import type Stripe from "stripe";
import type { PayoutRepository } from "./repository.ts";
import type {
  LedgerRecord,
  OnboardingState,
  PayoutEnvironment,
  StripePayoutGateway,
  StripeRecipientStatus,
} from "./types.ts";
import { isIsoInstant, isStripeAccountId } from "./validation.ts";
import type { ArtistRosterProjectionWriter } from "./roster-projection-adapter.ts";

const WEBHOOK_ACTOR = "stripe_connect_webhook";
const WEBHOOK_LEASE_MS = 5 * 60 * 1000;

export const CONNECT_ACCOUNT_EVENT_TYPES = new Set([
  "v2.core.account.created",
  "v2.core.account.closed",
  "v2.core.account.updated",
  "v2.core.account[configuration.recipient].updated",
  "v2.core.account[configuration.recipient].capability_status_updated",
  "v2.core.account[identity].updated",
  "v2.core.account[requirements].updated",
  "v2.core.account[future_requirements].updated",
]);

export const CONNECT_PAYOUT_EVENT_TYPES = new Set([
  "account.updated",
  "account.external_account.created",
  "account.external_account.updated",
  "account.external_account.deleted",
  "transfer.created",
  "transfer.updated",
  "transfer.reversed",
  "payout.created",
  "payout.updated",
  "payout.paid",
  "payout.reconciliation_completed",
  "payout.failed",
  "payout.canceled",
]);

type WebhookRepository = Pick<
  PayoutRepository,
  | "registerWebhookEvent"
  | "claimWebhookEvent"
  | "recoverExpiredWebhookLease"
  | "renewWebhookEventLease"
  | "completeWebhookEvent"
  | "failWebhookEvent"
  | "getArtistAccountByStripeAccount"
  | "upsertArtistAccount"
  | "getLedgerByTransferId"
  | "listUnreconciledLedgersForAccount"
  | "getPayoutDestinationVarianceApproval"
  | "recordTransferLifecycle"
  | "recordPayoutPending"
  | "recordStripePayoutPaidEvidence"
  | "recordPayoutFailed"
  | "openException"
>;

export interface ConnectWebhookClock {
  now(): Date;
}

export interface ConnectWebhookDependencies {
  stripe: Stripe;
  gateway: StripePayoutGateway;
  repository: WebhookRepository;
  environment: PayoutEnvironment;
  webhookSecret: string;
  rosterProjectionWriter?: ArtistRosterProjectionWriter;
  clock?: ConnectWebhookClock;
  claimTokenFactory?: () => string;
}

export type ConnectWebhookDisposition =
  "processed" | "ignored" | "duplicate" | "in_progress";

export interface ConnectWebhookOutcome {
  eventId: string;
  eventType: string;
  disposition: ConnectWebhookDisposition;
}

export class ConnectWebhookError extends Error {
  readonly safeCode: string;
  readonly httpStatus: 400 | 401 | 500;

  constructor(safeCode: string, httpStatus: 400 | 401 | 500) {
    super(safeCode);
    this.name = "ConnectWebhookError";
    this.safeCode = safeCode;
    this.httpStatus = httpStatus;
  }
}

const systemClock: ConnectWebhookClock = { now: () => new Date() };

function webhookError(
  safeCode: string,
  httpStatus: 400 | 401 | 500 = 500,
): ConnectWebhookError {
  return new ConnectWebhookError(safeCode, httpStatus);
}

function nowIso(clock: ConnectWebhookClock): string {
  const value = clock.now();
  if (Number.isNaN(value.valueOf()))
    throw webhookError("INVALID_WEBHOOK_CLOCK");
  return value.toISOString();
}

function assertExpectedMode(
  environment: PayoutEnvironment,
  livemode: unknown,
): void {
  if (typeof livemode !== "boolean" || livemode !== (environment === "live")) {
    throw webhookError("WEBHOOK_ENVIRONMENT_MISMATCH", 400);
  }
}

function eventObjectId(event: Stripe.Event): string {
  const object = event.data?.object as { id?: unknown } | undefined;
  if (!object || typeof object.id !== "string")
    throw webhookError("WEBHOOK_OBJECT_ID_MISSING", 400);
  return object.id;
}

function snapshotAccountId(event: Stripe.Event): string | null {
  return typeof event.account === "string" && isStripeAccountId(event.account)
    ? event.account
    : null;
}

function accountNotificationId(
  notification: Stripe.V2.Core.EventNotification,
): string {
  const related =
    "related_object" in notification ? notification.related_object : null;
  if (
    !related ||
    related.type !== "v2.core.account" ||
    !isStripeAccountId(related.id)
  ) {
    throw webhookError("WEBHOOK_ACCOUNT_ID_MISSING", 400);
  }
  return related.id;
}

