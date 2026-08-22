#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  canonicalBatchSnapshot,
  digestBatchSnapshot,
  digestLedgerMaterial,
  manualPaymentIntentDigest,
  transferIdempotencyKey,
} from "../../src/lib/artist-payouts/approval.ts";
import { assertMutationRequest } from "../../src/lib/artist-payouts/auth.ts";
import {
  assertBalanceCanFundBatch,
  getPayoutRuntimeConfig,
} from "../../src/lib/artist-payouts/config.ts";
import { assessCloseoutEligibility } from "../../src/lib/artist-payouts/eligibility.ts";
import {
  calculateArtistPayTotal,
  validateArtistPayAmounts,
} from "../../src/lib/artist-payouts/money.ts";
import {
  assertCurrentLosAngelesProcessingDay,
  dateInTimeZone,
  nextProcessingDate,
  nextProcessingDateAfterEligibility,
} from "../../src/lib/artist-payouts/schedule.ts";
import {
  assertTransition,
  canTransition,
} from "../../src/lib/artist-payouts/state-machine.ts";
import {
  assertLedgerDraft,
  isIsoDate,
  readJsonObject,
} from "../../src/lib/artist-payouts/validation.ts";

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const expectThrows = async (fn, pattern) =>
  assert.rejects(Promise.resolve().then(fn), pattern);

const completeCloseout = Object.freeze({
  assignmentExists: true,
  bookingIdValid: true,
  assignmentIdValid: true,
  eventCompleted: true,
  actualEndTime: "2026-08-16T23:00:00.000Z",
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
});

function ledger(overrides = {}) {
  return {
    ledgerId: "ledger_A01",
    bookingId: "booking_A01",
    assignmentId: "assignment_A01",
    crmRecordId: "artist_payment_A01",
    crmRevision: "crm_revision_1",
    artistId: "artist_A01",
    artistName: "Synthetic Artist",
    eventName: "Synthetic Celebration",
    eventDate: "2026-08-16",
    closeoutVerifiedAt: "2026-08-17T18:00:00.000Z",
    service: "Face painting",
    environment: "sandbox",
    sourceRevision: 1,
    closeout: { ...completeCloseout },
    connectedAccountId: "acct_123456789012",
    servicePayCents: 20_000,
    travelPayCents: 2_500,
    bonusCents: 1_000,
    adjustmentCents: -500,
    deductionCents: 250,
    totalApprovedPayCents: 22_750,
    ...overrides,
  };
}

test("money uses integer minor units and exact component equation", () => {
  assert.equal(
    calculateArtistPayTotal({
      servicePayCents: 20_000,
      travelPayCents: 2_500,
      bonusCents: 1_000,
      adjustmentCents: -500,
      deductionCents: 250,
    }),
    22_750,
  );
  assert.throws(
    () =>
      calculateArtistPayTotal({
        servicePayCents: 1.5,
        travelPayCents: 0,
        bonusCents: 0,
        adjustmentCents: 0,
        deductionCents: 0,
      }),
    /minor units/,
  );
  assert.throws(
    () =>
      validateArtistPayAmounts({ ...ledger(), totalApprovedPayCents: 22_751 }),
    /does not match/,
  );
});

test("processing dates are the next Monday or Wednesday for every weekday", () => {
  const expected = new Map([
    ["2026-08-17", "2026-08-19"],
    ["2026-08-18", "2026-08-19"],
    ["2026-08-19", "2026-08-24"],
    ["2026-08-20", "2026-08-24"],
    ["2026-08-21", "2026-08-24"],
    ["2026-08-22", "2026-08-24"],
    ["2026-08-23", "2026-08-24"],
  ]);
  for (const [input, output] of expected)
    assert.equal(nextProcessingDate(input), output);
  assert.throws(() => nextProcessingDate("2026-02-30"), /real/);
  assert.equal(isIsoDate("2028-02-29"), true);
  assert.equal(isIsoDate("2027-02-29"), false);
});

