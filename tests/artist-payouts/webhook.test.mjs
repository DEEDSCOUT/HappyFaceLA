import assert from "node:assert/strict";
import test from "node:test";
import Stripe from "stripe";
import {
  ConnectWebhookError,
  handleConnectAccountWebhook,
  handleConnectPayoutWebhook,
} from "../../src/lib/artist-payouts/webhook-service.ts";

const SECRET = "whsec_artist_payout_fixture_123456";
const ACCOUNT_ID = "acct_123456789012";
const TRANSFER_ID = "tr_123456789012";
const PAYOUT_ID = "po_123456789012";
const DESTINATION_PAYMENT_ID = "py_123456789012";
const FIXED_NOW = new Date("2026-08-22T18:00:00.000Z");

function stripeClient() {
  return new Stripe("sk_test_synthetic_webhook_12345", {
    apiVersion: "2026-07-29.dahlia",
  });
}

function sign(payload) {
  return Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: SECRET,
    timestamp: Math.floor(Date.now() / 1000),
  });
}

function thinPayload(overrides = {}) {
  return JSON.stringify({
    id: "evt_account000001",
    object: "v2.core.event",
    created: "2026-08-22T17:59:00.000Z",
    livemode: false,
    type: "v2.core.account[configuration.recipient].capability_status_updated",
    related_object: {
      id: ACCOUNT_ID,
      type: "v2.core.account",
      url: `/v2/core/accounts/${ACCOUNT_ID}`,
    },
    ...overrides,
  });
}

function snapshotPayload(overrides = {}) {
  const event = {
    id: "evt_payout000001",
    object: "event",
    account: ACCOUNT_ID,
    api_version: "2026-07-29.dahlia",
    created: 1_787_920_000,
    data: { object: { id: PAYOUT_ID, object: "payout", status: "pending" } },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: "payout.paid",
    ...overrides,
  };
  return JSON.stringify(event);
}

function webhookRecord(input) {
  return {
    stripeEventId: input.stripeEventId,
    environment: "sandbox",
    eventType: input.eventType,
    connectedAccountId: input.connectedAccountId,
    receivedAt: input.receivedAt,
    status: "RECEIVED",
    processingClaimToken: null,
    processingStartedAt: null,
    processingLeaseExpiresAt: null,
    processedAt: null,
    safeErrorCode: null,
    retryCount: 0,
  };
}

class FakeRepository {
  constructor({ account = null, ledgers = [] } = {}) {
    this.account = account;
    this.ledgers = ledgers;
    this.events = new Map();
    this.actions = [];
    this.recoveries = 0;
    this.renewals = 0;
    this.accountWrites = 0;
    this.exceptions = [];
    this.destinationVarianceApprovals = new Map();
  }

  async registerWebhookEvent(input) {
    const existing = this.events.get(input.stripeEventId);
    if (existing) {
      assert.equal(existing.eventType, input.eventType);
      assert.equal(existing.connectedAccountId, input.connectedAccountId);
      return { event: existing, inserted: false };
    }
    const event = webhookRecord(input);
    this.events.set(input.stripeEventId, event);
    return { event, inserted: true };
  }

  async claimWebhookEvent(input) {
    const event = this.events.get(input.stripeEventId);
    if (event.status === "RECEIVED" || event.status === "FAILED") {
      event.status = "PROCESSING";
      event.processingClaimToken = input.claimToken;
      event.processingStartedAt = input.claimedAt;
      event.processingLeaseExpiresAt = input.leaseExpiresAt;
      return { event, claimed: true };
    }
    return { event, claimed: false };
  }

  async recoverExpiredWebhookLease(input) {
    const event = this.events.get(input.stripeEventId);
    const recovered =
      event.status === "PROCESSING" &&
      event.processingClaimToken === input.expectedClaimToken &&
      event.processingLeaseExpiresAt <= input.recoveredAt;
    if (recovered) {
      event.processingClaimToken = input.newClaimToken;
      event.processingStartedAt = input.recoveredAt;
      event.processingLeaseExpiresAt = input.leaseExpiresAt;
      event.retryCount += 1;
      this.recoveries += 1;
    }
    return { event, recovered };
  }

  async renewWebhookEventLease(input) {
    const event = this.events.get(input.stripeEventId);
    const renewed =
      event.status === "PROCESSING" &&
      event.processingClaimToken === input.claimToken &&
      event.processingLeaseExpiresAt > input.renewedAt;
    if (renewed) {
      event.processingLeaseExpiresAt = input.leaseExpiresAt;
      this.renewals += 1;
    }
    return renewed;
  }

  async completeWebhookEvent(eventId, token, status, processedAt) {
    const event = this.events.get(eventId);
    if (event.status !== "PROCESSING" || event.processingClaimToken !== token)
      return false;
    event.status = status;
    event.processingClaimToken = null;
    event.processingStartedAt = null;
    event.processingLeaseExpiresAt = null;
    event.processedAt = processedAt;
    return true;
  }