function optionalAccountNotificationId(
  notification: Stripe.V2.Core.EventNotification,
): string | null {
  const related =
    "related_object" in notification ? notification.related_object : null;
  return related?.type === "v2.core.account" && isStripeAccountId(related.id)
    ? related.id
    : null;
}

function onboardingState(status: StripeRecipientStatus): OnboardingState {
  if (status.disabledReason === "account_closed") return "DISABLED";
  if (
    status.disabledReason ||
    status.requirementsStatus === "past_due" ||
    !status.automaticPayoutsEnabled ||
    status.payoutScheduleInterval === null ||
    status.payoutDestinationId === null
  )
    return "RESTRICTED";
  if (
    status.requirementsStatus === "complete" &&
    status.transfersStatus === "active" &&
    status.payoutsStatus === "active" &&
    status.automaticPayoutsEnabled &&
    status.payoutScheduleInterval !== null &&
    status.payoutDestinationId !== null &&
    status.currentlyDue.length === 0 &&
    status.disabledReason === null
  )
    return "TRANSFERS_ENABLED";
  if (status.transfersStatus === "active") return "TRANSFERS_ENABLED";
  if (status.requirementsStatus === "complete") return "ONBOARDING_COMPLETE";
  return "REQUIREMENTS_PENDING";
}

async function stableOperationalId(
  prefix: string,
  material: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(material),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix}_${hex.slice(0, 48)}`;
}

async function openCorrectiveCrmException(input: {
  repository: WebhookRepository;
  ledger: LedgerRecord;
  eventId: string;
  kind: "TRANSFER_REVERSED" | "PAYOUT_FAILED";
  stripeReference: string;
  now: string;
}): Promise<void> {
  await input.repository.openException({
    exceptionId: await stableOperationalId(
      "exception_webhook",
      `${input.kind}:${input.ledger.ledgerId}:${input.stripeReference}`,
    ),
    ledgerId: input.ledger.ledgerId,
    batchId: input.ledger.batchId,
    artistId: input.ledger.artistId,
    bookingId: input.ledger.bookingId,
    assignmentId: input.ledger.assignmentId,
    exceptionType: "CRM_CORRECTIVE_RECONCILIATION",
    reasonCode: input.kind,
    safeReason:
      input.kind === "TRANSFER_REVERSED"
        ? "Stripe reports a transfer reversal; the CRM paid projection must be corrected and independently read back."
        : "Stripe reports a payout failure or cancellation; the CRM payout projection must be corrected and independently read back.",
    ownerActionRequired:
      "Run the signed corrective CRM reconciliation, verify the independent readback, then resolve this exception.",
    stripeReference: input.stripeReference,
    lastAttemptAt: input.now,
    createdAt: input.now,
  });
}

function expectedArrivalDate(arrivalDate: number): string {
  if (!Number.isSafeInteger(arrivalDate) || arrivalDate <= 0) {
    throw webhookError("STRIPE_PAYOUT_ARRIVAL_INVALID");
  }
  const instant = new Date(arrivalDate * 1000);
  if (Number.isNaN(instant.valueOf()))
    throw webhookError("STRIPE_PAYOUT_ARRIVAL_INVALID");
  return instant.toISOString().slice(0, 10);
}

function failureCodeForPayout(
  status: string,
  gatewayCode: string | null,
): string {
  if (gatewayCode && /^[A-Za-z0-9_]{1,80}$/.test(gatewayCode))
    return gatewayCode;
  return status === "canceled" ? "PAYOUT_CANCELED" : "PAYOUT_FAILED";
}

function safeFailureCode(error: unknown): string {
  return error instanceof ConnectWebhookError
    ? error.safeCode
    : "WEBHOOK_PROCESSING_FAILED";
}

function claimToken(factory?: () => string): string {
  const token = factory ? factory() : `whclaim_${crypto.randomUUID()}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/.test(token)) {
    throw webhookError("WEBHOOK_CLAIM_TOKEN_INVALID");
  }
  return token;
}