test("Pacific eligibility date is DST-aware", () => {
  assert.equal(dateInTimeZone(new Date("2026-03-09T06:59:59Z")), "2026-03-08");
  assert.equal(dateInTimeZone(new Date("2026-03-09T07:00:00Z")), "2026-03-09");
  assert.equal(
    nextProcessingDateAfterEligibility(
      "2026-03-08",
      new Date("2026-03-09T07:00:00Z"),
    ),
    "2026-03-11",
  );
});

test("processing day is exactly current Los Angeles Monday or Wednesday", () => {
  assert.doesNotThrow(() =>
    assertCurrentLosAngelesProcessingDay(
      "2026-08-24",
      new Date("2026-08-25T06:59:59.000Z"),
    ),
  );
  assert.doesNotThrow(() =>
    assertCurrentLosAngelesProcessingDay(
      "2026-08-26",
      new Date("2026-08-26T19:00:00.000Z"),
    ),
  );
  assert.throws(
    () =>
      assertCurrentLosAngelesProcessingDay(
        "2026-08-19",
        new Date("2026-08-24T19:00:00.000Z"),
      ),
    /current America\/Los_Angeles date/,
  );
  assert.throws(
    () =>
      assertCurrentLosAngelesProcessingDay(
        "2026-08-26",
        new Date("2026-08-24T19:00:00.000Z"),
      ),
    /current America\/Los_Angeles date/,
  );
  assert.throws(
    () =>
      assertCurrentLosAngelesProcessingDay(
        "2026-08-22",
        new Date("2026-08-22T19:00:00.000Z"),
      ),
    /Monday or Wednesday/,
  );
});

test("eligibility fails closed on every control and malformed completion time", () => {
  assert.deepEqual(assessCloseoutEligibility({ ...completeCloseout }), {
    eligible: true,
    blockers: [],
  });
  for (const key of Object.keys(completeCloseout).filter(
    (key) => key !== "actualEndTime",
  )) {
    const result = assessCloseoutEligibility({
      ...completeCloseout,
      [key]: false,
    });
    assert.equal(result.eligible, false, key);
    assert.ok(result.blockers.includes(key), key);
  }
  assert.ok(
    assessCloseoutEligibility({
      ...completeCloseout,
      actualEndTime: "not-a-time",
    }).blockers.includes("actualEndTime"),
  );
});

test("state machine rejects financial jumps", () => {
  assert.equal(canTransition("CLOSEOUT_PENDING", "PAID"), false);
  assert.equal(canTransition("OWNER_APPROVED", "TRANSFER_QUEUED"), true);
  assert.throws(() => assertTransition("CLOSEOUT_PENDING", "PAID"), /Illegal/);
});

test("ledger material digest binds all approval invalidators and closeout", async () => {
  const base = await digestLedgerMaterial(ledger());
  for (const mutation of [
    { artistId: "artist_A02" },
    { bookingId: "booking_A02" },
    { assignmentId: "assignment_A02" },
    { connectedAccountId: "acct_999999999999" },
    { servicePayCents: 19_000, adjustmentCents: 500 },
    { travelPayCents: 1_500, bonusCents: 2_000 },
    { sourceRevision: 2 },
    { closeout: { ...completeCloseout, noRefundIssueAffectingPay: false } },
  ]) {
    assert.notEqual(await digestLedgerMaterial(ledger(mutation)), base);
  }
});