  async failWebhookEvent(eventId, token, safeErrorCode) {
    const event = this.events.get(eventId);
    if (event.status !== "PROCESSING" || event.processingClaimToken !== token)
      return false;
    event.status = "FAILED";
    event.safeErrorCode = safeErrorCode;
    event.processingClaimToken = null;
    event.processingStartedAt = null;
    event.processingLeaseExpiresAt = null;
    return true;
  }

  async getArtistAccountByStripeAccount(accountId) {
    return this.account?.stripeAccountId === accountId ? this.account : null;
  }

  async upsertArtistAccount(input) {
    this.accountWrites += 1;
    this.account = { ...this.account, ...input };
    return this.account;
  }

  async getLedgerByTransferId(transferId) {
    return (
      this.ledgers.find((ledger) => ledger.stripeTransferId === transferId) ??
      null
    );
  }

  async listUnreconciledLedgersForAccount(
    accountId,
    limit = 250,
    afterLedgerId = null,
  ) {
    return this.ledgers
      .filter(
        (ledger) =>
          ledger.connectedAccountId === accountId &&
          !ledger.reconciled &&
          (afterLedgerId === null || ledger.ledgerId > afterLedgerId),
      )
      .sort((left, right) => left.ledgerId.localeCompare(right.ledgerId))
      .slice(0, limit);
  }

  async getPayoutDestinationVarianceApproval(ledgerId, payoutId) {
    return (
      this.destinationVarianceApprovals.get(`${ledgerId}:${payoutId}`) ?? null
    );
  }

  async recordTransferLifecycle(input) {
    const ledger = this.ledgers.find(
      (item) => item.ledgerId === input.ledgerId,
    );
    const target =
      input.status === "reversed"
        ? "REVERSED"
        : input.status === "completed"
          ? "TRANSFER_COMPLETED"
          : "TRANSFER_PENDING";
    const applied =
      ledger.state !== target && ledger.state !== "PAYOUT_PENDING";
    if (applied) {
      ledger.state = target;
      this.actions.push(`transfer:${input.status}`);
    }
    return { applied, ledger };
  }

  async recordPayoutPending(input) {
    const ledger = this.ledgers.find(
      (item) => item.ledgerId === input.ledgerId,
    );
    const applied = [
      "TRANSFER_COMPLETED",
      "PAYOUT_PENDING",
      "PAYOUT_FAILED",
    ].includes(ledger.state);
    if (applied) {
      ledger.state = "PAYOUT_PENDING";
      ledger.stripePayoutId = input.payoutId;
      ledger.stripePayoutStatus = input.payoutStatus;
    }
    return { applied, ledger };
  }

  async recordStripePayoutPaidEvidence(input) {
    const ledger = this.ledgers.find(
      (item) => item.ledgerId === input.ledgerId,
    );
    const applied = [
      "TRANSFER_COMPLETED",
      "PAYOUT_PENDING",
      "PAYOUT_FAILED",
    ].includes(ledger.state);
    if (applied) {
      ledger.state = "PAYOUT_PENDING";
      ledger.stripePayoutId = input.payoutId;
      ledger.stripePayoutStatus = "paid";
      ledger.reconciled = false;
      ledger.reconciledAt = null;
      this.actions.push("payout:paid-evidence");
    }
    return { applied, ledger };
  }

  async recordPayoutFailed(input) {
    const ledger = this.ledgers.find(
      (item) => item.ledgerId === input.ledgerId,
    );
    const applied =
      ledger.state === "TRANSFER_COMPLETED" ||
      ledger.state === "PAYOUT_PENDING";
    if (applied) {
      ledger.state = "PAYOUT_FAILED";
      ledger.stripePayoutId = input.payoutId;
      ledger.stripePayoutStatus = input.payoutStatus;
      this.actions.push("payout:failed");
    }
    return { applied, ledger };
  }

  async openException(input) {
    const existing = this.exceptions.find(
      (exception) => exception.exceptionId === input.exceptionId,
    );
    if (existing) return existing;
    const exception = { ...structuredClone(input), status: "OPEN" };
    this.exceptions.push(exception);
    return exception;
  }
}

function accountRecord(overrides = {}) {
  return {
    environment: "sandbox",
    artistId: "artist_123",
    stripeAccountId: ACCOUNT_ID,
    artistDisplayName: "Test Artist",
    onboardingStatus: "REQUIREMENTS_PENDING",
    requirementsStatus: "pending",
    transfersStatus: "pending",
    payoutsStatus: "pending",
    preferredPayoutType: "unverified",
    payoutDestinationId: null,
    payoutReadyApprovedAt: null,
    onboardedAt: null,
    disabledReason: null,
    payoutExceptionFlag: false,
    ...overrides,
  };
}