async function claimDurableEvent(input: {
  repository: WebhookRepository;
  eventId: string;
  eventType: string;
  connectedAccountId: string | null;
  receivedAt: string;
  claimTokenFactory?: () => string;
}): Promise<{
  token: string | null;
  disposition: "duplicate" | "in_progress" | null;
}> {
  const registered = await input.repository.registerWebhookEvent({
    stripeEventId: input.eventId,
    eventType: input.eventType,
    connectedAccountId: input.connectedAccountId,
    receivedAt: input.receivedAt,
  });
  if (
    registered.event.status === "PROCESSED" ||
    registered.event.status === "IGNORED"
  ) {
    return { token: null, disposition: "duplicate" };
  }

  const token = claimToken(input.claimTokenFactory);
  const leaseExpiresAt = new Date(
    Date.parse(input.receivedAt) + WEBHOOK_LEASE_MS,
  ).toISOString();
  const claimed = await input.repository.claimWebhookEvent({
    stripeEventId: input.eventId,
    claimToken: token,
    claimedAt: input.receivedAt,
    leaseExpiresAt,
  });
  if (claimed.claimed) return { token, disposition: null };
  if (
    claimed.event.status === "PROCESSED" ||
    claimed.event.status === "IGNORED"
  ) {
    return { token: null, disposition: "duplicate" };
  }

  const stale =
    claimed.event.status === "PROCESSING" &&
    claimed.event.processingClaimToken &&
    claimed.event.processingLeaseExpiresAt &&
    Date.parse(claimed.event.processingLeaseExpiresAt) <=
      Date.parse(input.receivedAt);
  if (!stale) return { token: null, disposition: "in_progress" };

  const recovered = await input.repository.recoverExpiredWebhookLease({
    stripeEventId: input.eventId,
    expectedClaimToken: claimed.event.processingClaimToken as string,
    newClaimToken: token,
    recoveredAt: input.receivedAt,
    leaseExpiresAt,
  });
  return recovered.recovered
    ? { token, disposition: null }
    : {
        token: null,
        disposition:
          recovered.event.status === "PROCESSED" ||
          recovered.event.status === "IGNORED"
            ? "duplicate"
            : "in_progress",
      };
}

async function runDurableEvent(input: {
  repository: WebhookRepository;
  eventId: string;
  eventType: string;
  connectedAccountId: string | null;
  clock: ConnectWebhookClock;
  claimTokenFactory?: () => string;
  process: (
    now: string,
    guard: <Target extends object>(target: Target) => Target,
  ) => Promise<"processed" | "ignored">;
}): Promise<ConnectWebhookOutcome> {
  const receivedAt = nowIso(input.clock);
  const claim = await claimDurableEvent({ ...input, receivedAt });
  if (!claim.token) {
    return {
      eventId: input.eventId,
      eventType: input.eventType,
      disposition: claim.disposition as "duplicate" | "in_progress",
    };
  }

  const heartbeat = async (): Promise<void> => {
    const renewedAt = nowIso(input.clock);
    const leaseExpiresAt = new Date(
      Date.parse(renewedAt) + WEBHOOK_LEASE_MS,
    ).toISOString();
    const renewed = await input.repository.renewWebhookEventLease({
      stripeEventId: input.eventId,
      claimToken: claim.token as string,
      renewedAt,
      leaseExpiresAt,
    });
    if (!renewed) throw webhookError("WEBHOOK_LEASE_LOST");
  };
  const guard = <Target extends object>(target: Target): Target =>
    new Proxy(target, {
      get(current, property, receiver) {
        const value = Reflect.get(current, property, receiver) as unknown;
        if (typeof value !== "function") return value;
        return async (...arguments_: unknown[]) => {
          await heartbeat();
          const result = await Reflect.apply(
            value as (...values: unknown[]) => unknown,
            current,
            arguments_,
          );
          await heartbeat();
          return result;
        };
      },
    });

  try {
    await heartbeat();
    const disposition = await input.process(receivedAt, guard);
    await heartbeat();
    const completed = await input.repository.completeWebhookEvent(
      input.eventId,
      claim.token,
      disposition === "ignored" ? "IGNORED" : "PROCESSED",
      nowIso(input.clock),
    );
    if (!completed) throw webhookError("WEBHOOK_LEASE_LOST");
    return { eventId: input.eventId, eventType: input.eventType, disposition };
  } catch (error) {
    await input.repository.failWebhookEvent(
      input.eventId,
      claim.token,
      safeFailureCode(error),
      nowIso(input.clock),
    );
    throw error instanceof ConnectWebhookError
      ? error
      : webhookError("WEBHOOK_PROCESSING_FAILED");
  }
}

