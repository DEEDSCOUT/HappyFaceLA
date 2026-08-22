import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { ArtistPayoutApplicationService } from "../../src/lib/artist-payouts/application-service.ts";
import { manualPaymentIntentDigest } from "../../src/lib/artist-payouts/approval.ts";
import { PayoutRepository } from "../../src/lib/artist-payouts/repository.ts";
import {
  parseAppsScriptRequest,
  signedAppsScriptResponse,
} from "./apps-script-test-helpers.mjs";

const ACCOUNT_ID = "acct_123456789012";
const TRANSFER_ID = "tr_123456789012";
const DESTINATION_PAYMENT_ID = "py_123456789012";
const PAYOUT_ID = "po_123456789012";
const LEDGER_ID = "ledger_632fd415a0809f8244d9ffe997955db1eb7845fec5acba33";
const START = "2026-08-24T18:00:00.000Z";
const ACCOUNT_READY_AT = "2026-08-22T17:00:00.000Z";
const IDENTITY_EVIDENCE_REFERENCE = "synthetic-owner-review-001";
const OWNER = { email: "owner@example.test", role: "owner" };
const ADMIN = { email: "admin@example.test", role: "admin" };
const CRM_CONFIG = {
  writeUrl: "https://crm-adapter.example.test/write",
  readUrl: "https://crm-adapter.example.test/read",
  allowedOrigin: "https://crm-adapter.example.test",
  secret: "synthetic-hmac-secret-with-at-least-32-characters",
};