function payoutReadyAccountRecord(overrides = {}) {
  return accountRecord({
    onboardingStatus: "PAYOUT_READY",
    requirementsStatus: "complete",
    transfersStatus: "active",
    payoutsStatus: "active",
    preferredPayoutType: "automatic_standard",
    payoutDestinationId: "ba_123456789012",
    payoutReadyApprovedAt: "2026-08-22T17:00:00.000Z",
    onboardedAt: "2026-08-22T17:00:00.000Z",
    ...overrides,
  });
}

function ledgerRecord() {
  return {
    environment: "sandbox",
    ledgerId: "ledger_123",
    batchId: "batch_123",
    artistId: "artist_123",
    bookingId: "booking_123",
    assignmentId: "assignment_123",
    state: "TRANSFER_CREATED",
    approvedPayoutDestinationId: "ba_123456789012",
    approvedPayoutDestinationAt: "2026-08-22T17:00:00.000Z",
    stripeTransferId: TRANSFER_ID,
    stripeDestinationPaymentId: DESTINATION_PAYMENT_ID,
    stripePayoutId: null,
    stripePayoutStatus: null,
    connectedAccountId: ACCOUNT_ID,
    totalApprovedPayCents: 12_345,
    reconciled: false,
    reconciledAt: null,
  };
}

function gateway(overrides = {}) {
  return {
    async retrieveRecipientStatus() {
      return {
        accountId: ACCOUNT_ID,
        transfersStatus: "active",
        payoutsStatus: "active",
        automaticPayoutsEnabled: true,
        payoutScheduleInterval: "weekly",
        payoutDestinationId: "ba_123456789012",
        requirementsStatus: "complete",
        currentlyDue: [],
        disabledReason: null,
      };
    },
    async retrieveTransfer() {
      return {
        id: TRANSFER_ID,
        amount: 12_345,
        currency: "usd",
        destination: ACCOUNT_ID,
        destinationPaymentId: DESTINATION_PAYMENT_ID,
        reversed: false,
      };
    },
    async retrievePayout() {
      return {
        id: PAYOUT_ID,
        destinationId: "ba_123456789012",
        status: "paid",
        arrivalDate: 1_788_000_000,
        reconciliationStatus: "completed",
        failureCode: null,
        failureMessage: null,
      };
    },
    async payoutContainsDestinationPayment() {
      return true;
    },
    ...overrides,
  };
}

function dependencies(repository, gatewayOverrides = {}, extra = {}) {
  return {
    stripe: stripeClient(),
    gateway: gateway(gatewayOverrides),
    repository,
    environment: "sandbox",
    webhookSecret: SECRET,
    clock: { now: () => new Date(FIXED_NOW) },
    ...extra,
  };
}

test("both Connect endpoints reject an invalid signature before durable registration", async () => {
  const repository = new FakeRepository();
  await assert.rejects(
    handleConnectAccountWebhook({
      rawBody: thinPayload(),
      signature: "t=1,v1=invalid",
      dependencies: dependencies(repository),
    }),
    (error) =>
      error instanceof ConnectWebhookError &&
      error.safeCode === "INVALID_WEBHOOK_SIGNATURE",
  );
  await assert.rejects(
    handleConnectPayoutWebhook({
      rawBody: snapshotPayload(),
      signature: "t=1,v1=invalid",
      dependencies: dependencies(repository),
    }),
    (error) =>
      error instanceof ConnectWebhookError &&
      error.safeCode === "INVALID_WEBHOOK_SIGNATURE",
  );
  assert.equal(repository.events.size, 0);
});

test("signed thin account event uses authoritative status and exact event replay is deduplicated", async () => {
  const repository = new FakeRepository({ account: accountRecord() });
  const projected = [];
  const payload = thinPayload();
  const input = {
    rawBody: payload,
    signature: sign(payload),
    dependencies: dependencies(
      repository,
      {},
      {
        rosterProjectionWriter: {
          async sync(account) {
            projected.push(structuredClone(account));
          },
        },
      },
    ),
  };
  const first = await handleConnectAccountWebhook(input);
  const second = await handleConnectAccountWebhook(input);

  assert.equal(first.disposition, "processed");
  assert.equal(second.disposition, "duplicate");
  assert.equal(repository.accountWrites, 1);
  assert.equal(repository.account.onboardingStatus, "TRANSFERS_ENABLED");
  assert.equal(projected.length, 1);
  assert.equal(projected[0].stripeAccountId, ACCOUNT_ID);
  assert.equal(projected[0].onboardingStatus, "TRANSFERS_ENABLED");
});