async function refreshMappedAccount(input: {
  accountId: string;
  gateway: StripePayoutGateway;
  repository: WebhookRepository;
  eventId: string;
  now: string;
  rosterProjectionWriter?: ArtistRosterProjectionWriter;
}): Promise<"processed" | "ignored"> {
  const mapping = await input.repository.getArtistAccountByStripeAccount(
    input.accountId,
  );
  if (!mapping) return "ignored";

  const status = await input.gateway.retrieveRecipientStatus(
    input.accountId,
    mapping.artistId,
  );
  if (status.accountId !== input.accountId)
    throw webhookError("STRIPE_ACCOUNT_ID_MISMATCH");
  const observedState = onboardingState(status);
  const payoutDestinationUnchanged =
    mapping.payoutDestinationId !== null &&
    mapping.payoutDestinationId === status.payoutDestinationId;
  const retainedPayoutApproval =
    mapping.onboardingStatus === "PAYOUT_READY" &&
    mapping.payoutReadyApprovedAt !== null &&
    payoutDestinationUnchanged;
  const payoutDestinationReapprovalRequired =
    (mapping.onboardingStatus === "PAYOUT_READY" &&
      !payoutDestinationUnchanged) ||
    mapping.disabledReason === "payout_destination_requires_owner_reapproval";
  const state = payoutDestinationReapprovalRequired
    ? "RESTRICTED"
    : observedState === "TRANSFERS_ENABLED" &&
        status.requirementsStatus === "complete" &&
        status.transfersStatus === "active" &&
        status.payoutsStatus === "active" &&
        status.automaticPayoutsEnabled &&
        status.payoutScheduleInterval !== null &&
        status.payoutDestinationId !== null &&
        status.currentlyDue.length === 0 &&
        status.disabledReason === null &&
        retainedPayoutApproval
      ? "PAYOUT_READY"
      : observedState;
  if (
    mapping.onboardingStatus === "PAYOUT_READY" &&
    !payoutDestinationUnchanged
  ) {
    await input.repository.openException({
      exceptionId: await stableOperationalId(
        "exception_destination",
        `${mapping.environment}:${mapping.artistId}:${status.payoutDestinationId ?? "missing"}`,
      ),
      artistId: mapping.artistId,
      exceptionType: "PAYOUT_DESTINATION_CHANGED",
      reasonCode: status.payoutDestinationId
        ? "DEFAULT_BANK_DESTINATION_CHANGED"
        : "DEFAULT_BANK_DESTINATION_UNAVAILABLE",
      safeReason:
        "The recipient's default USD standard-payout bank destination changed or became unavailable.",
      ownerActionRequired:
        "Verify the new payout destination in Stripe, then explicitly reactivate this artist before any later batch.",
      stripeReference: status.payoutDestinationId,
      createdAt: input.now,
    });
  }
  const account = await input.repository.upsertArtistAccount({
    artistId: mapping.artistId,
    stripeAccountId: input.accountId,
    artistDisplayName: mapping.artistDisplayName,
    onboardingStatus: state,
    requirementsStatus: status.requirementsStatus,
    transfersStatus: status.transfersStatus,
    payoutsStatus: status.payoutsStatus,
    automaticPayoutsEnabled: status.automaticPayoutsEnabled,
    payoutDestinationId: status.payoutDestinationId,
    payoutReadyApprovedAt:
      state === "PAYOUT_READY" ? mapping.payoutReadyApprovedAt : null,
    lastRequirementsCheckAt: input.now,
    onboardedAt:
      state === "PAYOUT_READY" ||
      state === "TRANSFERS_ENABLED" ||
      state === "ONBOARDING_COMPLETE"
        ? (mapping.onboardedAt ?? input.now)
        : mapping.onboardedAt,
    disabledReason: payoutDestinationReapprovalRequired
      ? "payout_destination_requires_owner_reapproval"
      : status.disabledReason,
    payoutExceptionFlag: state === "RESTRICTED" || state === "DISABLED",
    auditActor: WEBHOOK_ACTOR,
    auditRequestId: input.eventId,
    auditId: await stableOperationalId(
      "audit_webhook_account",
      `${input.eventId}:${mapping.artistId}`,
    ),
    now: input.now,
  });
  await input.rosterProjectionWriter?.sync(account);
  return "processed";
}

function assertTransferMatchesLedger(
  transfer: Awaited<ReturnType<StripePayoutGateway["retrieveTransfer"]>>,
  ledger: LedgerRecord,
): void {
  if (
    transfer.id !== ledger.stripeTransferId ||
    transfer.amount !== ledger.totalApprovedPayCents ||
    transfer.currency !== "usd" ||
    transfer.destination !== ledger.connectedAccountId ||
    !transfer.destinationPaymentId ||
    transfer.destinationPaymentId !== ledger.stripeDestinationPaymentId
  ) {
    throw webhookError("TRANSFER_LEDGER_MISMATCH");
  }
}

