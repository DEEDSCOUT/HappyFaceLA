import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  PayoutRepository,
  PayoutRepositoryError,
} from "../../src/lib/artist-payouts/repository.ts";
import { onboardingChallengeDigest } from "../../src/lib/artist-payouts/onboarding-claim.ts";

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

const TIME = "2026-08-22T18:00:00.000Z";
const ARTIST_ID = "artist:100";
const ACCOUNT_ID = "acct_123456789012";

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
    artistId: ARTIST_ID,
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

async function readyRepository() {
  const db = new TestD1();
  const repository = new PayoutRepository(db, "sandbox");
  await repository.upsertArtistAccount({
    artistId: ARTIST_ID,
    stripeAccountId: ACCOUNT_ID,
    artistDisplayName: "Test Artist",
    onboardingStatus: "PAYOUT_READY",
    requirementsStatus: "complete",
    transfersStatus: "active",
    payoutsStatus: "active",
    automaticPayoutsEnabled: true,
    payoutDestinationId: "ba_123456789012",
    payoutReadyApprovedAt: TIME,
    lastRequirementsCheckAt: TIME,
    onboardedAt: TIME,
    disabledReason: null,
    payoutExceptionFlag: false,
    now: TIME,
  });
  await repository.upsertLedger({
    draft: ledgerDraft(),
    state: "READY_FOR_OWNER_APPROVAL",
    closeoutStatus: "complete",
    batchEligibilityDate: "2026-08-24",
    paymentMemo: "Assignment assignment:100",
    actor: "finance@example.test",
    auditId: "audit:ledger:100",
    requestId: "request:ledger:100",
    now: TIME,
  });
  return { db, repository };
}

async function completedTransferRepository(suffix) {
  const context = await readyRepository();
  const { repository } = context;
  const batchId = `batch:payout:${suffix}`;
  const prepared = await repository.prepareBatch({
    batchId,
    scheduledDate: "2026-08-24",
    ledgerIds: ["ledger:100"],
    blockedItemCount: 0,
    blockedExceptionIds: [],
    remainingCandidateCount: 0,
    createdBy: "finance@example.test",
    auditId: `audit:${suffix}:prepare`,
    requestId: `request:${suffix}:prepare`,
    now: "2026-08-22T18:01:00.000Z",
  });
  await repository.approveBatch({
    batchId,
    expectedDigest: prepared.approvalDigest,
    expectedRevision: 0,
    approvedBy: "owner@example.test",
    auditId: `audit:${suffix}:approve`,
    requestId: `request:${suffix}:approve`,
    now: "2026-08-22T18:02:00.000Z",
  });
  const claimToken = `claim:${suffix}`;
  await repository.claimBatchExecution({
    batchId,
    expectedDigest: prepared.approvalDigest,
    expectedRevision: 1,
    claimToken,
    availableBalanceCents: 100_000,
    minimumReserveCents: 50_000,
    actor: "owner@example.test",
    auditId: `audit:${suffix}:batch-claim`,
    requestId: `request:${suffix}:batch-claim`,
    now: "2026-08-22T18:03:00.000Z",
  });
  const { attempt } = await repository.claimTransferItem({
    attemptId: `attempt:${suffix}`,
    batchId,
    ledgerId: "ledger:100",
    claimToken,
    actor: "owner@example.test",
    auditId: `audit:${suffix}:item-claim`,
    requestId: `request:${suffix}:item-claim`,
    now: "2026-08-22T18:04:00.000Z",
  });
  await repository.recordApprovedPayoutDestination({
    attemptId: attempt.attemptId,
    claimToken,
    payoutDestinationId: "ba_123456789012",
    payoutDestinationApprovedAt: TIME,
    actor: "owner@example.test",
    auditId: `audit:${suffix}:destination-snapshot`,
    requestId: `request:${suffix}:destination-snapshot`,
    now: "2026-08-22T18:04:30.000Z",
  });
  await repository.recordTransferSucceeded({
    attemptId: attempt.attemptId,
    claimToken,
    stripeTransferId: "tr_123456789012",
    destinationPaymentId: "py_123456789012",
    actor: "stripe-webhook",
    auditId: `audit:${suffix}:transfer-created`,
    requestId: `request:${suffix}:transfer-created`,
    now: "2026-08-22T18:05:00.000Z",
  });
  await repository.recordTransferLifecycle({
    ledgerId: "ledger:100",
    stripeTransferId: "tr_123456789012",
    status: "completed",
    actor: "stripe-webhook",
    auditId: `audit:${suffix}:transfer-complete`,
    requestId: `request:${suffix}:transfer-complete`,
    now: "2026-08-22T18:06:00.000Z",
  });
  return context;
}

test("database identity sentinel rejects cross-environment access", async () => {
  const { db, repository } = await readyRepository();
  await repository.assertEnvironmentIdentity(TIME);
  const liveRepository = new PayoutRepository(db, "live");
  await assert.rejects(
    liveRepository.getDashboard(),
    (error) =>
      error instanceof PayoutRepositoryError && error.code === "DATA_INTEGRITY",
  );
});