class TestStatement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    assert.ok(
      values.length <= 100,
      `D1 statement exceeds the 100-bind ceiling: ${values.length}`,
    );
    return new TestStatement(this.database, this.sql, values);
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.values) ?? null;
  }

  async all() {
    return {
      success: true,
      results: this.database.prepare(this.sql).all(...this.values),
    };
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class TestD1 {
  constructor() {
    this.database = new DatabaseSync(":memory:");
    this.failNextBatchWhen = null;
    this.database.exec(
      readFileSync(
        new URL(
          "../../migrations/artist-payouts/sandbox/0000_environment_identity.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    this.database.exec(
      readFileSync(
        new URL(
          "../../migrations/artist-payouts/0001_artist_payout_system.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  }

  prepare(sql) {
    return new TestStatement(this.database, sql);
  }

  async batch(statements) {
    if (this.failNextBatchWhen && this.failNextBatchWhen(statements)) {
      this.failNextBatchWhen = null;
      throw new Error("synthetic D1 transactional write timeout");
    }
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

class MutableClock {
  constructor(instant = START) {
    this.milliseconds = Date.parse(instant);
  }

  now() {
    return new Date(this.milliseconds);
  }

  advance(milliseconds) {
    this.milliseconds += milliseconds;
  }
}

function readyStatus(overrides = {}) {
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
    ...overrides,
  };
}

function restrictedStatus(overrides = {}) {
  return readyStatus({
    transfersStatus: "inactive",
    payoutsStatus: "inactive",
    automaticPayoutsEnabled: false,
    payoutScheduleInterval: null,
    payoutDestinationId: null,
    requirementsStatus: "past_due",
    currentlyDue: ["individual.verification.document"],
    disabledReason: "requirements.past_due",
    ...overrides,
  });
}

function transferResult(overrides = {}) {
  return {
    id: TRANSFER_ID,
    amount: 22_000,
    currency: "usd",
    destination: ACCOUNT_ID,
    destinationPaymentId: DESTINATION_PAYMENT_ID,
    reversed: false,
    transferGroup: "HFL_ARTIST_BATCH:batch:payout:2026-08-24",
    metadata: {},
    ...overrides,
  };
}

function payoutResult(overrides = {}) {
  return {
    id: PAYOUT_ID,
    destinationId: "ba_123456789012",
    status: "paid",
    arrivalDate: Math.floor(Date.parse("2026-08-25T00:00:00.000Z") / 1000),
    reconciliationStatus: "completed",
    failureCode: null,
    failureMessage: null,
    ...overrides,
  };
}

class FakeStripeGateway {
  constructor() {
    this.defaultStatus = readyStatus();
    this.statusQueue = [];
    this.balanceQueue = [];
    this.defaultBalance = 100_000;
    this.payout = payoutResult();
    this.destinationPaymentMembership = true;
    this.ambiguousCreateRemaining = 0;
    this.createTransferHook = null;
    this.transfersByKey = new Map();
    this.recipientMatches = [];
    this.calls = {
      status: [],
      balance: [],
      createTransfer: [],
      retrieveTransfer: [],
      recoveryInventory: [],
      payout: [],
      membership: [],
      findRecipients: [],
      createRecipient: [],
    };
  }

  async findRecipientsByArtist(input) {
    this.calls.findRecipients.push(structuredClone(input));
    return this.recipientMatches.map((candidate) =>
      typeof candidate === "string"
        ? {
            accountId: candidate,
            contactEmailMatches: true,
            environmentMetadataMatches: true,
            purposeMatches: true,
            provenanceMatches: true,
          }
        : structuredClone(candidate),
    );
  }

  async createRecipient(input) {
    this.calls.createRecipient.push(structuredClone(input));
    return { accountId: ACCOUNT_ID };
  }

  async createOnboardingLink() {
    return {
      url: "https://connect.stripe.com/setup/s/synthetic",
      expiresAt: 1_800_000_000,
    };
  }

  async retrieveRecipientStatus(accountId, expectedArtistId) {
    this.calls.status.push({ accountId, expectedArtistId });
    const next =
      this.statusQueue.length > 0
        ? this.statusQueue.shift()
        : this.defaultStatus;
    if (next instanceof Error) throw next;
    return structuredClone(next);
  }

  async retrieveAvailableBalance(currency) {
    this.calls.balance.push(currency);
    const next =
      this.balanceQueue.length > 0
        ? this.balanceQueue.shift()
        : this.defaultBalance;
    if (next instanceof Error) throw next;
    return next;
  }

  async createTransfer(input) {
    this.calls.createTransfer.push(structuredClone(input));
    if (this.createTransferHook) {
      await this.createTransferHook(
        structuredClone(input),
        this.calls.createTransfer.length,
      );
    }
    let transfer = this.transfersByKey.get(input.idempotencyKey);
    if (!transfer) {
      transfer = transferResult({
        amount: input.amount,
        destination: input.destination,
        transferGroup: input.transferGroup,
        metadata: structuredClone(input.metadata),
      });
      this.transfersByKey.set(input.idempotencyKey, transfer);
    }
    if (this.ambiguousCreateRemaining > 0) {
      this.ambiguousCreateRemaining -= 1;
      throw new Error(
        "synthetic connection reset after Stripe accepted the request",
      );
    }
    return structuredClone(transfer);
  }

  async retrieveTransfer(transferId) {
    this.calls.retrieveTransfer.push(transferId);
    const transfer = [...this.transfersByKey.values()].find(
      (candidate) => candidate.id === transferId,
    );
    if (!transfer) throw new Error("synthetic transfer not found");
    return structuredClone(transfer);
  }

  async findTransfersByRecoveryFingerprint(input) {
    this.calls.recoveryInventory.push(structuredClone(input));
    return [...this.transfersByKey.values()]
      .filter(
        (transfer) =>
          transfer.destination === input.destinationAccountId &&
          transfer.metadata.idempotency_fingerprint ===
            input.idempotencyFingerprint,
      )
      .map((transfer) => structuredClone(transfer));
  }

  async retrievePayout(accountId, payoutId) {
    this.calls.payout.push({ accountId, payoutId });
    return structuredClone(this.payout);
  }

  async payoutContainsDestinationPayment(input) {
    this.calls.membership.push(structuredClone(input));
    return this.destinationPaymentMembership;
  }
}

function closeout(overrides = {}) {
  return {
    assignmentExists: true,
    bookingIdValid: true,
    assignmentIdValid: true,
    eventCompleted: true,
    actualEndTime: "2026-08-21T22:00:00.000Z",
    artistCompletionConfirmed: true,
    serviceCompleted: true,
    extraTimeReconciled: true,
    serviceChangeReconciled: true,
    travelPayReconciled: true,
    adjustmentsReconciled: true,
    noCustomerComplaintAffectingPay: true,
    noRefundIssueAffectingPay: true,
    noDamageOrSupplyIssueAffectingPay: true,
    compensationApproved: true,
    contractorControlSatisfied: true,
    stripeOnboardingComplete: true,
    stripeTransfersActive: true,
    stripePayoutsActive: true,
    connectedAccountMatchesArtist: true,
    ...overrides,
  };
}

function ledgerDraft(overrides = {}) {
  return {
    ledgerId: "ledger:100",
    bookingId: "booking:100",
    assignmentId: "assignment:100",
    crmRecordId: "crm:assignment:100",
    crmRevision: "revision:1",
    artistId: "artist:100",
    artistName: "Test Artist",
    eventName: "Synthetic Celebration",
    eventDate: "2026-08-21",
    closeoutVerifiedAt: "2026-08-22T16:00:00.000Z",
    service: "Face painting",
    servicePayCents: 20_000,
    travelPayCents: 2_500,
    bonusCents: 500,
    adjustmentCents: -250,
    deductionCents: 750,
    totalApprovedPayCents: 22_000,
    environment: "sandbox",
    sourceRevision: 1,
    closeout: closeout(),
    connectedAccountId: ACCOUNT_ID,
    ...overrides,
  };
}

function crmSourceFromDraft(draft) {
  return {
    environment: draft.environment,
    recordId: draft.crmRecordId,
    revision: draft.crmRevision,
    sourceRevision: draft.sourceRevision,
    bookingId: draft.bookingId,
    assignmentId: draft.assignmentId,
    artistId: draft.artistId,
    artistName: draft.artistName,
    eventName: draft.eventName,
    eventDate: draft.eventDate,
    closeoutVerifiedAt: draft.closeoutVerifiedAt,
    service: draft.service,
    servicePayCents: draft.servicePayCents,
    travelPayCents: draft.travelPayCents,
    bonusCents: draft.bonusCents,
    adjustmentCents: draft.adjustmentCents,
    deductionCents: draft.deductionCents,
    totalApprovedPayCents: draft.totalApprovedPayCents,
    priorPayment: draft.priorPayment ?? {
      disposition: "CLEAR",
      reasonCodes: [],
      legacyPaymentMethodPresent: true,
      legacyPaymentHandlePresent: true,
    },
    closeout: structuredClone(draft.closeout),
  };
}

async function ingestDraft(fixture, draft, actor, requestId) {
  fixture.source.current = structuredClone(draft);
  return fixture.service.ingestLedger({
    crmRecordId: draft.crmRecordId,
    actor,
    requestId,
  });
}

async function setup(options = {}) {
  const db = new TestD1();
  const repository = new PayoutRepository(db, "sandbox");
  const stripe = new FakeStripeGateway();
  const clock = new MutableClock(options.instant ?? START);
  const reserve = options.reserve ?? 5_000;
  const source = { current: ledgerDraft() };
  const activeRoster = options.activeRoster ?? [
    {
      environment: "sandbox",
      artistId: "artist:100",
      displayName: "Test Artist",
      revision: "roster:1",
    },
  ];
  const authoritativeSources = {
    resolveArtist: async (artistId) => ({
      environment: "sandbox",
      artistId,
      displayName: "Test Artist",
      contactEmail: "artist@example.test",
      country: "US",
      legalEntityType: "individual",
      active: true,
      revision: "roster:1",
    }),
    listActiveArtists: async () => {
      if (options.activeRosterError) throw options.activeRosterError;
      return {
        environment: "sandbox",
        revision: "roster-list:1",
        totalActiveCount: activeRoster.length,
        artists: structuredClone(activeRoster),
      };
    },
    resolveCrmSource: async (recordId) => {
      const resolved = crmSourceFromDraft(source.current);
      if (resolved.recordId !== recordId)
        throw new Error("synthetic source record mismatch");
      return resolved;
    },
  };
  const service = new ArtistPayoutApplicationService(
    repository,
    stripe,
    "https://happyfacesla.com",
    reserve,
    clock,
    authoritativeSources,
    options.onboardingSecret ?? null,
    options.rosterProjectionWriter ?? null,
  );
  if (!options.skipAccount) {
    const accountReadyAt = options.accountReadyAt ?? ACCOUNT_READY_AT;
    await repository.upsertArtistAccount({
      artistId: "artist:100",
      stripeAccountId: ACCOUNT_ID,
      artistDisplayName: "Test Artist",
      onboardingStatus: options.accountStatus ?? "PAYOUT_READY",
      requirementsStatus: "complete",
      transfersStatus: "active",
      payoutsStatus: "active",
      automaticPayoutsEnabled: options.accountAutomaticPayoutsEnabled ?? true,
      payoutDestinationId: "ba_123456789012",
      payoutReadyApprovedAt:
        (options.accountStatus ?? "PAYOUT_READY") === "PAYOUT_READY"
          ? accountReadyAt
          : null,
      lastRequirementsCheckAt: accountReadyAt,
      onboardedAt:
        (options.accountStatus ?? "PAYOUT_READY") === "PAYOUT_READY"
          ? accountReadyAt
          : null,
      disabledReason: null,
      payoutExceptionFlag: false,
      now: START,
    });
  }
  return { db, repository, stripe, clock, service, source };
}

async function readyApprovedBatch(options = {}) {
  const fixture = await setup(options);
  const scheduledDate = options.scheduledDate ?? "2026-08-24";
  const ingested = await ingestDraft(
    fixture,
    ledgerDraft(),
    ADMIN,
    "request:ingest",
  );
  assert.equal(ingested.ledger.state, "READY_FOR_OWNER_APPROVAL");
  const prepared = await fixture.service.prepareBatch({
    scheduledDate,
    actor: ADMIN,
    requestId: "request:prepare",
  });
  const approved = await fixture.service.approveBatch({
    batchId: prepared.batch.batchId,
    expectedDigest: prepared.approvalDigest,
    expectedRevision: 0,
    actor: OWNER,
    requestId: "request:approve",
  });
  return { ...fixture, prepared, approved };
}

async function repositoryApprovedBatch({ instant, scheduledDate }) {
  const fixture = await setup({
    instant,
    accountReadyAt: "2026-08-16T17:00:00.000Z",
  });
  const sourceDraft = ledgerDraft({
    eventDate: "2026-08-16",
    closeoutVerifiedAt: "2026-08-17T16:00:00.000Z",
    closeout: closeout({ actualEndTime: "2026-08-16T22:00:00.000Z" }),
  });
  const ingested = await ingestDraft(
    fixture,
    sourceDraft,
    ADMIN,
    `request:ingest:${scheduledDate}`,
  );
  assert.equal(ingested.ledger.state, "READY_FOR_OWNER_APPROVAL");
  const now = fixture.clock.now().toISOString();
  const prepared = await fixture.repository.prepareBatch({
    batchId: `batch:test:${scheduledDate.replaceAll("-", "")}`,
    scheduledDate,
    ledgerIds: [ingested.ledger.ledgerId],
    blockedItemCount: 0,
    blockedExceptionIds: [],
    remainingCandidateCount: 0,
    createdBy: ADMIN.email,
    auditId: `audit:prepare:${scheduledDate.replaceAll("-", "")}`,
    requestId: `request:prepare:${scheduledDate}`,
    now,
  });
  const approved = await fixture.repository.approveBatch({
    batchId: prepared.batch.batchId,
    expectedDigest: prepared.approvalDigest,
    expectedRevision: 0,
    approvedBy: OWNER.email,
    auditId: `audit:approve:${scheduledDate.replaceAll("-", "")}`,
    requestId: `request:approve:${scheduledDate}`,
    now,
  });
  return { ...fixture, prepared, approved };
}

async function manualIntentFixture() {
  const fixture = await setup();
  const ingested = await ingestDraft(
    fixture,
    ledgerDraft(),
    ADMIN,
    "request:manual:intake",
  );
  const intent = await fixture.repository.claimManualPaymentException({
    ledgerId: ingested.ledger.ledgerId,
    claimToken: "manual:claim:test",
    claimExpiresAt: "2026-08-24T18:02:00.000Z",
    expectedAmountCents: ingested.ledger.totalApprovedPayCents,
    expectedSourceRevision: ingested.ledger.sourceRevision,
    expectedMaterialDigest: ingested.ledger.materialDigest,
    method: "CHECK",
    reason: "Owner-approved legacy payment recovery",
    evidenceReference: "synthetic-evidence-001",
    memo: "Legacy artist payment",
    actor: OWNER.email,
    auditId: "audit:manual:intent",
    requestId: "request:manual:intent",
    now: START,
  });
  await fixture.repository.releaseManualPaymentClaim({
    ledgerId: intent.ledgerId,
    claimToken: "manual:claim:test",
    now: "2026-08-24T18:00:30.000Z",
  });
  return { ...fixture, intent };
}

test("source-bound onboarding is owner-only, provenance-bound, and stops on existing recipients", async () => {
  const onboardingSecret =
    "synthetic-onboarding-claim-secret-with-at-least-32-characters";
  const fixture = await setup({ skipAccount: true, onboardingSecret });
  await assert.rejects(
    fixture.service.startOnboarding({
      artistId: "artist:100",
      actor: ADMIN,
      requestId: "request:onboarding:admin",
    }),
    /Owner authorization is required/,
  );
  const invitation = await fixture.service.startOnboarding({
    artistId: "artist:100",
    actor: OWNER,
    requestId: "request:onboarding:owner",
  });
  assert.equal(invitation.account.onboardingStatus, "TRANSFERS_ENABLED");
  assert.match(
    invitation.invitationUrl,
    /^https:\/\/happyfacesla\.com\/artist\/payout-onboarding\?claim=/,
  );
  assert.equal(invitation.invitationUrl.includes("connect.stripe.com"), false);
  assert.match(
    invitation.challengeCode,
    /^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/,
  );
  assert.equal(
    invitation.expiresAt,
    Math.floor(Date.parse(START) / 1000) + 3600,
  );
  assert.equal(fixture.stripe.calls.createRecipient.length, 1);
  assert.match(
    fixture.stripe.calls.createRecipient[0].provenanceFingerprint,
    /^hmac-sha256:[a-f0-9]{64}$/,
  );
  assert.equal(
    fixture.stripe.calls.findRecipients[0].contactEmail,
    "artist@example.test",
  );

  const existing = await setup({ skipAccount: true, onboardingSecret });
  existing.stripe.recipientMatches = [ACCOUNT_ID, "acct_222222222222"];
  await assert.rejects(
    existing.service.startOnboarding({
      artistId: "artist:100",
      actor: OWNER,
      requestId: "request:onboarding:duplicates",
    }),
    /requires owner reconciliation/,
  );
  assert.equal(existing.stripe.calls.createRecipient.length, 0);
  assert.ok(
    (await existing.repository.listOpenExceptions()).some(
      (entry) => entry.reasonCode === "DUPLICATE_RECIPIENTS_FOUND",
    ),
  );
});

test("existing recipient recovery admits only one exact provenance-matched inventory result", async () => {
  const onboardingSecret =
    "synthetic-onboarding-claim-secret-with-at-least-32-characters";
  const fixture = await setup({ skipAccount: true, onboardingSecret });
  fixture.stripe.recipientMatches = [ACCOUNT_ID];
  const account = await fixture.service.mapExistingStripeRecipient({
    artistId: "artist:100",
    accountId: ACCOUNT_ID,
    actor: OWNER,
    requestId: "request:map-existing:exact",
  });
  assert.equal(account.stripeAccountId, ACCOUNT_ID);
  assert.equal(account.onboardingStatus, "TRANSFERS_ENABLED");
  assert.match(
    fixture.stripe.calls.findRecipients[0].provenanceFingerprint,
    /^hmac-sha256:[a-f0-9]{64}$/,
  );

  const mismatch = await setup({ skipAccount: true, onboardingSecret });
  mismatch.stripe.recipientMatches = ["acct_222222222222"];
  await assert.rejects(
    mismatch.service.mapExistingStripeRecipient({
      artistId: "artist:100",
      accountId: ACCOUNT_ID,
      actor: OWNER,
      requestId: "request:map-existing:mismatch",
    }),
    /does not contain one exact artist-bound account/,
  );
  assert.equal(await mismatch.repository.getArtistAccount("artist:100"), null);

  const rotatedSecret = await setup({ skipAccount: true, onboardingSecret });
  rotatedSecret.stripe.recipientMatches = [
    {
      accountId: ACCOUNT_ID,
      contactEmailMatches: true,
      environmentMetadataMatches: true,
      purposeMatches: true,
      provenanceMatches: false,
    },
  ];
  await assert.rejects(
    rotatedSecret.service.startOnboarding({
      artistId: "artist:100",
      actor: OWNER,
      requestId: "request:onboarding:rotated-secret",
    }),
    /requires owner reconciliation/,
  );
  assert.equal(rotatedSecret.stripe.calls.createRecipient.length, 0);
  await assert.rejects(
    rotatedSecret.service.mapExistingStripeRecipient({
      artistId: "artist:100",
      accountId: ACCOUNT_ID,
      actor: OWNER,
      requestId: "request:map-existing:rotated-secret",
    }),
    /does not contain one exact artist-bound account/,
  );
});

async function transferredLedgerFixture() {
  const fixture = await readyApprovedBatch();
  const executed = await fixture.service.executeBatch({
    batchId: fixture.approved.batchId,
    expectedDigest: fixture.approved.approvalDigest,
    expectedRevision: fixture.approved.approvalRevision,
    actor: OWNER,
    requestId: "request:execute",
  });
  assert.equal(executed.createdTransfers.length, 1);
  fixture.clock.advance(1_000);
  const completed = await fixture.repository.recordTransferLifecycle({
    ledgerId: LEDGER_ID,
    stripeTransferId: TRANSFER_ID,
    status: "completed",
    actor: "stripe-webhook",
    auditId: "audit:transfer:completed",
    requestId: "request:transfer:completed",
    now: fixture.clock.now().toISOString(),
  });
  assert.equal(completed.ledger.state, "TRANSFER_COMPLETED");
  return fixture;
}

test("historical paid or ambiguous CRM evidence is rejected before Stripe readiness or ledger intake", async () => {
  const fixture = await setup();
  const statusReadsBefore = fixture.stripe.calls.status.length;
  await assert.rejects(
    ingestDraft(
      fixture,
      ledgerDraft({
        priorPayment: {
          disposition: "OWNER_REVIEW_REQUIRED",
          reasonCodes: ["LEGACY_PAID_DATE_PRESENT"],
          legacyPaymentMethodPresent: true,
          legacyPaymentHandlePresent: true,
        },
      }),
      ADMIN,
      "request:historical-payment-block",
    ),
    /historical reconciliation; normal Stripe intake is blocked/,
  );
  assert.equal(fixture.stripe.calls.status.length, statusReadsBefore);
  assert.equal(await fixture.repository.getLedger(LEDGER_ID), null);
});

test("payment memo rejects overlength source material without truncating required trailing facts", async () => {
  const fixture = await setup();
  const draft = ledgerDraft({ service: "S".repeat(240) });
  await assert.rejects(
    ingestDraft(fixture, draft, ADMIN, "request:memo:overlength"),
    /Payment memo exceeds 240 characters/,
  );
  assert.equal(await fixture.repository.getLedger(draft.ledgerId), null);
});

test("funding preview surfaces a safe code and check time when Stripe balance is unavailable", async () => {
  const fixture = await setup();
  fixture.stripe.balanceQueue.push(new Error("synthetic provider outage"));
  const snapshot = await fixture.service.dashboardWithFundingPreview();
  assert.equal(snapshot.fundingPreviewUnavailable, true);
  assert.deepEqual(snapshot.fundingPreviewError, {
    code: "STRIPE_BALANCE_UNAVAILABLE",
    checkedAt: START,
  });
});

test("dashboard onboarding queue compares the complete active roster with payout-ready recipients", async () => {
  const fixture = await setup({
    activeRoster: [
      {
        environment: "sandbox",
        artistId: "artist:100",
        displayName: "Ready Artist",
        revision: "roster:ready",
      },
      {
        environment: "sandbox",
        artistId: "artist:200",
        displayName: "Needs Invitation",
        revision: "roster:needs-invitation",
      },
    ],
  });
  const snapshot = await fixture.service.dashboardWithAuthoritativeRoster();
  assert.equal(snapshot.onboardingQueueUnavailable, false);
  assert.equal(snapshot.activeRosterCount, 2);
  assert.deepEqual(snapshot.onboardingQueue, [
    {
      artistId: "artist:200",
      displayName: "Needs Invitation",
      onboardingStatus: "NOT_INVITED",
    },
  ]);
});

test("dashboard marks the onboarding queue unavailable instead of treating a roster failure as empty", async () => {
  const fixture = await setup({
    activeRosterError: new Error("synthetic roster continuation drift"),
  });
  const snapshot = await fixture.service.dashboardWithAuthoritativeRoster();
  assert.equal(snapshot.onboardingQueueUnavailable, true);
  assert.equal(snapshot.activeRosterCount, null);
  assert.deepEqual(snapshot.onboardingQueue, []);
});

test("batch preparation refreshes every recipient and binds blocked candidates to the prepared batch", async () => {
  const fixture = await setup();
  const secondAccountId = "acct_210987654321";
  await fixture.repository.upsertArtistAccount({
    artistId: "artist:200",
    stripeAccountId: secondAccountId,
    artistDisplayName: "Second Artist",
    onboardingStatus: "PAYOUT_READY",
    requirementsStatus: "complete",
    transfersStatus: "active",
    payoutsStatus: "active",
    automaticPayoutsEnabled: true,
    payoutDestinationId: "ba_210987654321",
    payoutReadyApprovedAt: ACCOUNT_READY_AT,
    lastRequirementsCheckAt: ACCOUNT_READY_AT,
    onboardedAt: ACCOUNT_READY_AT,
    disabledReason: null,
    payoutExceptionFlag: false,
    now: START,
  });
  fixture.stripe.statusQueue.push(
    readyStatus(),
    readyStatus({
      accountId: secondAccountId,
      payoutDestinationId: "ba_210987654321",
    }),
  );
  await ingestDraft(
    fixture,
    ledgerDraft(),
    ADMIN,
    "request:batch-refresh:first",
  );
  await ingestDraft(
    fixture,
    ledgerDraft({
      ledgerId: "ledger:200",
      bookingId: "booking:200",
      assignmentId: "assignment:200",
      crmRecordId: "crm:assignment:200",
      artistId: "artist:200",
      artistName: "Second Artist",
      connectedAccountId: secondAccountId,
    }),
    ADMIN,
    "request:batch-refresh:second",
  );
  fixture.stripe.statusQueue.push(
    readyStatus(),
    restrictedStatus({ accountId: secondAccountId }),
  );

  const prepared = await fixture.service.prepareBatch({
    scheduledDate: "2026-08-24",
    actor: ADMIN,
    requestId: "request:batch-refresh:prepare",
  });
  assert.equal(prepared.batch.itemCount, 1);
  assert.equal(prepared.batch.blockedItemCount, 1);
  assert.equal(prepared.batch.remainingCandidateCount, 0);
  assert.equal(fixture.stripe.calls.status.length, 4);
  const dashboard = await fixture.repository.getDashboard();
  assert.equal(dashboard.batchBlockedItems.length, 1);
  assert.equal(dashboard.batchBlockedItems[0].batchId, prepared.batch.batchId);
  assert.equal(dashboard.batchBlockedItems[0].artistId, "artist:200");
  assert.equal(
    dashboard.batchBlockedItems[0].reasonCode,
    "RECIPIENT_NOT_PAYOUT_READY",
  );
});

test("same-day Monday and Wednesday preparation and execution pass", async () => {
  for (const [scheduledDate, instant] of [
    ["2026-08-24", "2026-08-24T18:00:00.000Z"],
    ["2026-08-26", "2026-08-26T18:00:00.000Z"],
  ]) {
    const fixture = await readyApprovedBatch({ instant, scheduledDate });
    const executed = await fixture.service.executeBatch({
      batchId: fixture.approved.batchId,
      expectedDigest: fixture.approved.approvalDigest,
      expectedRevision: fixture.approved.approvalRevision,
      actor: OWNER,
      requestId: `request:execute:${scheduledDate}`,
    });
    assert.equal(executed.createdTransfers.length, 1, scheduledDate);
    assert.equal(fixture.stripe.calls.createTransfer.length, 1, scheduledDate);
  }
});

test("past, future, and weekend batch preparation is rejected before D1 batch creation", async () => {
  const cases = [
    ["past", "2026-08-19", "2026-08-24T18:00:00.000Z"],
    ["future", "2026-08-26", "2026-08-24T18:00:00.000Z"],
    ["weekend", "2026-08-22", "2026-08-22T18:00:00.000Z"],
  ];
  for (const [label, scheduledDate, instant] of cases) {
    const fixture = await setup({ instant });
    const sourceDraft = ledgerDraft({
      eventDate: "2026-08-16",
      closeoutVerifiedAt: "2026-08-17T16:00:00.000Z",
      closeout: closeout({ actualEndTime: "2026-08-16T22:00:00.000Z" }),
    });
    await ingestDraft(fixture, sourceDraft, ADMIN, `request:ingest:${label}`);
    await assert.rejects(
      fixture.service.prepareBatch({
        scheduledDate,
        actor: ADMIN,
        requestId: `request:prepare:${label}`,
      }),
      /current America\/Los_Angeles date|Monday or Wednesday|not scheduled or separately authorized/,
    );
    assert.equal(
      await fixture.repository.getBatch(`batch:test:${label}`),
      null,
    );
  }
});

test("past, future, and weekend batch execution is rejected before Stripe reads or writes", async () => {
  const cases = [
    ["past", "2026-08-19", "2026-08-24T18:00:00.000Z"],
    ["future", "2026-08-26", "2026-08-24T18:00:00.000Z"],
    ["weekend", "2026-08-22", "2026-08-22T18:00:00.000Z"],
  ];
  for (const [label, scheduledDate, instant] of cases) {
    const fixture = await repositoryApprovedBatch({ instant, scheduledDate });
    const statusReadsBefore = fixture.stripe.calls.status.length;
    await assert.rejects(
      fixture.service.executeBatch({
        batchId: fixture.approved.batchId,
        expectedDigest: fixture.approved.approvalDigest,
        expectedRevision: fixture.approved.approvalRevision,
        actor: OWNER,
        requestId: `request:execute:${label}`,
      }),
      /current America\/Los_Angeles date|Monday or Wednesday|not scheduled or separately authorized/,
    );
    assert.equal(fixture.stripe.calls.status.length, statusReadsBefore, label);
    assert.equal(fixture.stripe.calls.balance.length, 0, label);
    assert.equal(fixture.stripe.calls.createTransfer.length, 0, label);
    assert.equal(
      (await fixture.repository.getBatch(fixture.approved.batchId)).status,
      "OWNER_APPROVED",
      label,
    );
  }
});

test("non-owner cannot execute an owner-approved batch", async () => {
  const fixture = await readyApprovedBatch();
  const statusCalls = fixture.stripe.calls.status.length;
  await assert.rejects(
    fixture.service.executeBatch({
      batchId: fixture.approved.batchId,
      expectedDigest: fixture.approved.approvalDigest,
      expectedRevision: fixture.approved.approvalRevision,
      actor: ADMIN,
      requestId: "request:admin-execute",
    }),
    /Owner authorization is required/,
  );
  assert.equal(fixture.stripe.calls.status.length, statusCalls);
  assert.equal(fixture.stripe.calls.createTransfer.length, 0);
  assert.equal(
    (await fixture.repository.getBatch(fixture.approved.batchId)).status,
    "OWNER_APPROVED",
  );
});

test("authoritative Stripe readiness overrides client-provided closeout readiness", async () => {
  const fixture = await setup();
  fixture.stripe.defaultStatus = restrictedStatus();
  const result = await ingestDraft(
    fixture,
    ledgerDraft(),
    ADMIN,
    "request:restricted-ingest",
  );
  assert.equal(result.ledger.state, "CLOSEOUT_PENDING");
  assert.equal(result.ledger.closeout.stripeOnboardingComplete, false);
  assert.equal(result.ledger.closeout.stripeTransfersActive, false);
  assert.equal(result.ledger.closeout.stripePayoutsActive, false);
  assert.equal(result.ledger.closeout.connectedAccountMatchesArtist, false);
  assert.ok(result.blockers.includes("stripeTransfersActive"));
  assert.equal(
    (await fixture.repository.getArtistAccount("artist:100")).onboardingStatus,
    "RESTRICTED",
  );
});

test("same-revision Stripe readiness can clear and schedules strictly after owner activation", async () => {
  const fixture = await setup({
    accountStatus: "TRANSFERS_ENABLED",
    accountAutomaticPayoutsEnabled: false,
  });
  fixture.stripe.defaultStatus = restrictedStatus();
  const draft = ledgerDraft();
  const pending = await ingestDraft(
    fixture,
    draft,
    ADMIN,
    "request:readiness:pending",
  );
  assert.equal(pending.ledger.state, "CLOSEOUT_PENDING");
  assert.equal(pending.ledger.sourceRevision, 1);

  fixture.stripe.defaultStatus = readyStatus();
  const activated = await fixture.service.activateArtistPayoutAccount({
    artistId: "artist:100",
    accountId: ACCOUNT_ID,
    identityEvidenceReference: IDENTITY_EVIDENCE_REFERENCE,
    actor: OWNER,
    requestId: "request:readiness:activate",
  });
  assert.equal(activated.onboardingStatus, "PAYOUT_READY");
  assert.equal(activated.preferredPayoutType, "automatic_standard");
  assert.equal(activated.onboardedAt, START);

  const cleared = await ingestDraft(
    fixture,
    draft,
    ADMIN,
    "request:readiness:cleared",
  );
  assert.equal(cleared.ledger.state, "READY_FOR_OWNER_APPROVAL");
  assert.equal(cleared.ledger.sourceRevision, 1);
  assert.equal(cleared.ledger.materialDigest, pending.ledger.materialDigest);
  assert.equal(cleared.ledger.batchEligibilityDate, "2026-08-26");
  assert.equal(cleared.approvalInvalidated, false);
  assert.equal(
    (await fixture.repository.listReadyLedgers("2026-08-24")).ledgers.length,
    0,
  );
  assert.equal(
    (await fixture.repository.listReadyLedgers("2026-08-26")).ledgers.length,
    1,
  );
  assert.ok(
    (await fixture.repository.listAuditHistory()).some(
      (entry) => entry.action === "LEDGER_STRIPE_READINESS_REFRESHED",
    ),
  );
});

test("Monday destination reapproval rolls an existing unbatched READY ledger to Wednesday", async () => {
  const fixture = await setup();
  const draft = ledgerDraft();
  const ingested = await ingestDraft(
    fixture,
    draft,
    ADMIN,
    "request:destination-roll:ingest",
  );
  assert.equal(ingested.ledger.batchEligibilityDate, "2026-08-24");

  const changedDestination = readyStatus({
    payoutDestinationId: "ba_210987654321",
  });
  fixture.stripe.defaultStatus = changedDestination;
  await assert.rejects(
    fixture.service.prepareBatch({
      scheduledDate: "2026-08-24",
      actor: ADMIN,
      requestId: "request:destination-roll:detect",
    }),
    /blocked by the current Stripe readiness preflight/,
  );
  const demoted = await fixture.repository.getArtistAccount("artist:100");
  assert.equal(demoted.onboardingStatus, "RESTRICTED");
  assert.equal(demoted.payoutReadyApprovedAt, null);

  const activated = await fixture.service.activateArtistPayoutAccount({
    artistId: "artist:100",
    accountId: ACCOUNT_ID,
    identityEvidenceReference: IDENTITY_EVIDENCE_REFERENCE,
    actor: OWNER,
    requestId: "request:destination-roll:activate",
  });
  assert.equal(activated.payoutDestinationId, "ba_210987654321");
  assert.equal(activated.payoutReadyApprovedAt, START);
  assert.equal(
    (await fixture.repository.getLedger(LEDGER_ID)).batchEligibilityDate,
    "2026-08-26",
  );
  assert.equal(
    (await fixture.repository.listReadyLedgers("2026-08-24")).ledgers.length,
    0,
  );
  assert.equal(
    (await fixture.repository.listReadyLedgers("2026-08-26")).ledgers.length,
    1,
  );
});

test("future actual-end time is rejected before a ledger is admitted", async () => {
  const fixture = await setup();
  const sourceDraft = ledgerDraft({
    closeoutVerifiedAt: "2026-08-24T19:01:00.000Z",
    closeout: closeout({ actualEndTime: "2026-08-24T19:00:00.000Z" }),
  });
  await assert.rejects(
    ingestDraft(fixture, sourceDraft, ADMIN, "request:future-end"),
    /Actual end time cannot be in the future/,
  );
  assert.equal(await fixture.repository.getLedger(LEDGER_ID), null);
});

test("batch reserve failure occurs before the batch or any transfer item is claimed", async () => {
  const fixture = await readyApprovedBatch();
  fixture.stripe.balanceQueue = [26_999];
  await assert.rejects(
    fixture.service.executeBatch({
      batchId: fixture.approved.batchId,
      expectedDigest: fixture.approved.approvalDigest,
      expectedRevision: fixture.approved.approvalRevision,
      actor: OWNER,
      requestId: "request:reserve-block",
    }),
    /available balance would fall below/,
  );
  assert.equal(fixture.stripe.calls.createTransfer.length, 0);
  assert.equal(
    (await fixture.repository.getBatch(fixture.approved.batchId)).status,
    "OWNER_APPROVED",
  );
  assert.equal(
    await fixture.repository.getTransferAttemptByFingerprint(
      "hfl-artist-transfer:assignment:100:1",
    ),
    null,
  );
});

test("a safely failed pre-Stripe transfer can use a newly reapproved destination without duplication", async () => {
  const fixture = await readyApprovedBatch();
  fixture.stripe.balanceQueue = [100_000, 26_999];
  const first = await fixture.service.executeBatch({
    batchId: fixture.approved.batchId,
    expectedDigest: fixture.approved.approvalDigest,
    expectedRevision: fixture.approved.approvalRevision,
    actor: OWNER,
    requestId: "request:safe-resnapshot:first",
  });
  assert.equal(first.createdTransfers.length, 0);
  assert.equal(first.failedLedgers.length, 1);
  assert.equal(fixture.stripe.calls.createTransfer.length, 0);
  assert.equal(
    first.failedLedgers[0].approvedPayoutDestinationId,
    "ba_123456789012",
  );

  fixture.stripe.defaultStatus = readyStatus({
    payoutDestinationId: "ba_210987654321",
  });
  await assert.rejects(
    fixture.service.executeBatch({
      batchId: fixture.approved.batchId,
      expectedDigest: fixture.approved.approvalDigest,
      expectedRevision: fixture.approved.approvalRevision,
      actor: OWNER,
      requestId: "request:safe-resnapshot:detect",
    }),
    /not payout-ready/,
  );
  await fixture.service.activateArtistPayoutAccount({
    artistId: "artist:100",
    accountId: ACCOUNT_ID,
    identityEvidenceReference: IDENTITY_EVIDENCE_REFERENCE,
    actor: OWNER,
    requestId: "request:safe-resnapshot:activate",
  });

  fixture.clock.advance(2 * 24 * 60 * 60 * 1000);
  await fixture.service.authorizeCrossDayBatchRecovery({
    batchId: fixture.approved.batchId,
    expectedDigest: fixture.approved.approvalDigest,
    expectedRevision: fixture.approved.approvalRevision,
    reason: "Retry the safely failed item after owner destination reapproval.",
    actor: OWNER,
    requestId: "request:safe-resnapshot:cross-day",
  });
  const recovered = await fixture.service.executeBatch({
    batchId: fixture.approved.batchId,
    expectedDigest: fixture.approved.approvalDigest,
    expectedRevision: fixture.approved.approvalRevision,
    actor: OWNER,
    requestId: "request:safe-resnapshot:retry",
  });
  assert.equal(recovered.createdTransfers.length, 1);
  assert.equal(fixture.stripe.calls.createTransfer.length, 1);
  const ledger = await fixture.repository.getLedger(LEDGER_ID);
  assert.equal(ledger.approvedPayoutDestinationId, "ba_210987654321");
  assert.equal(ledger.stripeTransferId, TRANSFER_ID);
  assert.ok(
    (await fixture.repository.listAuditHistory()).some(
      (entry) =>
        entry.action ===
        "PAYOUT_DESTINATION_APPROVAL_RESNAPSHOTTED_AFTER_SAFE_FAILURE",
    ),
  );
});

test("an ambiguous Stripe outcome cannot spend a prior safe-retry bank resnapshot twice", async () => {
  const fixture = await readyApprovedBatch();
  fixture.stripe.balanceQueue = [100_000, 26_999];
  await fixture.service.executeBatch({
    batchId: fixture.approved.batchId,
    expectedDigest: fixture.approved.approvalDigest,
    expectedRevision: fixture.approved.approvalRevision,
    actor: OWNER,
    requestId: "request:one-use-resnapshot:first",
  });

  fixture.stripe.defaultStatus = readyStatus({
    payoutDestinationId: "ba_210987654321",
  });
  await assert.rejects(
    fixture.service.executeBatch({
      batchId: fixture.approved.batchId,
      expectedDigest: fixture.approved.approvalDigest,
      expectedRevision: fixture.approved.approvalRevision,
      actor: OWNER,
      requestId: "request:one-use-resnapshot:detect-b",
    }),
    /not payout-ready/,
  );
  await fixture.service.activateArtistPayoutAccount({
    artistId: "artist:100",
    accountId: ACCOUNT_ID,
    identityEvidenceReference: IDENTITY_EVIDENCE_REFERENCE,
    actor: OWNER,
    requestId: "request:one-use-resnapshot:activate-b",
  });
  fixture.clock.advance(2 * 24 * 60 * 60 * 1000);
  await fixture.service.authorizeCrossDayBatchRecovery({
    batchId: fixture.approved.batchId,
    expectedDigest: fixture.approved.approvalDigest,
    expectedRevision: fixture.approved.approvalRevision,
    reason: "Retry after exact owner verification of replacement bank B.",
    actor: OWNER,
    requestId: "request:one-use-resnapshot:recovery",
  });
  fixture.stripe.ambiguousCreateRemaining = 1;
  await assert.rejects(
    fixture.service.executeBatch({
      batchId: fixture.approved.batchId,
      expectedDigest: fixture.approved.approvalDigest,
      expectedRevision: fixture.approved.approvalRevision,
      actor: OWNER,
      requestId: "request:one-use-resnapshot:ambiguous",
    }),
    /Stripe transfer outcome is ambiguous/,
  );
  assert.equal(
    (await fixture.repository.getLedger(LEDGER_ID)).approvedPayoutDestinationId,
    "ba_210987654321",
  );

  fixture.stripe.defaultStatus = readyStatus({
    payoutDestinationId: "ba_333333333333",
  });
  await fixture.service.activateArtistPayoutAccount({
    artistId: "artist:100",
    accountId: ACCOUNT_ID,
    identityEvidenceReference: IDENTITY_EVIDENCE_REFERENCE,
    actor: OWNER,
    requestId: "request:one-use-resnapshot:activate-c",
  });
  const attempt = await fixture.repository.getTransferAttemptByFingerprint(
    "hfl-artist-transfer:assignment:100:1",
  );
  const executingBatch = await fixture.repository.getBatch(
    fixture.approved.batchId,
  );
  assert.equal(attempt.destinationResnapshotAuthorized, false);
  await assert.rejects(
    fixture.repository.recordApprovedPayoutDestination({
      attemptId: attempt.attemptId,
      claimToken: executingBatch.executionClaimToken,
      payoutDestinationId: "ba_333333333333",
      payoutDestinationApprovedAt: fixture.clock.now().toISOString(),
      actor: OWNER.email,
      auditId: "audit:one-use-resnapshot:forbidden-c",
      requestId: "request:one-use-resnapshot:forbidden-c",
      now: fixture.clock.now().toISOString(),
    }),
    /snapshot cannot be replaced/,
  );
  fixture.clock.advance(16 * 60 * 1000);
  await assert.rejects(
    fixture.service.executeBatch({
      batchId: fixture.approved.batchId,
      expectedDigest: fixture.approved.approvalDigest,
      expectedRevision: fixture.approved.approvalRevision,
      actor: OWNER,
      requestId: "request:one-use-resnapshot:retry-after-ambiguous",
    }),
    /not payout-ready/,
  );
  assert.equal(
    (await fixture.repository.getLedger(LEDGER_ID)).approvedPayoutDestinationId,
    "ba_210987654321",
  );
});

test("recipient restriction after the durable batch claim records failure without calling Stripe transfer create", async () => {
  const fixture = await readyApprovedBatch();
  fixture.stripe.statusQueue = [readyStatus(), restrictedStatus()];
  const result = await fixture.service.executeBatch({
    batchId: fixture.approved.batchId,
    expectedDigest: fixture.approved.approvalDigest,
    expectedRevision: fixture.approved.approvalRevision,
    actor: OWNER,
    requestId: "request:late-restriction",
  });
  assert.equal(result.createdTransfers.length, 0);
  assert.equal(result.failedLedgers.length, 1);
  assert.equal(result.failedLedgers[0].state, "TRANSFER_FAILED");
  assert.equal(
    result.failedLedgers[0].failureCode,
    "RECIPIENT_OR_DESTINATION_NOT_APPROVED",
  );
  assert.equal(fixture.stripe.calls.createTransfer.length, 0);
  const attempt = await fixture.repository.getTransferAttemptByFingerprint(
    "hfl-artist-transfer:assignment:100:1",
  );
  assert.equal(attempt.status, "STRIPE_FAILED");
});

test("destination drift after owner approval is durably demoted before batch preflight", async () => {
  const fixture = await readyApprovedBatch();
  fixture.stripe.defaultStatus = readyStatus({
    payoutDestinationId: "ba_210987654321",
  });
  await assert.rejects(
    fixture.service.executeBatch({
      batchId: fixture.approved.batchId,
      expectedDigest: fixture.approved.approvalDigest,
      expectedRevision: fixture.approved.approvalRevision,
      actor: OWNER,
      requestId: "request:destination-drift:preflight",
    }),
    /not payout-ready/,
  );
  const account = await fixture.repository.getArtistAccount("artist:100");
  assert.equal(account.onboardingStatus, "RESTRICTED");
  assert.equal(account.payoutDestinationId, "ba_210987654321");
  assert.equal(account.payoutReadyApprovedAt, null);
  assert.equal(fixture.stripe.calls.createTransfer.length, 0);
});

test("destination drift after the durable item claim records failure before Stripe transfer creation", async () => {
  const fixture = await readyApprovedBatch();
  fixture.stripe.statusQueue = [
    readyStatus(),
    readyStatus({ payoutDestinationId: "ba_210987654321" }),
  ];
  const result = await fixture.service.executeBatch({
    batchId: fixture.approved.batchId,
    expectedDigest: fixture.approved.approvalDigest,
    expectedRevision: fixture.approved.approvalRevision,
    actor: OWNER,
    requestId: "request:destination-drift:post-claim",
  });
  assert.equal(result.createdTransfers.length, 0);
  assert.equal(result.failedLedgers.length, 1);
  assert.equal(
    result.failedLedgers[0].failureCode,
    "RECIPIENT_OR_DESTINATION_NOT_APPROVED",
  );
  const account = await fixture.repository.getArtistAccount("artist:100");
  assert.equal(account.onboardingStatus, "RESTRICTED");
  assert.equal(account.payoutReadyApprovedAt, null);
  assert.equal(fixture.stripe.calls.createTransfer.length, 0);
});

test("same-day destination reactivation cannot execute an older owner-approved batch", async () => {
  const fixture = await readyApprovedBatch();
  fixture.stripe.defaultStatus = readyStatus({
    payoutDestinationId: "ba_210987654321",
  });
  await assert.rejects(
    fixture.service.executeBatch({
      batchId: fixture.approved.batchId,
      expectedDigest: fixture.approved.approvalDigest,
      expectedRevision: fixture.approved.approvalRevision,
      actor: OWNER,
      requestId: "request:reactivation-old-batch:detect",
    }),
    /not payout-ready/,
  );
  const reactivated = await fixture.service.activateArtistPayoutAccount({
    artistId: "artist:100",
    accountId: ACCOUNT_ID,
    identityEvidenceReference: IDENTITY_EVIDENCE_REFERENCE,
    actor: OWNER,
    requestId: "request:reactivation-old-batch:activate",
  });
  assert.equal(reactivated.payoutReadyApprovedAt, START);

  await assert.rejects(
    fixture.service.executeBatch({
      batchId: fixture.approved.batchId,
      expectedDigest: fixture.approved.approvalDigest,
      expectedRevision: fixture.approved.approvalRevision,
      actor: OWNER,
      requestId: "request:reactivation-old-batch:execute",
    }),
    /not payout-ready/,
  );
  assert.equal(fixture.stripe.calls.createTransfer.length, 0);
  assert.equal(
    (await fixture.repository.getBatch(fixture.approved.batchId)).status,
    "OWNER_APPROVED",
  );
});

test("ambiguous Stripe creation retains a claimed attempt and browser retries cannot create a second transfer", async () => {
  const fixture = await readyApprovedBatch();
  fixture.stripe.ambiguousCreateRemaining = 1;
  const execute = () =>
    fixture.service.executeBatch({
      batchId: fixture.approved.batchId,
      expectedDigest: fixture.approved.approvalDigest,
      expectedRevision: fixture.approved.approvalRevision,
      actor: OWNER,
      requestId: "request:ambiguous-transfer",
    });
  await assert.rejects(execute(), /Stripe transfer outcome is ambiguous/);
  const attempt = await fixture.repository.getTransferAttemptByFingerprint(
    "hfl-artist-transfer:assignment:100:1",
  );
  assert.equal(attempt.status, "CLAIMED");
  assert.equal(fixture.stripe.calls.createTransfer.length, 1);
  assert.equal(fixture.stripe.transfersByKey.size, 1);

  await assert.rejects(execute(), /Batch execution is already in progress/);
  assert.equal(fixture.stripe.calls.createTransfer.length, 1);

  fixture.clock.advance(16 * 60 * 1000);
  const recovered = await execute();
  assert.equal(recovered.createdTransfers.length, 1);
  assert.equal(fixture.stripe.calls.createTransfer.length, 2);
  assert.equal(
    fixture.stripe.calls.createTransfer[0].idempotencyKey,
    fixture.stripe.calls.createTransfer[1].idempotencyKey,
  );
  assert.equal(fixture.stripe.transfersByKey.size, 1);
  assert.equal(
    (await fixture.repository.getLedger(LEDGER_ID)).stripeTransferId,
    TRANSFER_ID,
  );
});

test("a rotated execution claim fences a delayed worker while the current worker records one idempotent Stripe result", async () => {
  const fixture = await readyApprovedBatch();
  let releaseFirstProviderCall;
  let signalFirstProviderCall;
  const firstProviderCall = new Promise((resolve) => {
    signalFirstProviderCall = resolve;
  });
  const providerBarrier = new Promise((resolve) => {
    releaseFirstProviderCall = resolve;
  });
  fixture.stripe.createTransferHook = async (_input, callNumber) => {
    if (callNumber !== 1) return;
    signalFirstProviderCall();
    await providerBarrier;
  };
  const execute = (requestId) =>
    fixture.service.executeBatch({
      batchId: fixture.approved.batchId,
      expectedDigest: fixture.approved.approvalDigest,
      expectedRevision: fixture.approved.approvalRevision,
      actor: OWNER,
      requestId,
    });
  const rotatedOutWorker = execute("request:lease-race:rotated-out");
  await firstProviderCall;

  fixture.clock.advance(16 * 60 * 1000);
  let currentWorker;
  try {
    currentWorker = await execute("request:lease-race:current");
  } finally {
    releaseFirstProviderCall();
  }
  assert.equal(currentWorker.createdTransfers.length, 1);
  await assert.rejects(rotatedOutWorker, /claim was rotated/);

  assert.equal(fixture.stripe.calls.createTransfer.length, 2);
  assert.equal(
    fixture.stripe.calls.createTransfer[0].idempotencyKey,
    fixture.stripe.calls.createTransfer[1].idempotencyKey,
  );
  assert.equal(fixture.stripe.transfersByKey.size, 1);
  const ledger = await fixture.repository.getLedger(LEDGER_ID);
  assert.equal(ledger.stripeTransferId, TRANSFER_ID);
  assert.equal(ledger.stripeDestinationPaymentId, DESTINATION_PAYMENT_ID);
  const audits = await fixture.repository.listAuditHistory();
  assert.equal(
    audits.filter((entry) => entry.action === "STRIPE_TRANSFER_CREATED").length,
    1,
  );
  assert.equal(
    (await fixture.repository.listOpenExceptions(100)).some(
      (entry) => entry.reasonCode === "LEDGER_PERSIST_AFTER_STRIPE_FAILED",
    ),
    false,
  );
});

test("ambiguous transfer recovery binds only one exact destination inventory candidate", async () => {
  const prepareAmbiguous = async () => {
    const fixture = await readyApprovedBatch();
    fixture.stripe.ambiguousCreateRemaining = 1;
    await assert.rejects(
      fixture.service.executeBatch({
        batchId: fixture.approved.batchId,
        expectedDigest: fixture.approved.approvalDigest,
        expectedRevision: fixture.approved.approvalRevision,
        actor: OWNER,
        requestId: "request:ambiguous-for-owner-recovery",
      }),
      /Stripe transfer outcome is ambiguous/,
    );
    return fixture;
  };

  const exact = await prepareAmbiguous();
  const recovered = await exact.service.reconcileAmbiguousTransferOutcome({
    ledgerId: LEDGER_ID,
    transferId: TRANSFER_ID,
    actor: OWNER,
    requestId: "request:ambiguous-owner-recovered",
  });
  assert.equal(recovered.stripeTransferId, TRANSFER_ID);
  assert.equal(recovered.stripeDestinationPaymentId, DESTINATION_PAYMENT_ID);
  assert.equal(exact.stripe.calls.recoveryInventory.length, 1);

  const duplicate = await prepareAmbiguous();
  const original = [...duplicate.stripe.transfersByKey.values()][0];
  duplicate.stripe.transfersByKey.set("synthetic-duplicate-key", {
    ...structuredClone(original),
    id: "tr_222222222222",
  });
  await assert.rejects(
    duplicate.service.reconcileAmbiguousTransferOutcome({
      ledgerId: LEDGER_ID,
      transferId: TRANSFER_ID,
      actor: OWNER,
      requestId: "request:ambiguous-owner-duplicate",
    }),
    /exactly one matching recovery candidate/,
  );
  assert.equal(
    (await duplicate.repository.getLedger(LEDGER_ID)).stripeTransferId,
    null,
  );
});

test("D1 persistence failure after Stripe is recovered using the same deterministic key", async () => {
  const fixture = await readyApprovedBatch();
  fixture.db.failNextBatchWhen = (statements) =>
    statements.some((statement) =>
      statement.sql.includes("attempt_status = 'STRIPE_SUCCEEDED'"),
    );

  const execute = () =>
    fixture.service.executeBatch({
      batchId: fixture.approved.batchId,
      expectedDigest: fixture.approved.approvalDigest,
      expectedRevision: fixture.approved.approvalRevision,
      actor: OWNER,
      requestId: "request:d1-recovery",
    });
  await assert.rejects(execute(), /ledger persistence requires recovery/);
  assert.equal(fixture.stripe.calls.createTransfer.length, 1);
  assert.equal(
    (
      await fixture.repository.getTransferAttemptByFingerprint(
        "hfl-artist-transfer:assignment:100:1",
      )
    ).status,
    "CLAIMED",
  );
  assert.equal(
    (await fixture.repository.getLedger(LEDGER_ID)).stripeTransferId,
    null,
  );

  fixture.clock.advance(16 * 60 * 1000);
  const recovered = await execute();
  assert.equal(recovered.createdTransfers.length, 1);
  assert.equal(fixture.stripe.calls.createTransfer.length, 2);
  assert.equal(
    fixture.stripe.calls.createTransfer[0].idempotencyKey,
    fixture.stripe.calls.createTransfer[1].idempotencyKey,
  );
  assert.equal(fixture.stripe.transfersByKey.size, 1);
  assert.equal(
    (await fixture.repository.getLedger(LEDGER_ID)).stripeTransferId,
    TRANSFER_ID,
  );
});

test("paid payout is held pending until Stripe reconciliation is completed", async () => {
  const fixture = await transferredLedgerFixture();
  fixture.stripe.payout = payoutResult({ reconciliationStatus: "in_progress" });
  const result = await fixture.service.reconcilePayout({
    ledgerId: LEDGER_ID,
    payoutId: PAYOUT_ID,
    actor: OWNER,
    requestId: "request:payout-in-progress",
    crm: CRM_CONFIG,
    fetcher: async () => {
      throw new Error("CRM must not be called");
    },
  });
  assert.equal(result.ledger.state, "PAYOUT_PENDING");
  assert.equal(result.ledger.reconciled, false);
  assert.equal(result.crm, null);
  assert.equal(fixture.stripe.calls.membership.length, 0);
});

test("paid payout cannot reconcile without destination-payment membership", async () => {
  const fixture = await transferredLedgerFixture();
  fixture.stripe.destinationPaymentMembership = false;
  let crmCalls = 0;
  await assert.rejects(
    fixture.service.reconcilePayout({
      ledgerId: LEDGER_ID,
      payoutId: PAYOUT_ID,
      actor: OWNER,
      requestId: "request:membership-missing",
      crm: CRM_CONFIG,
      fetcher: async () => {
        crmCalls += 1;
        throw new Error("CRM must not be called");
      },
    }),
    /does not contain the approved transfer destination payment/,
  );
  assert.equal(crmCalls, 0);
  assert.equal(fixture.stripe.calls.membership.length, 1);
  const ledger = await fixture.repository.getLedger(LEDGER_ID);
  assert.equal(ledger.state, "TRANSFER_COMPLETED");
  assert.equal(ledger.reconciled, false);
});

test("payout reconciliation rejects a bank destination that differs from the pre-transfer approval", async () => {
  const fixture = await transferredLedgerFixture();
  fixture.stripe.payout = payoutResult({
    destinationId: "ba_210987654321",
  });
  let crmCalls = 0;
  await assert.rejects(
    fixture.service.reconcilePayout({
      ledgerId: LEDGER_ID,
      payoutId: PAYOUT_ID,
      actor: OWNER,
      requestId: "request:payout-destination-mismatch",
      crm: CRM_CONFIG,
      fetcher: async () => {
        crmCalls += 1;
        throw new Error("CRM must not be called");
      },
    }),
    /does not match the pre-transfer approved bank destination/,
  );
  assert.equal(crmCalls, 0);
  assert.equal(fixture.stripe.calls.membership.length, 0);
  assert.ok(
    (await fixture.repository.listOpenExceptions()).some(
      (entry) => entry.reasonCode === "PAYOUT_DESTINATION_NOT_DURABLY_APPROVED",
    ),
  );
});

test("owner-approved payout destination variance preserves the original bank and unlocks one exact payout", async () => {
  const fixture = await transferredLedgerFixture();
  const replacementDestinationId = "ba_210987654321";
  fixture.stripe.defaultStatus = readyStatus({
    payoutDestinationId: replacementDestinationId,
  });
  await fixture.service.activateArtistPayoutAccount({
    artistId: "artist:100",
    accountId: ACCOUNT_ID,
    identityEvidenceReference: IDENTITY_EVIDENCE_REFERENCE,
    actor: OWNER,
    requestId: "request:variance:activate",
  });
  fixture.stripe.payout = payoutResult({
    destinationId: replacementDestinationId,
    reconciliationStatus: "in_progress",
  });

  await assert.rejects(
    fixture.service.reconcilePayout({
      ledgerId: LEDGER_ID,
      payoutId: PAYOUT_ID,
      actor: OWNER,
      requestId: "request:variance:blocked",
      crm: CRM_CONFIG,
    }),
    /does not match the pre-transfer approved bank destination/,
  );
  await assert.rejects(
    fixture.service.approvePayoutDestinationVariance({
      ledgerId: LEDGER_ID,
      payoutId: PAYOUT_ID,
      reason: "Owner verified the exact replacement bank in Stripe.",
      actor: ADMIN,
      requestId: "request:variance:admin-rejected",
    }),
    /Owner authorization is required/,
  );

  const approval = await fixture.service.approvePayoutDestinationVariance({
    ledgerId: LEDGER_ID,
    payoutId: PAYOUT_ID,
    reason: "Owner verified the exact replacement bank in Stripe.",
    actor: OWNER,
    requestId: "request:variance:owner-approved",
  });
  assert.equal(approval.originalDestinationId, "ba_123456789012");
  assert.equal(approval.approvedDestinationId, replacementDestinationId);
  assert.equal(approval.payoutId, PAYOUT_ID);
  assert.equal(
    (await fixture.repository.listOpenExceptions()).some(
      (entry) =>
        entry.exceptionType === "PAYOUT_DESTINATION_MISMATCH" &&
        entry.stripeReference === PAYOUT_ID,
    ),
    false,
  );

  const reconciled = await fixture.service.reconcilePayout({
    ledgerId: LEDGER_ID,
    payoutId: PAYOUT_ID,
    actor: OWNER,
    requestId: "request:variance:reconcile",
    crm: CRM_CONFIG,
  });
  assert.equal(reconciled.ledger.state, "PAYOUT_PENDING");
  assert.equal(
    reconciled.ledger.approvedPayoutDestinationId,
    "ba_123456789012",
  );
  assert.equal(
    (
      await fixture.repository.getPayoutDestinationVarianceApproval(
        LEDGER_ID,
        PAYOUT_ID,
      )
    ).approvedDestinationId,
    replacementDestinationId,
  );
});

test("a failed original-bank payout can be replaced only by an exact owner-approved new-bank payout", async () => {
  const fixture = await transferredLedgerFixture();
  fixture.stripe.payout = payoutResult({ status: "failed" });
  const failed = await fixture.service.reconcilePayout({
    ledgerId: LEDGER_ID,
    payoutId: PAYOUT_ID,
    actor: OWNER,
    requestId: "request:variance:original-failed",
    crm: CRM_CONFIG,
  });
  assert.equal(failed.ledger.state, "PAYOUT_FAILED");
  let correctiveProjection = null;
  await fixture.service.reconcileCorrectiveState({
    ledgerId: LEDGER_ID,
    actor: OWNER,
    requestId: "request:variance:original-corrected",
    crm: CRM_CONFIG,
    fetcher: async (url, init) => {
      const transport = parseAppsScriptRequest(url, init);
      if (init.method === "POST") {
        correctiveProjection = structuredClone(transport.payload.projection);
        return signedAppsScriptResponse(url, init, ({ auth }) => ({
          ok: true,
          recordId: "crm:assignment:100",
          revision: "revision:failed-corrected",
          requestId: auth.requestId,
        }));
      }
      return signedAppsScriptResponse(url, init, ({ auth }) => ({
        ok: true,
        recordId: "crm:assignment:100",
        revision: correctiveProjection
          ? "revision:failed-corrected"
          : "revision:1",
        requestId: auth.requestId,
        projection: correctiveProjection,
      }));
    },
  });

  const replacementPayoutId = "po_210987654321";
  const replacementDestinationId = "ba_210987654321";
  fixture.stripe.defaultStatus = readyStatus({
    payoutDestinationId: replacementDestinationId,
  });
  await fixture.service.activateArtistPayoutAccount({
    artistId: "artist:100",
    accountId: ACCOUNT_ID,
    identityEvidenceReference: IDENTITY_EVIDENCE_REFERENCE,
    actor: OWNER,
    requestId: "request:variance:replacement-activate",
  });
  fixture.stripe.payout = payoutResult({
    id: replacementPayoutId,
    destinationId: replacementDestinationId,
    status: "pending",
    reconciliationStatus: "in_progress",
  });
  await fixture.service.approvePayoutDestinationVariance({
    ledgerId: LEDGER_ID,
    payoutId: replacementPayoutId,
    reason: "Owner verified the exact replacement payout destination.",
    actor: OWNER,
    requestId: "request:variance:replacement-approved",
  });
  const replacement = await fixture.service.reconcilePayout({
    ledgerId: LEDGER_ID,
    payoutId: replacementPayoutId,
    actor: OWNER,
    requestId: "request:variance:replacement-reconcile",
    crm: CRM_CONFIG,
  });
  assert.equal(replacement.ledger.state, "PAYOUT_PENDING");
  assert.equal(replacement.ledger.stripePayoutId, replacementPayoutId);
  assert.equal(
    replacement.ledger.approvedPayoutDestinationId,
    "ba_123456789012",
  );
});

test("an in-flight payout remains reconcilable after a later owner-approved bank change", async () => {
  const fixture = await transferredLedgerFixture();
  await fixture.repository.upsertArtistAccount({
    artistId: "artist:100",
    stripeAccountId: ACCOUNT_ID,
    artistDisplayName: "Test Artist",
    onboardingStatus: "PAYOUT_READY",
    requirementsStatus: "complete",
    transfersStatus: "active",
    payoutsStatus: "active",
    automaticPayoutsEnabled: true,
    payoutDestinationId: "ba_210987654321",
    payoutReadyApprovedAt: "2026-08-24T19:00:00.000Z",
    lastRequirementsCheckAt: "2026-08-24T19:00:00.000Z",
    onboardedAt: ACCOUNT_READY_AT,
    disabledReason: null,
    payoutExceptionFlag: false,
    now: "2026-08-24T19:00:00.000Z",
  });
  fixture.stripe.payout = payoutResult({ reconciliationStatus: "in_progress" });
  const result = await fixture.service.reconcilePayout({
    ledgerId: LEDGER_ID,
    payoutId: PAYOUT_ID,
    actor: OWNER,
    requestId: "request:historical-destination",
    crm: CRM_CONFIG,
    fetcher: async () => {
      throw new Error("CRM must not be called");
    },
  });
  assert.equal(result.ledger.state, "PAYOUT_PENDING");
  assert.equal(result.ledger.approvedPayoutDestinationId, "ba_123456789012");
  assert.equal(
    (await fixture.repository.getArtistAccount("artist:100"))
      .payoutDestinationId,
    "ba_210987654321",
  );
});

test("CRM outage leaves verified Stripe paid evidence PAID and unreconciled", async () => {
  const fixture = await transferredLedgerFixture();
  await assert.rejects(
    fixture.service.reconcilePayout({
      ledgerId: LEDGER_ID,
      payoutId: PAYOUT_ID,
      actor: OWNER,
      requestId: "request:crm-outage",
      crm: CRM_CONFIG,
      fetcher: async () => {
        throw new Error("synthetic CRM outage");
      },
    }),
    /CRM reconciliation did not complete/,
  );
  const ledger = await fixture.repository.getLedger(LEDGER_ID);
  assert.equal(ledger.state, "PAID");
  assert.equal(ledger.stripePayoutStatus, "paid");
  assert.equal(ledger.reconciled, false);
  assert.equal(ledger.crmReconciledRevision, null);
  assert.ok(
    (await fixture.repository.listOpenExceptions()).some(
      (entry) => entry.reasonCode === "CRM_WRITE_OR_READBACK_FAILED",
    ),
  );
});

test("exact signed CRM write/readback finalizes PAID and stores the readback revision", async () => {
  const fixture = await transferredLedgerFixture();
  const calls = [];
  let storedProjection = null;
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), init });
    const transport = parseAppsScriptRequest(url, init);
    assert.match(transport.auth.signature, /^v1=[a-f0-9]{64}$/);
    if (init.method === "GET" && storedProjection === null) {
      return signedAppsScriptResponse(url, init, ({ auth }) => ({
        ok: true,
        recordId: "crm:assignment:100",
        revision: "revision:1",
        requestId: auth.requestId,
        projection: {},
      }));
    }
    if (init.method === "POST") {
      storedProjection = transport.payload.projection;
      return signedAppsScriptResponse(url, init, ({ auth }) => ({
        ok: true,
        recordId: "crm:assignment:100",
        revision: "revision:2",
        requestId: auth.requestId,
      }));
    }
    return signedAppsScriptResponse(url, init, ({ auth }) => ({
      ok: true,
      recordId: "crm:assignment:100",
      revision: "revision:2",
      requestId: auth.requestId,
      projection: storedProjection,
    }));
  };

  const result = await fixture.service.reconcilePayout({
    ledgerId: LEDGER_ID,
    payoutId: PAYOUT_ID,
    actor: OWNER,
    requestId: "request:closed-loop",
    crm: CRM_CONFIG,
    fetcher,
  });
  assert.equal(calls.length, 3);
  assert.equal(result.crm.revision, "revision:2");
  assert.equal(result.ledger.state, "PAID");
  assert.equal(result.ledger.reconciled, true);
  assert.equal(result.ledger.crmRevision, "revision:1");
  assert.equal(result.ledger.crmReconciledRevision, "revision:2");
  assert.equal(
    (await fixture.repository.getBatchItems(result.ledger.batchId))[0].status,
    "COMPLETED",
  );
});

test("manual payment intent cancellation accepts only an exact pristine null CRM projection", async () => {
  for (const unsafeProjection of [
    {},
    { state: "MANUAL_REVIEW" },
    { state: "PAID", manualPayment: { method: "CHECK" } },
  ]) {
    const fixture = await manualIntentFixture();
    await assert.rejects(
      fixture.service.cancelManualPaymentIntent({
        ledgerId: fixture.intent.ledgerId,
        actor: OWNER,
        requestId: "request:manual:cancel:rejected",
        crm: CRM_CONFIG,
        fetcher: async (url, init) =>
          signedAppsScriptResponse(url, init, ({ auth }) => ({
            ok: true,
            recordId: fixture.intent.crmRecordId,
            revision: fixture.intent.crmRevision,
            requestId: auth.requestId,
            projection: unsafeProjection,
          })),
      }),
      /CRM absence was not proven/,
    );
    assert.equal(
      (await fixture.repository.getLedger(fixture.intent.ledgerId)).state,
      "MANUAL_REVIEW",
    );
  }

  const wrongRevision = await manualIntentFixture();
  await assert.rejects(
    wrongRevision.service.cancelManualPaymentIntent({
      ledgerId: wrongRevision.intent.ledgerId,
      actor: OWNER,
      requestId: "request:manual:cancel:wrong-revision",
      crm: CRM_CONFIG,
      fetcher: async (url, init) =>
        signedAppsScriptResponse(url, init, ({ auth }) => ({
          ok: true,
          recordId: wrongRevision.intent.crmRecordId,
          revision: "revision:other",
          requestId: auth.requestId,
          projection: null,
        })),
    }),
    /CRM absence was not proven/,
  );

  const pristine = await manualIntentFixture();
  const canceled = await pristine.service.cancelManualPaymentIntent({
    ledgerId: pristine.intent.ledgerId,
    actor: OWNER,
    requestId: "request:manual:cancel:accepted",
    crm: CRM_CONFIG,
    fetcher: async (url, init) =>
      signedAppsScriptResponse(url, init, ({ auth }) => ({
        ok: true,
        recordId: pristine.intent.crmRecordId,
        revision: pristine.intent.crmRevision,
        requestId: auth.requestId,
        projection: null,
      })),
  });
  assert.equal(canceled.state, "READY_FOR_OWNER_APPROVAL");
  assert.equal(canceled.manualPaymentMethod, null);
  assert.ok(
    (await pristine.repository.listAuditHistory()).some(
      (entry) => entry.action === "MANUAL_PAYMENT_INTENT_CANCELED",
    ),
  );
});

test("manual payment retry recovers an exact committed CRM projection after D1 finalization failure", async () => {
  const fixture = await setup();
  const draft = ledgerDraft();
  const ingested = await ingestDraft(
    fixture,
    draft,
    ADMIN,
    "request:manual:retry:intake",
  );
  const intent = {
    ledgerId: ingested.ledger.ledgerId,
    expectedAmountCents: ingested.ledger.totalApprovedPayCents,
    method: "CHECK",
    reason: "Owner-approved legacy payment recovery",
    evidenceReference: "synthetic-evidence-retry-001",
    memo: "Legacy artist payment recovery",
  };
  const intentDigest = await manualPaymentIntentDigest(intent);
  let storedProjection = null;
  let writeCount = 0;
  const fetcher = async (url, init) => {
    const transport = parseAppsScriptRequest(url, init);
    if (init.method === "POST") {
      writeCount += 1;
      storedProjection = structuredClone(transport.payload.projection);
      return signedAppsScriptResponse(url, init, ({ auth }) => ({
        ok: true,
        recordId: draft.crmRecordId,
        revision: "revision:2",
        requestId: auth.requestId,
      }));
    }
    return signedAppsScriptResponse(url, init, ({ auth }) => ({
      ok: true,
      recordId: draft.crmRecordId,
      revision: storedProjection ? "revision:2" : draft.crmRevision,
      requestId: auth.requestId,
      projection: storedProjection,
    }));
  };
  fixture.db.failNextBatchWhen = (statements) =>
    statements.some((statement) =>
      statement.sql.includes("SET state = 'MANUAL_PAYMENT_EXCEPTION'"),
    );
  await assert.rejects(
    fixture.service.recordManualPaymentException({
      ...intent,
      intentDigest,
      actor: OWNER,
      requestId: "request:manual:retry:first",
      crm: CRM_CONFIG,
      fetcher,
    }),
    /did not complete/,
  );
  assert.ok(storedProjection);
  assert.equal(writeCount, 1);
  const pending = await fixture.repository.getLedger(intent.ledgerId);
  assert.equal(pending.state, "MANUAL_REVIEW");
  assert.equal(pending.reconciled, false);
  assert.equal(pending.manualPaymentCrmRevision, null);

  fixture.source.current.priorPayment = {
    disposition: "OWNER_REVIEW_REQUIRED",
    reasonCodes: ["EXISTING_PAYOUT_PROJECTION_PRESENT"],
    legacyPaymentMethodPresent: true,
    legacyPaymentHandlePresent: true,
  };
  const recovered = await fixture.service.recordManualPaymentException({
    ...intent,
    intentDigest,
    actor: OWNER,
    requestId: "request:manual:retry:recovered",
    crm: CRM_CONFIG,
    fetcher,
  });
  assert.equal(recovered.ledger.state, "MANUAL_PAYMENT_EXCEPTION");
  assert.equal(recovered.ledger.reconciled, true);
  assert.equal(recovered.ledger.manualPaymentCrmRevision, "revision:2");
  assert.equal(recovered.crm.recovered, true);
  assert.equal(writeCount, 1);
});

test("only the owner can activate one exact roster-bound fully ready recipient", async () => {
  const fixture = await setup({
    accountStatus: "TRANSFERS_ENABLED",
    accountAutomaticPayoutsEnabled: false,
  });
  assert.equal(
    (await fixture.repository.getArtistAccount("artist:100"))
      .preferredPayoutType,
    "unverified",
  );
  await assert.rejects(
    fixture.service.activateArtistPayoutAccount({
      artistId: "artist:100",
      accountId: ACCOUNT_ID,
      identityEvidenceReference: IDENTITY_EVIDENCE_REFERENCE,
      actor: ADMIN,
      requestId: "request:activate:admin",
    }),
    /Owner authorization is required/,
  );
  const activated = await fixture.service.activateArtistPayoutAccount({
    artistId: "artist:100",
    accountId: ACCOUNT_ID,
    identityEvidenceReference: IDENTITY_EVIDENCE_REFERENCE,
    actor: OWNER,
    requestId: "request:activate:owner",
  });
  assert.equal(activated.onboardingStatus, "PAYOUT_READY");
  assert.equal(activated.preferredPayoutType, "automatic_standard");
  const identityVerification = fixture.db.database
    .prepare(
      `SELECT verification_id, roster_revision, payout_destination_id,
        verified_by, evidence_reference
       FROM artist_payee_identity_verifications
       WHERE environment = 'sandbox' AND artist_id = ?`,
    )
    .get("artist:100");
  assert.match(identityVerification.verification_id, /^identity_verification_/);
  assert.equal(identityVerification.roster_revision, "roster:1");
  assert.equal(identityVerification.payout_destination_id, "ba_123456789012");
  assert.equal(identityVerification.verified_by, OWNER.email);
  assert.equal(
    identityVerification.evidence_reference,
    IDENTITY_EVIDENCE_REFERENCE,
  );
  assert.throws(() =>
    fixture.db.database
      .prepare(
        "UPDATE artist_payee_identity_verifications SET evidence_reference = 'tampered' WHERE verification_id = ?",
      )
      .run(identityVerification.verification_id),
  );
  assert.throws(() =>
    fixture.db.database
      .prepare(
        "DELETE FROM artist_payee_identity_verifications WHERE verification_id = ?",
      )
      .run(identityVerification.verification_id),
  );
  await assert.rejects(
    fixture.service.activateArtistPayoutAccount({
      artistId: "artist:100",
      accountId: ACCOUNT_ID,
      identityEvidenceReference: "synthetic-owner-review-repeat",
      actor: OWNER,
      requestId: "request:activate:repeat",
    }),
    /already active/,
  );
  assert.equal(
    fixture.db.database
      .prepare(
        "SELECT COUNT(*) AS count FROM artist_payee_identity_verifications WHERE artist_id = ?",
      )
      .get("artist:100").count,
    1,
  );
  assert.ok(
    (await fixture.repository.listAuditHistory()).some(
      (entry) =>
        entry.action === "ARTIST_PAYOUT_IDENTITY_OWNER_ACTIVATED" &&
        entry.actor === OWNER.email,
    ),
  );

  const restricted = await setup({ accountStatus: "TRANSFERS_ENABLED" });
  restricted.stripe.defaultStatus = restrictedStatus();
  await assert.rejects(
    restricted.service.activateArtistPayoutAccount({
      artistId: "artist:100",
      accountId: ACCOUNT_ID,
      identityEvidenceReference: IDENTITY_EVIDENCE_REFERENCE,
      actor: OWNER,
      requestId: "request:activate:restricted",
    }),
    /one exact roster-bound, Stripe-ready recipient/,
  );
  assert.equal(
    (await restricted.repository.getArtistAccount("artist:100"))
      .onboardingStatus,
    "TRANSFERS_ENABLED",
  );

  const manual = await setup({
    accountStatus: "TRANSFERS_ENABLED",
    accountAutomaticPayoutsEnabled: false,
  });
  manual.stripe.defaultStatus = readyStatus({
    automaticPayoutsEnabled: false,
    payoutScheduleInterval: null,
    disabledReason: "automatic_payouts_manual",
  });
  await assert.rejects(
    manual.service.activateArtistPayoutAccount({
      artistId: "artist:100",
      accountId: ACCOUNT_ID,
      identityEvidenceReference: IDENTITY_EVIDENCE_REFERENCE,
      actor: OWNER,
      requestId: "request:activate:manual-payouts",
    }),
    /one exact roster-bound, Stripe-ready recipient/,
  );
  assert.equal(
    (await manual.repository.getArtistAccount("artist:100"))
      .preferredPayoutType,
    "unverified",
  );
});

test("authoritative account refresh and owner activation project the exact durable account state", async () => {
  const projected = [];
  const writer = {
    async sync(account) {
      projected.push(structuredClone(account));
      return {
        artistId: account.artistId,
        revision: `projection:${projected.length}`,
        requestId: `projection-request:${projected.length}`,
        recovered: false,
      };
    },
  };
  const fixture = await setup({
    accountStatus: "TRANSFERS_ENABLED",
    rosterProjectionWriter: writer,
  });
  await ingestDraft(fixture, ledgerDraft(), ADMIN, "request:project:refresh");
  assert.equal(projected.length, 1);
  assert.equal(projected[0].artistId, "artist:100");
  assert.equal(projected[0].stripeAccountId, ACCOUNT_ID);
  assert.equal(projected[0].onboardingStatus, "TRANSFERS_ENABLED");
  assert.equal(projected[0].lastRequirementsCheckAt, START);

  await fixture.service.activateArtistPayoutAccount({
    artistId: "artist:100",
    accountId: ACCOUNT_ID,
    identityEvidenceReference: IDENTITY_EVIDENCE_REFERENCE,
    actor: OWNER,
    requestId: "request:project:activate",
  });
  assert.equal(projected.length, 2);
  assert.equal(projected[1].onboardingStatus, "PAYOUT_READY");
});

test("roster projection failure blocks ledger intake before a payment ledger is admitted", async () => {
  const fixture = await setup({
    rosterProjectionWriter: {
      async sync() {
        throw new Error("synthetic roster projection outage");
      },
    },
  });
  await assert.rejects(
    ingestDraft(fixture, ledgerDraft(), ADMIN, "request:project:outage"),
    /roster projection outage/,
  );
  assert.equal(await fixture.repository.getLedger(LEDGER_ID), null);
});