async function recordAuthoritativeTransfer(input: {
  event: Stripe.Event;
  gateway: StripePayoutGateway;
  repository: WebhookRepository;
  now: string;
}): Promise<"processed" | "ignored"> {
  const transferId = eventObjectId(input.event);
  if (!/^tr_[A-Za-z0-9]{12,80}$/.test(transferId))
    throw webhookError("WEBHOOK_TRANSFER_ID_INVALID", 400);
  const transfer = await input.gateway.retrieveTransfer(transferId);
  const ledger = await input.repository.getLedgerByTransferId(transferId);
  if (!ledger) throw webhookError("TRANSFER_EVENT_UNMATCHED");
  assertTransferMatchesLedger(transfer, ledger);

  const eventAccountId = snapshotAccountId(input.event);
  if (input.event.account && !eventAccountId)
    throw webhookError("WEBHOOK_ACCOUNT_ID_INVALID", 400);
  if (eventAccountId && eventAccountId !== transfer.destination) {
    throw webhookError("WEBHOOK_ACCOUNT_ID_MISMATCH", 400);
  }

  const recorded = await input.repository.recordTransferLifecycle({
    ledgerId: ledger.ledgerId,
    stripeTransferId: transfer.id,
    status: transfer.reversed ? "reversed" : "completed",
    safeFailureReason: transfer.reversed
      ? "Stripe reports that the transfer was reversed."
      : null,
    actor: WEBHOOK_ACTOR,
    auditId: await stableOperationalId(
      "audit_webhook",
      `${input.event.id}:transfer:${ledger.ledgerId}`,
    ),
    requestId: input.event.id,
    now: input.now,
  });
  if (transfer.reversed && recorded.ledger.state === "REVERSED") {
    await openCorrectiveCrmException({
      repository: input.repository,
      ledger: recorded.ledger,
      eventId: input.event.id,
      kind: "TRANSFER_REVERSED",
      stripeReference: transfer.id,
      now: input.now,
    });
  }
  return "processed";
}

async function ensureTransferCompleted(input: {
  eventId: string;
  ledger: LedgerRecord;
  gateway: StripePayoutGateway;
  repository: WebhookRepository;
  now: string;
}): Promise<boolean> {
  if (!input.ledger.stripeTransferId)
    throw webhookError("PAYOUT_TRANSFER_ID_MISSING");
  const transfer = await input.gateway.retrieveTransfer(
    input.ledger.stripeTransferId,
  );
  assertTransferMatchesLedger(transfer, input.ledger);
  if (transfer.reversed) {
    const recorded = await input.repository.recordTransferLifecycle({
      ledgerId: input.ledger.ledgerId,
      stripeTransferId: transfer.id,
      status: "reversed",
      safeFailureReason: "Stripe reports that the transfer was reversed.",
      actor: WEBHOOK_ACTOR,
      auditId: await stableOperationalId(
        "audit_webhook",
        `${input.eventId}:reversed:${input.ledger.ledgerId}`,
      ),
      requestId: input.eventId,
      now: input.now,
    });
    if (recorded.ledger.state === "REVERSED") {
      await openCorrectiveCrmException({
        repository: input.repository,
        ledger: recorded.ledger,
        eventId: input.eventId,
        kind: "TRANSFER_REVERSED",
        stripeReference: transfer.id,
        now: input.now,
      });
    }
    return false;
  }
  if (
    input.ledger.state === "TRANSFER_CREATED" ||
    input.ledger.state === "TRANSFER_PENDING"
  ) {
    await input.repository.recordTransferLifecycle({
      ledgerId: input.ledger.ledgerId,
      stripeTransferId: transfer.id,
      status: "completed",
      safeFailureReason: null,
      actor: WEBHOOK_ACTOR,
      auditId: await stableOperationalId(
        "audit_webhook",
        `${input.eventId}:completed:${input.ledger.ledgerId}`,
      ),
      requestId: input.eventId,
      now: input.now,
    });
  }
  return true;
}