test("roster projection outage leaves the webhook retryable and a retry closes the mirror", async () => {
  const repository = new FakeRepository({ account: accountRecord() });
  let projectionAttempts = 0;
  const payload = thinPayload({ id: "evt_account_projection_retry" });
  const input = {
    rawBody: payload,
    signature: sign(payload),
    dependencies: dependencies(
      repository,
      {},
      {
        rosterProjectionWriter: {
          async sync() {
            projectionAttempts += 1;
            if (projectionAttempts === 1)
              throw new Error("synthetic projection outage");
          },
        },
      },
    ),
  };
  await assert.rejects(
    handleConnectAccountWebhook(input),
    (error) =>
      error instanceof ConnectWebhookError &&
      error.safeCode === "WEBHOOK_PROCESSING_FAILED",
  );
  assert.equal(
    repository.events.get("evt_account_projection_retry").status,
    "FAILED",
  );
  const retried = await handleConnectAccountWebhook(input);
  assert.equal(retried.disposition, "processed");
  assert.equal(projectionAttempts, 2);
  assert.equal(
    repository.events.get("evt_account_projection_retry").status,
    "PROCESSED",
  );
});

test("signed cross-mode event is rejected and unknown event is durably ignored", async () => {
  const repository = new FakeRepository();
  const crossMode = thinPayload({ id: "evt_account000002", livemode: true });
  await assert.rejects(
    handleConnectAccountWebhook({
      rawBody: crossMode,
      signature: sign(crossMode),
      dependencies: dependencies(repository),
    }),
    (error) =>
      error instanceof ConnectWebhookError &&
      error.safeCode === "WEBHOOK_ENVIRONMENT_MISMATCH",
  );

  const unknown = snapshotPayload({
    id: "evt_unknown000001",
    account: undefined,
    type: "charge.succeeded",
    data: { object: { id: "ch_123456789012", object: "charge" } },
  });
  const outcome = await handleConnectPayoutWebhook({
    rawBody: unknown,
    signature: sign(unknown),
    dependencies: dependencies(repository),
  });
  assert.equal(outcome.disposition, "ignored");
  assert.equal(repository.events.get("evt_unknown000001").status, "IGNORED");
});

test("signed transfer snapshot ignores payload status and records the authoritative transfer state", async () => {
  const ledger = ledgerRecord();
  const repository = new FakeRepository({ ledgers: [ledger] });
  const payload = snapshotPayload({
    id: "evt_transfer000001",
    account: undefined,
    type: "transfer.updated",
    data: { object: { id: TRANSFER_ID, object: "transfer", reversed: true } },
  });
  const outcome = await handleConnectPayoutWebhook({
    rawBody: payload,
    signature: sign(payload),
    dependencies: dependencies(repository),
  });
  assert.equal(outcome.disposition, "processed");
  assert.equal(ledger.state, "TRANSFER_COMPLETED");
  assert.deepEqual(repository.actions, ["transfer:completed"]);
});

test("a recognized transfer event stays failed and retryable until recovery binds the transfer", async () => {
  const ledger = ledgerRecord();
  ledger.stripeTransferId = null;
  ledger.stripeDestinationPaymentId = null;
  const repository = new FakeRepository({ ledgers: [ledger] });
  const payload = snapshotPayload({
    id: "evt_transfer_unbound01",
    account: undefined,
    type: "transfer.created",
    data: { object: { id: TRANSFER_ID, object: "transfer" } },
  });
  const input = {
    rawBody: payload,
    signature: sign(payload),
    dependencies: dependencies(repository),
  };
  await assert.rejects(
    handleConnectPayoutWebhook(input),
    (error) =>
      error instanceof ConnectWebhookError &&
      error.safeCode === "TRANSFER_EVENT_UNMATCHED",
  );
  assert.equal(
    repository.events.get("evt_transfer_unbound01").status,
    "FAILED",
  );

  ledger.stripeTransferId = TRANSFER_ID;
  ledger.stripeDestinationPaymentId = DESTINATION_PAYMENT_ID;
  const retried = await handleConnectPayoutWebhook(input);
  assert.equal(retried.disposition, "processed");
  assert.equal(
    repository.events.get("evt_transfer_unbound01").status,
    "PROCESSED",
  );
  assert.deepEqual(repository.actions, ["transfer:completed"]);
});

test("a recognized payout event stays failed and retryable until transfer recovery is durable", async () => {
  const ledger = ledgerRecord();
  ledger.stripeTransferId = null;
  ledger.stripeDestinationPaymentId = null;
  const repository = new FakeRepository({
    account: payoutReadyAccountRecord(),
    ledgers: [ledger],
  });
  const payload = snapshotPayload({ id: "evt_payout_unbound001" });
  const input = {
    rawBody: payload,
    signature: sign(payload),
    dependencies: dependencies(repository),
  };
  await assert.rejects(
    handleConnectPayoutWebhook(input),
    (error) =>
      error instanceof ConnectWebhookError &&
      error.safeCode === "PAYOUT_EVENT_UNMATCHED",
  );
  assert.equal(repository.events.get("evt_payout_unbound001").status, "FAILED");

  ledger.stripeTransferId = TRANSFER_ID;
  ledger.stripeDestinationPaymentId = DESTINATION_PAYMENT_ID;
  const retried = await handleConnectPayoutWebhook(input);
  assert.equal(retried.disposition, "processed");
  assert.equal(
    repository.events.get("evt_payout_unbound001").status,
    "PROCESSED",
  );
  assert.deepEqual(repository.actions, [
    "transfer:completed",
    "payout:paid-evidence",
  ]);
});

