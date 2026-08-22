import { assessCloseoutEligibility } from "./eligibility.ts";
import {
  assertCurrentLosAngelesProcessingDay,
  dateInTimeZone,
  nextProcessingDateAfterEligibility,
} from "./schedule.ts";
import { assertBalanceCanFundBatch } from "./config.ts";
import {
  isExactCrmProjectionReadback,
  readCrmPayoutProjection,
  syncCrmPayoutProjection,
  type CrmAdapterConfig,
  type CrmPayoutProjection,
  type CrmSyncReceipt,
} from "./crm-adapter.ts";
import type {
  LedgerDraft,
  LedgerRecord,
  OnboardingState,
  PayoutActor,
  StripePayoutGateway,
  StripeRecipientStatus,
} from "./types.ts";
import {
  PayoutRepositoryError,
  type PayoutRepository,
  type ArtistAccountRecord,
  type DashboardSnapshot,
  type DashboardQuery,
  type PayoutBatchRecord,
  type PayoutBatchItemRecord,
  type PayoutDestinationVarianceApprovalRecord,
  type TransferAttemptRecord,
} from "./repository.ts";
import {
  dashboardWithAuthoritativeRoster,
  type AuthoritativePayoutSourceResolver,
} from "./authoritative-sources.ts";
import type { AuthoritativeCrmPayoutSource } from "./crm-payout-source-adapter.ts";
import type { ArtistRosterProjectionWriter } from "./roster-projection-adapter.ts";
import {
  assertOnboardingClaimSecret,
  generateOnboardingChallengeCode,
  onboardingChallengeDigest,
  onboardingRecipientEmailBinding,
  signOnboardingClaim,
  stripeRecipientProvenance,
} from "./onboarding-claim.ts";
import {
  manualPaymentIntentDigest,
  transferIdempotencyKey,
} from "./approval.ts";
import {
  isIsoInstant,
  isSafeBusinessId,
  sanitizeOperationalText,
} from "./validation.ts";

export interface PayoutServiceClock {
  now(): Date;
}

const systemClock: PayoutServiceClock = { now: () => new Date() };