async function assertHistoricalPayoutDestination(input: {
  repository: WebhookRepository;
  ledger: LedgerRecord;
  payoutDestinationId: string;
  payoutId: string;
  eventId: string;
  now: string;
}): Promise<void> {
  if (
    input.ledger.approvedPayoutDestinationId === input.payoutDestinationId &&
    input.ledger.approvedPayoutDestinationAt !== null &&
    isIsoInstant(input.ledger.approvedPayoutDestinationAt)
  ) {
    return;
  }
  if (
    input.ledger.approvedPayoutDestinationId &&
    input.ledger.approvedPayoutDestinationAt &&
    isIsoInstant(input.ledger.approvedPayoutDestinationAt)
  ) {
    const variance =
      await input.repository.getPayoutDestinationVarianceApproval(
        input.ledger.ledgerId,
        input.payoutId,
      );
    if (
      variance !== null &&
      variance.environment === input.ledger.environment &&
      variance.ledgerId === input.ledger.ledgerId &&
      variance.payoutId === input.payoutId &&
      variance.originalDestinationId ===
        input.ledger.approvedPayoutDestinationId &&
      variance.approvedDestinationId === input.payoutDestinationId &&
      isIsoInstant(variance.recipientApprovalAt)
    ) {
      return;
    }
  }
  await input.repository.openException({
    exceptionId: await stableOperationalId(
      "exception_payout_destination",
      `${input.eventId}:${input.ledger.ledgerId}:${input.payoutDestinationId}`,
    ),
    ledgerId: input.ledger.ledgerId,
    batchId: input.ledger.batchId,
    artistId: input.ledger.artistId,
    bookingId: input.ledger.bookingId,
    assignmentId: input.ledger.assignmentId,
    exceptionType: "PAYOUT_DESTINATION_MISMATCH",
    reasonCode: "PAYOUT_DESTINATION_NOT_DURABLY_APPROVED",
    safeReason:
      "The authoritative Stripe payout bank destination does not match the immutable destination approval captured before transfer creation.",
    ownerActionRequired:
      "Reconcile the payout against the exact pre-transfer destination snapshot before retrying; do not replace historical destination evidence.",
    stripeReference: input.payoutId,
    lastAttemptAt: input.now,
    createdAt: input.now,
  });
  throw webhookError("PAYOUT_DESTINATION_MISMATCH");
}