test("connected external-account event refreshes authoritative recipient readiness", async () => {
  const repository = new FakeRepository({ account: accountRecord() });
  const payload = snapshotPayload({
    id: "evt_externalacct001",
    type: "account.external_account.updated",
    data: { object: { id: "ba_123456789012", object: "bank_account" } },
  });
  const outcome = await handleConnectPayoutWebhook({
    rawBody: payload,
    signature: sign(payload),
    dependencies: dependencies(repository),
  });
  assert.equal(outcome.disposition, "processed");
  assert.equal(repository.account.onboardingStatus, "TRANSFERS_ENABLED");
  assert.equal(repository.accountWrites, 1);
});

test("unchanged bank destination retains approval while changed or deleted destination requires owner reapproval", async () => {
  const approvedAt = "2026-08-20T18:00:00.000Z";
  const unchangedRepository = new FakeRepository({
    account: accountRecord({
      onboardingStatus: "PAYOUT_READY",
      requirementsStatus: "complete",
      transfersStatus: "active",
      payoutsStatus: "active",
      payoutDestinationId: "ba_123456789012",
      payoutReadyApprovedAt: approvedAt,
    }),
  });
  const unchangedPayload = snapshotPayload({
    id: "evt_external_same001",
    type: "account.external_account.updated",
    data: { object: { id: "ba_123456789012", object: "bank_account" } },
  });
  await handleConnectPayoutWebhook({
    rawBody: unchangedPayload,
    signature: sign(unchangedPayload),
    dependencies: dependencies(unchangedRepository),
  });
  assert.equal(unchangedRepository.account.onboardingStatus, "PAYOUT_READY");
  assert.equal(unchangedRepository.account.payoutReadyApprovedAt, approvedAt);
  assert.equal(unchangedRepository.exceptions.length, 0);

  for (const scenario of [
    {
      eventId: "evt_external_changed1",
      eventType: "account.external_account.updated",
      destinationId: "ba_210987654321",
      disabledReason: null,
      expectedReason: "DEFAULT_BANK_DESTINATION_CHANGED",
    },
    {
      eventId: "evt_external_deleted1",
      eventType: "account.external_account.deleted",
      destinationId: null,
      disabledReason: "payout_destination_unavailable",
      expectedReason: "DEFAULT_BANK_DESTINATION_UNAVAILABLE",
    },
  ]) {
    const repository = new FakeRepository({
      account: accountRecord({
        onboardingStatus: "PAYOUT_READY",
        requirementsStatus: "complete",
        transfersStatus: "active",
        payoutsStatus: "active",
        payoutDestinationId: "ba_123456789012",
        payoutReadyApprovedAt: approvedAt,
      }),
    });
    const payload = snapshotPayload({
      id: scenario.eventId,
      type: scenario.eventType,
      data: {
        object: {
          id: scenario.destinationId ?? "ba_123456789012",
          object: "bank_account",
        },
      },
    });
    await handleConnectPayoutWebhook({
      rawBody: payload,
      signature: sign(payload),
      dependencies: dependencies(repository, {
        async retrieveRecipientStatus() {
          return {
            accountId: ACCOUNT_ID,
            transfersStatus: "active",
            payoutsStatus: "active",
            automaticPayoutsEnabled: true,
            payoutScheduleInterval: "weekly",
            payoutDestinationId: scenario.destinationId,
            requirementsStatus: "complete",
            currentlyDue: [],
            disabledReason: scenario.disabledReason,
          };
        },
      }),
    });
    assert.equal(repository.account.onboardingStatus, "RESTRICTED");
    assert.equal(repository.account.payoutReadyApprovedAt, null);
    assert.equal(
      repository.account.disabledReason,
      "payout_destination_requires_owner_reapproval",
    );
    assert.equal(repository.exceptions.length, 1);
    assert.equal(repository.exceptions[0].reasonCode, scenario.expectedReason);
  }
});

test("out-of-order paid event reconciles transfer first, records Stripe evidence only, and semantic duplicate is safe", async () => {
  const ledger = ledgerRecord();
  const repository = new FakeRepository({
    account: payoutReadyAccountRecord(),
    ledgers: [ledger],
  });
  const firstPayload = snapshotPayload();
  const first = await handleConnectPayoutWebhook({
    rawBody: firstPayload,
    signature: sign(firstPayload),
    dependencies: dependencies(repository),
  });
  assert.equal(first.disposition, "processed");
  assert.deepEqual(repository.actions, [
    "transfer:completed",
    "payout:paid-evidence",
  ]);
  assert.equal(ledger.state, "PAYOUT_PENDING");
  assert.equal(ledger.stripePayoutStatus, "paid");
  assert.equal(ledger.reconciled, false);

  const semanticDuplicate = snapshotPayload({ id: "evt_payout000002" });
  const second = await handleConnectPayoutWebhook({
    rawBody: semanticDuplicate,
    signature: sign(semanticDuplicate),
    dependencies: dependencies(repository),
  });
  assert.equal(second.disposition, "processed");
  assert.deepEqual(repository.actions, [
    "transfer:completed",
    "payout:paid-evidence",
  ]);
  assert.equal(ledger.reconciled, false);
});