test("out-of-band onboarding challenges lock after five failures and consume exactly once", async () => {
  const db = new TestD1();
  const repository = new PayoutRepository(db, "sandbox");
  const secret = "synthetic-onboarding-challenge-secret-at-least-32-characters";
  const rosterRevision = "roster:challenge:1";
  await repository.upsertArtistAccount({
    artistId: ARTIST_ID,
    stripeAccountId: ACCOUNT_ID,
    artistDisplayName: "Test Artist",
    onboardingStatus: "TRANSFERS_ENABLED",
    requirementsStatus: "complete",
    transfersStatus: "active",
    payoutsStatus: "active",
    automaticPayoutsEnabled: true,
    payoutDestinationId: "ba_123456789012",
    payoutReadyApprovedAt: null,
    lastRequirementsCheckAt: TIME,
    onboardedAt: TIME,
    disabledReason: null,
    payoutExceptionFlag: false,
    now: TIME,
  });

  async function digest(nonce, challengeCode) {
    return onboardingChallengeDigest({
      secret,
      environment: "sandbox",
      artistId: ARTIST_ID,
      accountId: ACCOUNT_ID,
      nonce,
      rosterRevision,
      challengeCode,
    });
  }

  const lockedNonce = "onboarding_claim_locked_123456";
  await repository.createOnboardingClaim({
    nonce: lockedNonce,
    artistId: ARTIST_ID,
    stripeAccountId: ACCOUNT_ID,
    rosterRevision,
    challengeDigest: await digest(lockedNonce, "23456-789AB"),
    expiresAt: "2026-08-22T20:00:00.000Z",
    createdBy: "owner@example.test",
    createdAt: TIME,
  });
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await assert.rejects(
      repository.activateOnboardingSession({
        claimNonce: lockedNonce,
        sessionNonce: `onboarding_session_failed_${attempt}`,
        artistId: ARTIST_ID,
        stripeAccountId: ACCOUNT_ID,
        rosterRevision,
        challengeDigest: await digest(lockedNonce, "ZZZZZ-ZZZZZ"),
        expiresAt: "2026-08-22T19:30:00.000Z",
        activatedAt: "2026-08-22T18:05:00.000Z",
        auditId: `audit:onboarding:failed:${attempt}`,
        requestId: `request:onboarding:failed:${attempt}`,
      }),
      (error) =>
        error instanceof PayoutRepositoryError &&
        error.code === "CLAIM_REJECTED",
    );
    const claim = db.database
      .prepare(
        `SELECT challenge_failed_attempts, challenge_locked_at, consumed_at
         FROM artist_onboarding_claims WHERE nonce = ?`,
      )
      .get(lockedNonce);
    assert.equal(claim.challenge_failed_attempts, attempt);
    assert.equal(claim.consumed_at, null);
    assert.equal(
      claim.challenge_locked_at,
      attempt === 5 ? "2026-08-22T18:05:00.000Z" : null,
    );
  }
  await assert.rejects(
    repository.activateOnboardingSession({
      claimNonce: lockedNonce,
      sessionNonce: "onboarding_session_locked_correct",
      artistId: ARTIST_ID,
      stripeAccountId: ACCOUNT_ID,
      rosterRevision,
      challengeDigest: await digest(lockedNonce, "23456-789AB"),
      expiresAt: "2026-08-22T19:30:00.000Z",
      activatedAt: "2026-08-22T18:06:00.000Z",
      auditId: "audit:onboarding:locked:correct",
      requestId: "request:onboarding:locked:correct",
    }),
    (error) =>
      error instanceof PayoutRepositoryError && error.code === "CLAIM_REJECTED",
  );
  assert.equal(
    db.database
      .prepare(
        "SELECT COUNT(*) AS count FROM artist_onboarding_sessions WHERE claim_nonce = ?",
      )
      .get(lockedNonce).count,
    0,
  );
  assert.equal(
    (await repository.getArtistAccount(ARTIST_ID)).onboardingStatus,
    "INVITE_READY",
  );

  const validNonce = "onboarding_claim_valid_123456";
  const activatedAt = "2026-08-22T18:10:00.000Z";
  await repository.createOnboardingClaim({
    nonce: validNonce,
    artistId: ARTIST_ID,
    stripeAccountId: ACCOUNT_ID,
    rosterRevision,
    challengeDigest: await digest(validNonce, "ABCDE-FGHJK"),
    expiresAt: "2026-08-22T20:00:00.000Z",
    createdBy: "owner@example.test",
    createdAt: "2026-08-22T18:09:00.000Z",
  });
  const validInput = {
    claimNonce: validNonce,
    sessionNonce: "onboarding_session_valid_123456",
    artistId: ARTIST_ID,
    stripeAccountId: ACCOUNT_ID,
    rosterRevision,
    challengeDigest: await digest(validNonce, "ABCDE-FGHJK"),
    expiresAt: "2026-08-22T19:40:00.000Z",
    activatedAt,
    auditId: "audit:onboarding:valid",
    requestId: "request:onboarding:valid",
  };
  await repository.activateOnboardingSession(validInput);
  const consumed = db.database
    .prepare(
      `SELECT consumed_at, challenge_verified_at, challenge_failed_attempts
       FROM artist_onboarding_claims WHERE nonce = ?`,
    )
    .get(validNonce);
  assert.equal(consumed.consumed_at, activatedAt);
  assert.equal(consumed.challenge_verified_at, activatedAt);
  assert.equal(consumed.challenge_failed_attempts, 0);
  assert.equal(
    (await repository.getArtistAccount(ARTIST_ID)).onboardingStatus,
    "ONBOARDING_STARTED",
  );
  await assert.rejects(
    repository.activateOnboardingSession({
      ...validInput,
      sessionNonce: "onboarding_session_replay_123456",
      auditId: "audit:onboarding:replay",
      requestId: "request:onboarding:replay",
    }),
    (error) =>
      error instanceof PayoutRepositoryError && error.code === "CLAIM_REJECTED",
  );
  assert.equal(
    db.database
      .prepare(
        "SELECT COUNT(*) AS count FROM artist_onboarding_sessions WHERE claim_nonce = ?",
      )
      .get(validNonce).count,
    1,
  );
});