async function recordAuthoritativePayout(input: {
  event: Stripe.Event;
  accountId: string;
  gateway: StripePayoutGateway;
  repository: WebhookRepository;
  now: string;
}): Promise<"processed" | "ignored"> {
  const payoutId = eventObjectId(input.event);
  if (!/^po_[A-Za-z0-9]{12,80}$/.test(payoutId))
    throw webhookError("WEBHOOK_PAYOUT_ID_INVALID", 400);
  const mapping = await input.repository.getArtistAccountByStripeAccount(
    input.accountId,
  );
  if (!mapping) throw webhookError("PAYOUT_ACCOUNT_UNMAPPED");

  const payout = await input.gateway.retrievePayout(input.accountId, payoutId);
  if (payout.id !== payoutId) throw webhookError("STRIPE_PAYOUT_ID_MISMATCH");
  const ledgers: LedgerRecord[] = [];
  let afterLedgerId: string | null = null;
  for (;;) {
    const page = await input.repository.listUnreconciledLedgersForAccount(
      input.accountId,
      100,
      afterLedgerId,
    );
    if (page.length > 100)
      throw webhookError("PAYOUT_LEDGER_PAGE_BOUND_EXCEEDED");
    if (page.length === 0) break;
    for (const ledger of page) {
      if (afterLedgerId !== null && ledger.ledgerId <= afterLedgerId) {
        throw webhookError("PAYOUT_LEDGER_CURSOR_INVALID");
      }
      if (
        ledgers.length > 0 &&
        ledger.ledgerId <= ledgers[ledgers.length - 1].ledgerId
      ) {
        throw webhookError("PAYOUT_LEDGER_CURSOR_INVALID");
      }
      ledgers.push(ledger);
    }
    if (page.length < 100) break;
    afterLedgerId = page[page.length - 1].ledgerId;
  }

  if (payout.status === "failed" || payout.status === "canceled") {
    let matched = 0;
    for (const ledger of ledgers) {
      if (!ledger.stripeDestinationPaymentId) continue;
      const alreadyBound = ledger.stripePayoutId === payout.id;
      if (
        ledger.stripePayoutId &&
        !alreadyBound &&
        ledger.state !== "PAYOUT_FAILED"
      )
        continue;
      const contains =
        alreadyBound ||
        (await input.gateway.payoutContainsDestinationPayment({
          accountId: input.accountId,
          payoutId: payout.id,
          destinationPaymentId: ledger.stripeDestinationPaymentId,
        }));
      if (!contains) continue;
      await assertHistoricalPayoutDestination({
        repository: input.repository,
        ledger,
        payoutDestinationId: payout.destinationId,
        payoutId: payout.id,
        eventId: input.event.id,
        now: input.now,
      });
      if (
        !(await ensureTransferCompleted({
          eventId: input.event.id,
          ledger,
          gateway: input.gateway,
          repository: input.repository,
          now: input.now,
        }))
      )
        continue;
      if (!alreadyBound) {
        await input.repository.recordPayoutPending({
          ledgerId: ledger.ledgerId,
          payoutId: payout.id,
          payoutStatus: payout.status,
          expectedArrival: expectedArrivalDate(payout.arrivalDate),
          actor: WEBHOOK_ACTOR,
          auditId: await stableOperationalId(
            "audit_webhook",
            `${input.event.id}:bind-failed:${ledger.ledgerId}`,
          ),
          requestId: input.event.id,
          now: input.now,
        });
      }
      const recorded = await input.repository.recordPayoutFailed({
        ledgerId: ledger.ledgerId,
        payoutId: payout.id,
        payoutStatus: payout.status,
        safeErrorCode: failureCodeForPayout(payout.status, payout.failureCode),
        safeReason:
          payout.status === "canceled"
            ? "Stripe reports that the connected-account payout was canceled."
            : "Stripe reports that the connected-account payout failed.",
        actor: WEBHOOK_ACTOR,
        auditId: await stableOperationalId(
          "audit_webhook",
          `${input.event.id}:failed:${ledger.ledgerId}`,
        ),
        requestId: input.event.id,
        now: input.now,
      });
      if (recorded.ledger.state === "PAYOUT_FAILED") {
        await openCorrectiveCrmException({
          repository: input.repository,
          ledger: recorded.ledger,
          eventId: input.event.id,
          kind: "PAYOUT_FAILED",
          stripeReference: payout.id,
          now: input.now,
        });
      }
      matched += 1;
    }
    if (!matched) throw webhookError("PAYOUT_EVENT_UNMATCHED");
    return "processed";
  }

  if (payout.status !== "paid") {
    let matched = 0;
    for (const ledger of ledgers) {
      if (!ledger.stripeDestinationPaymentId) continue;
      const alreadyBound = ledger.stripePayoutId === payout.id;
      if (
        ledger.stripePayoutId &&
        !alreadyBound &&
        ledger.state !== "PAYOUT_FAILED"
      )
        continue;
      const contains =
        alreadyBound ||
        (await input.gateway.payoutContainsDestinationPayment({
          accountId: input.accountId,
          payoutId: payout.id,
          destinationPaymentId: ledger.stripeDestinationPaymentId,
        }));
      if (!contains) continue;
      await assertHistoricalPayoutDestination({
        repository: input.repository,
        ledger,
        payoutDestinationId: payout.destinationId,
        payoutId: payout.id,
        eventId: input.event.id,
        now: input.now,
      });
      if (
        !(await ensureTransferCompleted({
          eventId: input.event.id,
          ledger,
          gateway: input.gateway,
          repository: input.repository,
          now: input.now,
        }))
      )
        continue;
      await input.repository.recordPayoutPending({
        ledgerId: ledger.ledgerId,
        payoutId: payout.id,
        payoutStatus: payout.status,
        expectedArrival: expectedArrivalDate(payout.arrivalDate),
        actor: WEBHOOK_ACTOR,
        auditId: await stableOperationalId(
          "audit_webhook",
          `${input.event.id}:pending:${ledger.ledgerId}`,
        ),
        requestId: input.event.id,
        now: input.now,
      });
      matched += 1;
    }
    if (!matched) throw webhookError("PAYOUT_EVENT_UNMATCHED");
    return "processed";
  }

  if (payout.reconciliationStatus !== "completed") {
    throw webhookError("PAYOUT_RECONCILIATION_INCOMPLETE");
  }

  let matched = 0;
  for (const ledger of ledgers) {
    if (
      !ledger.stripeDestinationPaymentId ||
      (ledger.stripePayoutId &&
        ledger.stripePayoutId !== payout.id &&
        ledger.state !== "PAYOUT_FAILED")
    ) {
      continue;
    }
    const contains = await input.gateway.payoutContainsDestinationPayment({
      accountId: input.accountId,
      payoutId: payout.id,
      destinationPaymentId: ledger.stripeDestinationPaymentId,
    });
    if (!contains) continue;
    await assertHistoricalPayoutDestination({
      repository: input.repository,
      ledger,
      payoutDestinationId: payout.destinationId,
      payoutId: payout.id,
      eventId: input.event.id,
      now: input.now,
    });
    if (
      !(await ensureTransferCompleted({
        eventId: input.event.id,
        ledger,
        gateway: input.gateway,
        repository: input.repository,
        now: input.now,
      }))
    ) {
      continue;
    }
    if (
      ledger.state === "PAYOUT_PENDING" &&
      ledger.stripePayoutId === payout.id &&
      ledger.stripePayoutStatus === "paid" &&
      !ledger.reconciled
    ) {
      matched += 1;
      continue;
    }
    await input.repository.recordStripePayoutPaidEvidence({
      ledgerId: ledger.ledgerId,
      payoutId: payout.id,
      payoutStatus: "paid",
      expectedArrival: expectedArrivalDate(payout.arrivalDate),
      actor: WEBHOOK_ACTOR,
      auditId: await stableOperationalId(
        "audit_webhook",
        `${input.event.id}:paid:${ledger.ledgerId}`,
      ),
      requestId: input.event.id,
      now: input.now,
    });
    matched += 1;
  }
  if (!matched) throw webhookError("PAYOUT_EVENT_UNMATCHED");
  return "processed";
}