test("batch digest is deterministic, order-independent, and material-bound", async () => {
  const materialA = await digestLedgerMaterial(ledger());
  const materialB = await digestLedgerMaterial(
    ledger({ ledgerId: "ledger_B01", assignmentId: "assignment_B01" }),
  );
  const itemA = {
    ledgerId: "ledger_A01",
    assignmentId: "assignment_A01",
    artistId: "artist_A01",
    connectedAccountId: "acct_123456789012",
    totalApprovedPayCents: 22_750,
    sourceRevision: 1,
    materialDigest: materialA,
    paymentMemo: "Assignment A01",
  };
  const itemB = {
    ledgerId: "ledger_B01",
    assignmentId: "assignment_B01",
    artistId: "artist_A01",
    connectedAccountId: "acct_123456789012",
    totalApprovedPayCents: 22_750,
    sourceRevision: 1,
    materialDigest: materialB,
    paymentMemo: "Assignment B01",
  };
  const first = {
    batchId: "batch_20260819",
    environment: "sandbox",
    scheduledDate: "2026-08-19",
    currency: "usd",
    items: [itemA, itemB],
  };
  const second = { ...first, items: [itemB, itemA] };
  assert.equal(canonicalBatchSnapshot(first), canonicalBatchSnapshot(second));
  assert.equal(
    await digestBatchSnapshot(first),
    await digestBatchSnapshot(second),
  );
  assert.notEqual(
    await digestBatchSnapshot(first),
    await digestBatchSnapshot({
      ...first,
      items: [{ ...itemA, materialDigest: "sha256:changed" }, itemB],
    }),
  );
  assert.equal(
    transferIdempotencyKey("assignment_A01", 7),
    "hfl-artist-transfer:assignment_A01:7",
  );
});

test("manual-payment digest binds the exact ledger, amount, method, reason, evidence, and memo", async () => {
  const intent = {
    ledgerId: "ledger_A01",
    expectedAmountCents: 22_750,
    method: "CHECK",
    reason: "Owner-approved legacy payment recovery",
    evidenceReference: "synthetic-evidence-001",
    memo: "Legacy artist payment",
  };
  const digest = await manualPaymentIntentDigest(intent);
  assert.match(digest, /^sha256-hex:[a-f0-9]{64}$/);
  assert.equal(await manualPaymentIntentDigest({ ...intent }), digest);
  for (const [field, value] of [
    ["ledgerId", "ledger_A02"],
    ["expectedAmountCents", 22_751],
    ["method", "CASH"],
    ["reason", `${intent.reason} changed`],
    ["evidenceReference", "synthetic-evidence-002"],
    ["memo", `${intent.memo} changed`],
  ]) {
    assert.notEqual(
      await manualPaymentIntentDigest({ ...intent, [field]: value }),
      digest,
      field,
    );
  }
});

test("runtime configuration fails closed across flags, environment, keys, and reserve", () => {
  const db = {
    prepare() {
      throw new Error("unused");
    },
  };
  const base = {
    PAYOUTS_D1: db,
    STRIPE_ARTIST_PAYOUTS_ENABLED: "true",
    STRIPE_ARTIST_ONBOARDING_ENABLED: "true",
    STRIPE_ARTIST_TRANSFERS_ENABLED: "true",
    STRIPE_ARTIST_PAYOUTS_ENV: "sandbox",
    STRIPE_PAYOUTS_SANDBOX_SECRET_KEY: "sk_test_synthetic_key_12345",
    STRIPE_PAYOUTS_SANDBOX_PLATFORM_ACCOUNT_ID: "acct_123456789012",
    STRIPE_PAYOUTS_SANDBOX_ACCOUNT_WEBHOOK_SECRET:
      "whsec_synthetic_account_12345",
    STRIPE_PAYOUTS_SANDBOX_PAYOUT_WEBHOOK_SECRET:
      "whsec_synthetic_payout_12345",
    PAYOUT_MIN_RESERVE_CENTS: "500000",
    PAYOUT_PUBLIC_BASE_URL: "https://example.test",
  };
  assert.equal(
    getPayoutRuntimeConfig(base, "transfer").minimumReserveCents,
    500_000,
  );
  assert.equal(
    getPayoutRuntimeConfig(base, "account-webhook").environment,
    "sandbox",
  );
  assert.equal(
    getPayoutRuntimeConfig(base, "payout-webhook").environment,
    "sandbox",
  );
  assert.throws(
    () =>
      getPayoutRuntimeConfig(
        { ...base, STRIPE_ARTIST_TRANSFERS_ENABLED: "false" },
        "transfer",
      ),
    /not true/,
  );
  assert.throws(
    () =>
      getPayoutRuntimeConfig(
        { ...base, STRIPE_ARTIST_PAYOUTS_ENV: "live" },
        "transfer",
      ),
    /valid live/,
  );
  assert.throws(
    () =>
      getPayoutRuntimeConfig(
        { ...base, PAYOUT_MIN_RESERVE_CENTS: "" },
        "transfer",
      ),
    /integer minor units/,
  );
});