test("payout webhook keyset-pages beyond 500 unreconciled ledgers", async () => {
  const ledgers = Array.from({ length: 501 }, (_, index) => {
    const suffix = String(index).padStart(12, "0");
    return {
      ...ledgerRecord(),
      ledgerId: `ledger_${String(index).padStart(3, "0")}`,
      assignmentId: `assignment_${String(index).padStart(3, "0")}`,
      stripeTransferId: `tr_${suffix}`,
      stripeDestinationPaymentId: `py_${suffix}`,
    };
  });
  const target = ledgers[500];
  const repository = new FakeRepository({
    account: payoutReadyAccountRecord(),
    ledgers,
  });
  const payload = snapshotPayload({ id: "evt_payoutpaged001" });
  const outcome = await handleConnectPayoutWebhook({
    rawBody: payload,
    signature: sign(payload),
    dependencies: dependencies(repository, {
      async payoutContainsDestinationPayment({ destinationPaymentId }) {
        return destinationPaymentId === target.stripeDestinationPaymentId;
      },
      async retrieveTransfer(transferId) {
        assert.equal(transferId, target.stripeTransferId);
        return {
          id: target.stripeTransferId,
          amount: target.totalApprovedPayCents,
          currency: "usd",
          destination: ACCOUNT_ID,
          destinationPaymentId: target.stripeDestinationPaymentId,
          reversed: false,
        };
      },
    }),
  });
  assert.equal(outcome.disposition, "processed");
  assert.equal(target.state, "PAYOUT_PENDING");
  assert.equal(target.stripePayoutId, PAYOUT_ID);
});

test("pending automatic payout positively binds an unbound destination payment", async () => {
  const ledger = ledgerRecord();
  const repository = new FakeRepository({
    account: payoutReadyAccountRecord(),
    ledgers: [ledger],
  });
  const payload = snapshotPayload({
    id: "evt_payoutpending001",
    type: "payout.updated",
  });
  const outcome = await handleConnectPayoutWebhook({
    rawBody: payload,
    signature: sign(payload),
    dependencies: dependencies(repository, {
      async retrievePayout() {
        return {
          id: PAYOUT_ID,
          destinationId: "ba_123456789012",
          status: "in_transit",
          arrivalDate: 1_788_000_000,
          reconciliationStatus: "in_progress",
          failureCode: null,
          failureMessage: null,
        };
      },
    }),
  });
  assert.equal(outcome.disposition, "processed");
  assert.equal(ledger.state, "PAYOUT_PENDING");
  assert.equal(ledger.stripePayoutId, PAYOUT_ID);
  assert.equal(ledger.stripePayoutStatus, "in_transit");
  assert.deepEqual(repository.actions, ["transfer:completed"]);
});

test("paid automatic payout can replace an older failed payout after membership verification", async () => {
  const ledger = {
    ...ledgerRecord(),
    state: "PAYOUT_FAILED",
    stripePayoutId: "po_olderfailed0001",
    stripePayoutStatus: "failed",
  };
  const repository = new FakeRepository({
    account: payoutReadyAccountRecord(),
    ledgers: [ledger],
  });
  const payload = snapshotPayload({ id: "evt_payoutretry0001" });
  const outcome = await handleConnectPayoutWebhook({
    rawBody: payload,
    signature: sign(payload),
    dependencies: dependencies(repository),
  });
  assert.equal(outcome.disposition, "processed");
  assert.equal(ledger.state, "PAYOUT_PENDING");
  assert.equal(ledger.stripePayoutId, PAYOUT_ID);
  assert.equal(ledger.stripePayoutStatus, "paid");
  assert.equal(ledger.reconciled, false);
  assert.deepEqual(repository.actions, ["payout:paid-evidence"]);
});

test("payout reconciliation-completed event retains CRM as the terminal gate", async () => {
  const ledger = {
    ...ledgerRecord(),
    state: "PAYOUT_PENDING",
    stripePayoutId: PAYOUT_ID,
    stripePayoutStatus: "paid",
  };
  const repository = new FakeRepository({
    account: payoutReadyAccountRecord(),
    ledgers: [ledger],
  });
  const payload = snapshotPayload({
    id: "evt_reconcile00001",
    type: "payout.reconciliation_completed",
  });
  const outcome = await handleConnectPayoutWebhook({
    rawBody: payload,
    signature: sign(payload),
    dependencies: dependencies(repository),
  });
  assert.equal(outcome.disposition, "processed");
  assert.equal(ledger.state, "PAYOUT_PENDING");
  assert.equal(ledger.reconciled, false);
});