export async function handleConnectAccountWebhook(input: {
  rawBody: string;
  signature: string;
  dependencies: ConnectWebhookDependencies;
}): Promise<ConnectWebhookOutcome> {
  let notification: Stripe.V2.Core.EventNotification;
  try {
    notification = await input.dependencies.stripe.parseEventNotificationAsync(
      input.rawBody,
      input.signature,
      input.dependencies.webhookSecret,
    );
  } catch {
    throw webhookError("INVALID_WEBHOOK_SIGNATURE", 401);
  }
  assertExpectedMode(input.dependencies.environment, notification.livemode);

  const supported = CONNECT_ACCOUNT_EVENT_TYPES.has(notification.type);
  const accountId = supported
    ? accountNotificationId(notification)
    : optionalAccountNotificationId(notification);
  return runDurableEvent({
    repository: input.dependencies.repository,
    eventId: notification.id,
    eventType: notification.type,
    connectedAccountId: accountId,
    clock: input.dependencies.clock ?? systemClock,
    claimTokenFactory: input.dependencies.claimTokenFactory,
    process: supported
      ? (now, guard) =>
          refreshMappedAccount({
            accountId: accountId as string,
            gateway: guard(input.dependencies.gateway),
            repository: guard(input.dependencies.repository),
            rosterProjectionWriter: input.dependencies.rosterProjectionWriter
              ? guard(input.dependencies.rosterProjectionWriter)
              : undefined,
            eventId: notification.id,
            now,
          })
      : async () => "ignored",
  });
}

export async function handleConnectPayoutWebhook(input: {
  rawBody: string;
  signature: string;
  dependencies: ConnectWebhookDependencies;
}): Promise<ConnectWebhookOutcome> {
  let event: Stripe.Event;
  try {
    event = await input.dependencies.stripe.webhooks.constructEventAsync(
      input.rawBody,
      input.signature,
      input.dependencies.webhookSecret,
    );
  } catch {
    throw webhookError("INVALID_WEBHOOK_SIGNATURE", 401);
  }
  assertExpectedMode(input.dependencies.environment, event.livemode);

  const supported = CONNECT_PAYOUT_EVENT_TYPES.has(event.type);
  const isPayout = event.type.startsWith("payout.");
  const isAccountStatus =
    event.type === "account.updated" ||
    event.type.startsWith("account.external_account.");
  const accountId = snapshotAccountId(event);
  if (supported && (isPayout || isAccountStatus) && !accountId)
    throw webhookError("WEBHOOK_ACCOUNT_ID_MISSING", 400);
  if (supported && event.account && !accountId)
    throw webhookError("WEBHOOK_ACCOUNT_ID_INVALID", 400);

  return runDurableEvent({
    repository: input.dependencies.repository,
    eventId: event.id,
    eventType: event.type,
    connectedAccountId: accountId,
    clock: input.dependencies.clock ?? systemClock,
    claimTokenFactory: input.dependencies.claimTokenFactory,
    process: !supported
      ? async () => "ignored"
      : isAccountStatus
        ? (now, guard) =>
            refreshMappedAccount({
              accountId: accountId as string,
              gateway: guard(input.dependencies.gateway),
              repository: guard(input.dependencies.repository),
              rosterProjectionWriter: input.dependencies.rosterProjectionWriter
                ? guard(input.dependencies.rosterProjectionWriter)
                : undefined,
              eventId: event.id,
              now,
            })
        : event.type.startsWith("transfer.")
          ? (now, guard) =>
              recordAuthoritativeTransfer({
                event,
                gateway: guard(input.dependencies.gateway),
                repository: guard(input.dependencies.repository),
                now,
              })
          : (now, guard) =>
              recordAuthoritativePayout({
                event,
                accountId: accountId as string,
                gateway: guard(input.dependencies.gateway),
                repository: guard(input.dependencies.repository),
                now,
              }),
  });
}

export function safeWebhookReference(value: string): string {
  return value.length <= 8 ? "***" : `***${value.slice(-6)}`;
}
