#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  ARTIST_PAYOUT_RUNTIME_OPERATIONS,
  handleArtistPayoutApiRequest,
  prepareBatchWithRuntimeStripe,
} from "../../functions/api/internal/artist-payouts/[[path]].ts";
import { handleArtistPayoutPageRequest } from "../../functions/internal/artist-payouts.ts";
import { getPayoutRuntimeConfig } from "../../src/lib/artist-payouts/config.ts";
import { manualPaymentIntentDigest } from "../../src/lib/artist-payouts/approval.ts";
import { PayoutRepository } from "../../src/lib/artist-payouts/repository.ts";
import { assertCurrentLosAngelesProcessingDay } from "../../src/lib/artist-payouts/schedule.ts";

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const origin = "https://admin.example.test";
const ROUTE_NOW = "2026-08-24T19:00:00.000Z";
const SYNTHETIC_STRIPE_TEST_KEY = ["sk", "test", "Synthetic123456789"].join(
  "_",
);
const SYNTHETIC_STRIPE_LIVE_KEY = ["sk", "live", "Synthetic123456789"].join(
  "_",
);

const environment = {
  PAYOUT_PUBLIC_BASE_URL: `${origin}/`,
  STRIPE_ARTIST_PAYOUTS_ENV: "sandbox",
};

class RuntimeTestStatement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new RuntimeTestStatement(this.database, this.sql, values);
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