test("reserve uses available funds only and preserves owner buffer", () => {
  assert.doesNotThrow(() =>
    assertBalanceCanFundBatch({
      availableBalanceCents: 100_000,
      batchTotalCents: 75_000,
      minimumReserveCents: 25_000,
    }),
  );
  assert.throws(
    () =>
      assertBalanceCanFundBatch({
        availableBalanceCents: 99_999,
        batchTotalCents: 75_000,
        minimumReserveCents: 25_000,
      }),
    /below/,
  );
});

test("mutations require same-origin explicit confirmation and idempotency", () => {
  const valid = new Request("https://admin.example.test/api", {
    method: "POST",
    headers: {
      origin: "https://admin.example.test",
      "sec-fetch-site": "same-origin",
      "x-hfla-payout-request": "owner-confirmed",
      "idempotency-key": "owner-action:batch_123",
    },
  });
  assert.doesNotThrow(() =>
    assertMutationRequest(valid, "https://admin.example.test"),
  );
  for (const headers of [
    {
      origin: "https://evil.test",
      "x-hfla-payout-request": "owner-confirmed",
      "idempotency-key": "a",
    },
    {
      origin: "https://admin.example.test",
      "sec-fetch-site": "cross-site",
      "x-hfla-payout-request": "owner-confirmed",
      "idempotency-key": "a",
    },
    { origin: "https://admin.example.test", "idempotency-key": "a" },
    {
      origin: "https://admin.example.test",
      "x-hfla-payout-request": "owner-confirmed",
    },
  ]) {
    assert.throws(() =>
      assertMutationRequest(
        new Request("https://admin.example.test/api", {
          method: "POST",
          headers,
        }),
        "https://admin.example.test",
      ),
    );
  }
});

test("request JSON reader rejects invalid, non-object, and oversized bodies", async () => {
  assert.deepEqual(
    await readJsonObject(
      new Request("https://example.test", {
        method: "POST",
        body: '{"ok":true}',
      }),
    ),
    { ok: true },
  );
  await expectThrows(
    () =>
      readJsonObject(
        new Request("https://example.test", { method: "POST", body: "[]" }),
      ),
    /JSON object/,
  );
  await expectThrows(
    () =>
      readJsonObject(
        new Request("https://example.test", { method: "POST", body: "{" }),
      ),
    /valid JSON/,
  );
  await expectThrows(
    () =>
      readJsonObject(
        new Request("https://example.test", {
          method: "POST",
          body: "x".repeat(40_000),
        }),
      ),
    /too large/,
  );
});

test("ledger input validation rejects invalid IDs, dates, accounts, and totals", () => {
  assert.doesNotThrow(() => assertLedgerDraft(ledger()));
  assert.throws(
    () => assertLedgerDraft(ledger({ assignmentId: "../unsafe" })),
    /IDs/,
  );
  assert.throws(
    () => assertLedgerDraft(ledger({ eventDate: "2026-02-30" })),
    /real/,
  );
  assert.throws(
    () => assertLedgerDraft(ledger({ connectedAccountId: "acct_bad" })),
    /malformed/,
  );
});

let passed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}
console.log(`\nArtist payout core: ${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exitCode = 1;