test("historical bank snapshots and destination variance approvals are database-immutable", async () => {
  const { db } = await completedTransferRepository("immutable-destination");
  assert.throws(
    () =>
      db.database
        .prepare(
          `UPDATE artist_payment_ledger
           SET approved_payout_destination_id = ?, approved_payout_destination_at = ?
           WHERE ledger_id = ? AND environment = ?`,
        )
        .run(
          "ba_210987654321",
          "2026-08-22T19:00:00.000Z",
          "ledger:100",
          "sandbox",
        ),
    /approved payout destination snapshot is immutable/,
  );

  db.database
    .prepare(
      `INSERT INTO payout_destination_variance_approvals (
        approval_id, environment, ledger_id, payout_id,
        original_destination_id, approved_destination_id,
        recipient_approval_at, approved_by, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "payout_variance_immutable",
      "sandbox",
      "ledger:100",
      "po_123456789012",
      "ba_123456789012",
      "ba_210987654321",
      "2026-08-22T19:00:00.000Z",
      "owner@example.test",
      "Owner verified replacement destination",
      "2026-08-22T19:01:00.000Z",
    );
  assert.throws(
    () =>
      db.database
        .prepare(
          `UPDATE payout_destination_variance_approvals
           SET reason = ? WHERE approval_id = ?`,
        )
        .run("Rewritten evidence", "payout_variance_immutable"),
    /payout destination variance approval is immutable/,
  );
});

test("D1-safe ten-item batches expose the exact remaining candidate count for a second batch", async () => {
  const { repository } = await readyRepository();
  for (let index = 101; index <= 110; index += 1) {
    await repository.upsertLedger({
      draft: ledgerDraft({
        ledgerId: `ledger:${index}`,
        bookingId: `booking:${index}`,
        assignmentId: `assignment:${index}`,
        crmRecordId: `crm:assignment:${index}`,
      }),
      state: "READY_FOR_OWNER_APPROVAL",
      closeoutStatus: "complete",
      batchEligibilityDate: "2026-08-24",
      paymentMemo: `Assignment assignment:${index}`,
      actor: "finance@example.test",
      auditId: `audit:ledger:${index}`,
      requestId: `request:ledger:${index}`,
      now: TIME,
    });
  }

  const firstPage = await repository.listReadyLedgers("2026-08-24");
  assert.equal(firstPage.ledgers.length, 10);
  assert.equal(firstPage.totalCandidateCount, 11);
  assert.equal(firstPage.remainingCandidateCount, 1);
  const firstBatch = await repository.prepareBatch({
    batchId: "batch:scale:first",
    scheduledDate: "2026-08-24",
    ledgerIds: firstPage.ledgers.map((ledger) => ledger.ledgerId),
    blockedItemCount: 0,
    blockedExceptionIds: [],
    remainingCandidateCount: firstPage.remainingCandidateCount,
    createdBy: "finance@example.test",
    auditId: "audit:scale:first",
    requestId: "request:scale:first",
    now: "2026-08-22T18:01:00.000Z",
  });
  assert.equal(firstBatch.batch.itemCount, 10);
  assert.equal(firstBatch.batch.remainingCandidateCount, 1);

  const secondPage = await repository.listReadyLedgers("2026-08-24");
  assert.equal(secondPage.ledgers.length, 1);
  assert.equal(secondPage.totalCandidateCount, 1);
  assert.equal(secondPage.remainingCandidateCount, 0);
});

test("dashboard remains available beyond 250 ledgers and audits with exact totals and stable cursors", async () => {
  const { repository } = await readyRepository();
  for (let index = 101; index <= 359; index += 1) {
    await repository.upsertLedger({
      draft: ledgerDraft({
        ledgerId: `ledger:scale:${index}`,
        bookingId: `booking:scale:${index}`,
        assignmentId: `assignment:scale:${index}`,
        crmRecordId: `crm:scale:${index}`,
      }),
      state: "READY_FOR_OWNER_APPROVAL",
      closeoutStatus: "complete",
      batchEligibilityDate: "2026-08-24",
      paymentMemo: `Scale assignment ${index}`,
      actor: "finance@example.test",
      auditId: `audit:scale:${index}`,
      requestId: `request:scale:${index}`,
      now: TIME,
    });
  }

  const first = await repository.getDashboard({ limit: 250 });
  assert.equal(first.collectionPages.ledgers.totalCount, 260);
  assert.equal(first.collectionPages.ledgers.returnedCount, 250);
  assert.equal(first.collectionPages.ledgers.hasMore, true);
  assert.match(first.collectionPages.ledgers.nextCursor, /^[A-Za-z0-9_-]+$/);
  assert.ok(first.collectionPages.auditHistory.totalCount > 250);
  assert.equal(first.collectionPages.auditHistory.returnedCount, 250);
  assert.equal(first.collectionPages.auditHistory.hasMore, true);

  const second = await repository.getDashboard({
    limit: 250,
    cursors: {
      ledgers: first.collectionPages.ledgers.nextCursor,
      auditHistory: first.collectionPages.auditHistory.nextCursor,
    },
  });
  assert.equal(second.collectionPages.ledgers.totalCount, 260);
  assert.equal(second.ledgers.length, 10);
  assert.equal(second.collectionPages.ledgers.hasMore, false);
  assert.equal(
    new Set([
      ...first.ledgers.map((ledger) => ledger.ledgerId),
      ...second.ledgers.map((ledger) => ledger.ledgerId),
    ]).size,
    260,
  );
  assert.equal(
    first.auditHistory.some((entry) =>
      second.auditHistory.some((later) => later.auditId === entry.auditId),
    ),
    false,
  );
  await assert.rejects(
    repository.getDashboard({
      limit: 100,
      cursors: { ledgers: "not_a_valid_cursor" },
    }),
    (error) =>
      error instanceof PayoutRepositoryError && error.code === "INVALID_INPUT",
  );
});

test("selected artist profile has exact isolated totals and artist-bound keyset continuation", async () => {
  const { repository } = await readyRepository();
  for (let index = 101; index <= 103; index += 1) {
    await repository.upsertLedger({
      draft: ledgerDraft({
        ledgerId: `ledger:profile:${index}`,
        bookingId: `booking:profile:${index}`,
        assignmentId: `assignment:profile:${index}`,
        crmRecordId: `crm:profile:${index}`,
        eventDate: `2026-08-${index - 80}`,
      }),
      state: "READY_FOR_OWNER_APPROVAL",
      closeoutStatus: "complete",
      batchEligibilityDate: "2026-08-24",
      paymentMemo: `Profile assignment ${index}`,
      actor: "finance@example.test",
      auditId: `audit:profile:${index}`,
      requestId: `request:profile:${index}`,
      now: TIME,
    });
  }
  const otherArtistId = "artist:200";
  const otherAccountId = "acct_abcdefghijkl";
  await repository.upsertArtistAccount({
    artistId: otherArtistId,
    stripeAccountId: otherAccountId,
    artistDisplayName: "Other Artist",
    onboardingStatus: "RESTRICTED",
    requirementsStatus: "currently_due",
    transfersStatus: "inactive",
    payoutsStatus: "inactive",
    automaticPayoutsEnabled: true,
    payoutDestinationId: null,
    payoutReadyApprovedAt: null,
    lastRequirementsCheckAt: TIME,
    onboardedAt: null,
    disabledReason: "requirements.past_due",
    payoutExceptionFlag: true,
    now: TIME,
  });
  for (let index = 201; index <= 203; index += 1) {
    await repository.upsertLedger({
      draft: ledgerDraft({
        ledgerId: `ledger:other:${index}`,
        bookingId: `booking:other:${index}`,
        assignmentId: `assignment:other:${index}`,
        crmRecordId: `crm:other:${index}`,
        artistId: otherArtistId,
        artistName: "Other Artist",
        connectedAccountId: otherAccountId,
        eventDate: `2026-08-${index - 180}`,
      }),
      state: "READY_FOR_OWNER_APPROVAL",
      closeoutStatus: "complete",
      batchEligibilityDate: "2026-08-24",
      paymentMemo: `Other artist assignment ${index}`,
      actor: "finance@example.test",
      auditId: `audit:other:${index}`,
      requestId: `request:other:${index}`,
      now: TIME,
    });
  }
  for (let index = 1; index <= 3; index += 1) {
    await repository.openException({
      exceptionId: `exception:profile:${index}`,
      ledgerId: `ledger:profile:${100 + index}`,
      artistId: ARTIST_ID,
      bookingId: `booking:profile:${100 + index}`,
      assignmentId: `assignment:profile:${100 + index}`,
      exceptionType: "SYNTHETIC_PROFILE_REVIEW",
      reasonCode: `PROFILE_REASON_${index}`,
      safeReason: `Synthetic selected artist exception ${index}`,
      ownerActionRequired: "Review selected artist evidence",
      createdAt: `2026-08-22T18:0${index}:00.000Z`,
    });
    await repository.openException({
      exceptionId: `exception:other:${index}`,
      ledgerId: `ledger:other:${200 + index}`,
      artistId: otherArtistId,
      bookingId: `booking:other:${200 + index}`,
      assignmentId: `assignment:other:${200 + index}`,
      exceptionType: "SYNTHETIC_OTHER_REVIEW",
      reasonCode: `OTHER_REASON_${index}`,
      safeReason: `Synthetic other artist exception ${index}`,
      ownerActionRequired: "Review other artist evidence",
      createdAt: `2026-08-22T18:1${index}:00.000Z`,
    });
  }

  const first = await repository.getDashboard({
    artistId: ARTIST_ID,
    limit: 2,
  });
  const firstProfile = first.selectedArtistProfile;
  assert.ok(firstProfile);
  assert.equal(firstProfile.artistId, ARTIST_ID);
  assert.equal(firstProfile.account.stripeAccountId, ACCOUNT_ID);
  assert.deepEqual(firstProfile.metrics, {
    unpaidAssignmentCount: 4,
    unpaidAmountCents: 88_000,
    assignmentCount: 4,
    paidAssignmentCount: 0,
    openExceptionCount: 3,
  });
  assert.equal(first.collectionPages.ledgers.totalCount, 7);
  assert.equal(
    first.stateTotals.find(
      (state) => state.state === "READY_FOR_OWNER_APPROVAL",
    )?.count,
    7,
  );
  for (const collection of [
    "unpaidAssignments",
    "paymentHistory",
    "openExceptions",
  ]) {
    assert.equal(firstProfile.collectionPages[collection].returnedCount, 2);
    assert.equal(firstProfile.collectionPages[collection].hasMore, true);
    assert.match(
      firstProfile.collectionPages[collection].nextCursor,
      /^[A-Za-z0-9_-]+$/,
    );
  }
  assert.equal(
    firstProfile.unpaidAssignments.every(
      (ledger) => ledger.artistId === ARTIST_ID,
    ),
    true,
  );
  assert.equal(
    firstProfile.paymentHistory.every(
      (ledger) => ledger.artistId === ARTIST_ID,
    ),
    true,
  );
  assert.equal(
    firstProfile.openExceptions.every(
      (exception) => exception.artistId === ARTIST_ID,
    ),
    true,
  );

  const second = await repository.getDashboard({
    artistId: ARTIST_ID,
    limit: 2,
    artistProfileCursors: {
      unpaidAssignments:
        firstProfile.collectionPages.unpaidAssignments.nextCursor,
      paymentHistory: firstProfile.collectionPages.paymentHistory.nextCursor,
      openExceptions: firstProfile.collectionPages.openExceptions.nextCursor,
    },
  });
  const secondProfile = second.selectedArtistProfile;
  assert.ok(secondProfile);
  assert.equal(secondProfile.unpaidAssignments.length, 2);
  assert.equal(secondProfile.paymentHistory.length, 2);
  assert.equal(secondProfile.openExceptions.length, 1);
  assert.equal(
    new Set([
      ...firstProfile.paymentHistory.map((ledger) => ledger.ledgerId),
      ...secondProfile.paymentHistory.map((ledger) => ledger.ledgerId),
    ]).size,
    4,
  );
  assert.equal(secondProfile.collectionPages.paymentHistory.hasMore, false);
  assert.equal(secondProfile.collectionPages.openExceptions.hasMore, false);

  await assert.rejects(
    repository.getDashboard({
      artistId: otherArtistId,
      limit: 2,
      artistProfileCursors: {
        paymentHistory: firstProfile.collectionPages.paymentHistory.nextCursor,
      },
    }),
    (error) =>
      error instanceof PayoutRepositoryError && error.code === "INVALID_INPUT",
  );
  await assert.rejects(
    repository.getDashboard({
      limit: 2,
      artistProfileCursors: {
        paymentHistory: firstProfile.collectionPages.paymentHistory.nextCursor,
      },
    }),
    (error) =>
      error instanceof PayoutRepositoryError && error.code === "INVALID_INPUT",
  );
});

test("failed webhook queue has an exact total and duplicate-free stable continuation", async () => {
  const { db, repository } = await readyRepository();
  const insert = db.database.prepare(
    `INSERT INTO stripe_webhook_events (
      stripe_event_id, environment, event_type, connected_account_id,
      received_at, processing_status, safe_error_code, retry_count
    ) VALUES (?, 'sandbox', 'payout.failed', ?, ?, 'FAILED',
      'SYNTHETIC_FAILURE', 0)`,
  );
  for (let index = 0; index < 260; index += 1) {
    insert.run(
      `evt_${String(index).padStart(12, "0")}`,
      ACCOUNT_ID,
      new Date(Date.parse(TIME) + index * 1000).toISOString(),
    );
  }

  const eventIds = [];
  let cursor;
  for (let pageNumber = 0; pageNumber < 3; pageNumber += 1) {
    const page = await repository.getDashboard({
      limit: 100,
      cursors: cursor ? { failedWebhookEvents: cursor } : {},
    });
    assert.equal(page.collectionPages.failedWebhookEvents.totalCount, 260);
    eventIds.push(...page.failedWebhookEvents.map((event) => event.eventId));
    cursor = page.collectionPages.failedWebhookEvents.nextCursor;
    assert.equal(
      page.collectionPages.failedWebhookEvents.hasMore,
      pageNumber < 2,
    );
  }
  assert.equal(eventIds.length, 260);
  assert.equal(new Set(eventIds).size, 260);
  assert.equal(cursor, null);
});

test("source revision change invalidates a prepared snapshot and prevents stale approval", async () => {
  const { repository } = await readyRepository();
  const prepared = await repository.prepareBatch({
    batchId: "batch:stale",
    scheduledDate: "2026-08-24",
    ledgerIds: ["ledger:100"],
    blockedItemCount: 0,
    blockedExceptionIds: [],
    remainingCandidateCount: 0,
    createdBy: "finance@example.test",
    auditId: "audit:batch:stale",
    requestId: "request:batch:stale",
    now: "2026-08-22T18:01:00.000Z",
  });

  const revised = ledgerDraft({
    sourceRevision: 2,
    bonusCents: 1_500,
    totalApprovedPayCents: 23_000,
  });
  await repository.upsertLedger({
    draft: revised,
    state: "READY_FOR_OWNER_APPROVAL",
    closeoutStatus: "complete",
    batchEligibilityDate: "2026-08-24",
    paymentMemo: "Assignment assignment:100",
    actor: "finance@example.test",
    auditId: "audit:ledger:revision:2",
    requestId: "request:ledger:revision:2",
    now: "2026-08-22T18:02:00.000Z",
  });

  const blocked = await repository.getBatch("batch:stale");
  assert.equal(blocked.status, "BLOCKED");
  assert.equal(blocked.approvalDigest, prepared.approvalDigest);
  await assert.rejects(
    repository.approveBatch({
      batchId: "batch:stale",
      expectedDigest: prepared.approvalDigest,
      expectedRevision: 0,
      approvedBy: "owner@example.test",
      auditId: "audit:stale:approval",
      requestId: "request:stale:approval",
      now: "2026-08-22T18:03:00.000Z",
    }),
    (error) =>
      error instanceof PayoutRepositoryError &&
      error.code === "APPROVAL_INVALIDATED",
  );
});

test("approval, execution, and transfer claim bind revision and material digest", async () => {
  const { db, repository } = await readyRepository();
  const prepared = await repository.prepareBatch({
    batchId: "batch:execute",
    scheduledDate: "2026-08-24",
    ledgerIds: ["ledger:100"],
    blockedItemCount: 0,
    blockedExceptionIds: [],
    remainingCandidateCount: 0,
    createdBy: "finance@example.test",
    auditId: "audit:batch:execute",
    requestId: "request:batch:execute",
    now: "2026-08-22T18:01:00.000Z",
  });
  await repository.approveBatch({
    batchId: "batch:execute",
    expectedDigest: prepared.approvalDigest,
    expectedRevision: 0,
    approvedBy: "owner@example.test",
    auditId: "audit:batch:approval",
    requestId: "request:batch:approval",
    now: "2026-08-22T18:02:00.000Z",
  });
  await repository.claimBatchExecution({
    batchId: "batch:execute",
    expectedDigest: prepared.approvalDigest,
    expectedRevision: 1,
    claimToken: "claim:batch:execute",
    availableBalanceCents: 100_000,
    minimumReserveCents: 50_000,
    actor: "owner@example.test",
    auditId: "audit:batch:claim",
    requestId: "request:batch:claim",
    now: "2026-08-22T18:03:00.000Z",
  });

  const first = await repository.claimTransferItem({
    attemptId: "attempt:execute:1",
    batchId: "batch:execute",
    ledgerId: "ledger:100",
    claimToken: "claim:batch:execute",
    actor: "finance@example.test",
    auditId: "audit:transfer:claim:1",
    requestId: "request:transfer:claim:1",
    now: "2026-08-22T18:04:00.000Z",
  });
  assert.equal(first.claimed, true);
  assert.equal(first.attempt.sourceRevision, 1);
  assert.equal(
    first.attempt.idempotencyFingerprint,
    "hfl-artist-transfer:assignment:100:1",
  );

  const replay = await repository.claimTransferItem({
    attemptId: "attempt:execute:2",
    batchId: "batch:execute",
    ledgerId: "ledger:100",
    claimToken: "claim:batch:execute",
    actor: "finance@example.test",
    auditId: "audit:transfer:claim:2",
    requestId: "request:transfer:claim:2",
    now: "2026-08-22T18:05:00.000Z",
  });
  assert.equal(replay.claimed, false);
  assert.equal(replay.attempt.attemptId, first.attempt.attemptId);

  const attempts = db.database
    .prepare(
      "SELECT COUNT(*) AS count FROM payout_transfer_attempts WHERE environment = ?",
    )
    .get("sandbox");
  assert.equal(attempts.count, 1);
});

test("Stripe paid evidence becomes PAID while reconciliation waits for independent CRM readback", async () => {
  const { repository } = await readyRepository();
  const prepared = await repository.prepareBatch({
    batchId: "batch:closed-loop",
    scheduledDate: "2026-08-24",
    ledgerIds: ["ledger:100"],
    blockedItemCount: 0,
    blockedExceptionIds: [],
    remainingCandidateCount: 0,
    createdBy: "finance@example.test",
    auditId: "audit:closed-loop:prepare",
    requestId: "request:closed-loop:prepare",
    now: "2026-08-22T18:01:00.000Z",
  });
  await repository.approveBatch({
    batchId: "batch:closed-loop",
    expectedDigest: prepared.approvalDigest,
    expectedRevision: 0,
    approvedBy: "owner@example.test",
    auditId: "audit:closed-loop:approve",
    requestId: "request:closed-loop:approve",
    now: "2026-08-22T18:02:00.000Z",
  });
  await repository.claimBatchExecution({
    batchId: "batch:closed-loop",
    expectedDigest: prepared.approvalDigest,
    expectedRevision: 1,
    claimToken: "claim:closed-loop",
    availableBalanceCents: 100_000,
    minimumReserveCents: 50_000,
    actor: "owner@example.test",
    auditId: "audit:closed-loop:batch-claim",
    requestId: "request:closed-loop:batch-claim",
    now: "2026-08-22T18:03:00.000Z",
  });
  const { attempt } = await repository.claimTransferItem({
    attemptId: "attempt:closed-loop",
    batchId: "batch:closed-loop",
    ledgerId: "ledger:100",
    claimToken: "claim:closed-loop",
    actor: "finance@example.test",
    auditId: "audit:closed-loop:item-claim",
    requestId: "request:closed-loop:item-claim",
    now: "2026-08-22T18:04:00.000Z",
  });
  await repository.recordApprovedPayoutDestination({
    attemptId: attempt.attemptId,
    claimToken: "claim:closed-loop",
    payoutDestinationId: "ba_123456789012",
    payoutDestinationApprovedAt: TIME,
    actor: "owner@example.test",
    auditId: "audit:closed-loop:destination-snapshot",
    requestId: "request:closed-loop:destination-snapshot",
    now: "2026-08-22T18:04:30.000Z",
  });
  await repository.recordTransferSucceeded({
    attemptId: attempt.attemptId,
    claimToken: "claim:closed-loop",
    stripeTransferId: "tr_123456789012",
    destinationPaymentId: "py_123456789012",
    actor: "stripe-webhook",
    auditId: "audit:closed-loop:transfer-created",
    requestId: "request:closed-loop:transfer-created",
    now: "2026-08-22T18:05:00.000Z",
  });
  assert.equal(
    (await repository.getLedgerByTransferId("tr_123456789012")).ledgerId,
    "ledger:100",
  );
  await repository.recordTransferLifecycle({
    ledgerId: "ledger:100",
    stripeTransferId: "tr_123456789012",
    status: "pending",
    actor: "stripe-webhook",
    auditId: "audit:closed-loop:transfer-pending",
    requestId: "request:closed-loop:transfer-pending",
    now: "2026-08-22T18:06:00.000Z",
  });
  await repository.recordTransferLifecycle({
    ledgerId: "ledger:100",
    stripeTransferId: "tr_123456789012",
    status: "completed",
    actor: "stripe-webhook",
    auditId: "audit:closed-loop:transfer-complete",
    requestId: "request:closed-loop:transfer-complete",
    now: "2026-08-22T18:07:00.000Z",
  });
  const evidence = await repository.recordStripePayoutPaidEvidence({
    ledgerId: "ledger:100",
    payoutId: "po_123456789012",
    payoutStatus: "paid",
    expectedArrival: "2026-08-25",
    actor: "stripe-webhook",
    auditId: "audit:closed-loop:stripe-paid",
    requestId: "request:closed-loop:stripe-paid",
    now: "2026-08-22T18:08:00.000Z",
  });
  assert.equal(evidence.ledger.state, "PAID");
  assert.equal(evidence.ledger.reconciled, false);
  assert.equal(
    (
      await repository.getTransferAttemptByFingerprint(
        attempt.idempotencyFingerprint,
      )
    ).status,
    "STRIPE_SUCCEEDED",
  );

  const reconciliationClaim = "reconciliation:closed-loop";
  await repository.claimPayoutReconciliation({
    ledgerId: "ledger:100",
    payoutId: "po_123456789012",
    claimToken: reconciliationClaim,
    claimExpiresAt: "2026-08-22T18:20:00.000Z",
    actor: "reconciliation-worker",
    auditId: "audit:closed-loop:reconciliation-claim",
    requestId: "request:closed-loop:reconciliation-claim",
    now: "2026-08-22T18:08:30.000Z",
  });
  await repository.stageCrmReconciliationReadback({
    ledgerId: "ledger:100",
    claimToken: reconciliationClaim,
    crmReadbackRevision: "revision:7",
    now: "2026-08-22T18:08:45.000Z",
  });

  const finalized = await repository.finalizePayoutReconciliation({
    ledgerId: "ledger:100",
    payoutId: "po_123456789012",
    claimToken: reconciliationClaim,
    expectedCrmRecordId: "crm:assignment:100",
    expectedCrmRevision: "revision:1",
    crmReadbackRevision: "revision:7",
    actor: "reconciliation-worker",
    auditId: "audit:closed-loop:finalized",
    requestId: "request:closed-loop:finalized",
    reconciledAt: "2026-08-22T18:09:00.000Z",
    now: "2026-08-22T18:09:00.000Z",
  });
  assert.equal(finalized.ledger.state, "PAID");
  assert.equal(finalized.ledger.reconciled, true);
  assert.equal(finalized.ledger.crmReconciledRevision, "revision:7");
  assert.equal(
    (
      await repository.getTransferAttemptByFingerprint(
        attempt.idempotencyFingerprint,
      )
    ).status,
    "RECONCILED",
  );
  assert.equal(
    (await repository.getBatchItems("batch:closed-loop"))[0].status,
    "COMPLETED",
  );
  assert.equal(
    (await repository.getBatch("batch:closed-loop")).status,
    "COMPLETED",
  );
  assert.equal(
    (await repository.listUnreconciledLedgersForAccount(ACCOUNT_ID)).length,
    0,
  );
  const dashboard = await repository.getDashboard();
  assert.equal(dashboard.lastReconciliationAt, "2026-08-22T18:09:00.000Z");
  assert.ok(
    dashboard.auditHistory.some(
      (entry) => entry.action === "PAYOUT_CLOSED_LOOP_RECONCILED",
    ),
  );
  assert.equal(dashboard.artistAccounts.length, 1);
  assert.deepEqual(dashboard.artistProfileMetrics, [
    {
      artistId: ARTIST_ID,
      unpaidAssignmentCount: 0,
      unpaidAmountCents: 0,
      assignmentCount: 1,
      paidAssignmentCount: 1,
      openExceptionCount: 0,
    },
  ]);
});

test("a failed automatic payout can be replaced by a new payout without losing transfer identity", async () => {
  const { repository } = await completedTransferRepository("new-payout");
  await repository.recordPayoutPending({
    ledgerId: "ledger:100",
    payoutId: "po_111111111111",
    payoutStatus: "in_transit",
    expectedArrival: "2026-08-25",
    actor: "stripe-webhook",
    auditId: "audit:new-payout:pending-one",
    requestId: "request:new-payout:pending-one",
    now: "2026-08-22T18:07:00.000Z",
  });
  await repository.recordPayoutFailed({
    ledgerId: "ledger:100",
    payoutId: "po_111111111111",
    payoutStatus: "failed",
    safeErrorCode: "bank_account_closed",
    safeReason: "Stripe reports that the automatic payout failed.",
    actor: "stripe-webhook",
    auditId: "audit:new-payout:failed-one",
    requestId: "request:new-payout:failed-one",
    now: "2026-08-22T18:08:00.000Z",
  });
  await repository.claimCrmCorrection({
    ledgerId: "ledger:100",
    expectedState: "PAYOUT_FAILED",
    claimToken: "correction:new-payout:one",
    claimExpiresAt: "2026-08-22T18:18:00.000Z",
    now: "2026-08-22T18:08:10.000Z",
  });
  await repository.finalizeCrmCorrection({
    ledgerId: "ledger:100",
    expectedState: "PAYOUT_FAILED",
    claimToken: "correction:new-payout:one",
    expectedCrmRecordId: "crm:assignment:100",
    expectedCrmRevision: "revision:1",
    crmReadbackRevision: "revision:failed-one",
    actor: "reconciliation-worker",
    auditId: "audit:new-payout:correction-one",
    requestId: "request:new-payout:correction-one",
    now: "2026-08-22T18:08:20.000Z",
  });
  const replacementPending = await repository.recordPayoutPending({
    ledgerId: "ledger:100",
    payoutId: "po_222222222222",
    payoutStatus: "pending",
    expectedArrival: "2026-08-27",
    actor: "stripe-webhook",
    auditId: "audit:new-payout:pending-two",
    requestId: "request:new-payout:pending-two",
    now: "2026-08-22T18:09:00.000Z",
  });
  assert.equal(replacementPending.ledger.state, "PAYOUT_PENDING");
  assert.equal(replacementPending.ledger.stripePayoutId, "po_222222222222");
  assert.equal(replacementPending.ledger.stripeTransferId, "tr_123456789012");
  assert.equal(
    replacementPending.ledger.stripeDestinationPaymentId,
    "py_123456789012",
  );
  const pendingAudit = (await repository.listAuditHistory(100)).find(
    (entry) => entry.auditId === "audit:new-payout:pending-two",
  );
  assert.equal(pendingAudit?.previousState, "PAYOUT_FAILED");
  assert.equal(pendingAudit?.newState, "PAYOUT_PENDING");

  await repository.recordPayoutFailed({
    ledgerId: "ledger:100",
    payoutId: "po_222222222222",
    payoutStatus: "canceled",
    safeErrorCode: "PAYOUT_CANCELED",
    safeReason: "Stripe reports that the automatic payout was canceled.",
    actor: "stripe-webhook",
    auditId: "audit:new-payout:canceled-two",
    requestId: "request:new-payout:canceled-two",
    now: "2026-08-22T18:10:00.000Z",
  });
  await repository.claimCrmCorrection({
    ledgerId: "ledger:100",
    expectedState: "PAYOUT_FAILED",
    claimToken: "correction:new-payout:two",
    claimExpiresAt: "2026-08-22T18:20:30.000Z",
    now: "2026-08-22T18:10:10.000Z",
  });
  await repository.finalizeCrmCorrection({
    ledgerId: "ledger:100",
    expectedState: "PAYOUT_FAILED",
    claimToken: "correction:new-payout:two",
    expectedCrmRecordId: "crm:assignment:100",
    expectedCrmRevision: "revision:failed-one",
    crmReadbackRevision: "revision:failed-two",
    actor: "reconciliation-worker",
    auditId: "audit:new-payout:correction-two",
    requestId: "request:new-payout:correction-two",
    now: "2026-08-22T18:10:20.000Z",
  });
  const replacementPaid = await repository.recordStripePayoutPaidEvidence({
    ledgerId: "ledger:100",
    payoutId: "po_333333333333",
    payoutStatus: "paid",
    expectedArrival: "2026-08-29",
    actor: "stripe-webhook",
    auditId: "audit:new-payout:paid-three",
    requestId: "request:new-payout:paid-three",
    now: "2026-08-22T18:11:00.000Z",
  });
  assert.equal(replacementPaid.ledger.state, "PAID");
  assert.equal(replacementPaid.ledger.stripePayoutId, "po_333333333333");
  assert.equal(replacementPaid.ledger.stripePayoutStatus, "paid");
  assert.equal(replacementPaid.ledger.reconciled, false);
});

test("failed transfer retries reuse the same source-bound idempotency fingerprint", async () => {
  const { repository } = await readyRepository();
  const prepared = await repository.prepareBatch({
    batchId: "batch:retry",
    scheduledDate: "2026-08-24",
    ledgerIds: ["ledger:100"],
    blockedItemCount: 0,
    blockedExceptionIds: [],
    remainingCandidateCount: 0,
    createdBy: "finance@example.test",
    auditId: "audit:retry:prepare",
    requestId: "request:retry:prepare",
    now: "2026-08-22T18:01:00.000Z",
  });
  await repository.approveBatch({
    batchId: "batch:retry",
    expectedDigest: prepared.approvalDigest,
    expectedRevision: 0,
    approvedBy: "owner@example.test",
    auditId: "audit:retry:approve",
    requestId: "request:retry:approve",
    now: "2026-08-22T18:02:00.000Z",
  });
  await repository.claimBatchExecution({
    batchId: "batch:retry",
    expectedDigest: prepared.approvalDigest,
    expectedRevision: 1,
    claimToken: "claim:retry",
    availableBalanceCents: 100_000,
    minimumReserveCents: 50_000,
    actor: "owner@example.test",
    auditId: "audit:retry:batch-claim",
    requestId: "request:retry:batch-claim",
    now: "2026-08-22T18:03:00.000Z",
  });
  const first = await repository.claimTransferItem({
    attemptId: "attempt:retry:original",
    batchId: "batch:retry",
    ledgerId: "ledger:100",
    claimToken: "claim:retry",
    actor: "finance@example.test",
    auditId: "audit:retry:item-claim",
    requestId: "request:retry:item-claim",
    now: "2026-08-22T18:04:00.000Z",
  });
  await repository.recordTransferFailed({
    attemptId: first.attempt.attemptId,
    claimToken: "claim:retry",
    safeErrorCode: "BALANCE_CHECK_UNAVAILABLE",
    safeReason: "Balance read failed before any Stripe transfer request",
    actor: "transfer-worker",
    auditId: "audit:retry:failed",
    requestId: "request:retry:failed",
    now: "2026-08-22T18:05:00.000Z",
  });
  const retry = await repository.claimTransferItem({
    attemptId: "attempt:retry:new-id-ignored",
    batchId: "batch:retry",
    ledgerId: "ledger:100",
    claimToken: "claim:retry",
    actor: "finance@example.test",
    auditId: "audit:retry:reclaim",
    requestId: "request:retry:reclaim",
    now: "2026-08-22T18:06:00.000Z",
  });
  assert.equal(retry.claimed, true);
  assert.equal(retry.attempt.attemptId, first.attempt.attemptId);
  assert.equal(
    retry.attempt.idempotencyFingerprint,
    first.attempt.idempotencyFingerprint,
  );
  assert.equal(retry.attempt.retryCount, 1);
  assert.equal(
    (await repository.getLedger("ledger:100")).state,
    "TRANSFER_QUEUED",
  );
});

test("ledger ingestion rejects caller-supplied execution states", async () => {
  const { repository } = await readyRepository();
  await assert.rejects(
    repository.upsertLedger({
      draft: ledgerDraft({ sourceRevision: 2 }),
      state: "PAID",
      closeoutStatus: "complete",
      batchEligibilityDate: "2026-08-24",
      paymentMemo: "Assignment assignment:100",
      actor: "finance@example.test",
      auditId: "audit:invalid:paid-jump",
      requestId: "request:invalid:paid-jump",
      now: "2026-08-22T18:01:00.000Z",
    }),
    (error) =>
      error instanceof PayoutRepositoryError && error.code === "INVALID_INPUT",
  );
});

test("only one batch can hold the environment execution lease and stale ownership is recoverable", async () => {
  const { repository } = await readyRepository();
  await repository.upsertArtistAccount({
    artistId: "artist:200",
    stripeAccountId: "acct_abcdefghijkl",
    artistDisplayName: "Second Artist",
    onboardingStatus: "PAYOUT_READY",
    requirementsStatus: "complete",
    transfersStatus: "active",
    payoutsStatus: "active",
    automaticPayoutsEnabled: true,
    payoutDestinationId: "ba_abcdefghijkl",
    payoutReadyApprovedAt: TIME,
    lastRequirementsCheckAt: TIME,
    onboardedAt: TIME,
    disabledReason: null,
    payoutExceptionFlag: false,
    now: TIME,
  });
  await repository.upsertLedger({
    draft: ledgerDraft({
      ledgerId: "ledger:200",
      bookingId: "booking:200",
      assignmentId: "assignment:200",
      artistId: "artist:200",
      artistName: "Second Artist",
      connectedAccountId: "acct_abcdefghijkl",
    }),
    state: "READY_FOR_OWNER_APPROVAL",
    closeoutStatus: "complete",
    batchEligibilityDate: "2026-08-24",
    paymentMemo: "Assignment assignment:200",
    actor: "finance@example.test",
    auditId: "audit:ledger:200",
    requestId: "request:ledger:200",
    now: TIME,
  });
  const first = await repository.prepareBatch({
    batchId: "batch:lease:first",
    scheduledDate: "2026-08-24",
    ledgerIds: ["ledger:100"],
    blockedItemCount: 0,
    blockedExceptionIds: [],
    remainingCandidateCount: 0,
    createdBy: "finance@example.test",
    auditId: "audit:lease:first:prepare",
    requestId: "request:lease:first:prepare",
    now: "2026-08-22T18:01:00.000Z",
  });
  const second = await repository.prepareBatch({
    batchId: "batch:lease:second",
    scheduledDate: "2026-08-26",
    ledgerIds: ["ledger:200"],
    blockedItemCount: 0,
    blockedExceptionIds: [],
    remainingCandidateCount: 0,
    createdBy: "finance@example.test",
    auditId: "audit:lease:second:prepare",
    requestId: "request:lease:second:prepare",
    now: "2026-08-22T18:01:30.000Z",
  });
  for (const [batchId, digest, suffix] of [
    ["batch:lease:first", first.approvalDigest, "first"],
    ["batch:lease:second", second.approvalDigest, "second"],
  ]) {
    await repository.approveBatch({
      batchId,
      expectedDigest: digest,
      expectedRevision: 0,
      approvedBy: "owner@example.test",
      auditId: `audit:lease:${suffix}:approve`,
      requestId: `request:lease:${suffix}:approve`,
      now: "2026-08-22T18:02:00.000Z",
    });
  }
  await repository.claimBatchExecution({
    batchId: "batch:lease:first",
    expectedDigest: first.approvalDigest,
    expectedRevision: 1,
    claimToken: "claim:lease:first",
    availableBalanceCents: 100_000,
    minimumReserveCents: 50_000,
    actor: "owner@example.test",
    auditId: "audit:lease:first:claim",
    requestId: "request:lease:first:claim",
    now: "2026-08-22T18:03:00.000Z",
  });
  await assert.rejects(
    repository.claimBatchExecution({
      batchId: "batch:lease:second",
      expectedDigest: second.approvalDigest,
      expectedRevision: 1,
      claimToken: "claim:lease:second",
      availableBalanceCents: 100_000,
      minimumReserveCents: 50_000,
      actor: "owner@example.test",
      auditId: "audit:lease:second:claim",
      requestId: "request:lease:second:claim",
      now: "2026-08-22T18:04:00.000Z",
    }),
    (error) =>
      error instanceof PayoutRepositoryError && error.code === "CLAIM_REJECTED",
  );
  const recovered = await repository.recoverStaleBatchExecution({
    batchId: "batch:lease:first",
    expectedClaimToken: "claim:lease:first",
    newClaimToken: "claim:lease:first:recovered",
    expectedDigest: first.approvalDigest,
    expectedRevision: 1,
    staleBefore: "2026-08-22T18:03:30.000Z",
    actor: "owner@example.test",
    auditId: "audit:lease:first:recovered",
    requestId: "request:lease:first:recovered",
    now: "2026-08-22T18:05:00.000Z",
  });
  assert.equal(recovered.executionClaimToken, "claim:lease:first:recovered");
  assert.equal(
    (await repository.getBatch("batch:lease:second")).status,
    "OWNER_APPROVED",
  );
});

test("webhook receipt is durable, replay-safe, and requires a processing claim", async () => {
  const { repository } = await readyRepository();
  const first = await repository.registerWebhookEvent({
    stripeEventId: "evt_123456789012",
    eventType: "v2.core.account.updated",
    connectedAccountId: ACCOUNT_ID,
    receivedAt: TIME,
  });
  assert.equal(first.inserted, true);

  const duplicate = await repository.registerWebhookEvent({
    stripeEventId: "evt_123456789012",
    eventType: "v2.core.account.updated",
    connectedAccountId: ACCOUNT_ID,
    receivedAt: "2026-08-22T18:01:00.000Z",
  });
  assert.equal(duplicate.inserted, false);

  const claim = await repository.claimWebhookEvent({
    stripeEventId: "evt_123456789012",
    claimToken: "webhook:claim:1",
    claimedAt: "2026-08-22T18:01:00.000Z",
    leaseExpiresAt: "2026-08-22T18:06:00.000Z",
  });
  assert.equal(claim.claimed, true);
  const secondClaim = await repository.claimWebhookEvent({
    stripeEventId: "evt_123456789012",
    claimToken: "webhook:claim:2",
    claimedAt: "2026-08-22T18:02:00.000Z",
    leaseExpiresAt: "2026-08-22T18:07:00.000Z",
  });
  assert.equal(secondClaim.claimed, false);
  assert.equal(
    await repository.renewWebhookEventLease({
      stripeEventId: "evt_123456789012",
      claimToken: "webhook:claim:1",
      renewedAt: "2026-08-22T18:05:00.000Z",
      leaseExpiresAt: "2026-08-22T18:10:00.000Z",
    }),
    true,
  );
  assert.equal(
    await repository.renewWebhookEventLease({
      stripeEventId: "evt_123456789012",
      claimToken: "webhook:claim:2",
      renewedAt: "2026-08-22T18:06:00.000Z",
      leaseExpiresAt: "2026-08-22T18:11:00.000Z",
    }),
    false,
  );
  assert.equal(
    await repository.renewWebhookEventLease({
      stripeEventId: "evt_123456789012",
      claimToken: "webhook:claim:1",
      renewedAt: "2026-08-22T18:10:00.000Z",
      leaseExpiresAt: "2026-08-22T18:15:00.000Z",
    }),
    false,
  );
  const recovered = await repository.recoverExpiredWebhookLease({
    stripeEventId: "evt_123456789012",
    expectedClaimToken: "webhook:claim:1",
    newClaimToken: "webhook:claim:3",
    recoveredAt: "2026-08-22T18:11:00.000Z",
    leaseExpiresAt: "2026-08-22T18:16:00.000Z",
  });
  assert.equal(recovered.recovered, true);
  assert.equal(
    await repository.completeWebhookEvent(
      "evt_123456789012",
      "webhook:claim:1",
      "PROCESSED",
      "2026-08-22T18:12:00.000Z",
    ),
    false,
  );
  assert.equal(
    await repository.completeWebhookEvent(
      "evt_123456789012",
      "webhook:claim:3",
      "PROCESSED",
      "2026-08-22T18:12:00.000Z",
    ),
    true,
  );

  await repository.registerWebhookEvent({
    stripeEventId: "evt_999999999999",
    eventType: "payout.failed",
    connectedAccountId: ACCOUNT_ID,
    receivedAt: "2026-08-22T18:13:00.000Z",
  });
  const failedClaim = await repository.claimWebhookEvent({
    stripeEventId: "evt_999999999999",
    claimToken: "webhook:claim:failed",
    claimedAt: "2026-08-22T18:13:10.000Z",
    leaseExpiresAt: "2026-08-22T18:18:10.000Z",
  });
  assert.equal(failedClaim.claimed, true);
  assert.equal(
    await repository.failWebhookEvent(
      "evt_999999999999",
      "webhook:claim:failed",
      "PAYOUT_MEMBERSHIP_UNVERIFIED",
      "2026-08-22T18:13:20.000Z",
    ),
    true,
  );
  const dashboard = await repository.getDashboard();
  assert.equal(dashboard.webhookBacklog.failed, 1);
  assert.deepEqual(dashboard.failedWebhookEvents, [
    {
      eventId: "evt_999999999999",
      eventType: "payout.failed",
      connectedAccountId: ACCOUNT_ID,
      receivedAt: "2026-08-22T18:13:00.000Z",
      safeErrorCode: "PAYOUT_MEMBERSHIP_UNVERIFIED",
      retryCount: 0,
    },
  ]);
});

test("webhook lifecycle CHECK constraints reject impossible direct D1 states", async () => {
  const { db, repository } = await readyRepository();
  await repository.registerWebhookEvent({
    stripeEventId: "evt_Invariant123456",
    eventType: "v2.core.account.updated",
    connectedAccountId: ACCOUNT_ID,
    receivedAt: TIME,
  });
  const invalidUpdates = [
    "UPDATE stripe_webhook_events SET processing_status = 'PROCESSING' WHERE stripe_event_id = 'evt_Invariant123456'",
    "UPDATE stripe_webhook_events SET processing_claim_token = 'claim:orphaned' WHERE stripe_event_id = 'evt_Invariant123456'",
    "UPDATE stripe_webhook_events SET processing_status = 'PROCESSED' WHERE stripe_event_id = 'evt_Invariant123456'",
    "UPDATE stripe_webhook_events SET processing_status = 'FAILED' WHERE stripe_event_id = 'evt_Invariant123456'",
  ];
  for (const sql of invalidUpdates) {
    assert.throws(() => db.database.prepare(sql).run(), /CHECK constraint/);
  }
  const stored = db.database
    .prepare(
      "SELECT processing_status, processing_claim_token, processing_started_at, processing_lease_expires_at, processed_at, safe_error_code FROM stripe_webhook_events WHERE stripe_event_id = ?",
    )
    .get("evt_Invariant123456");
  assert.deepEqual(
    { ...stored },
    {
      processing_status: "RECEIVED",
      processing_claim_token: null,
      processing_started_at: null,
      processing_lease_expires_at: null,
      processed_at: null,
      safe_error_code: null,
    },
  );
});