class RuntimeTestD1 {
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
    return new RuntimeTestStatement(this.database, sql);
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

function actorFor(request) {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (token === "owner-token")
    return { email: "owner@example.test", role: "owner" };
  if (token === "admin-token")
    return { email: "admin@example.test", role: "admin" };
  throw new Error("synthetic invalid assertion");
}

function emptyDashboard() {
  return {
    environment: "sandbox",
    pageLimit: 100,
    collectionPages: Object.fromEntries(
      [
        "batches",
        "ledgers",
        "artistAccounts",
        "openExceptions",
        "auditHistory",
        "batchBlockedItems",
        "failedWebhookEvents",
      ].map((key) => [
        key,
        {
          totalCount: 0,
          returnedCount: 0,
          hasMore: false,
          nextCursor: null,
        },
      ]),
    ),
    fundingPreviewUnavailable: true,
    fundingPreviewError: null,
    stateTotals: [],
    onboardingTotals: [],
    batches: [],
    batchReviewItems: [],
    batchBlockedItems: [],
    ledgers: [],
    recentTransfers: [],
    openExceptions: [],
    artistAccounts: [],
    artistProfileMetrics: [],
    selectedArtistProfile: null,
    activeRosterCount: null,
    onboardingQueueUnavailable: true,
    onboardingQueue: [],
    auditHistory: [],
    webhookBacklog: { received: 0, processing: 0, failed: 0 },
    failedWebhookEvents: [],
    lastReconciliationAt: null,
  };
}

function batch(overrides = {}) {
  return {
    batchId: "batch_20260824_demo",
    environment: "sandbox",
    scheduledDate: "2026-08-24",
    status: "OWNER_APPROVED",
    currency: "usd",
    itemCount: 1,
    blockedItemCount: 0,
    remainingCandidateCount: 0,
    totalCents: 12_500,
    availableBalanceCents: null,
    minimumReserveCents: null,
    projectedBalanceCents: null,
    approvalDigest: `sha256:${"a".repeat(43)}`,
    approvalRevision: 1,
    createdBy: "admin@example.test",
    approvedBy: "owner@example.test",
    approvalTimestamp: "2026-08-22T08:00:00.000Z",
    executionClaimToken: null,
    executionStartedAt: null,
    executionCompletedAt: null,
    createdAt: "2026-08-22T07:00:00.000Z",
    updatedAt: "2026-08-22T08:00:00.000Z",
    ...overrides,
  };
}

function dependencies(overrides = {}) {
  const operations = {
    dashboard: async () => emptyDashboard(),
    startOnboarding: async (_env, input) => ({
      invitationUrl: `${origin}/artist/payout-onboarding?claim=synthetic`,
      challengeCode: "23456-789AB",
      expiresAt: 1_800_000_000,
      account: {
        artistId: input.artistId,
        onboardingStatus: "REQUIREMENTS_PENDING",
      },
    }),
    mapExistingStripeRecipient: async (_env, input) => ({
      artistId: input.artistId,
      stripeAccountId: input.accountId,
      onboardingStatus: "TRANSFERS_ENABLED",
    }),
    activateArtistPayoutAccount: async (_env, input) => ({
      artistId: input.artistId,
      stripeAccountId: input.accountId,
      onboardingStatus: "PAYOUT_READY",
    }),
    ingestLedger: async (_env, input) => ({
      ledger: {
        ledgerId: "ledger_demo_123",
        assignmentId: "assignment_demo_123",
        sourceRevision: 1,
        materialDigest: `sha256:${"b".repeat(43)}`,
        state: "READY_FOR_OWNER_APPROVAL",
        ownerApprovalRevision: 0,
        approvalDigest: null,
        approvedBy: null,
        approvalTimestamp: null,
        batchEligibilityDate: "2026-08-24",
        batchId: null,
        stripeTransferId: null,
        stripeDestinationPaymentId: null,
        stripePayoutId: null,
        stripePayoutStatus: null,
        expectedArrival: null,
        failureCode: null,
        failureReason: null,
        paymentMemo: "synthetic memo",
        reconciled: false,
        reconciledAt: null,
        createdAt: "2026-08-22T08:00:00.000Z",
        updatedAt: "2026-08-22T08:00:00.000Z",
      },
      blockers: [],
      approvalInvalidated: false,
    }),
    prepareBatch: async () => ({
      batch: batch({
        status: "PREPARED",
        approvalRevision: 0,
        approvedBy: null,
        approvalTimestamp: null,
      }),
      approvalDigest: `sha256:${"a".repeat(43)}`,
    }),
    approveBatch: async () => batch(),
    executeBatch: async () => ({
      batch: batch({ status: "COMPLETED" }),
      createdTransfers: [],
      failedLedgers: [],
    }),
    assertExecutionProcessingDay: async (_env, _batchId, now) => {
      assertCurrentLosAngelesProcessingDay("2026-08-24", now);
    },
    reconcilePayout: async (_env, input) => ({
      ledger: {
        ledgerId: input.ledgerId,
        state: "PAID",
        reconciled: true,
      },
      crm: {
        recordId: "crm_demo_123",
        revision: "revision-2",
        requestId: "crm-request-1",
        recovered: false,
      },
    }),
    recordManualPaymentException: async (_env, input) => ({
      ledger: {
        ledgerId: input.ledgerId,
        state: "MANUAL_PAYMENT_EXCEPTION",
        reconciled: true,
      },
      crm: { revision: "revision-manual-1" },
    }),
    cancelManualPaymentIntent: async (_env, input) => ({
      ledgerId: input.ledgerId,
      state: "READY_FOR_OWNER_APPROVAL",
    }),
    reconcileAmbiguousTransferOutcome: async (_env, input) => ({
      ledgerId: input.ledgerId,
      state: "TRANSFER_CREATED",
      stripeTransferId: input.transferId,
    }),
    approvePayoutDestinationVariance: async (_env, input) => ({
      approvalId: "payout_variance_synthetic123",
      environment: "sandbox",
      ledgerId: input.ledgerId,
      payoutId: input.payoutId,
      originalDestinationId: "ba_123456789012",
      approvedDestinationId: "ba_210987654321",
      recipientApprovalAt: ROUTE_NOW,
      approvedBy: input.actor.email,
      reason: input.reason,
      createdAt: ROUTE_NOW,
    }),
    resolveException: async () => {},
    ...overrides.operations,
  };
  return {
    authenticate: async (request) => actorFor(request),
    now: () => new Date(ROUTE_NOW),
    operations,
    ...overrides,
    operations,
  };
}

function request(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.token) headers.set("cf-access-jwt-assertion", options.token);
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  return new Request(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

function mutationHeaders(token = "owner-token") {
  return {
    "cf-access-jwt-assertion": token,
    origin,
    "sec-fetch-site": "same-origin",
    "x-hfla-payout-request": "owner-confirmed",
    "idempotency-key": "synthetic:test:request-1",
  };
}

async function api(req, deps = dependencies()) {
  return handleArtistPayoutApiRequest({ request: req, env: environment }, deps);
}

async function payload(response) {
  return response.json();
}

function assertProtectedHeaders(response) {
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /default-src 'none'/,
  );
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
}

test("requires server-verified Cloudflare Access identity before every API route", async () => {
  const cases = [
    request("/api/internal/artist-payouts"),
    request("/api/internal/artist-payouts/onboarding", {
      method: "POST",
      body: {},
    }),
    request("/api/internal/artist-payouts/batches/batch_demo_123/approve", {
      method: "POST",
      body: {},
    }),
  ];
  for (const candidate of cases) {
    const response = await api(candidate);
    assert.equal(response.status, 401);
    assert.deepEqual(await payload(response), {
      ok: false,
      error: "Authentication required",
    });
    assertProtectedHeaders(response);
  }
  const invalid = await api(
    request("/api/internal/artist-payouts", { token: "invalid-token" }),
  );
  assert.equal(invalid.status, 401);
});

test("allows authenticated admin reads and marks all data non-cacheable", async () => {
  const response = await api(
    request("/api/internal/artist-payouts/dashboard", { token: "admin-token" }),
  );
  assert.equal(response.status, 200);
  assert.equal((await payload(response)).ok, true);
  assertProtectedHeaders(response);
  assert.equal(response.headers.get("vary"), "CF-Access-Jwt-Assertion");
});

test("dashboard GET returns the selected artist profile and preserves isolated cursor scopes", async () => {
  let receivedQuery;
  const expectedProfile = {
    artistId: "artist:100",
    account: {
      artistId: "artist:100",
      requirementsStatus: "currently_due",
      disabledReason: "requirements.past_due",
    },
    metrics: {
      unpaidAssignmentCount: 3,
      unpaidAmountCents: 30_000,
      assignmentCount: 8,
      paidAssignmentCount: 5,
      openExceptionCount: 1,
    },
    collectionPages: {
      unpaidAssignments: {
        totalCount: 3,
        returnedCount: 2,
        hasMore: true,
        nextCursor: "next_unpaid",
      },
      paymentHistory: {
        totalCount: 8,
        returnedCount: 2,
        hasMore: true,
        nextCursor: "next_payments",
      },
      openExceptions: {
        totalCount: 1,
        returnedCount: 1,
        hasMore: false,
        nextCursor: null,
      },
    },
    unpaidAssignments: [],
    paymentHistory: [],
    openExceptions: [],
  };
  const deps = dependencies({
    operations: {
      dashboard: async (_env, query) => {
        receivedQuery = query;
        return {
          ...emptyDashboard(),
          selectedArtistProfile: expectedProfile,
        };
      },
    },
  });
  const response = await api(
    request(
      "/api/internal/artist-payouts/dashboard?limit=2&artist_id=artist%3A100&cursor_ledgers=efgh&cursor_artist_unpaid=abcd&cursor_artist_payments=ijkl&cursor_artist_exceptions=mnop",
      { token: "admin-token" },
    ),
    deps,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(receivedQuery, {
    limit: 2,
    cursors: { ledgers: "efgh" },
    artistId: "artist:100",
    artistProfileCursors: {
      unpaidAssignments: "abcd",
      paymentHistory: "ijkl",
      openExceptions: "mnop",
    },
  });
  const body = await payload(response);
  assert.deepEqual(body.dashboard.selectedArtistProfile, expectedProfile);
});

test("dashboard GET rejects malformed, duplicated, or unscoped artist profile queries", async () => {
  let calls = 0;
  const deps = dependencies({
    operations: {
      dashboard: async () => {
        calls += 1;
        return emptyDashboard();
      },
    },
  });
  const malformedQueries = [
    "artist_id=%3Cscript%3E",
    "artist_id=artist%3A100&artist_id=artist%3A200",
    "cursor_artist_payments=abcd",
    "artist_id=artist%3A100&cursor_artist_unpaid=%24%24%24%24",
  ];
  for (const query of malformedQueries) {
    const response = await api(
      request(`/api/internal/artist-payouts/dashboard?${query}`, {
        token: "admin-token",
      }),
      deps,
    );
    assert.equal(response.status, 503);
    assert.deepEqual(await payload(response), {
      ok: false,
      error: "Artist payouts temporarily unavailable",
    });
  }
  assert.equal(calls, 0);
});

test("owner-only onboarding returns the source-bound link and separate one-time code", async () => {
  const response = await api(
    request("/api/internal/artist-payouts/onboarding", {
      method: "POST",
      headers: mutationHeaders(),
      body: {
        artistId: "artist_demo_123",
        confirmation: "INVITE artist_demo_123",
      },
    }),
  );
  assert.equal(response.status, 201);
  const body = await payload(response);
  assert.equal(
    body.invitationUrl,
    `${origin}/artist/payout-onboarding?claim=synthetic`,
  );
  assert.equal(body.challengeCode, "23456-789AB");
  assert.equal(body.invitationUrl.includes(body.challengeCode), false);
});

test("enforces owner role before approval, execution, reconciliation, or exception resolution", async () => {
  let calls = 0;
  const deps = dependencies({
    operations: {
      approveBatch: async () => {
        calls += 1;
        return batch();
      },
      executeBatch: async () => {
        calls += 1;
        return { batch: batch(), createdTransfers: [], failedLedgers: [] };
      },
      reconcilePayout: async () => {
        calls += 1;
        return {
          ledger: {
            ledgerId: "ledger_demo_123",
            state: "PAID",
            reconciled: true,
          },
          crm: null,
        };
      },
      resolveException: async () => {
        calls += 1;
      },
    },
  });
  const digest = `sha256:${"a".repeat(43)}`;
  const approve = await api(
    request("/api/internal/artist-payouts/batches/batch_demo_123/approve", {
      method: "POST",
      headers: mutationHeaders("admin-token"),
      body: {
        expectedDigest: digest,
        expectedRevision: 0,
        confirmation: "APPROVE batch_demo_123",
      },
    }),
    deps,
  );
  const resolve = await api(
    request(
      "/api/internal/artist-payouts/exceptions/exception_demo_123/resolve",
      {
        method: "POST",
        headers: mutationHeaders("admin-token"),
        body: { confirmation: "RESOLVE exception_demo_123" },
      },
    ),
    deps,
  );
  const execute = await api(
    request("/api/internal/artist-payouts/batches/batch_demo_123/execute", {
      method: "POST",
      headers: mutationHeaders("admin-token"),
      body: {
        expectedDigest: digest,
        expectedRevision: 1,
        confirmation: "EXECUTE batch_demo_123",
      },
    }),
    deps,
  );
  const reconcile = await api(
    request("/api/internal/artist-payouts/ledgers/ledger_demo_123/reconcile", {
      method: "POST",
      headers: mutationHeaders("admin-token"),
      body: {
        payoutId: "po_Synthetic123456",
        confirmation: "RECONCILE ledger_demo_123",
      },
    }),
    deps,
  );
  assert.equal(approve.status, 403);
  assert.equal(resolve.status, 403);
  assert.equal(execute.status, 403);
  assert.equal(reconcile.status, 403);
  assert.equal(calls, 0);
});

test("fails mutation requests closed on origin, fetch-site, confirmation header, and idempotency key", async () => {
  const body = { scheduledDate: "2026-08-24" };
  const badHeaders = [
    { ...mutationHeaders("admin-token"), origin: "https://evil.example.test" },
    { ...mutationHeaders("admin-token"), "sec-fetch-site": "cross-site" },
    { ...mutationHeaders("admin-token"), "x-hfla-payout-request": "maybe" },
    { ...mutationHeaders("admin-token"), "idempotency-key": "" },
  ];
  for (const headers of badHeaders) {
    const response = await api(
      request("/api/internal/artist-payouts/batches/prepare", {
        method: "POST",
        headers,
        body,
      }),
    );
    assert.equal(response.status, 403);
    assert.deepEqual(await payload(response), {
      ok: false,
      error: "Action not permitted",
    });
  }
});

test("processing-day route defense accepts same-day Monday and Wednesday", async () => {
  for (const [scheduledDate, instant] of [
    ["2026-08-24", "2026-08-24T19:00:00.000Z"],
    ["2026-08-26", "2026-08-26T19:00:00.000Z"],
  ]) {
    let prepareCalls = 0;
    let executeCalls = 0;
    const deps = dependencies({
      now: () => new Date(instant),
      operations: {
        prepareBatch: async () => {
          prepareCalls += 1;
          return {
            batch: batch({ scheduledDate, status: "PREPARED" }),
            approvalDigest: `sha256:${"a".repeat(43)}`,
          };
        },
        assertExecutionProcessingDay: async (_env, _batchId, now) => {
          assertCurrentLosAngelesProcessingDay(scheduledDate, now);
        },
        executeBatch: async () => {
          executeCalls += 1;
          return {
            batch: batch({ scheduledDate, status: "COMPLETED" }),
            createdTransfers: [],
            failedLedgers: [],
          };
        },
      },
    });
    const prepared = await api(
      request("/api/internal/artist-payouts/batches/prepare", {
        method: "POST",
        headers: mutationHeaders("admin-token"),
        body: { scheduledDate },
      }),
      deps,
    );
    const executed = await api(
      request("/api/internal/artist-payouts/batches/batch_demo_123/execute", {
        method: "POST",
        headers: mutationHeaders(),
        body: {
          expectedDigest: `sha256:${"a".repeat(43)}`,
          expectedRevision: 1,
          confirmation: "EXECUTE batch_demo_123",
        },
      }),
      deps,
    );
    assert.equal(prepared.status, 201, scheduledDate);
    assert.equal(executed.status, 200, scheduledDate);
    assert.equal(prepareCalls, 1, scheduledDate);
    assert.equal(executeCalls, 1, scheduledDate);
  }
});

test("processing-day route defense rejects past, future, and weekend prepare and execute", async () => {
  const cases = [
    {
      label: "past",
      scheduledDate: "2026-08-19",
      instant: "2026-08-24T19:00:00.000Z",
    },
    {
      label: "future",
      scheduledDate: "2026-08-26",
      instant: "2026-08-24T19:00:00.000Z",
    },
    {
      label: "weekend",
      scheduledDate: "2026-08-22",
      instant: "2026-08-22T19:00:00.000Z",
    },
  ];
  for (const { label, scheduledDate, instant } of cases) {
    let prepareCalls = 0;
    let executeCalls = 0;
    const deps = dependencies({
      now: () => new Date(instant),
      operations: {
        prepareBatch: async () => {
          prepareCalls += 1;
          throw new Error("prepare must not run");
        },
        assertExecutionProcessingDay: async (_env, _batchId, now) => {
          assertCurrentLosAngelesProcessingDay(scheduledDate, now);
        },
        executeBatch: async () => {
          executeCalls += 1;
          throw new Error("execute must not run");
        },
      },
    });
    const prepared = await api(
      request("/api/internal/artist-payouts/batches/prepare", {
        method: "POST",
        headers: mutationHeaders("admin-token"),
        body: { scheduledDate },
      }),
      deps,
    );
    const executed = await api(
      request("/api/internal/artist-payouts/batches/batch_demo_123/execute", {
        method: "POST",
        headers: mutationHeaders(),
        body: {
          expectedDigest: `sha256:${"a".repeat(43)}`,
          expectedRevision: 1,
          confirmation: "EXECUTE batch_demo_123",
        },
      }),
      deps,
    );
    assert.equal(prepared.status, 409, `${label} prepare`);
    assert.equal(executed.status, 409, `${label} execute`);
    assert.equal(prepareCalls, 0, `${label} prepare calls`);
    assert.equal(executeCalls, 0, `${label} execute calls`);
  }
});

test("binds approval identity to the path and exact typed confirmation", async () => {
  let input;
  const deps = dependencies({
    operations: {
      approveBatch: async (_env, value) => {
        input = value;
        return batch({ batchId: value.batchId });
      },
    },
  });
  const digest = `sha256:${"a".repeat(43)}`;
  const tampered = await api(
    request("/api/internal/artist-payouts/batches/batch_demo_123/approve", {
      method: "POST",
      headers: mutationHeaders(),
      body: {
        batchId: "batch_other_123",
        expectedDigest: digest,
        expectedRevision: 0,
        confirmation: "APPROVE batch_demo_123",
      },
    }),
    deps,
  );
  assert.equal(tampered.status, 409);
  assert.equal(input, undefined);

  const wrongConfirmation = await api(
    request("/api/internal/artist-payouts/batches/batch_demo_123/approve", {
      method: "POST",
      headers: mutationHeaders(),
      body: {
        expectedDigest: digest,
        expectedRevision: 0,
        confirmation: "APPROVE batch_other_123",
      },
    }),
    deps,
  );
  assert.equal(wrongConfirmation.status, 409);

  const accepted = await api(
    request("/api/internal/artist-payouts/batches/batch_demo_123/approve", {
      method: "POST",
      headers: mutationHeaders(),
      body: {
        expectedDigest: digest,
        expectedRevision: 0,
        confirmation: "APPROVE batch_demo_123",
      },
    }),
    deps,
  );
  assert.equal(accepted.status, 200);
  assert.equal(input.batchId, "batch_demo_123");
  assert.equal(input.actor.role, "owner");
  assert.equal(Object.hasOwn(input, "amount"), false);
  assert.equal(Object.hasOwn(input, "destination"), false);
  assert.equal(Object.hasOwn(input, "environment"), false);
});

test("does not accept caller-selected live mode, destination, amount, or base URL", async () => {
  let calls = 0;
  const deps = dependencies({
    operations: {
      startOnboarding: async () => {
        calls += 1;
        throw new Error("must not run");
      },
      executeBatch: async () => {
        calls += 1;
        return {};
      },
    },
  });
  const onboarding = await api(
    request("/api/internal/artist-payouts/onboarding", {
      method: "POST",
      headers: mutationHeaders(),
      body: {
        artistId: "artist_demo_123",
        displayName: "Synthetic Artist",
        contactEmail: "artist@example.test",
        country: "US",
        legalEntityType: "individual",
        environment: "live",
        baseUrl: "https://evil.example.test",
      },
    }),
    deps,
  );
  assert.equal(onboarding.status, 409);

  const execute = await api(
    request("/api/internal/artist-payouts/batches/batch_demo_123/execute", {
      method: "POST",
      headers: mutationHeaders(),
      body: {
        expectedDigest: `sha256:${"a".repeat(43)}`,
        expectedRevision: 1,
        confirmation: "EXECUTE batch_demo_123",
        amount: 1,
        destination: "acct_Attacker123456",
        environment: "live",
      },
    }),
    deps,
  );
  assert.equal(execute.status, 409);
  assert.equal(calls, 0);
});

test("accepts only a CRM record identity and resolves all ledger facts server-side", async () => {
  let received;
  const deps = dependencies({
    operations: {
      ingestLedger: async (_env, input) => {
        received = input;
        return dependencies().operations.ingestLedger(_env, input);
      },
    },
  });
  const body = { crmRecordId: "crm_demo_123" };
  const response = await api(
    request("/api/internal/artist-payouts/ledger", {
      method: "POST",
      headers: mutationHeaders("admin-token"),
      body,
    }),
    deps,
  );
  assert.equal(response.status, 200);
  assert.equal(received.crmRecordId, "crm_demo_123");
  assert.equal(received.actor.role, "admin");
  assert.equal(Object.hasOwn(received, "amount"), false);
  assert.equal(Object.hasOwn(received, "destination"), false);

  const tampered = await api(
    request("/api/internal/artist-payouts/ledger", {
      method: "POST",
      headers: mutationHeaders("admin-token"),
      body: { ...body, connectedAccountId: "acct_Attacker123456" },
    }),
    deps,
  );
  assert.equal(tampered.status, 409);
});

test("manual payment requires an exact digest-bound owner phrase and forwards no caller-selected extras", async () => {
  const ledgerId = "ledger_demo_123";
  const exact = {
    ledgerId,
    expectedAmountCents: 12_500,
    method: "CHECK",
    reason: "Owner-approved legacy payment recovery",
    evidenceReference: "synthetic-evidence-001",
    memo: "Legacy artist payment",
  };
  const intentDigest = await manualPaymentIntentDigest(exact);
  let received;
  const deps = dependencies({
    operations: {
      recordManualPaymentException: async (_env, input) => {
        received = input;
        return dependencies().operations.recordManualPaymentException(
          _env,
          input,
        );
      },
    },
  });
  const wrong = await api(
    request(`/api/internal/artist-payouts/ledgers/${ledgerId}/manual-payment`, {
      method: "POST",
      headers: mutationHeaders(),
      body: {
        ...exact,
        ledgerId: undefined,
        intentDigest: `sha256-hex:${"0".repeat(64)}`,
        confirmation: `MANUAL ${ledgerId} sha256-hex:${"0".repeat(64)}`,
      },
    }),
    deps,
  );
  assert.equal(wrong.status, 409);
  assert.equal(received, undefined);

  const accepted = await api(
    request(`/api/internal/artist-payouts/ledgers/${ledgerId}/manual-payment`, {
      method: "POST",
      headers: mutationHeaders(),
      body: {
        expectedAmountCents: exact.expectedAmountCents,
        method: exact.method,
        reason: exact.reason,
        evidenceReference: exact.evidenceReference,
        memo: exact.memo,
        intentDigest,
        confirmation: `MANUAL ${ledgerId} ${intentDigest}`,
      },
    }),
    deps,
  );
  assert.equal(accepted.status, 200);
  assert.equal(received.intentDigest, intentDigest);
  assert.equal(received.actor.role, "owner");
  assert.equal(Object.hasOwn(received, "destination"), false);
});

test("owner-only activation, manual-intent cancellation, and ambiguous-transfer binding use exact path identities", async () => {
  const captured = [];
  const deps = dependencies({
    operations: {
      activateArtistPayoutAccount: async (_env, input) => {
        captured.push(["activate", input]);
        return dependencies().operations.activateArtistPayoutAccount(
          _env,
          input,
        );
      },
      cancelManualPaymentIntent: async (_env, input) => {
        captured.push(["cancel", input]);
        return dependencies().operations.cancelManualPaymentIntent(_env, input);
      },
      reconcileAmbiguousTransferOutcome: async (_env, input) => {
        captured.push(["bind", input]);
        return dependencies().operations.reconcileAmbiguousTransferOutcome(
          _env,
          input,
        );
      },
    },
  });
  const artistId = "artist_demo_123";
  const accountId = "acct_Synthetic123456";
  const ledgerId = "ledger_demo_123";
  const transferId = "tr_Synthetic123456";
  for (const shortIdentityEvidence of ["abc", "abcdefg"]) {
    const rejected = await api(
      request("/api/internal/artist-payouts/onboarding/activate", {
        method: "POST",
        headers: mutationHeaders(),
        body: {
          artistId,
          accountId,
          identityEvidenceReference: shortIdentityEvidence,
          confirmation: `ACTIVATE ${artistId} ${accountId} IDENTITY VERIFIED`,
        },
      }),
      deps,
    );
    assert.equal(rejected.status, 409);
  }
  assert.equal(captured.length, 0);
  const unsafeIdentityEvidence = await api(
    request("/api/internal/artist-payouts/onboarding/activate", {
      method: "POST",
      headers: mutationHeaders(),
      body: {
        artistId,
        accountId,
        identityEvidenceReference: "artist@example.test",
        confirmation: `ACTIVATE ${artistId} ${accountId} IDENTITY VERIFIED`,
      },
    }),
    deps,
  );
  assert.equal(unsafeIdentityEvidence.status, 409);
  assert.equal(captured.length, 0);
  const requests = [
    request("/api/internal/artist-payouts/onboarding/activate", {
      method: "POST",
      headers: mutationHeaders(),
      body: {
        artistId,
        accountId,
        identityEvidenceReference: "synthetic-owner-review-001",
        confirmation: `ACTIVATE ${artistId} ${accountId} IDENTITY VERIFIED`,
      },
    }),
    request(
      `/api/internal/artist-payouts/ledgers/${ledgerId}/manual-payment/cancel`,
      {
        method: "POST",
        headers: mutationHeaders(),
        body: { confirmation: `CANCEL MANUAL ${ledgerId}` },
      },
    ),
    request(
      `/api/internal/artist-payouts/ledgers/${ledgerId}/reconcile-transfer-outcome`,
      {
        method: "POST",
        headers: mutationHeaders(),
        body: {
          transferId,
          confirmation: `BIND ${ledgerId} ${transferId}`,
        },
      },
    ),
  ];
  for (const item of requests)
    assert.equal((await api(item, deps)).status, 200);
  assert.deepEqual(
    captured.map(([operation, input]) => [operation, input.actor.role]),
    [
      ["activate", "owner"],
      ["cancel", "owner"],
      ["bind", "owner"],
    ],
  );
});

test("reconciliation remains configured when new transfer creation is disabled", () => {
  const runtimeEnv = {
    PAYOUTS_D1: {},
    STRIPE_ARTIST_PAYOUTS_ENABLED: "true",
    STRIPE_ARTIST_TRANSFERS_ENABLED: "false",
    STRIPE_ARTIST_PAYOUTS_ENV: "sandbox",
    STRIPE_PAYOUTS_SANDBOX_SECRET_KEY: SYNTHETIC_STRIPE_TEST_KEY,
    STRIPE_PAYOUTS_SANDBOX_PLATFORM_ACCOUNT_ID: "acct_123456789012",
  };
  assert.equal(ARTIST_PAYOUT_RUNTIME_OPERATIONS.execute, "transfer");
  assert.equal(ARTIST_PAYOUT_RUNTIME_OPERATIONS.reconcile, "reconcile");
  assert.throws(
    () =>
      getPayoutRuntimeConfig(
        runtimeEnv,
        ARTIST_PAYOUT_RUNTIME_OPERATIONS.execute,
      ),
    /TRANSFERS_ENABLED/,
  );
  const reconcileConfig = getPayoutRuntimeConfig(
    runtimeEnv,
    ARTIST_PAYOUT_RUNTIME_OPERATIONS.reconcile,
  );
  assert.equal(reconcileConfig.environment, "sandbox");
  assert.equal(reconcileConfig.minimumReserveCents, null);
});

test("funding preview is read-only gated independently from transfer creation", () => {
  const base = {
    PAYOUTS_D1: {},
    STRIPE_ARTIST_PAYOUTS_ENABLED: "true",
    STRIPE_ARTIST_TRANSFERS_ENABLED: "false",
    STRIPE_ARTIST_PAYOUTS_ENV: "sandbox",
    STRIPE_PAYOUTS_SANDBOX_SECRET_KEY: SYNTHETIC_STRIPE_TEST_KEY,
    STRIPE_PAYOUTS_SANDBOX_PLATFORM_ACCOUNT_ID: "acct_123456789012",
    PAYOUT_MIN_RESERVE_CENTS: "50000",
  };
  assert.equal(ARTIST_PAYOUT_RUNTIME_OPERATIONS.preview, "preview");
  const preview = getPayoutRuntimeConfig(
    base,
    ARTIST_PAYOUT_RUNTIME_OPERATIONS.preview,
  );
  assert.equal(preview.environment, "sandbox");
  assert.equal(preview.minimumReserveCents, 50_000);
  assert.match(preview.stripeSecretKey, /^sk_test_/);

  assert.throws(
    () =>
      getPayoutRuntimeConfig(
        { ...base, STRIPE_ARTIST_PAYOUTS_ENABLED: "false" },
        "preview",
      ),
    /PAYOUTS_ENABLED/,
  );
  assert.throws(
    () =>
      getPayoutRuntimeConfig(
        {
          ...base,
          STRIPE_PAYOUTS_SANDBOX_SECRET_KEY: undefined,
          STRIPE_PAYOUTS_LIVE_SECRET_KEY: SYNTHETIC_STRIPE_LIVE_KEY,
        },
        "preview",
      ),
    /sandbox Stripe payout key/,
  );
  assert.throws(
    () =>
      getPayoutRuntimeConfig(
        { ...base, PAYOUT_MIN_RESERVE_CENTS: undefined },
        "preview",
      ),
    /PAYOUT_MIN_RESERVE_CENTS/,
  );
});

test("default batch preparation runtime uses the real read-only Stripe preview client", async () => {
  const db = new RuntimeTestD1();
  const repository = new PayoutRepository(db, "sandbox");
  const accountId = "acct_123456789012";
  const now = "2026-08-24T19:00:00.000Z";
  await repository.upsertArtistAccount({
    artistId: "artist:100",
    stripeAccountId: accountId,
    artistDisplayName: "Synthetic Artist",
    onboardingStatus: "PAYOUT_READY",
    requirementsStatus: "complete",
    transfersStatus: "active",
    payoutsStatus: "active",
    automaticPayoutsEnabled: true,
    payoutDestinationId: "ba_123456789012",
    payoutReadyApprovedAt: "2026-08-22T17:00:00.000Z",
    lastRequirementsCheckAt: "2026-08-22T17:00:00.000Z",
    onboardedAt: "2026-08-22T17:00:00.000Z",
    disabledReason: null,
    payoutExceptionFlag: false,
    now,
  });
  await repository.upsertLedger({
    draft: {
      ledgerId: "ledger:runtime:100",
      bookingId: "booking:runtime:100",
      assignmentId: "assignment:runtime:100",
      crmRecordId: "crm:runtime:100",
      crmRevision: "revision:1",
      artistId: "artist:100",
      artistName: "Synthetic Artist",
      eventName: "Synthetic Browser Event",
      eventDate: "2026-08-21",
      closeoutVerifiedAt: "2026-08-22T18:00:00.000Z",
      service: "Face painting",
      servicePayCents: 12_500,
      travelPayCents: 0,
      bonusCents: 0,
      adjustmentCents: 0,
      deductionCents: 0,
      totalApprovedPayCents: 12_500,
      environment: "sandbox",
      sourceRevision: 1,
      connectedAccountId: accountId,
      closeout: {
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
      },
    },
    state: "READY_FOR_OWNER_APPROVAL",
    closeoutStatus: "COMPLETE",
    batchEligibilityDate: "2026-08-24",
    paymentMemo:
      "HFL Artist Pay | booking:runtime:100 | Synthetic Artist | 2026-08-21 | Face painting | $125.00",
    actor: "admin@example.test",
    auditId: "audit:runtime:ledger",
    requestId: "request:runtime:ledger",
    now,
  });

  const originalFetch = globalThis.fetch;
  const stripeRequests = [];
  globalThis.fetch = async (url, init) => {
    const requestUrl = String(url);
    stripeRequests.push({
      url: requestUrl,
      method: init?.method,
      stripeAccount: new Headers(init?.headers).get("stripe-account"),
    });
    const body = requestUrl.includes("/external_accounts")
      ? {
          object: "list",
          data: [
            {
              id: "ba_123456789012",
              object: "bank_account",
              account: accountId,
              available_payout_methods: ["standard"],
              country: "US",
              currency: "usd",
              default_for_currency: true,
              last4: "6789",
              status: "new",
            },
          ],
          has_more: false,
          url: `/v1/accounts/${accountId}/external_accounts`,
        }
      : /\/v1\/account(?:\?|$)/.test(requestUrl)
        ? { id: accountId, object: "account" }
        : requestUrl.includes("/v1/balance_settings")
          ? {
              object: "balance_settings",
              payments: {
                payouts: {
                  schedule: {
                    interval: "weekly",
                    weekly_payout_days: ["monday", "wednesday"],
                  },
                  status: "enabled",
                },
              },
            }
          : {
              id: accountId,
              object: "v2.core.account",
              applied_configurations: ["recipient"],
              configuration: {
                recipient: {
                  applied: true,
                  capabilities: {
                    stripe_balance: {
                      stripe_transfers: {
                        status: "active",
                        status_details: [],
                      },
                      payouts: { status: "active", status_details: [] },
                    },
                  },
                },
              },
              created: "2026-08-22T12:00:00.000Z",
              livemode: false,
              dashboard: "express",
              defaults: {
                currency: "usd",
                responsibilities: {
                  fees_collector: "application",
                  losses_collector: "application",
                },
              },
              contact_email: "artist@example.test",
              metadata: {
                hfla_artist_id: "artist:100",
                hfla_environment: "sandbox",
                hfla_purpose: "artist_payout_recipient",
                hfla_recipient_provenance: `hmac-sha256:${"a".repeat(64)}`,
              },
              requirements: { entries: [] },
            };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "request-id": "req_test",
      },
    });
  };
  try {
    const prepared = await prepareBatchWithRuntimeStripe(
      {
        PAYOUTS_D1: db,
        STRIPE_ARTIST_PAYOUTS_ENABLED: "true",
        STRIPE_ARTIST_TRANSFERS_ENABLED: "false",
        STRIPE_ARTIST_PAYOUTS_ENV: "sandbox",
        STRIPE_PAYOUTS_SANDBOX_SECRET_KEY: SYNTHETIC_STRIPE_TEST_KEY,
        STRIPE_PAYOUTS_SANDBOX_PLATFORM_ACCOUNT_ID: accountId,
        PAYOUT_MIN_RESERVE_CENTS: "50000",
      },
      {
        scheduledDate: "2026-08-24",
        actor: { email: "admin@example.test", role: "admin" },
        requestId: "request:runtime:prepare",
      },
      { now: () => new Date(now) },
    );
    assert.equal(prepared.batch.status, "PREPARED");
    assert.equal(prepared.batch.itemCount, 1);
    assert.equal(prepared.batch.blockedItemCount, 0);
    assert.equal(stripeRequests.length, 4);
    assert.match(stripeRequests[0].url, /\/v1\/account$/);
    assert.match(stripeRequests[1].url, /\/v2\/core\/accounts\/acct_/);
    assert.match(stripeRequests[2].url, /\/v1\/balance_settings$/);
    assert.equal(stripeRequests[2].stripeAccount, accountId);
    assert.match(stripeRequests[3].url, /\/external_accounts/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("wires execution only after exact owner approval controls and returns a bounded result", async () => {
  let received;
  const deps = dependencies({
    operations: {
      executeBatch: async (_env, input) => {
        received = input;
        return {
          batch: batch({ batchId: input.batchId, status: "COMPLETED" }),
          createdTransfers: [{ ledgerId: "ledger_demo_123" }],
          failedLedgers: [],
        };
      },
    },
  });
  const response = await api(
    request("/api/internal/artist-payouts/batches/batch_demo_123/execute", {
      method: "POST",
      headers: mutationHeaders(),
      body: {
        expectedDigest: `sha256:${"a".repeat(43)}`,
        expectedRevision: 1,
        confirmation: "EXECUTE batch_demo_123",
      },
    }),
    deps,
  );
  assert.equal(response.status, 200);
  assert.equal(received.batchId, "batch_demo_123");
  assert.equal(received.actor.role, "owner");
  assert.deepEqual(await payload(response), {
    ok: true,
    batch: {
      batchId: "batch_demo_123",
      status: "COMPLETED",
      approvalDigest: `sha256:${"a".repeat(43)}`,
      approvalRevision: 1,
    },
    createdTransferCount: 1,
    failedTransferCount: 0,
  });
});

test("binds reconciliation to the ledger path and exact payout confirmation", async () => {
  let received;
  const deps = dependencies({
    operations: {
      reconcilePayout: async (_env, input) => {
        received = input;
        return {
          ledger: { ledgerId: input.ledgerId, state: "PAID", reconciled: true },
          crm: {
            recordId: "crm_demo_123",
            revision: "revision-2",
            requestId: "crm-request-1",
            recovered: false,
          },
        };
      },
    },
  });
  const tampered = await api(
    request("/api/internal/artist-payouts/ledgers/ledger_demo_123/reconcile", {
      method: "POST",
      headers: mutationHeaders(),
      body: {
        ledgerId: "ledger_other_123",
        payoutId: "po_Synthetic123456",
        confirmation: "RECONCILE ledger_demo_123",
      },
    }),
    deps,
  );
  assert.equal(tampered.status, 409);
  assert.equal(received, undefined);

  const wrongConfirmation = await api(
    request("/api/internal/artist-payouts/ledgers/ledger_demo_123/reconcile", {
      method: "POST",
      headers: mutationHeaders(),
      body: {
        payoutId: "po_Synthetic123456",
        confirmation: "RECONCILE ledger_other_123",
      },
    }),
    deps,
  );
  assert.equal(wrongConfirmation.status, 409);

  const accepted = await api(
    request("/api/internal/artist-payouts/ledgers/ledger_demo_123/reconcile", {
      method: "POST",
      headers: mutationHeaders(),
      body: {
        payoutId: "po_Synthetic123456",
        confirmation: "RECONCILE ledger_demo_123",
      },
    }),
    deps,
  );
  assert.equal(accepted.status, 200);
  assert.equal(received.ledgerId, "ledger_demo_123");
  assert.equal(received.payoutId, "po_Synthetic123456");
  assert.equal(received.actor.role, "owner");
  assert.equal(Object.hasOwn(received, "environment"), false);
  assert.equal(Object.hasOwn(received, "connectedAccountId"), false);
  assert.deepEqual(await payload(accepted), {
    ok: true,
    ledger: { ledgerId: "ledger_demo_123", state: "PAID", reconciled: true },
    crmVerified: true,
  });
});

test("owner destination variance route binds one exact ledger, payout, reason, and phrase", async () => {
  const ledgerId = "ledger_demo_123";
  const payoutId = "po_Synthetic123456";
  const reason = "Owner verified the exact replacement bank in Stripe.";
  let received;
  const deps = dependencies({
    operations: {
      approvePayoutDestinationVariance: async (_env, input) => {
        received = input;
        return dependencies().operations.approvePayoutDestinationVariance(
          _env,
          input,
        );
      },
    },
  });
  const endpoint = `/api/internal/artist-payouts/ledgers/${ledgerId}/approve-payout-destination-variance`;
  for (const body of [
    {
      payoutId,
      reason: "too short",
      confirmation: `APPROVE DESTINATION ${ledgerId} ${payoutId}`,
    },
    {
      payoutId,
      reason,
      confirmation: `APPROVE DESTINATION ${ledgerId} po_Other12345678`,
    },
    {
      payoutId,
      reason,
      confirmation: `APPROVE DESTINATION ${ledgerId} ${payoutId}`,
      approvedDestinationId: "ba_Attacker123456",
    },
  ]) {
    const rejected = await api(
      request(endpoint, {
        method: "POST",
        headers: mutationHeaders(),
        body,
      }),
      deps,
    );
    assert.equal(rejected.status, 409);
    assert.equal(received, undefined);
  }
  const forbidden = await api(
    request(endpoint, {
      method: "POST",
      headers: mutationHeaders("admin-token"),
      body: {
        payoutId,
        reason,
        confirmation: `APPROVE DESTINATION ${ledgerId} ${payoutId}`,
      },
    }),
    deps,
  );
  assert.equal(forbidden.status, 403);
  assert.equal(received, undefined);

  const accepted = await api(
    request(endpoint, {
      method: "POST",
      headers: mutationHeaders(),
      body: {
        payoutId,
        reason,
        confirmation: `APPROVE DESTINATION ${ledgerId} ${payoutId}`,
      },
    }),
    deps,
  );
  assert.equal(accepted.status, 200);
  assert.equal(received.ledgerId, ledgerId);
  assert.equal(received.payoutId, payoutId);
  assert.equal(received.reason, reason);
  assert.equal(received.actor.role, "owner");
  assert.equal(Object.hasOwn(received, "approvedDestinationId"), false);
  assert.equal(Object.hasOwn(received, "originalDestinationId"), false);
  const body = await payload(accepted);
  assert.equal(body.approval.ledgerId, ledgerId);
  assert.equal(body.approval.payoutId, payoutId);
  assert.equal(body.approval.originalDestinationId, "ba_123456789012");
  assert.equal(body.approval.approvedDestinationId, "ba_210987654321");
});

test("never reflects provider errors, secrets, or PII to API callers", async () => {
  const deps = dependencies({
    operations: {
      dashboard: async () => {
        throw new Error("sk_live_SECRET artist-private@example.test");
      },
    },
  });
  const response = await api(
    request("/api/internal/artist-payouts", { token: "admin-token" }),
    deps,
  );
  assert.equal(response.status, 503);
  const text = await response.text();
  assert.doesNotMatch(text, /sk_live|artist-private|SECRET/);
});

test("protects the internal Pages Function UI and blocks external resource loading", async () => {
  const pageDeps = {
    authenticate: async (candidate) => actorFor(candidate),
    dashboard: async () => emptyDashboard(),
  };
  const unauthenticated = await handleArtistPayoutPageRequest(
    {
      request: request("/internal/artist-payouts"),
      env: environment,
    },
    pageDeps,
  );
  assert.equal(unauthenticated.status, 401);
  assertProtectedHeaders(unauthenticated);

  const authenticated = await handleArtistPayoutPageRequest(
    {
      request: request("/internal/artist-payouts", { token: "admin-token" }),
      env: environment,
    },
    pageDeps,
  );
  assert.equal(authenticated.status, 200);
  assertProtectedHeaders(authenticated);
  const csp = authenticated.headers.get("content-security-policy") ?? "";
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /img-src 'none'/);
  assert.match(csp, /font-src 'none'/);
  assert.doesNotMatch(csp, /https?:/);
  assert.doesNotMatch(csp, /script-src 'unsafe-inline'/);
  const nonce = csp.match(/script-src 'nonce-([A-Za-z0-9_-]{24})'/)?.[1];
  assert.ok(nonce);
  const html = await authenticated.text();
  assert.match(html, new RegExp(`<script nonce="${nonce}">`));
  assert.match(html, /protected internal finance area/);
  assert.match(html, /Funding preview unavailable/);
  assert.match(html, /sha256-hex:/);
  assert.match(html, /expectedAmountCents'\?Number/);

  const varianceDashboard = emptyDashboard();
  varianceDashboard.openExceptions = [
    {
      exceptionId: "exception_destination_123",
      environment: "sandbox",
      ledgerId: "ledger_demo_123",
      batchId: "batch_demo_123",
      artistId: "artist_demo_123",
      bookingId: "booking_demo_123",
      assignmentId: "assignment_demo_123",
      exceptionType: "PAYOUT_DESTINATION_MISMATCH",
      reasonCode: "PAYOUT_DESTINATION_NOT_DURABLY_APPROVED",
      safeReason: "Stripe payout uses a replacement bank destination.",
      status: "OPEN",
      ownerActionRequired: "Verify the exact replacement bank payout.",
      lastAttemptAt: ROUTE_NOW,
      nextAllowedAttemptAt: null,
      stripeReference: "po_Synthetic123456",
      createdAt: ROUTE_NOW,
      resolvedAt: null,
      resolvedBy: null,
      resolutionEvidence: null,
    },
  ];
  const ownerPage = await handleArtistPayoutPageRequest(
    {
      request: request("/internal/artist-payouts", { token: "owner-token" }),
      env: environment,
    },
    {
      ...pageDeps,
      dashboard: async () => varianceDashboard,
    },
  );
  const ownerHtml = await ownerPage.text();
  assert.match(
    ownerHtml,
    /ledgers\/ledger_demo_123\/approve-payout-destination-variance/,
  );
  assert.match(
    ownerHtml,
    /APPROVE DESTINATION ledger_demo_123 po_Synthetic123456/,
  );
  assert.match(ownerHtml, /name="reason" minlength="12" maxlength="240"/);
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
console.log(`\nArtist payout HTTP routes: ${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exitCode = 1;