test("paid without completed Stripe reconciliation fails for retry and cannot record paid evidence", async () => {
  const ledger = ledgerRecord();
  ledger.state = "TRANSFER_COMPLETED";
  const repository = new FakeRepository({
    account: payoutReadyAccountRecord(),
    ledgers: [ledger],
  });
  const payload = snapshotPayload({ id: "evt_payout000003" });
  await assert.rejects(
    handleConnectPayoutWebhook({
      rawBody: payload,
      signature: sign(payload),
      dependencies: dependencies(repository, {
        async retrievePayout() {
          return {
            id: PAYOUT_ID,
            destinationId: "ba_123456789012",
            status: "paid",
            arrivalDate: 1_788_000_000,
            reconciliationStatus: "in_progress",
            failureCode: null,
            failureMessage: null,
          };
        },
      }),
    }),
    (error) =>
      error instanceof ConnectWebhookError &&
      error.safeCode === "PAYOUT_RECONCILIATION_INCOMPLETE",
  );
  assert.deepEqual(repository.actions, []);
  assert.equal(ledger.state, "TRANSFER_COMPLETED");
  assert.equal(ledger.reconciled, false);
  assert.equal(repository.events.get("evt_payout000003").status, "FAILED");
});

test("authoritative payout destination mismatch fails durably before ledger mutation", async () => {
  const ledger = ledgerRecord();
  const repository = new FakeRepository({
    account: payoutReadyAccountRecord(),
    ledgers: [ledger],
  });
  const payload = snapshotPayload({ id: "evt_destmismatch001" });
  await assert.rejects(
    handleConnectPayoutWebhook({
      rawBody: payload,
      signature: sign(payload),
      dependencies: dependencies(repository, {
        async retrievePayout() {
          return {
            ...(await gateway().retrievePayout()),
            destinationId: "ba_210987654321",
          };
        },
      }),
    }),
    (error) =>
      error instanceof ConnectWebhookError &&
      error.safeCode === "PAYOUT_DESTINATION_MISMATCH",
  );
  assert.equal(repository.events.get("evt_destmismatch001").status, "FAILED");
  assert.deepEqual(repository.actions, []);
  assert.equal(ledger.state, "TRANSFER_CREATED");
  assert.equal(repository.exceptions.length, 1);
  assert.equal(
    repository.exceptions[0].reasonCode,
    "PAYOUT_DESTINATION_NOT_DURABLY_APPROVED",
  );
});

test("webhook accepts only an exact immutable payout destination variance approval", async () => {
  const ledger = ledgerRecord();
  const repository = new FakeRepository({
    account: payoutReadyAccountRecord({
      payoutDestinationId: "ba_210987654321",
      payoutReadyApprovedAt: "2026-08-24T19:00:00.000Z",
    }),
    ledgers: [ledger],
  });
  repository.destinationVarianceApprovals.set(
    `${ledger.ledgerId}:${PAYOUT_ID}`,
    {
      approvalId: "payout_variance_exact001",
      environment: "sandbox",
      ledgerId: ledger.ledgerId,
      payoutId: PAYOUT_ID,
      originalDestinationId: "ba_123456789012",
      approvedDestinationId: "ba_210987654321",
      recipientApprovalAt: "2026-08-24T19:00:00.000Z",
      approvedBy: "owner@example.test",
      reason: "Owner verified the exact replacement bank in Stripe.",
      createdAt: "2026-08-24T19:01:00.000Z",
    },
  );
  const payload = snapshotPayload({ id: "evt_destvariance001" });
  const outcome = await handleConnectPayoutWebhook({
    rawBody: payload,
    signature: sign(payload),
    dependencies: dependencies(repository, {
      async retrievePayout() {
        return {
          ...(await gateway().retrievePayout()),
          destinationId: "ba_210987654321",
        };
      },
    }),
  });
  assert.equal(outcome.disposition, "processed");
  assert.equal(ledger.approvedPayoutDestinationId, "ba_123456789012");
  assert.equal(ledger.stripePayoutId, PAYOUT_ID);
  assert.equal(ledger.stripePayoutStatus, "paid");
  assert.equal(repository.exceptions.length, 0);
});

test("historical payout destination remains valid after the current account moves to a new bank", async () => {
  const ledger = ledgerRecord();
  const repository = new FakeRepository({
    account: payoutReadyAccountRecord({
      payoutDestinationId: "ba_210987654321",
      payoutReadyApprovedAt: "2026-08-24T19:00:00.000Z",
    }),
    ledgers: [ledger],
  });
  const payload = snapshotPayload({ id: "evt_historicaldest1" });
  const outcome = await handleConnectPayoutWebhook({
    rawBody: payload,
    signature: sign(payload),
    dependencies: dependencies(repository),
  });
  assert.equal(outcome.disposition, "processed");
  assert.equal(ledger.stripePayoutStatus, "paid");
  assert.deepEqual(repository.actions, [
    "transfer:completed",
    "payout:paid-evidence",
  ]);
});