function operationalId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function deterministicBusinessId(
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

function isoNow(clock: PayoutServiceClock): string {
  const value = clock.now();
  if (Number.isNaN(value.valueOf()))
    throw new Error("Application clock returned an invalid instant");
  return value.toISOString();
}

function assertOwner(actor: PayoutActor): void {
  if (actor.role !== "owner")
    throw new Error("Owner authorization is required");
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

function memoFor(draft: LedgerDraft): string {
  const amount = (draft.totalApprovedPayCents / 100).toFixed(2);
  const name = sanitizeOperationalText(draft.artistName, 160);
  const service = sanitizeOperationalText(draft.service, 240);
  const memo = `HFL Artist Pay | ${draft.bookingId} | ${name} | ${draft.eventDate} | ${service} | $${amount}`;
  if (memo.length > 240) {
    throw new Error(
      "Payment memo exceeds 240 characters; shorten the artist, booking, or service source field",
    );
  }
  return memo;
}

function derivedCloseoutStatus(eligible: boolean, blockers: string[]): string {
  if (eligible) return "COMPLETE";
  const issueControls = new Set([
    "noCustomerComplaintAffectingPay",
    "noRefundIssueAffectingPay",
    "noDamageOrSupplyIssueAffectingPay",
    "contractorControlSatisfied",
  ]);
  return blockers.some((blocker) => issueControls.has(blocker))
    ? "ISSUE_REVIEW"
    : "PENDING";
}

function recipientIsReady(status: StripeRecipientStatus): boolean {
  return (
    status.requirementsStatus === "complete" &&
    status.transfersStatus === "active" &&
    status.payoutsStatus === "active" &&
    status.automaticPayoutsEnabled &&
    status.payoutScheduleInterval !== null &&
    status.payoutDestinationId !== null &&
    status.currentlyDue.length === 0 &&
    status.disabledReason === null
  );
}

function recipientMatchesDurablePayoutApproval(
  account: ArtistAccountRecord | null,
  ledger: LedgerRecord,
  status: StripeRecipientStatus,
  processingDate: string,
): boolean {
  return (
    account !== null &&
    account.artistId === ledger.artistId &&
    account.stripeAccountId === ledger.connectedAccountId &&
    account.onboardingStatus === "PAYOUT_READY" &&
    account.preferredPayoutType === "automatic_standard" &&
    account.payoutReadyApprovedAt !== null &&
    isIsoInstant(account.payoutReadyApprovedAt) &&
    nextProcessingDateAfterEligibility(
      ledger.eventDate,
      new Date(account.payoutReadyApprovedAt),
    ) <= processingDate &&
    account.payoutDestinationId !== null &&
    account.payoutDestinationId === status.payoutDestinationId &&
    recipientIsReady(status)
  );
}

function payoutMatchesHistoricalDestinationApproval(
  ledger: LedgerRecord,
  destinationId: string,
): boolean {
  return (
    ledger.approvedPayoutDestinationId !== null &&
    ledger.approvedPayoutDestinationAt !== null &&
    isIsoInstant(ledger.approvedPayoutDestinationAt) &&
    ledger.approvedPayoutDestinationId === destinationId
  );
}

function manualCrmProjection(ledger: LedgerRecord): CrmPayoutProjection {
  if (
    !ledger.manualPaymentMethod ||
    ledger.manualPaymentAmountCents !== ledger.totalApprovedPayCents ||
    !ledger.manualPaymentReason ||
    !ledger.manualPaymentEvidenceReference ||
    !ledger.manualPaymentMemo ||
    !ledger.manualPaymentRecordedBy ||
    !ledger.manualPaymentRecordedAt
  ) {
    throw new Error("Durable manual payment intent is incomplete");
  }
  return {
    environment: ledger.environment,
    ledgerId: ledger.ledgerId,
    bookingId: ledger.bookingId,
    assignmentId: ledger.assignmentId,
    artistId: ledger.artistId,
    sourceRevision: ledger.sourceRevision,
    expectedCrmRecordId: ledger.crmRecordId,
    expectedCrmRevision: ledger.crmRevision,
    state: "MANUAL_PAYMENT_EXCEPTION",
    batchId: null,
    batchDate: null,
    currency: "usd",
    amountCents: ledger.totalApprovedPayCents,
    connectedAccountId: ledger.connectedAccountId,
    transferId: null,
    payoutId: null,
    payoutStatus: null,
    reconciled: true,
    reconciledAt: ledger.manualPaymentRecordedAt,
    manualPayment: {
      method: ledger.manualPaymentMethod,
      reason: ledger.manualPaymentReason,
      evidenceReference: ledger.manualPaymentEvidenceReference,
      memo: ledger.manualPaymentMemo,
      recordedBy: ledger.manualPaymentRecordedBy,
      recordedAt: ledger.manualPaymentRecordedAt,
    },
    lastVerifiedAt: ledger.manualPaymentRecordedAt,
  };
}

function expectedArrivalDate(unixSeconds: number): string {
  if (
    !Number.isSafeInteger(unixSeconds) ||
    unixSeconds <= 0 ||
    unixSeconds > 8_640_000_000
  ) {
    throw new Error(
      "Stripe payout arrival time is outside the supported date range",
    );
  }
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function attemptCanReuseStripeIdempotency(
  attempt: TransferAttemptRecord,
  now: Date,
): boolean {
  if (attempt.destinationResnapshotAuthorized) return true;
  const createdAt = Date.parse(attempt.createdAt);
  return (
    Number.isFinite(createdAt) &&
    now.valueOf() - createdAt >= 0 &&
    now.valueOf() - createdAt <= 23 * 60 * 60 * 1000
  );
}

function assertBatchExecutionProcessingDay(
  batch: PayoutBatchRecord,
  instant: Date,
): string {
  const processingDate = dateInTimeZone(instant);
  assertCurrentLosAngelesProcessingDay(processingDate, instant);
  if (
    batch.scheduledDate !== processingDate &&
    batch.recoveryProcessingDate !== processingDate
  ) {
    throw new Error(
      "Batch is not scheduled or separately authorized for today's Los Angeles processing date",
    );
  }
  if (
    batch.scheduledDate !== processingDate &&
    (!batch.recoveryAuthorizedBy ||
      !batch.recoveryAuthorizedAt ||
      !batch.recoveryReason)
  ) {
    throw new Error("Cross-day batch recovery authorization is incomplete");
  }
  return processingDate;
}

function transferMetadata(
  ledger: LedgerRecord,
  batch: PayoutBatchRecord,
): Record<string, string> {
  return {
    booking_id: ledger.bookingId,
    assignment_id: ledger.assignmentId,
    artist_id: ledger.artistId,
    artist_name: sanitizeOperationalText(ledger.artistName, 120),
    event_date: ledger.eventDate,
    service: sanitizeOperationalText(ledger.service, 160),
    service_pay_cents: String(ledger.servicePayCents),
    travel_pay_cents: String(ledger.travelPayCents),
    bonus_cents: String(ledger.bonusCents),
    adjustment_cents: String(ledger.adjustmentCents),
    deduction_cents: String(ledger.deductionCents),
    total_artist_pay_cents: String(ledger.totalApprovedPayCents),
    closeout_status: "COMPLETE",
    approved_by: ledger.approvedBy ?? "",
    approval_timestamp: ledger.approvalTimestamp ?? "",
    batch_date: batch.scheduledDate,
    environment: ledger.environment,
    ledger_revision: String(ledger.sourceRevision),
  };
}

function exactStringRecord(
  actual: Record<string, string>,
  expected: Record<string, string>,
): boolean {
  const keys = Object.keys(expected).sort();
  return (
    JSON.stringify(Object.keys(actual).sort()) === JSON.stringify(keys) &&
    keys.every((key) => actual[key] === expected[key])
  );
}

const CRM_CLOSEOUT_KEYS = [
  "assignmentExists",
  "bookingIdValid",
  "assignmentIdValid",
  "eventCompleted",
  "actualEndTime",
  "artistCompletionConfirmed",
  "serviceCompleted",
  "extraTimeReconciled",
  "serviceChangeReconciled",
  "travelPayReconciled",
  "adjustmentsReconciled",
  "noCustomerComplaintAffectingPay",
  "noRefundIssueAffectingPay",
  "noDamageOrSupplyIssueAffectingPay",
  "compensationApproved",
  "contractorControlSatisfied",
] as const;

class AuthoritativeSourceMismatchError extends Error {}

function assertLedgerMatchesAuthoritativeSource(
  ledger: LedgerRecord,
  source: AuthoritativeCrmPayoutSource,
  allowExactExistingProjection = false,
): void {
  const existingProjectionOnly =
    source.priorPayment.disposition === "OWNER_REVIEW_REQUIRED" &&
    source.priorPayment.reasonCodes.length === 1 &&
    source.priorPayment.reasonCodes[0] === "EXISTING_PAYOUT_PROJECTION_PRESENT";
  if (
    source.priorPayment.disposition !== "CLEAR" &&
    !(allowExactExistingProjection && existingProjectionOnly)
  ) {
    throw new AuthoritativeSourceMismatchError(
      "Authoritative CRM reports prior or ambiguous payment evidence",
    );
  }
  const exact =
    ledger.environment === source.environment &&
    ledger.crmRecordId === source.recordId &&
    ledger.crmRevision === source.revision &&
    ledger.sourceRevision === source.sourceRevision &&
    ledger.bookingId === source.bookingId &&
    ledger.assignmentId === source.assignmentId &&
    ledger.artistId === source.artistId &&
    ledger.artistName === source.artistName &&
    ledger.eventName === source.eventName &&
    ledger.eventDate === source.eventDate &&
    ledger.closeoutVerifiedAt === source.closeoutVerifiedAt &&
    ledger.service === source.service &&
    ledger.servicePayCents === source.servicePayCents &&
    ledger.travelPayCents === source.travelPayCents &&
    ledger.bonusCents === source.bonusCents &&
    ledger.adjustmentCents === source.adjustmentCents &&
    ledger.deductionCents === source.deductionCents &&
    ledger.totalApprovedPayCents === source.totalApprovedPayCents &&
    CRM_CLOSEOUT_KEYS.every(
      (key) => ledger.closeout[key] === source.closeout[key],
    );
  if (!exact)
    throw new AuthoritativeSourceMismatchError(
      "Authoritative CRM source changed after the approved batch snapshot",
    );
}

export interface BatchExecutionResult {
  batch: PayoutBatchRecord;
  createdTransfers: LedgerRecord[];
  failedLedgers: LedgerRecord[];
}

export class ArtistPayoutApplicationService {
  readonly repository: PayoutRepository;
  readonly stripe: StripePayoutGateway;
  private readonly publicBaseUrl: string;
  private readonly minimumReserveCents: number | null;
  private readonly clock: PayoutServiceClock;
  private readonly authoritativeSources: AuthoritativePayoutSourceResolver | null;
  private readonly onboardingClaimSecret: string | null;
  private readonly rosterProjectionWriter: ArtistRosterProjectionWriter | null;

  constructor(
    repository: PayoutRepository,
    stripe: StripePayoutGateway,
    publicBaseUrl: string,
    minimumReserveCents: number | null,
    clock: PayoutServiceClock = systemClock,
    authoritativeSources: AuthoritativePayoutSourceResolver | null = null,
    onboardingClaimSecret: string | null = null,
    rosterProjectionWriter: ArtistRosterProjectionWriter | null = null,
  ) {
    this.repository = repository;
    this.stripe = stripe;
    this.publicBaseUrl = publicBaseUrl;
    this.minimumReserveCents = minimumReserveCents;
    this.clock = clock;
    this.authoritativeSources = authoritativeSources;
    this.onboardingClaimSecret = onboardingClaimSecret;
    this.rosterProjectionWriter = rosterProjectionWriter;
    const base = new URL(publicBaseUrl);
    if (
      base.protocol !== "https:" ||
      base.origin !== publicBaseUrl ||
      base.pathname !== "/"
    ) {
      throw new Error("Artist payout public base URL must be an HTTPS origin");
    }
  }

  async dashboard(query: DashboardQuery = {}): Promise<DashboardSnapshot> {
    return this.repository.getDashboard(query);
  }

  async dashboardWithAuthoritativeRoster(
    query: DashboardQuery = {},
  ): Promise<DashboardSnapshot> {
    return dashboardWithAuthoritativeRoster(
      this.repository,
      this.authoritativeSources,
      query,
    );
  }

  async dashboardWithFundingPreview(
    query: DashboardQuery = {},
  ): Promise<DashboardSnapshot> {
    const snapshot = await this.dashboardWithAuthoritativeRoster(query);
    let availableBalanceCents: number;
    try {
      availableBalanceCents = await this.stripe.retrieveAvailableBalance("usd");
    } catch {
      return {
        ...snapshot,
        fundingPreviewUnavailable: true,
        fundingPreviewError: {
          code: "STRIPE_BALANCE_UNAVAILABLE",
          checkedAt: isoNow(this.clock),
        },
      };
    }
    const minimumReserveCents = this.configuredMinimumReserveCents;
    return {
      ...snapshot,
      fundingPreviewUnavailable: false,
      fundingPreviewError: null,
      batches: snapshot.batches.map((batch) => {
        if (!["PREPARED", "OWNER_APPROVED"].includes(batch.status))
          return batch;
        const projectedBalanceCents = availableBalanceCents - batch.totalCents;
        if (!Number.isSafeInteger(projectedBalanceCents)) {
          throw new Error(
            "Batch funding preview exceeds the safe integer range",
          );
        }
        return {
          ...batch,
          availableBalanceCents,
          minimumReserveCents,
          projectedBalanceCents,
        };
      }),
    };
  }

  private async refreshRecipient(
    artistId: string,
    displayName: string,
    accountId: string,
  ): Promise<{ account: ArtistAccountRecord; stripe: StripeRecipientStatus }> {
    const now = isoNow(this.clock);
    const status = await this.stripe.retrieveRecipientStatus(
      accountId,
      artistId,
    );
    const observedState = onboardingState(status);
    const existing = await this.repository.getArtistAccount(artistId);
    const payoutDestinationUnchanged =
      existing?.payoutDestinationId !== null &&
      existing?.payoutDestinationId === status.payoutDestinationId;
    const retainedPayoutApproval =
      existing?.onboardingStatus === "PAYOUT_READY" &&
      existing.payoutReadyApprovedAt !== null &&
      payoutDestinationUnchanged;
    const payoutDestinationReapprovalRequired =
      (existing?.onboardingStatus === "PAYOUT_READY" &&
        !payoutDestinationUnchanged) ||
      existing?.disabledReason ===
        "payout_destination_requires_owner_reapproval";
    const state = payoutDestinationReapprovalRequired
      ? "RESTRICTED"
      : observedState === "TRANSFERS_ENABLED" &&
          recipientIsReady(status) &&
          retainedPayoutApproval
        ? "PAYOUT_READY"
        : observedState;
    if (
      existing?.onboardingStatus === "PAYOUT_READY" &&
      !payoutDestinationUnchanged
    ) {
      await this.repository.openException({
        exceptionId: await deterministicBusinessId(
          "exception_destination",
          `${this.repository.environment}:${artistId}:${status.payoutDestinationId ?? "missing"}`,
        ),
        artistId,
        exceptionType: "PAYOUT_DESTINATION_CHANGED",
        reasonCode: status.payoutDestinationId
          ? "DEFAULT_BANK_DESTINATION_CHANGED"
          : "DEFAULT_BANK_DESTINATION_UNAVAILABLE",
        safeReason:
          "The recipient's default USD standard-payout bank destination changed or became unavailable.",
        ownerActionRequired:
          "Verify the new payout destination in Stripe, then explicitly reactivate this artist before any later batch.",
        stripeReference: status.payoutDestinationId,
        createdAt: now,
      });
    }
    const account = await this.repository.upsertArtistAccount({
      artistId,
      stripeAccountId: accountId,
      artistDisplayName: displayName,
      onboardingStatus: state,
      requirementsStatus: status.requirementsStatus,
      transfersStatus: status.transfersStatus,
      payoutsStatus: status.payoutsStatus,
      automaticPayoutsEnabled: status.automaticPayoutsEnabled,
      payoutDestinationId: status.payoutDestinationId,
      payoutReadyApprovedAt:
        state === "PAYOUT_READY"
          ? (existing?.payoutReadyApprovedAt ?? null)
          : null,
      lastRequirementsCheckAt: now,
      onboardedAt:
        existing?.onboardedAt ??
        (state === "PAYOUT_READY" ||
        state === "TRANSFERS_ENABLED" ||
        state === "ONBOARDING_COMPLETE"
          ? now
          : null),
      disabledReason: payoutDestinationReapprovalRequired
        ? "payout_destination_requires_owner_reapproval"
        : status.disabledReason,
      payoutExceptionFlag: state === "RESTRICTED" || state === "DISABLED",
      now,
    });
    await this.rosterProjectionWriter?.sync(account);
    return { account, stripe: status };
  }

  async startOnboarding(input: {
    artistId: string;
    actor: PayoutActor;
    requestId: string;
  }): Promise<{
    account: ArtistAccountRecord;
    invitationUrl: string;
    challengeCode: string;
    expiresAt: number;
  }> {
    assertOwner(input.actor);
    if (!isSafeBusinessId(input.artistId))
      throw new Error("Artist ID is malformed");
    const claimSecret = assertOnboardingClaimSecret(
      this.onboardingClaimSecret ?? "",
    );
    if (!this.authoritativeSources)
      throw new Error("Authoritative artist roster access is not configured");
    const identity = await this.authoritativeSources.resolveArtist(
      input.artistId,
    );
    if (identity.artistId !== input.artistId || identity.active !== true)
      throw new Error("Authoritative artist identity does not match");
    const now = isoNow(this.clock);
    const provenanceFingerprint = await stripeRecipientProvenance({
      secret: claimSecret,
      environment: this.repository.environment,
      artistId: identity.artistId,
      contactEmail: identity.contactEmail,
    });
    let account = await this.repository.getArtistAccount(input.artistId);
    if (!account) {
      const matches = await this.stripe.findRecipientsByArtist({
        artistId: input.artistId,
        contactEmail: identity.contactEmail,
        provenanceFingerprint,
      });
      if (matches.length > 0) {
        await this.repository.openException({
          exceptionId: operationalId("exception"),
          artistId: input.artistId,
          exceptionType: "ONBOARDING_ACCOUNT_RECONCILIATION",
          reasonCode:
            matches.length === 1
              ? "EXISTING_RECIPIENT_FOUND"
              : "DUPLICATE_RECIPIENTS_FOUND",
          safeReason:
            "Stripe already contains an artist recipient mapping that is not admitted to the payout ledger.",
          ownerActionRequired:
            "Verify and explicitly map or resolve the existing Stripe recipient before onboarding.",
          createdAt: now,
        });
        throw new Error(
          "Existing Stripe recipient requires owner reconciliation before onboarding",
        );
      }
      const created = await this.stripe.createRecipient({
        artistId: input.artistId,
        displayName: identity.displayName,
        contactEmail: identity.contactEmail,
        country: identity.country,
        legalEntityType: identity.legalEntityType,
        environment: this.repository.environment,
        provenanceFingerprint,
      });
      account = (
        await this.refreshRecipient(
          input.artistId,
          identity.displayName,
          created.accountId,
        )
      ).account;
      await this.repository.appendAudit({
        auditId: operationalId("audit"),
        timestamp: now,
        actor: input.actor.email,
        action: "STRIPE_RECIPIENT_CREATED",
        artistId: input.artistId,
        connectedAccountId: created.accountId,
        result: "SUCCESS",
        requestId: input.requestId,
        safeDetails: { dashboard: "express", configuration: "recipient" },
      });
    } else {
      account = (
        await this.refreshRecipient(
          input.artistId,
          account.artistDisplayName,
          account.stripeAccountId,
        )
      ).account;
    }

    if (
      account.onboardingStatus === "PAYOUT_READY" ||
      account.onboardingStatus === "DISABLED"
    ) {
      await this.repository.revokeArtistOnboardingSessions({
        artistId: account.artistId,
        revokedAt: now,
      });
      throw new Error(
        "Payout-ready or disabled recipients require a separate owner-audited recovery workflow",
      );
    }
    const nonce = operationalId("onboarding_claim");
    const challengeCode = generateOnboardingChallengeCode();
    const expiresAtDate = new Date(this.clock.now().valueOf() + 60 * 60 * 1000);
    const expiresAt = Math.floor(expiresAtDate.valueOf() / 1000);
    await this.repository.createOnboardingClaim({
      nonce,
      artistId: identity.artistId,
      stripeAccountId: account.stripeAccountId,
      rosterRevision: identity.revision,
      challengeDigest: await onboardingChallengeDigest({
        secret: claimSecret,
        environment: this.repository.environment,
        artistId: identity.artistId,
        accountId: account.stripeAccountId,
        nonce,
        rosterRevision: identity.revision,
        challengeCode,
      }),
      expiresAt: expiresAtDate.toISOString(),
      createdBy: input.actor.email,
      createdAt: now,
    });
    const claim = await signOnboardingClaim(
      {
        version: 1,
        purpose: "artist-onboarding-claim",
        environment: this.repository.environment,
        artistId: identity.artistId,
        accountId: account.stripeAccountId,
        nonce,
        rosterRevision: identity.revision,
        recipientEmailBinding: await onboardingRecipientEmailBinding({
          secret: claimSecret,
          environment: this.repository.environment,
          artistId: identity.artistId,
          contactEmail: identity.contactEmail,
        }),
        expiresAt: expiresAtDate.toISOString(),
      },
      claimSecret,
    );
    const invitationUrl = `${this.publicBaseUrl}/artist/payout-onboarding?claim=${encodeURIComponent(claim)}`;
    await this.repository.appendAudit({
      auditId: operationalId("audit"),
      timestamp: now,
      actor: input.actor.email,
      action: "ARTIST_ONBOARDING_CLAIM_CREATED",
      artistId: input.artistId,
      connectedAccountId: account.stripeAccountId,
      result: "SUCCESS",
      requestId: input.requestId,
      safeDetails: {
        expiresAt,
        rawStripeLinkExposed: false,
        challengeDelivery: "authoritative_roster_mailbox_out_of_band",
        rosterRevision: identity.revision,
      },
    });
    return { account, invitationUrl, challengeCode, expiresAt };
  }

  async mapExistingStripeRecipient(input: {
    artistId: string;
    accountId: string;
    actor: PayoutActor;
    requestId: string;
  }): Promise<ArtistAccountRecord> {
    assertOwner(input.actor);
    const claimSecret = assertOnboardingClaimSecret(
      this.onboardingClaimSecret ?? "",
    );
    if (!isSafeBusinessId(input.artistId))
      throw new Error("Artist ID is malformed");
    if (!/^acct_[A-Za-z0-9]{12,80}$/.test(input.accountId))
      throw new Error("Stripe account ID is malformed");
    if (!this.authoritativeSources)
      throw new Error("Authoritative artist roster access is not configured");
    const identity = await this.authoritativeSources.resolveArtist(
      input.artistId,
    );
    if (
      identity.artistId !== input.artistId ||
      identity.environment !== this.repository.environment ||
      identity.active !== true
    ) {
      throw new Error("Authoritative artist identity does not match");
    }
    if (await this.repository.getArtistAccount(input.artistId))
      throw new Error(
        "Artist already has an admitted Stripe recipient mapping",
      );
    const provenanceFingerprint = await stripeRecipientProvenance({
      secret: claimSecret,
      environment: this.repository.environment,
      artistId: identity.artistId,
      contactEmail: identity.contactEmail,
    });
    const matches = await this.stripe.findRecipientsByArtist({
      artistId: input.artistId,
      contactEmail: identity.contactEmail,
      provenanceFingerprint,
    });
    const candidate = matches.length === 1 ? matches[0] : null;
    if (
      !candidate ||
      candidate.accountId !== input.accountId ||
      !candidate.contactEmailMatches ||
      !candidate.environmentMetadataMatches ||
      !candidate.purposeMatches ||
      !candidate.provenanceMatches
    )
      throw new Error(
        "Stripe recipient inventory does not contain one exact artist-bound account",
      );
    const status = await this.stripe.retrieveRecipientStatus(
      input.accountId,
      input.artistId,
    );
    if (status.accountId !== input.accountId)
      throw new Error("Stripe recipient readback returned a different account");
    const now = isoNow(this.clock);
    const account = await this.repository.upsertArtistAccount({
      artistId: input.artistId,
      stripeAccountId: input.accountId,
      artistDisplayName: identity.displayName,
      onboardingStatus: onboardingState(status),
      requirementsStatus: status.requirementsStatus,
      transfersStatus: status.transfersStatus,
      payoutsStatus: status.payoutsStatus,
      automaticPayoutsEnabled: status.automaticPayoutsEnabled,
      payoutDestinationId: status.payoutDestinationId,
      payoutReadyApprovedAt: null,
      lastRequirementsCheckAt: now,
      onboardedAt: recipientIsReady(status) ? now : null,
      disabledReason: status.disabledReason,
      payoutExceptionFlag: Boolean(status.disabledReason),
      auditActor: input.actor.email,
      auditRequestId: input.requestId,
      auditId: operationalId("audit"),
      now,
    });
    await this.rosterProjectionWriter?.sync(account);
    return account;
  }

  async activateArtistPayoutAccount(input: {
    artistId: string;
    accountId: string;
    identityEvidenceReference: string;
    actor: PayoutActor;
    requestId: string;
  }): Promise<ArtistAccountRecord> {
    assertOwner(input.actor);
    if (!isSafeBusinessId(input.artistId))
      throw new Error("Artist ID is malformed");
    if (!/^acct_[A-Za-z0-9]{12,80}$/.test(input.accountId))
      throw new Error("Stripe account ID is malformed");
    const identityEvidenceReference = sanitizeOperationalText(
      input.identityEvidenceReference,
      120,
    );
    if (
      !isSafeBusinessId(identityEvidenceReference) ||
      identityEvidenceReference.length < 8 ||
      identityEvidenceReference !== input.identityEvidenceReference.trim()
    ) {
      throw new Error(
        "Payee identity activation requires a non-sensitive evidence reference",
      );
    }
    if (!this.authoritativeSources)
      throw new Error("Authoritative artist roster access is not configured");
    const [identity, account] = await Promise.all([
      this.authoritativeSources.resolveArtist(input.artistId),
      this.repository.getArtistAccount(input.artistId),
    ]);
    if (
      identity.environment !== this.repository.environment ||
      identity.artistId !== input.artistId ||
      identity.active !== true ||
      !account ||
      account.stripeAccountId !== input.accountId
    ) {
      throw new Error(
        "Owner activation requires one exact roster-bound, Stripe-ready recipient",
      );
    }
    const status = await this.stripe.retrieveRecipientStatus(
      input.accountId,
      input.artistId,
    );
    if (status.accountId !== input.accountId || !recipientIsReady(status)) {
      throw new Error(
        "Owner activation requires one exact roster-bound, Stripe-ready recipient",
      );
    }
    const now = isoNow(this.clock);
    const payoutApprovalStillValid =
      account.onboardingStatus === "PAYOUT_READY" &&
      account.payoutReadyApprovedAt !== null &&
      isIsoInstant(account.payoutReadyApprovedAt) &&
      account.payoutDestinationId !== null &&
      account.payoutDestinationId === status.payoutDestinationId;
    await this.repository.upsertArtistAccount({
      artistId: input.artistId,
      stripeAccountId: input.accountId,
      artistDisplayName: identity.displayName,
      onboardingStatus: payoutApprovalStillValid
        ? "PAYOUT_READY"
        : onboardingState(status),
      requirementsStatus: status.requirementsStatus,
      transfersStatus: status.transfersStatus,
      payoutsStatus: status.payoutsStatus,
      automaticPayoutsEnabled: status.automaticPayoutsEnabled,
      payoutDestinationId: status.payoutDestinationId,
      payoutReadyApprovedAt: payoutApprovalStillValid
        ? account.payoutReadyApprovedAt
        : null,
      lastRequirementsCheckAt: now,
      onboardedAt: account.onboardedAt ?? now,
      disabledReason: status.disabledReason,
      payoutExceptionFlag: false,
      auditActor: input.actor.email,
      auditRequestId: input.requestId,
      auditId: operationalId("audit"),
      now,
    });
    const activated = await this.repository.activateArtistPayoutAccount({
      artistId: input.artistId,
      stripeAccountId: input.accountId,
      rosterRevision: identity.revision,
      verificationId: operationalId("identity_verification"),
      identityEvidenceReference,
      actor: input.actor.email,
      auditId: operationalId("audit"),
      requestId: input.requestId,
      nextBatchEligibilityDate: nextProcessingDateAfterEligibility(
        dateInTimeZone(this.clock.now()),
        this.clock.now(),
      ),
      now,
    });
    await this.rosterProjectionWriter?.sync(activated);
    return activated;
  }

  async ingestLedger(input: {
    crmRecordId: string;
    actor: PayoutActor;
    requestId: string;
  }): Promise<{
    ledger: LedgerRecord;
    blockers: string[];
    approvalInvalidated: boolean;
  }> {
    const nowDate = this.clock.now();
    const now = isoNow({ now: () => nowDate });
    if (!this.authoritativeSources)
      throw new Error(
        "Authoritative CRM payout source access is not configured",
      );
    const source = await this.authoritativeSources.resolveCrmSource(
      input.crmRecordId,
    );
    if (source.recordId !== input.crmRecordId)
      throw new Error(
        "Authoritative CRM payout source identity does not match",
      );
    if (source.environment !== this.repository.environment)
      throw new Error(
        "Authoritative CRM payout source environment does not match",
      );
    if (source.priorPayment.disposition !== "CLEAR") {
      throw new Error(
        "Prior or ambiguous payment evidence requires owner-reviewed historical reconciliation; normal Stripe intake is blocked",
      );
    }
    const mapped = await this.repository.getArtistAccount(source.artistId);
    if (!mapped)
      throw new Error(
        "Artist must have a source-bound Stripe recipient before ledger intake",
      );
    const refreshedRecipient = await this.refreshRecipient(
      source.artistId,
      source.artistName,
      mapped.stripeAccountId,
    );
    const stripeStatus: StripeRecipientStatus = refreshedRecipient.stripe;
    const payoutAccount = refreshedRecipient.account;
    const ownerActivationVerified =
      payoutAccount.onboardingStatus === "PAYOUT_READY" &&
      payoutAccount.payoutReadyApprovedAt !== null &&
      isIsoInstant(payoutAccount.payoutReadyApprovedAt);

    const draft: LedgerDraft = {
      ledgerId: await deterministicBusinessId(
        "ledger",
        `${this.repository.environment}:${source.assignmentId}`,
      ),
      bookingId: source.bookingId,
      assignmentId: source.assignmentId,
      crmRecordId: source.recordId,
      crmRevision: source.revision,
      artistId: source.artistId,
      artistName: source.artistName,
      eventName: source.eventName,
      eventDate: source.eventDate,
      closeoutVerifiedAt: source.closeoutVerifiedAt,
      service: source.service,
      environment: this.repository.environment,
      sourceRevision: source.sourceRevision,
      servicePayCents: source.servicePayCents,
      travelPayCents: source.travelPayCents,
      bonusCents: source.bonusCents,
      adjustmentCents: source.adjustmentCents,
      deductionCents: source.deductionCents,
      totalApprovedPayCents: source.totalApprovedPayCents,
      connectedAccountId: mapped.stripeAccountId,
      closeout: {
        ...source.closeout,
        stripeOnboardingComplete:
          stripeStatus?.requirementsStatus === "complete",
        stripeTransfersActive: stripeStatus?.transfersStatus === "active",
        stripePayoutsActive:
          stripeStatus?.payoutsStatus === "active" &&
          stripeStatus.automaticPayoutsEnabled &&
          stripeStatus.payoutScheduleInterval !== null,
        connectedAccountMatchesArtist: Boolean(
          stripeStatus &&
          mapped.stripeAccountId === stripeStatus.accountId &&
          ownerActivationVerified,
        ),
      },
    };
    if (
      draft.closeout.actualEndTime &&
      !isIsoInstant(draft.closeout.actualEndTime)
    ) {
      throw new Error("Actual end time must be an ISO UTC instant");
    }
    if (draft.closeout.actualEndTime) {
      const actualEnd = new Date(draft.closeout.actualEndTime);
      if (actualEnd.valueOf() > nowDate.valueOf() + 30_000)
        throw new Error("Actual end time cannot be in the future");
      if (dateInTimeZone(actualEnd) < draft.eventDate)
        throw new Error("Actual end time cannot precede the event date");
    }
    const closeoutVerifiedAt = new Date(draft.closeoutVerifiedAt);
    if (closeoutVerifiedAt.valueOf() > nowDate.valueOf() + 30_000)
      throw new Error("Closeout verification time cannot be in the future");
    if (
      draft.closeout.actualEndTime &&
      closeoutVerifiedAt.valueOf() < Date.parse(draft.closeout.actualEndTime)
    ) {
      throw new Error(
        "Closeout verification time cannot precede the actual event end",
      );
    }
    if (dateInTimeZone(closeoutVerifiedAt) < draft.eventDate)
      throw new Error(
        "Closeout verification time cannot precede the event date",
      );
    const ownerActivatedAt = ownerActivationVerified
      ? new Date(payoutAccount.payoutReadyApprovedAt as string)
      : null;
    if (
      ownerActivatedAt &&
      ownerActivatedAt.valueOf() > nowDate.valueOf() + 30_000
    ) {
      throw new Error("Owner payout activation time cannot be in the future");
    }
    const assessment = assessCloseoutEligibility(draft.closeout);
    const closeoutStatus = derivedCloseoutStatus(
      assessment.eligible,
      assessment.blockers,
    );
    const state = assessment.eligible
      ? "READY_FOR_OWNER_APPROVAL"
      : closeoutStatus === "ISSUE_REVIEW"
        ? "ISSUE_REVIEW"
        : "CLOSEOUT_PENDING";
    const batchEligibilityDate = assessment.eligible
      ? nextProcessingDateAfterEligibility(
          draft.eventDate,
          new Date(
            Math.max(
              closeoutVerifiedAt.valueOf(),
              ownerActivatedAt?.valueOf() ?? nowDate.valueOf(),
            ),
          ),
        )
      : null;
    const result = await this.repository.upsertLedger({
      draft,
      state,
      closeoutStatus,
      batchEligibilityDate,
      paymentMemo: memoFor(draft),
      actor: input.actor.email,
      auditId: operationalId("audit"),
      requestId: input.requestId,
      now,
    });
    return {
      ledger: result.record,
      blockers: assessment.blockers,
      approvalInvalidated: result.approvalInvalidated,
    };
  }

  async prepareBatch(input: {
    scheduledDate: string;
    actor: PayoutActor;
    requestId: string;
  }): Promise<Awaited<ReturnType<PayoutRepository["prepareBatch"]>>> {
    const processingInstant = this.clock.now();
    const now = isoNow({ now: () => processingInstant });
    assertCurrentLosAngelesProcessingDay(
      input.scheduledDate,
      processingInstant,
    );
    const candidates = await this.repository.listReadyLedgers(
      input.scheduledDate,
    );
    if (candidates.ledgers.length === 0)
      throw new Error(
        "No eligible assignments are available for this processing date",
      );
    const recipientChecks = new Map<
      string,
      Promise<{
        refreshed: {
          account: ArtistAccountRecord;
          stripe: StripeRecipientStatus;
        } | null;
        unavailable: boolean;
      }>
    >();
    const approved: LedgerRecord[] = [];
    const blocked: LedgerRecord[] = [];
    const blockedExceptionIds: string[] = [];
    for (const ledger of candidates.ledgers) {
      const key = `${ledger.artistId}:${ledger.connectedAccountId}`;
      let check = recipientChecks.get(key);
      if (!check) {
        check = (async () => {
          try {
            const refreshed = await this.refreshRecipient(
              ledger.artistId,
              ledger.artistName,
              ledger.connectedAccountId,
            );
            return { refreshed, unavailable: false };
          } catch {
            return { refreshed: null, unavailable: true };
          }
        })();
        recipientChecks.set(key, check);
      }
      const result = await check;
      if (
        result.refreshed &&
        recipientMatchesDurablePayoutApproval(
          result.refreshed.account,
          ledger,
          result.refreshed.stripe,
          input.scheduledDate,
        )
      ) {
        approved.push(ledger);
        continue;
      }
      blocked.push(ledger);
      blockedExceptionIds.push(
        await this.openOperationalException({
          ledger,
          exceptionType: "RECIPIENT_BATCH_PREVIEW",
          reasonCode: result.unavailable
            ? "RECIPIENT_STATUS_UNAVAILABLE"
            : "RECIPIENT_NOT_PAYOUT_READY",
          safeReason: result.unavailable
            ? "Stripe recipient readiness could not be refreshed for the batch preview."
            : "The current Stripe recipient is not fully enabled for transfers and standard payouts.",
          ownerActionRequired:
            "Resolve or verify the Stripe recipient and refresh the assignment before a later batch.",
          now,
        }),
      );
    }
    if (approved.length === 0) {
      throw new Error(
        "All payout candidates were blocked by the current Stripe readiness preflight",
      );
    }
    const batchId = operationalId(
      `batch_${input.scheduledDate.replaceAll("-", "")}`,
    );
    return this.repository.prepareBatch({
      batchId,
      scheduledDate: input.scheduledDate,
      ledgerIds: approved.map((ledger) => ledger.ledgerId),
      blockedItemCount: blocked.length,
      blockedExceptionIds,
      remainingCandidateCount: candidates.remainingCandidateCount,
      createdBy: input.actor.email,
      auditId: operationalId("audit"),
      requestId: input.requestId,
      now,
    });
  }

  async approveBatch(input: {
    batchId: string;
    expectedDigest: string;
    expectedRevision: number;
    actor: PayoutActor;
    requestId: string;
  }): Promise<PayoutBatchRecord> {
    assertOwner(input.actor);
    return this.repository.approveBatch({
      batchId: input.batchId,
      expectedDigest: input.expectedDigest,
      expectedRevision: input.expectedRevision,
      approvedBy: input.actor.email,
      auditId: operationalId("audit"),
      requestId: input.requestId,
      now: isoNow(this.clock),
    });
  }

  async releaseUnchangedBatchAssignments(input: {
    batchId: string;
    actor: PayoutActor;
    requestId: string;
  }): Promise<{
    batch: PayoutBatchRecord;
    releasedLedgerIds: string[];
  }> {
    assertOwner(input.actor);
    return this.repository.releaseUnchangedLedgersFromBlockedBatch({
      batchId: input.batchId,
      actor: input.actor.email,
      auditId: operationalId("audit"),
      requestId: input.requestId,
      now: isoNow(this.clock),
    });
  }

  async authorizeCrossDayBatchRecovery(input: {
    batchId: string;
    expectedDigest: string;
    expectedRevision: number;
    reason: string;
    actor: PayoutActor;
    requestId: string;
  }): Promise<PayoutBatchRecord> {
    assertOwner(input.actor);
    const instant = this.clock.now();
    const processingDate = dateInTimeZone(instant);
    assertCurrentLosAngelesProcessingDay(processingDate, instant);
    return this.repository.authorizeCrossDayBatchRecovery({
      batchId: input.batchId,
      recoveryProcessingDate: processingDate,
      expectedDigest: input.expectedDigest,
      expectedRevision: input.expectedRevision,
      reason: sanitizeOperationalText(input.reason, 240),
      staleBefore: new Date(instant.valueOf() - 15 * 60 * 1000).toISOString(),
      actor: input.actor.email,
      auditId: operationalId("audit"),
      requestId: input.requestId,
      now: instant.toISOString(),
    });
  }

  private async openOperationalException(input: {
    ledger?: LedgerRecord | null;
    batchId?: string | null;
    artistId?: string | null;
    exceptionType: string;
    reasonCode: string;
    safeReason: string;
    ownerActionRequired: string;
    stripeReference?: string | null;
    now: string;
  }): Promise<string> {
    const exceptionId = operationalId("exception");
    await this.repository.openException({
      exceptionId,
      ledgerId: input.ledger?.ledgerId ?? null,
      batchId: input.batchId ?? input.ledger?.batchId ?? null,
      artistId: input.artistId ?? input.ledger?.artistId ?? null,
      bookingId: input.ledger?.bookingId ?? null,
      assignmentId: input.ledger?.assignmentId ?? null,
      exceptionType: input.exceptionType,
      reasonCode: input.reasonCode,
      safeReason: input.safeReason,
      ownerActionRequired: input.ownerActionRequired,
      lastAttemptAt: input.now,
      stripeReference: input.stripeReference ?? null,
      createdAt: input.now,
    });
    return exceptionId;
  }

  private async assertPayoutDestinationApproved(input: {
    ledger: LedgerRecord;
    payoutId: string;
    destinationId: string;
    now: string;
  }): Promise<void> {
    if (
      await this.payoutDestinationIsAuthorized(
        input.ledger,
        input.payoutId,
        input.destinationId,
      )
    ) {
      return;
    }
    await this.openOperationalException({
      ledger: input.ledger,
      exceptionType: "PAYOUT_DESTINATION_MISMATCH",
      reasonCode: "PAYOUT_DESTINATION_NOT_DURABLY_APPROVED",
      safeReason:
        "The authoritative Stripe payout bank destination does not match the immutable destination approval captured before transfer creation.",
      ownerActionRequired:
        "Reconcile the payout against the exact pre-transfer destination snapshot before retrying; do not replace historical destination evidence.",
      stripeReference: input.payoutId,
      now: input.now,
    });
    throw new Error(
      "Stripe payout destination does not match the pre-transfer approved bank destination",
    );
  }

  private async payoutDestinationIsAuthorized(
    ledger: LedgerRecord,
    payoutId: string,
    destinationId: string,
  ): Promise<boolean> {
    if (payoutMatchesHistoricalDestinationApproval(ledger, destinationId)) {
      return true;
    }
    if (
      !ledger.approvedPayoutDestinationId ||
      !ledger.approvedPayoutDestinationAt ||
      !isIsoInstant(ledger.approvedPayoutDestinationAt)
    ) {
      return false;
    }
    const variance = await this.repository.getPayoutDestinationVarianceApproval(
      ledger.ledgerId,
      payoutId,
    );
    return (
      variance !== null &&
      variance.environment === ledger.environment &&
      variance.ledgerId === ledger.ledgerId &&
      variance.payoutId === payoutId &&
      variance.originalDestinationId === ledger.approvedPayoutDestinationId &&
      variance.approvedDestinationId === destinationId &&
      isIsoInstant(variance.recipientApprovalAt)
    );
  }

  private async assertBatchRecipientsReady(
    items: PayoutBatchItemRecord[],
    now: string,
    processingDate: string,
  ): Promise<void> {
    for (const item of items) {
      if (!["APPROVED", "TRANSFER_QUEUED", "FAILED"].includes(item.status))
        continue;
      const ledger = await this.repository.getLedger(item.ledgerId);
      if (!ledger) throw new Error("An approved payout ledger is missing");
      let refreshed: {
        account: ArtistAccountRecord;
        stripe: StripeRecipientStatus;
      };
      try {
        refreshed = await this.refreshRecipient(
          ledger.artistId,
          ledger.artistName,
          ledger.connectedAccountId,
        );
      } catch {
        await this.openOperationalException({
          ledger,
          exceptionType: "RECIPIENT_EXECUTION_PREFLIGHT",
          reasonCode: "RECIPIENT_STATUS_UNAVAILABLE",
          safeReason:
            "Stripe recipient readiness could not be authoritatively verified before batch execution.",
          ownerActionRequired:
            "Verify the recipient in Stripe and retry the owner-approved batch without changing its material revision.",
          now,
        });
        throw new Error("A recipient readiness check failed before execution");
      }
      const status = refreshed.stripe;
      if (
        status.accountId !== ledger.connectedAccountId ||
        !recipientMatchesDurablePayoutApproval(
          refreshed.account,
          ledger,
          status,
          processingDate,
        )
      ) {
        await this.openOperationalException({
          ledger,
          exceptionType: "RECIPIENT_EXECUTION_PREFLIGHT",
          reasonCode:
            status.payoutDestinationId === null
              ? "PAYOUT_DESTINATION_UNAVAILABLE"
              : "RECIPIENT_OR_DESTINATION_NOT_APPROVED",
          safeReason:
            "A recipient is no longer fully enabled for transfers and standard payouts.",
          ownerActionRequired:
            "Resolve the Stripe requirements or account restriction before retrying this batch.",
          now,
        });
        throw new Error("A recipient is not payout-ready");
      }
    }
  }

  private async assertBatchSourceUnchanged(input: {
    batchId: string;
    item: PayoutBatchItemRecord;
    actor: PayoutActor;
    requestId: string;
    now: string;
  }): Promise<LedgerRecord> {
    if (!this.authoritativeSources)
      throw new Error(
        "Authoritative CRM payout source access is not configured",
      );
    const ledger = await this.repository.getLedger(input.item.ledgerId);
    if (!ledger) throw new Error("An approved payout ledger is missing");
    let source: AuthoritativeCrmPayoutSource;
    try {
      source = await this.authoritativeSources.resolveCrmSource(
        ledger.crmRecordId,
      );
    } catch (error) {
      await this.openOperationalException({
        ledger,
        exceptionType: "AUTHORITATIVE_SOURCE_UNAVAILABLE",
        reasonCode: "CRM_SOURCE_READ_UNAVAILABLE",
        safeReason:
          "The authoritative CRM record could not be read or authenticated before execution.",
        ownerActionRequired:
          "Restore the exact signed CRM source read and retry the unchanged owner-approved batch.",
        now: input.now,
      });
      throw new Error(
        "Authoritative CRM source is unavailable; no approval was mutated",
        { cause: error },
      );
    }
    try {
      assertLedgerMatchesAuthoritativeSource(ledger, source);
      return ledger;
    } catch (error) {
      if (!(error instanceof AuthoritativeSourceMismatchError)) throw error;
      await this.repository.invalidateBatchForAuthoritativeSourceChange({
        batchId: input.batchId,
        ledgerId: ledger.ledgerId,
        actor: input.actor.email,
        auditId: operationalId("audit"),
        requestId: input.requestId,
        now: input.now,
      });
      await this.openOperationalException({
        ledger,
        exceptionType: "AUTHORITATIVE_SOURCE_CHANGE",
        reasonCode: "CRM_SOURCE_CHANGED_AFTER_APPROVAL",
        safeReason:
          "The authoritative CRM record no longer exactly matches the owner-approved assignment snapshot.",
        ownerActionRequired:
          "Re-import the current CRM source, review a newly prepared batch, and approve a new exact digest.",
        now: input.now,
      });
      throw new Error(
        "Authoritative CRM source changed; owner approval was invalidated",
        { cause: error },
      );
    }
  }

  async executeBatch(input: {
    batchId: string;
    expectedDigest: string;
    expectedRevision: number;
    actor: PayoutActor;
    requestId: string;
  }): Promise<BatchExecutionResult> {
    assertOwner(input.actor);
    const executionDate = this.clock.now();
    const now = isoNow({ now: () => executionDate });
    let batch = await this.repository.getBatch(input.batchId);
    if (!batch) throw new Error("Payout batch was not found");
    const processingDate = assertBatchExecutionProcessingDay(
      batch,
      executionDate,
    );
    if (
      batch.approvalDigest !== input.expectedDigest ||
      batch.approvalRevision !== input.expectedRevision
    ) {
      throw new Error(
        "Batch approval revision does not match the owner-reviewed snapshot",
      );
    }
    if (
      !["OWNER_APPROVED", "EXECUTING", "PARTIALLY_COMPLETED"].includes(
        batch.status,
      )
    ) {
      throw new Error("Batch is not eligible for owner-triggered execution");
    }

    const items = await this.repository.getBatchItems(input.batchId);
    const actionable = items.filter((item) =>
      ["APPROVED", "TRANSFER_QUEUED", "FAILED"].includes(item.status),
    );
    if (actionable.length === 0)
      throw new Error("Batch has no transfer items requiring execution");

    // Re-read every source before any Stripe call. This invalidates the owner
    // approval if CRM changed after preview or approval.
    for (const item of actionable) {
      await this.assertBatchSourceUnchanged({
        batchId: input.batchId,
        item,
        actor: input.actor,
        requestId: input.requestId,
        now,
      });
    }
    // Check every recipient before claiming the environment-wide execution lock.
    // A second source and recipient check occurs immediately before each transfer.
    await this.assertBatchRecipientsReady(actionable, now, processingDate);
    const availableBalanceCents =
      await this.stripe.retrieveAvailableBalance("usd");
    const remainingTotalCents = actionable.reduce((sum, item) => {
      const total = sum + item.totalApprovedPayCents;
      if (!Number.isSafeInteger(total))
        throw new Error("Remaining batch total exceeds the safe integer range");
      return total;
    }, 0);
    assertBalanceCanFundBatch({
      availableBalanceCents,
      batchTotalCents: remainingTotalCents,
      minimumReserveCents: this.configuredMinimumReserveCents,
    });

    let claimToken: string;
    if (batch.status === "OWNER_APPROVED") {
      claimToken = operationalId("batch_claim");
      batch = await this.repository.claimBatchExecution({
        batchId: input.batchId,
        expectedDigest: input.expectedDigest,
        expectedRevision: input.expectedRevision,
        claimToken,
        availableBalanceCents,
        minimumReserveCents: this.configuredMinimumReserveCents,
        actor: input.actor.email,
        auditId: operationalId("audit"),
        requestId: input.requestId,
        now,
      });
    } else if (batch.status === "EXECUTING") {
      if (!batch.executionClaimToken || !batch.executionStartedAt) {
        throw new Error(
          "Executing batch is missing its durable claim identity",
        );
      }
      const startedAt = Date.parse(batch.executionStartedAt);
      if (
        !Number.isFinite(startedAt) ||
        executionDate.valueOf() - startedAt < 15 * 60 * 1000
      ) {
        throw new Error("Batch execution is already in progress");
      }
      claimToken = operationalId("batch_claim");
      batch = await this.repository.recoverStaleBatchExecution({
        batchId: input.batchId,
        expectedClaimToken: batch.executionClaimToken,
        newClaimToken: claimToken,
        expectedDigest: input.expectedDigest,
        expectedRevision: input.expectedRevision,
        staleBefore: new Date(
          executionDate.valueOf() - 15 * 60 * 1000,
        ).toISOString(),
        actor: input.actor.email,
        auditId: operationalId("audit"),
        requestId: input.requestId,
        now,
      });
    } else {
      if (!batch.executionClaimToken)
        throw new Error(
          "Retryable batch is missing its durable claim identity",
        );
      claimToken = batch.executionClaimToken;
    }
    await this.repository.markBatchExecutionDate({
      batchId: input.batchId,
      claimToken,
      processingDate,
      expectedDigest: input.expectedDigest,
      expectedRevision: input.expectedRevision,
      actor: input.actor.email,
      auditId: operationalId("audit"),
      requestId: input.requestId,
      now: isoNow(this.clock),
    });

    const createdTransfers: LedgerRecord[] = [];
    const failedLedgers: LedgerRecord[] = [];
    for (const item of actionable) {
      let ledger = await this.repository.getLedger(item.ledgerId);
      if (!ledger) throw new Error("A claimed payout ledger is missing");
      if (ledger.stripeTransferId) continue;

      ledger = await this.assertBatchSourceUnchanged({
        batchId: input.batchId,
        item,
        actor: input.actor,
        requestId: input.requestId,
        now: isoNow(this.clock),
      });

      const claim = await this.repository.claimTransferItem({
        attemptId: operationalId("attempt"),
        batchId: input.batchId,
        ledgerId: item.ledgerId,
        claimToken,
        actor: input.actor.email,
        auditId: operationalId("audit"),
        requestId: input.requestId,
        now: isoNow(this.clock),
      });
      const attempt = claim.attempt;
      if (
        attempt.status === "STRIPE_SUCCEEDED" ||
        attempt.status === "RECONCILED"
      )
        continue;
      if (!attemptCanReuseStripeIdempotency(attempt, this.clock.now())) {
        await this.openOperationalException({
          ledger,
          exceptionType: "TRANSFER_OUTCOME_RECONCILIATION",
          reasonCode: "IDEMPOTENCY_RECOVERY_WINDOW_EXPIRED",
          safeReason:
            "A claimed transfer has no recorded Stripe result and its automatic idempotency recovery window has expired.",
          ownerActionRequired:
            "Search Stripe using the safe ledger metadata and reconcile the existing result before any new transfer is authorized.",
          now: isoNow(this.clock),
        });
        throw new Error(
          "Transfer outcome requires manual reconciliation before retry",
        );
      }

      // No transfer occurs unless the account and balance still pass immediately
      // after the durable per-item claim.
      let refreshed: {
        account: ArtistAccountRecord;
        stripe: StripeRecipientStatus;
      } | null = null;
      try {
        refreshed = await this.refreshRecipient(
          ledger.artistId,
          ledger.artistName,
          ledger.connectedAccountId,
        );
      } catch {
        // The failed readiness read proves that no Stripe transfer was attempted.
      }
      const status = refreshed?.stripe ?? null;
      if (
        !status ||
        status.accountId !== ledger.connectedAccountId ||
        !recipientMatchesDurablePayoutApproval(
          refreshed?.account ?? null,
          ledger,
          status,
          processingDate,
        )
      ) {
        ledger = await this.repository.recordTransferFailed({
          attemptId: attempt.attemptId,
          claimToken,
          safeErrorCode: status
            ? "RECIPIENT_OR_DESTINATION_NOT_APPROVED"
            : "RECIPIENT_STATUS_UNAVAILABLE",
          safeReason:
            "Recipient readiness could not be confirmed immediately before transfer creation.",
          actor: input.actor.email,
          auditId: operationalId("audit"),
          requestId: input.requestId,
          now: isoNow(this.clock),
        });
        failedLedgers.push(ledger);
        await this.openOperationalException({
          ledger,
          exceptionType: "TRANSFER_BLOCKED_BEFORE_STRIPE",
          reasonCode: status
            ? "RECIPIENT_OR_DESTINATION_NOT_APPROVED"
            : "RECIPIENT_STATUS_UNAVAILABLE",
          safeReason:
            "The item was blocked before Stripe transfer creation because recipient readiness was not confirmed.",
          ownerActionRequired:
            "Resolve or verify the recipient status, then use the owner-controlled retry flow.",
          now: isoNow(this.clock),
        });
        continue;
      }

      const approvedAccount = refreshed?.account;
      if (
        !approvedAccount?.payoutDestinationId ||
        !approvedAccount.payoutReadyApprovedAt
      ) {
        throw new Error(
          "Recipient approval snapshot disappeared before the transfer safety write",
        );
      }
      ledger = await this.repository.recordApprovedPayoutDestination({
        attemptId: attempt.attemptId,
        claimToken,
        payoutDestinationId: approvedAccount.payoutDestinationId,
        payoutDestinationApprovedAt: approvedAccount.payoutReadyApprovedAt,
        actor: input.actor.email,
        auditId: operationalId("audit"),
        requestId: input.requestId,
        now: isoNow(this.clock),
      });

      let currentBalance: number | null = null;
      try {
        currentBalance = await this.stripe.retrieveAvailableBalance("usd");
      } catch {
        // The failed balance read proves that no Stripe transfer was attempted.
      }
      if (
        currentBalance === null ||
        currentBalance <
          ledger.totalApprovedPayCents + this.configuredMinimumReserveCents
      ) {
        ledger = await this.repository.recordTransferFailed({
          attemptId: attempt.attemptId,
          claimToken,
          safeErrorCode:
            currentBalance === null
              ? "BALANCE_CHECK_UNAVAILABLE"
              : "PAYOUT_RESERVE_BLOCKED",
          safeReason:
            "Authoritative available balance did not pass the configured reserve check immediately before transfer.",
          actor: input.actor.email,
          auditId: operationalId("audit"),
          requestId: input.requestId,
          now: isoNow(this.clock),
        });
        failedLedgers.push(ledger);
        await this.openOperationalException({
          ledger,
          exceptionType: "TRANSFER_BLOCKED_BEFORE_STRIPE",
          reasonCode:
            currentBalance === null
              ? "BALANCE_CHECK_UNAVAILABLE"
              : "PAYOUT_RESERVE_BLOCKED",
          safeReason:
            "The item was blocked before Stripe transfer creation because the balance reserve check did not pass.",
          ownerActionRequired:
            "Verify the platform available balance and configured reserve before an owner-controlled retry.",
          now: isoNow(this.clock),
        });
        continue;
      }

      let created;
      try {
        created = await this.stripe.createTransfer({
          amount: ledger.totalApprovedPayCents,
          currency: "usd",
          destination: ledger.connectedAccountId,
          description: ledger.paymentMemo,
          transferGroup: `HFL_ARTIST_BATCH:${batch.batchId}`,
          metadata: {
            ...transferMetadata(ledger, batch),
            idempotency_fingerprint: attempt.idempotencyFingerprint,
          },
          idempotencyKey: attempt.idempotencyFingerprint,
        });
      } catch (error) {
        const currentBatch = await this.repository.getBatch(batch.batchId);
        if (
          (error instanceof PayoutRepositoryError &&
            error.code === "CLAIM_REJECTED") ||
          !currentBatch ||
          currentBatch.status !== "EXECUTING" ||
          currentBatch.executionClaimToken !== claimToken
        ) {
          throw new Error(
            "Batch execution claim was rotated before transfer outcome handling",
            { cause: error },
          );
        }
        await this.openOperationalException({
          ledger,
          exceptionType: "TRANSFER_OUTCOME_RECONCILIATION",
          reasonCode: "STRIPE_TRANSFER_OUTCOME_AMBIGUOUS",
          safeReason:
            "Stripe transfer creation did not return a result that can be safely recorded.",
          ownerActionRequired:
            "Retry only through this batch using the same durable idempotency key, or manually reconcile Stripe before the recovery window expires.",
          now: isoNow(this.clock),
        });
        throw new Error(
          "Stripe transfer outcome is ambiguous; automatic creation stopped",
          { cause: error },
        );
      }

      let readback;
      try {
        readback = await this.stripe.retrieveTransfer(created.id);
      } catch {
        await this.openOperationalException({
          ledger,
          exceptionType: "TRANSFER_OUTCOME_RECONCILIATION",
          reasonCode: "STRIPE_TRANSFER_READBACK_UNAVAILABLE",
          safeReason:
            "Stripe created a transfer but authoritative readback was unavailable.",
          ownerActionRequired:
            "Retry through this batch with the same idempotency key and reconcile the Stripe transfer readback.",
          stripeReference: created.id,
          now: isoNow(this.clock),
        });
        throw new Error("Stripe transfer exists but readback is incomplete");
      }
      if (
        readback.id !== created.id ||
        readback.amount !== ledger.totalApprovedPayCents ||
        readback.currency !== "usd" ||
        readback.destination !== ledger.connectedAccountId ||
        readback.reversed ||
        readback.transferGroup !== `HFL_ARTIST_BATCH:${batch.batchId}` ||
        !exactStringRecord(readback.metadata, {
          ...transferMetadata(ledger, batch),
          idempotency_fingerprint: attempt.idempotencyFingerprint,
        }) ||
        (created.destinationPaymentId &&
          readback.destinationPaymentId &&
          created.destinationPaymentId !== readback.destinationPaymentId)
      ) {
        await this.openOperationalException({
          ledger,
          exceptionType: "TRANSFER_OUTCOME_RECONCILIATION",
          reasonCode: "STRIPE_TRANSFER_READBACK_MISMATCH",
          safeReason:
            "Stripe transfer readback did not match the owner-approved ledger snapshot.",
          ownerActionRequired:
            "Stop payout processing and reconcile the Stripe transfer against the immutable audit snapshot.",
          stripeReference: created.id,
          now: isoNow(this.clock),
        });
        throw new Error(
          "Stripe transfer readback does not match the approved payout",
        );
      }

      const destinationPaymentId =
        readback.destinationPaymentId ?? created.destinationPaymentId;
      if (!destinationPaymentId) {
        await this.openOperationalException({
          ledger,
          exceptionType: "TRANSFER_OUTCOME_RECONCILIATION",
          reasonCode: "DESTINATION_PAYMENT_ID_NOT_YET_AVAILABLE",
          safeReason:
            "Stripe transfer readback does not yet expose the destination-payment identity required for payout membership reconciliation.",
          ownerActionRequired:
            "Retry through the same batch and idempotency key until authoritative transfer readback includes the destination payment; do not create a new transfer.",
          stripeReference: readback.id,
          now: isoNow(this.clock),
        });
        throw new Error(
          "Stripe transfer exists but destination-payment evidence is incomplete",
        );
      }

      try {
        ledger = await this.repository.recordTransferSucceeded({
          attemptId: attempt.attemptId,
          claimToken,
          stripeTransferId: readback.id,
          destinationPaymentId,
          actor: input.actor.email,
          auditId: operationalId("audit"),
          requestId: input.requestId,
          now: isoNow(this.clock),
        });
      } catch (error) {
        const currentBatch = await this.repository.getBatch(batch.batchId);
        if (
          (error instanceof PayoutRepositoryError &&
            error.code === "CLAIM_REJECTED") ||
          !currentBatch ||
          currentBatch.status !== "EXECUTING" ||
          currentBatch.executionClaimToken !== claimToken
        ) {
          throw new Error(
            "Batch execution claim was rotated before transfer persistence",
            { cause: error },
          );
        }
        await this.openOperationalException({
          ledger,
          exceptionType: "TRANSFER_OUTCOME_RECONCILIATION",
          reasonCode: "LEDGER_PERSIST_AFTER_STRIPE_FAILED",
          safeReason:
            "Stripe transfer readback succeeded but the local ledger result was not durably recorded.",
          ownerActionRequired:
            "Retry through the same batch and idempotency key to recover the existing Stripe transfer; do not create a new manual transfer.",
          stripeReference: readback.id,
          now: isoNow(this.clock),
        });
        throw new Error(
          "Stripe transfer exists but ledger persistence requires recovery",
          { cause: error },
        );
      }
      createdTransfers.push(ledger);
    }

    const completed = await this.repository.getBatch(input.batchId);
    if (!completed) throw new Error("Executed batch could not be read back");
    return { batch: completed, createdTransfers, failedLedgers };
  }

  async reconcileAmbiguousTransferOutcome(input: {
    ledgerId: string;
    transferId: string;
    actor: PayoutActor;
    requestId: string;
  }): Promise<LedgerRecord> {
    assertOwner(input.actor);
    const ledger = await this.repository.getLedger(input.ledgerId);
    if (!ledger || !ledger.batchId)
      throw new Error(
        "Transfer recovery ledger is not bound to a payout batch",
      );
    if (ledger.stripeTransferId || ledger.stripeDestinationPaymentId)
      throw new Error("Transfer outcome is already recorded for this ledger");
    const batch = await this.repository.getBatch(ledger.batchId);
    if (!batch || !batch.approvalDigest)
      throw new Error("Transfer recovery batch is missing its owner approval");
    if (!batch.executionClaimToken || batch.status !== "EXECUTING")
      throw new Error(
        "Transfer recovery batch is not held by an active execution claim",
      );
    const fingerprint = transferIdempotencyKey(
      ledger.assignmentId,
      ledger.sourceRevision,
    );
    const attempt =
      await this.repository.getTransferAttemptByFingerprint(fingerprint);
    if (
      !attempt ||
      attempt.ledgerId !== ledger.ledgerId ||
      attempt.batchId !== batch.batchId ||
      attempt.status !== "CLAIMED" ||
      attempt.requestAmountCents !== ledger.totalApprovedPayCents ||
      attempt.destinationAccountId !== ledger.connectedAccountId
    ) {
      throw new Error(
        "No exact unresolved transfer attempt is available to reconcile",
      );
    }
    const transfer = await this.stripe.retrieveTransfer(input.transferId);
    const expectedMetadata = {
      ...transferMetadata(ledger, batch),
      idempotency_fingerprint: attempt.idempotencyFingerprint,
    };
    if (
      transfer.id !== input.transferId ||
      transfer.reversed ||
      transfer.amount !== ledger.totalApprovedPayCents ||
      transfer.currency !== "usd" ||
      transfer.destination !== ledger.connectedAccountId ||
      transfer.transferGroup !== `HFL_ARTIST_BATCH:${batch.batchId}` ||
      !transfer.destinationPaymentId ||
      !exactStringRecord(transfer.metadata, expectedMetadata)
    ) {
      throw new Error(
        "Stripe Transfer readback does not exactly match the claimed payout attempt",
      );
    }
    const candidates = await this.stripe.findTransfersByRecoveryFingerprint({
      destinationAccountId: ledger.connectedAccountId,
      idempotencyFingerprint: attempt.idempotencyFingerprint,
    });
    if (candidates.length !== 1 || candidates[0]?.id !== transfer.id) {
      throw new Error(
        "Stripe transfer inventory does not contain exactly one matching recovery candidate",
      );
    }
    const now = isoNow(this.clock);
    const recovered = await this.repository.recordTransferSucceeded({
      attemptId: attempt.attemptId,
      claimToken: batch.executionClaimToken,
      stripeTransferId: transfer.id,
      destinationPaymentId: transfer.destinationPaymentId,
      actor: input.actor.email,
      auditId: operationalId("audit"),
      requestId: input.requestId,
      now,
    });
    await this.repository.appendAudit({
      auditId: operationalId("audit"),
      timestamp: now,
      actor: input.actor.email,
      action: "AMBIGUOUS_TRANSFER_OUTCOME_OWNER_RECONCILED",
      bookingId: recovered.bookingId,
      assignmentId: recovered.assignmentId,
      artistId: recovered.artistId,
      amountCents: recovered.totalApprovedPayCents,
      currency: "usd",
      connectedAccountId: recovered.connectedAccountId,
      transferId: recovered.stripeTransferId,
      previousState: ledger.state,
      newState: recovered.state,
      approvalRevision: recovered.ownerApprovalRevision,
      idempotencyFingerprint: attempt.idempotencyFingerprint,
      result: "SUCCESS",
      requestId: input.requestId,
      batchId: batch.batchId,
      safeDetails: {
        attemptId: attempt.attemptId,
        destinationPaymentReadBack: true,
      },
    });
    return recovered;
  }

  async recordManualPaymentException(input: {
    ledgerId: string;
    expectedAmountCents: number;
    method: string;
    reason: string;
    evidenceReference: string;
    memo: string;
    intentDigest: string;
    actor: PayoutActor;
    requestId: string;
    crm: CrmAdapterConfig;
    fetcher?: typeof fetch;
  }): Promise<{ ledger: LedgerRecord; crm: CrmSyncReceipt }> {
    assertOwner(input.actor);
    const expectedIntentDigest = await manualPaymentIntentDigest({
      ledgerId: input.ledgerId,
      expectedAmountCents: input.expectedAmountCents,
      method: input.method,
      reason: input.reason,
      evidenceReference: input.evidenceReference,
      memo: input.memo,
    });
    if (input.intentDigest !== expectedIntentDigest)
      throw new Error(
        "Manual payment owner approval does not bind the exact evidence payload",
      );
    if (!this.authoritativeSources)
      throw new Error(
        "Authoritative CRM payout source access is not configured",
      );
    const nowDate = this.clock.now();
    const now = nowDate.toISOString();
    const current = await this.repository.getLedger(input.ledgerId);
    if (!current) throw new Error("Manual payment ledger was not found");
    const source = await this.authoritativeSources.resolveCrmSource(
      current.crmRecordId,
    );
    const durableIntentMatches =
      current.state === "MANUAL_REVIEW" &&
      current.manualPaymentMethod === input.method &&
      current.manualPaymentAmountCents === input.expectedAmountCents &&
      current.manualPaymentReason === input.reason &&
      current.manualPaymentEvidenceReference === input.evidenceReference &&
      current.manualPaymentMemo === input.memo &&
      current.manualPaymentRecordedBy !== null &&
      current.manualPaymentRecordedAt !== null;
    const existingProjectionRecovery =
      durableIntentMatches &&
      source.priorPayment.disposition === "OWNER_REVIEW_REQUIRED" &&
      source.priorPayment.reasonCodes.length === 1 &&
      source.priorPayment.reasonCodes[0] ===
        "EXISTING_PAYOUT_PROJECTION_PRESENT";
    assertLedgerMatchesAuthoritativeSource(
      current,
      source,
      existingProjectionRecovery,
    );
    let recoveredReceipt: CrmSyncReceipt | null = null;
    if (existingProjectionRecovery) {
      const expectedProjection = manualCrmProjection(current);
      const readback = await readCrmPayoutProjection(
        expectedProjection,
        input.crm,
        input.fetcher,
      );
      if (
        !isExactCrmProjectionReadback(readback.projection, expectedProjection)
      ) {
        throw new Error(
          "Existing CRM payout projection does not match the durable manual payment intent",
        );
      }
      recoveredReceipt = { ...readback, recovered: true };
    }
    const claimToken = operationalId("manual_payment_claim");
    const claimExpiresAt = new Date(
      nowDate.valueOf() + 2 * 60 * 1000,
    ).toISOString();
    let ledger = await this.repository.claimManualPaymentException({
      ledgerId: input.ledgerId,
      claimToken,
      claimExpiresAt,
      expectedAmountCents: input.expectedAmountCents,
      expectedSourceRevision: current.sourceRevision,
      expectedMaterialDigest: current.materialDigest,
      method: input.method,
      reason: input.reason,
      evidenceReference: input.evidenceReference,
      memo: input.memo,
      actor: input.actor.email,
      auditId: operationalId("audit"),
      requestId: input.requestId,
      now,
    });
    if (
      !ledger.manualPaymentMethod ||
      ledger.manualPaymentAmountCents !== input.expectedAmountCents ||
      !ledger.manualPaymentReason ||
      !ledger.manualPaymentEvidenceReference ||
      !ledger.manualPaymentMemo ||
      !ledger.manualPaymentRecordedBy ||
      !ledger.manualPaymentRecordedAt
    ) {
      throw new Error("Durable manual payment intent is incomplete");
    }
    let receipt: CrmSyncReceipt;
    try {
      receipt =
        recoveredReceipt ??
        (await syncCrmPayoutProjection(
          manualCrmProjection(ledger),
          input.crm,
          input.fetcher,
        ));
      if (receipt.recordId !== ledger.crmRecordId)
        throw new Error(
          "Manual payment CRM readback returned the wrong record",
        );
      ledger = await this.repository.finalizeManualPaymentException({
        ledgerId: ledger.ledgerId,
        claimToken,
        expectedAmountCents: input.expectedAmountCents,
        method: input.method,
        reason: input.reason,
        evidenceReference: input.evidenceReference,
        memo: input.memo,
        crmReadbackRevision: receipt.revision,
        actor: input.actor.email,
        auditId: operationalId("audit"),
        requestId: input.requestId,
        now,
      });
      return { ledger, crm: receipt };
    } catch {
      await this.repository.releaseManualPaymentClaim({
        ledgerId: ledger.ledgerId,
        claimToken,
        now: isoNow(this.clock),
      });
      await this.openOperationalException({
        ledger,
        exceptionType: "MANUAL_PAYMENT_RECONCILIATION",
        reasonCode: "MANUAL_PAYMENT_CRM_OR_D1_FINALIZATION_FAILED",
        safeReason:
          "The exceptional manual payment was not durably reconciled across CRM and the payout ledger.",
        ownerActionRequired:
          "Verify the external payment evidence and retry the exact owner-confirmed manual-payment reconciliation.",
        now: isoNow(this.clock),
      });
      throw new Error(
        "Manual payment exception reconciliation did not complete",
      );
    }
  }

  async cancelManualPaymentIntent(input: {
    ledgerId: string;
    actor: PayoutActor;
    requestId: string;
    crm: CrmAdapterConfig;
    fetcher?: typeof fetch;
  }): Promise<LedgerRecord> {
    assertOwner(input.actor);
    if (!this.authoritativeSources)
      throw new Error(
        "Authoritative CRM payout source access is not configured",
      );
    const ledger = await this.repository.getLedger(input.ledgerId);
    if (!ledger) throw new Error("Manual payment ledger was not found");
    const source = await this.authoritativeSources.resolveCrmSource(
      ledger.crmRecordId,
    );
    assertLedgerMatchesAuthoritativeSource(ledger, source);
    const readback = await readCrmPayoutProjection(
      manualCrmProjection(ledger),
      input.crm,
      input.fetcher,
    );
    if (
      readback.revision !== ledger.crmRevision ||
      readback.projection !== null
    ) {
      throw new Error(
        "Manual payment intent cannot be canceled because CRM absence was not proven",
      );
    }
    return this.repository.cancelManualPaymentIntent({
      ledgerId: ledger.ledgerId,
      actor: input.actor.email,
      auditId: operationalId("audit"),
      requestId: input.requestId,
      now: isoNow(this.clock),
    });
  }

  async approvePayoutDestinationVariance(input: {
    ledgerId: string;
    payoutId: string;
    reason: string;
    actor: PayoutActor;
    requestId: string;
  }): Promise<PayoutDestinationVarianceApprovalRecord> {
    assertOwner(input.actor);
    const reason = sanitizeOperationalText(input.reason, 240);
    if (reason.length < 12 || reason !== input.reason.trim()) {
      throw new Error(
        "Payout destination variance requires an exact safe reason of at least 12 characters",
      );
    }
    const ledger = await this.repository.getLedger(input.ledgerId);
    if (
      !ledger ||
      !ledger.batchId ||
      !ledger.stripeTransferId ||
      !ledger.stripeDestinationPaymentId ||
      !ledger.approvedPayoutDestinationId ||
      !ledger.approvedPayoutDestinationAt ||
      !isIsoInstant(ledger.approvedPayoutDestinationAt)
    ) {
      throw new Error(
        "Destination variance requires complete immutable transfer and bank-approval evidence",
      );
    }
    const batch = await this.repository.getBatch(ledger.batchId);
    if (!batch?.approvalDigest) {
      throw new Error(
        "Destination variance requires the durable owner-approved payout batch",
      );
    }

    const refreshed = await this.refreshRecipient(
      ledger.artistId,
      ledger.artistName,
      ledger.connectedAccountId,
    );
    if (
      refreshed.account.onboardingStatus !== "PAYOUT_READY" ||
      refreshed.account.preferredPayoutType !== "automatic_standard" ||
      !refreshed.account.payoutReadyApprovedAt ||
      !isIsoInstant(refreshed.account.payoutReadyApprovedAt) ||
      !refreshed.account.payoutDestinationId ||
      refreshed.account.payoutDestinationId !==
        refreshed.stripe.payoutDestinationId ||
      !recipientIsReady(refreshed.stripe)
    ) {
      throw new Error(
        "The replacement bank destination is not currently and durably owner-approved",
      );
    }

    const [payout, transfer] = await Promise.all([
      this.stripe.retrievePayout(ledger.connectedAccountId, input.payoutId),
      this.stripe.retrieveTransfer(ledger.stripeTransferId),
    ]);
    const fingerprint = transferIdempotencyKey(
      ledger.assignmentId,
      ledger.sourceRevision,
    );
    const expectedMetadata = {
      ...transferMetadata(ledger, batch),
      idempotency_fingerprint: fingerprint,
    };
    if (
      payout.id !== input.payoutId ||
      payout.destinationId === ledger.approvedPayoutDestinationId ||
      payout.destinationId !== refreshed.account.payoutDestinationId ||
      transfer.id !== ledger.stripeTransferId ||
      transfer.reversed ||
      transfer.amount !== ledger.totalApprovedPayCents ||
      transfer.currency !== "usd" ||
      transfer.destination !== ledger.connectedAccountId ||
      transfer.destinationPaymentId !== ledger.stripeDestinationPaymentId ||
      transfer.transferGroup !== `HFL_ARTIST_BATCH:${batch.batchId}` ||
      !exactStringRecord(transfer.metadata, expectedMetadata)
    ) {
      throw new Error(
        "Stripe payout, transfer, and replacement destination evidence do not exactly match",
      );
    }
    const containsDestinationPayment =
      await this.stripe.payoutContainsDestinationPayment({
        accountId: ledger.connectedAccountId,
        payoutId: payout.id,
        destinationPaymentId: ledger.stripeDestinationPaymentId,
      });
    if (!containsDestinationPayment) {
      throw new Error(
        "The destination variance payout does not contain the durable transfer payment",
      );
    }

    const approvalMaterial = JSON.stringify({
      environment: ledger.environment,
      ledgerId: ledger.ledgerId,
      payoutId: payout.id,
      originalDestinationId: ledger.approvedPayoutDestinationId,
      approvedDestinationId: payout.destinationId,
      recipientApprovalAt: refreshed.account.payoutReadyApprovedAt,
      approvedBy: input.actor.email,
      reason,
    });
    return this.repository.approvePayoutDestinationVariance({
      approvalId: await deterministicBusinessId(
        "payout_variance",
        approvalMaterial,
      ),
      ledgerId: ledger.ledgerId,
      payoutId: payout.id,
      originalDestinationId: ledger.approvedPayoutDestinationId,
      approvedDestinationId: payout.destinationId,
      recipientApprovalAt: refreshed.account.payoutReadyApprovedAt,
      reason,
      actor: input.actor.email,
      auditId: operationalId("audit"),
      requestId: input.requestId,
      now: isoNow(this.clock),
    });
  }

  async reconcilePayout(input: {
    ledgerId: string;
    payoutId: string;
    actor: PayoutActor;
    requestId: string;
    crm: CrmAdapterConfig;
    fetcher?: typeof fetch;
  }): Promise<{ ledger: LedgerRecord; crm: CrmSyncReceipt | null }> {
    assertOwner(input.actor);
    const now = isoNow(this.clock);
    let ledger = await this.repository.getLedger(input.ledgerId);
    if (!ledger) throw new Error("Payout ledger was not found");
    if (!ledger.stripeDestinationPaymentId)
      throw new Error(
        "Destination-payment identity is required for payout reconciliation",
      );
    const destinationPaymentId = ledger.stripeDestinationPaymentId;

    const payout = await this.stripe.retrievePayout(
      ledger.connectedAccountId,
      input.payoutId,
    );
    await this.assertPayoutDestinationApproved({
      ledger,
      payoutId: payout.id,
      destinationId: payout.destinationId,
      now,
    });
    const expectedArrival = expectedArrivalDate(payout.arrivalDate);
    if (payout.status === "failed" || payout.status === "canceled") {
      const result = await this.repository.recordPayoutFailed({
        ledgerId: ledger.ledgerId,
        payoutId: payout.id,
        payoutStatus: payout.status,
        safeErrorCode:
          payout.failureCode ?? `STRIPE_PAYOUT_${payout.status.toUpperCase()}`,
        safeReason:
          "Stripe reports that the automatic standard payout did not complete.",
        actor: input.actor.email,
        auditId: operationalId("audit"),
        requestId: input.requestId,
        now,
      });
      await this.openOperationalException({
        ledger: result.ledger,
        exceptionType: "STRIPE_PAYOUT_FAILED",
        reasonCode:
          payout.failureCode ?? `STRIPE_PAYOUT_${payout.status.toUpperCase()}`,
        safeReason:
          "Stripe reports that the artist bank payout failed or was canceled.",
        ownerActionRequired:
          "Resolve the recipient payout issue in Stripe and keep the assignment outside PAID until new paid evidence is reconciled.",
        stripeReference: payout.id,
        now,
      });
      return { ledger: result.ledger, crm: null };
    }

    if (
      payout.status !== "paid" ||
      payout.reconciliationStatus !== "completed"
    ) {
      const result = await this.repository.recordPayoutPending({
        ledgerId: ledger.ledgerId,
        payoutId: payout.id,
        payoutStatus: payout.status,
        expectedArrival,
        actor: input.actor.email,
        auditId: operationalId("audit"),
        requestId: input.requestId,
        now,
      });
      return { ledger: result.ledger, crm: null };
    }

    const containsDestinationPayment =
      await this.stripe.payoutContainsDestinationPayment({
        accountId: ledger.connectedAccountId,
        payoutId: payout.id,
        destinationPaymentId,
      });
    if (!containsDestinationPayment) {
      await this.openOperationalException({
        ledger,
        exceptionType: "PAYOUT_RECONCILIATION_BLOCKER",
        reasonCode: "DESTINATION_PAYMENT_NOT_IN_PAYOUT",
        safeReason:
          "The paid Stripe payout does not contain the ledger destination payment.",
        ownerActionRequired:
          "Verify the correct automatic payout and destination payment before any CRM or PAID transition.",
        stripeReference: payout.id,
        now,
      });
      throw new Error(
        "Stripe payout does not contain the approved transfer destination payment",
      );
    }

    const paidEvidence = await this.repository.recordStripePayoutPaidEvidence({
      ledgerId: ledger.ledgerId,
      payoutId: payout.id,
      payoutStatus: "paid",
      expectedArrival,
      actor: input.actor.email,
      auditId: operationalId("audit"),
      requestId: input.requestId,
      now,
    });
    ledger = paidEvidence.ledger;
    if (ledger.state === "PAID" && ledger.reconciled)
      return { ledger, crm: null };

    const batch = ledger.batchId
      ? await this.repository.getBatch(ledger.batchId)
      : null;
    const claimToken = operationalId("reconcile_claim");
    const claimExpiresAt = new Date(
      this.clock.now().valueOf() + 2 * 60 * 1000,
    ).toISOString();
    ledger = await this.repository.claimPayoutReconciliation({
      ledgerId: ledger.ledgerId,
      payoutId: payout.id,
      claimToken,
      claimExpiresAt,
      actor: input.actor.email,
      auditId: operationalId("audit"),
      requestId: input.requestId,
      now,
    });
    const reconciliationProjectionAt = ledger.reconciliationProjectionAt;
    if (!reconciliationProjectionAt)
      throw new Error("Durable payout reconciliation intent is missing");
    let receipt: CrmSyncReceipt;
    try {
      receipt = await syncCrmPayoutProjection(
        {
          environment: ledger.environment,
          ledgerId: ledger.ledgerId,
          bookingId: ledger.bookingId,
          assignmentId: ledger.assignmentId,
          artistId: ledger.artistId,
          sourceRevision: ledger.sourceRevision,
          expectedCrmRecordId: ledger.crmRecordId,
          expectedCrmRevision:
            ledger.crmReconciledRevision ?? ledger.crmRevision,
          state: "PAID",
          batchId: ledger.batchId,
          batchDate: batch?.scheduledDate ?? null,
          currency: "usd",
          amountCents: ledger.totalApprovedPayCents,
          connectedAccountId: ledger.connectedAccountId,
          transferId: ledger.stripeTransferId,
          payoutId: payout.id,
          payoutStatus: "paid",
          reconciled: true,
          reconciledAt: reconciliationProjectionAt,
          manualPayment: null,
          lastVerifiedAt: reconciliationProjectionAt,
        },
        input.crm,
        input.fetcher,
      );
      if (receipt.recordId !== ledger.crmRecordId) {
        throw new Error(
          "CRM readback record identity does not match the approved ledger",
        );
      }
      ledger = await this.repository.stageCrmReconciliationReadback({
        ledgerId: ledger.ledgerId,
        claimToken,
        crmReadbackRevision: receipt.revision,
        now,
      });
    } catch {
      await this.repository.releasePayoutReconciliationClaim({
        ledgerId: ledger.ledgerId,
        claimToken,
        now,
      });
      await this.openOperationalException({
        ledger,
        exceptionType: "CRM_RECONCILIATION_BLOCKER",
        reasonCode: "CRM_WRITE_OR_READBACK_FAILED",
        safeReason:
          "Stripe paid evidence is recorded, but the signed CRM write and independent readback did not complete exactly.",
        ownerActionRequired:
          "Resolve the CRM adapter or revision conflict, then retry closed-loop reconciliation without changing the Stripe payout.",
        stripeReference: payout.id,
        now,
      });
      throw new Error(
        "CRM reconciliation did not complete; ledger remains unreconciled",
      );
    }

    const [postWritePayout, postWriteTransfer] = await Promise.all([
      this.stripe.retrievePayout(ledger.connectedAccountId, payout.id),
      this.stripe.retrieveTransfer(ledger.stripeTransferId ?? ""),
    ]);
    const postWriteMembership =
      !postWriteTransfer.reversed &&
      postWriteTransfer.destinationPaymentId === destinationPaymentId &&
      (await this.stripe.payoutContainsDestinationPayment({
        accountId: ledger.connectedAccountId,
        payoutId: payout.id,
        destinationPaymentId,
      }));
    const postWriteDestinationAuthorized =
      await this.payoutDestinationIsAuthorized(
        ledger,
        postWritePayout.id,
        postWritePayout.destinationId,
      );
    if (
      postWritePayout.status !== "paid" ||
      postWritePayout.reconciliationStatus !== "completed" ||
      !postWriteDestinationAuthorized ||
      !postWriteMembership
    ) {
      await this.repository.releasePayoutReconciliationClaim({
        ledgerId: ledger.ledgerId,
        claimToken,
        now,
      });
      if (postWriteTransfer.reversed && ledger.stripeTransferId) {
        ledger = (
          await this.repository.recordTransferLifecycle({
            ledgerId: ledger.ledgerId,
            stripeTransferId: ledger.stripeTransferId,
            status: "reversed",
            safeFailureReason:
              "Stripe transfer reversed during CRM reconciliation.",
            actor: input.actor.email,
            auditId: operationalId("audit"),
            requestId: input.requestId,
            now,
          })
        ).ledger;
      } else if (
        postWritePayout.status === "failed" ||
        postWritePayout.status === "canceled"
      ) {
        ledger = (
          await this.repository.recordPayoutFailed({
            ledgerId: ledger.ledgerId,
            payoutId: postWritePayout.id,
            payoutStatus: postWritePayout.status,
            safeErrorCode:
              postWritePayout.failureCode ??
              `STRIPE_PAYOUT_${postWritePayout.status.toUpperCase()}`,
            safeReason:
              "Stripe payout changed after the CRM paid projection write.",
            actor: input.actor.email,
            auditId: operationalId("audit"),
            requestId: input.requestId,
            now,
          })
        ).ledger;
      }
      await this.openOperationalException({
        ledger,
        exceptionType: "RECONCILIATION_STATE_RACE",
        reasonCode: postWriteDestinationAuthorized
          ? "STRIPE_CHANGED_DURING_CRM_WRITE"
          : "PAYOUT_DESTINATION_CHANGED_DURING_CRM_WRITE",
        safeReason:
          "Authoritative Stripe state changed during the signed CRM reconciliation window.",
        ownerActionRequired:
          "Run corrective CRM reconciliation and verify the independent readback before resolving this exception.",
        stripeReference: payout.id,
        now,
      });
      if (ledger.state === "REVERSED" || ledger.state === "PAYOUT_FAILED") {
        await this.reconcileCorrectiveState({
          ledgerId: ledger.ledgerId,
          actor: input.actor,
          requestId: input.requestId,
          crm: input.crm,
          fetcher: input.fetcher,
        });
      }
      throw new Error(
        "Stripe state changed during reconciliation; CRM correction was required",
      );
    }

    let finalized;
    try {
      finalized = await this.repository.finalizePayoutReconciliation({
        ledgerId: ledger.ledgerId,
        payoutId: payout.id,
        claimToken,
        expectedCrmRecordId: ledger.crmRecordId,
        expectedCrmRevision: ledger.crmRevision,
        crmReadbackRevision: receipt.revision,
        actor: input.actor.email,
        auditId: operationalId("audit"),
        requestId: input.requestId,
        reconciledAt: reconciliationProjectionAt,
        now,
      });
    } catch {
      await this.repository.releasePayoutReconciliationClaim({
        ledgerId: ledger.ledgerId,
        claimToken,
        now,
      });
      await this.openOperationalException({
        ledger,
        exceptionType: "CRM_RECONCILIATION_BLOCKER",
        reasonCode: "D1_FINALIZATION_AFTER_CRM_FAILED",
        safeReason:
          "The signed CRM projection was read back, but the atomic D1 finalization did not complete.",
        ownerActionRequired:
          "Retry the same reconciliation; the exact CRM readback will be recovered without a duplicate payout.",
        stripeReference: payout.id,
        now,
      });
      throw new Error("CRM readback exists but D1 finalization requires retry");
    }
    return { ledger: finalized.ledger, crm: receipt };
  }

  async reconcileCorrectiveState(input: {
    ledgerId: string;
    actor: PayoutActor;
    requestId: string;
    crm: CrmAdapterConfig;
    fetcher?: typeof fetch;
  }): Promise<{ ledger: LedgerRecord; crm: CrmSyncReceipt }> {
    assertOwner(input.actor);
    const now = isoNow(this.clock);
    let ledger = await this.repository.getLedger(input.ledgerId);
    if (!ledger) throw new Error("Payout ledger was not found");
    if (ledger.state !== "REVERSED" && ledger.state !== "PAYOUT_FAILED")
      throw new Error(
        "Corrective CRM reconciliation is not available for this state",
      );
    const correctiveState = ledger.state;
    if (!ledger.crmCorrectionRequired)
      throw new Error("The CRM projection does not require correction");
    if (ledger.state === "REVERSED") {
      if (!ledger.stripeTransferId)
        throw new Error("Transfer evidence is missing");
      const transfer = await this.stripe.retrieveTransfer(
        ledger.stripeTransferId,
      );
      if (!transfer.reversed)
        throw new Error("Stripe does not confirm the transfer reversal");
    } else {
      if (!ledger.stripePayoutId) throw new Error("Payout evidence is missing");
      const payout = await this.stripe.retrievePayout(
        ledger.connectedAccountId,
        ledger.stripePayoutId,
      );
      if (payout.status !== "failed" && payout.status !== "canceled")
        throw new Error("Stripe does not confirm the payout failure");
    }
    const claimToken = operationalId("correction_claim");
    const claimExpiresAt = new Date(
      this.clock.now().valueOf() + 2 * 60 * 1000,
    ).toISOString();
    ledger = await this.repository.claimCrmCorrection({
      ledgerId: ledger.ledgerId,
      expectedState: correctiveState,
      claimToken,
      claimExpiresAt,
      now,
    });
    const correctionProjectionAt = ledger.crmCorrectionProjectionAt;
    if (!correctionProjectionAt)
      throw new Error("Durable CRM correction intent is missing");
    const batch = ledger.batchId
      ? await this.repository.getBatch(ledger.batchId)
      : null;
    try {
      const receipt = await syncCrmPayoutProjection(
        {
          environment: ledger.environment,
          ledgerId: ledger.ledgerId,
          bookingId: ledger.bookingId,
          assignmentId: ledger.assignmentId,
          artistId: ledger.artistId,
          sourceRevision: ledger.sourceRevision,
          expectedCrmRecordId: ledger.crmRecordId,
          expectedCrmRevision:
            ledger.crmReconciledRevision ?? ledger.crmRevision,
          state: ledger.state,
          batchId: ledger.batchId,
          batchDate: batch?.scheduledDate ?? null,
          currency: "usd",
          amountCents: ledger.totalApprovedPayCents,
          connectedAccountId: ledger.connectedAccountId,
          transferId: ledger.stripeTransferId,
          payoutId: ledger.stripePayoutId,
          payoutStatus: ledger.stripePayoutStatus,
          reconciled: false,
          reconciledAt: null,
          manualPayment: null,
          lastVerifiedAt: correctionProjectionAt,
        },
        input.crm,
        input.fetcher,
      );
      ledger = await this.repository.finalizeCrmCorrection({
        ledgerId: ledger.ledgerId,
        expectedState: correctiveState,
        claimToken,
        expectedCrmRecordId: ledger.crmRecordId,
        expectedCrmRevision: ledger.crmReconciledRevision ?? ledger.crmRevision,
        crmReadbackRevision: receipt.revision,
        actor: input.actor.email,
        auditId: operationalId("audit"),
        requestId: input.requestId,
        now,
      });
      return { ledger, crm: receipt };
    } catch {
      await this.repository.releasePayoutReconciliationClaim({
        ledgerId: ledger.ledgerId,
        claimToken,
        now,
      });
      await this.openOperationalException({
        ledger,
        exceptionType: "CRM_CORRECTIVE_RECONCILIATION",
        reasonCode: "CRM_CORRECTIVE_WRITE_OR_READBACK_FAILED",
        safeReason:
          "The corrective CRM projection or its independent readback did not complete exactly.",
        ownerActionRequired:
          "Repair the signed CRM adapter or revision conflict, then retry corrective reconciliation.",
        stripeReference: ledger.stripePayoutId ?? ledger.stripeTransferId,
        now,
      });
      throw new Error("Corrective CRM reconciliation did not complete");
    }
  }

  get configuredMinimumReserveCents(): number {
    if (this.minimumReserveCents === null)
      throw new Error(
        "Payout reserve is not configured for transfer execution",
      );
    return this.minimumReserveCents;
  }
}