test("stale processing lease is recovered with a new token and completed", async () => {
  const repository = new FakeRepository();
  const payload = snapshotPayload({
    id: "evt_stale00000001",
    account: undefined,
    type: "charge.succeeded",
    data: { object: { id: "ch_123456789012", object: "charge" } },
  });
  const record = webhookRecord({
    stripeEventId: "evt_stale00000001",
    eventType: "charge.succeeded",
    connectedAccountId: null,
    receivedAt: "2026-08-22T17:00:00.000Z",
  });
  record.status = "PROCESSING";
  record.processingClaimToken = "whclaim_old_123456";
  record.processingStartedAt = "2026-08-22T17:00:00.000Z";
  record.processingLeaseExpiresAt = "2026-08-22T17:05:00.000Z";
  repository.events.set(record.stripeEventId, record);

  const outcome = await handleConnectPayoutWebhook({
    rawBody: payload,
    signature: sign(payload),
    dependencies: dependencies(
      repository,
      {},
      { claimTokenFactory: () => "whclaim_new_123456" },
    ),
  });
  assert.equal(outcome.disposition, "ignored");
  assert.equal(repository.recoveries, 1);
  assert.equal(record.status, "IGNORED");
  assert.equal(record.processingClaimToken, null);
});

test("a multi-ledger webhook renews its lease throughout processing beyond five minutes", async () => {
  const secondTransferId = "tr_222222222222";
  const secondDestinationPaymentId = "py_222222222222";
  const repository = new FakeRepository({
    account: payoutReadyAccountRecord(),
    ledgers: [
      ledgerRecord(),
      {
        ...ledgerRecord(),
        ledgerId: "ledger_222",
        stripeTransferId: secondTransferId,
        stripeDestinationPaymentId: secondDestinationPaymentId,
      },
    ],
  });
  let cursor = FIXED_NOW.valueOf();
  const clock = {
    now() {
      const result = new Date(cursor);
      cursor += 60_000;
      return result;
    },
  };
  const payload = snapshotPayload({ id: "evt_heartbeat00001" });
  const outcome = await handleConnectPayoutWebhook({
    rawBody: payload,
    signature: sign(payload),
    dependencies: dependencies(
      repository,
      {
        async retrieveTransfer(transferId) {
          return {
            id: transferId,
            amount: 12_345,
            currency: "usd",
            destination: ACCOUNT_ID,
            destinationPaymentId:
              transferId === secondTransferId
                ? secondDestinationPaymentId
                : DESTINATION_PAYMENT_ID,
            reversed: false,
          };
        },
      },
      { clock, claimTokenFactory: () => "whclaim_heartbeat_001" },
    ),
  });

  assert.equal(outcome.disposition, "processed");
  assert.ok(cursor - FIXED_NOW.valueOf() > 5 * 60_000);
  assert.ok(repository.renewals > 10);
  assert.equal(
    repository.actions.filter((action) => action === "payout:paid-evidence")
      .length,
    2,
  );
});

test("a recovered worker fences the old worker after a delayed Stripe response", async () => {
  const repository = new FakeRepository({
    account: payoutReadyAccountRecord(),
    ledgers: [ledgerRecord()],
  });
  let now = FIXED_NOW.valueOf();
  const clock = { now: () => new Date(now) };
  let releaseStripe;
  let signalStripeStarted;
  const stripeStarted = new Promise((resolve) => {
    signalStripeStarted = resolve;
  });
  const delayedStripe = new Promise((resolve) => {
    releaseStripe = resolve;
  });
  const payload = snapshotPayload({ id: "evt_leasefence0001" });
  const workerA = handleConnectPayoutWebhook({
    rawBody: payload,
    signature: sign(payload),
    dependencies: dependencies(
      repository,
      {
        async retrievePayout() {
          signalStripeStarted();
          await delayedStripe;
          return gateway().retrievePayout();
        },
      },
      { clock, claimTokenFactory: () => "whclaim_worker_a_001" },
    ),
  });
  await stripeStarted;

  now += 6 * 60_000;
  const workerB = await handleConnectPayoutWebhook({
    rawBody: payload,
    signature: sign(payload),
    dependencies: dependencies(
      repository,
      {},
      {
        clock,
        claimTokenFactory: () => "whclaim_worker_b_001",
      },
    ),
  });
  assert.equal(workerB.disposition, "processed");
  releaseStripe();
  await assert.rejects(
    workerA,
    (error) =>
      error instanceof ConnectWebhookError &&
      error.safeCode === "WEBHOOK_LEASE_LOST",
  );
  assert.equal(repository.recoveries, 1);
  assert.deepEqual(repository.actions, [
    "transfer:completed",
    "payout:paid-evidence",
  ]);
  assert.equal(repository.events.get("evt_leasefence0001").status, "PROCESSED");
});
