#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { renderArtistPayoutAdmin } from "../../src/lib/artist-payouts/admin-ui.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const outputDir = path.join(repoRoot, "output", "playwright");
mkdirSync(outputDir, { recursive: true });
const session = `hfla-payout-${process.pid}`;
const nonce = "abcdefghijklmnopqrstuvwx";
const batchId = "batch_browser_demo_20260824";
const operations = [];

function profileLedger(overrides = {}) {
  return {
    ledgerId: "ledger_browser_profile_1",
    artistId: "artist_browser_demo",
    artistName: "Synthetic Artist",
    bookingId: "booking_browser_profile_1",
    assignmentId: "assignment_browser_profile_1",
    eventName: "Synthetic Profile Celebration",
    eventDate: "2026-08-20",
    service: "Face painting",
    totalApprovedPayCents: 12_500,
    state: "READY_FOR_OWNER_APPROVAL",
    batchId: null,
    stripeTransferId: null,
    stripePayoutId: null,
    expectedArrival: null,
    reconciled: false,
    ...overrides,
  };
}

function snapshot(selectedArtistId = null) {
  const account = {
    artistId: "artist_browser_demo",
    environment: "sandbox",
    stripeAccountId: "acct_123456789012",
    artistDisplayName: "Synthetic Artist",
    onboardingStatus: "RESTRICTED",
    requirementsStatus: "currently_due",
    transfersStatus: "inactive",
    payoutsStatus: "inactive",
    dashboardType: "express",
    preferredPayoutType: "automatic_standard",
    payoutDestinationId: "ba_123456789012",
    payoutReadyApprovedAt: null,
    lastRequirementsCheckAt: "2026-08-24T18:00:00.000Z",
    onboardedAt: "2026-08-24T18:00:00.000Z",
    disabledReason: "requirements.past_due",
    payoutExceptionFlag: true,
    createdAt: "2026-08-24T18:00:00.000Z",
    updatedAt: "2026-08-24T18:00:00.000Z",
  };
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
    fundingPreviewError: {
      code: "STRIPE_BALANCE_UNAVAILABLE",
      checkedAt: "2026-08-24T19:00:00.000Z",
    },
    stateTotals: [
      { state: "READY_FOR_OWNER_APPROVAL", count: 1, amountCents: 12_500 },
    ],
    onboardingTotals: [{ status: "PAYOUT_READY", count: 1 }],
    batches: [
      {
        batchId,
        environment: "sandbox",
        scheduledDate: "2026-08-24",
        status: "PREPARED",
        currency: "usd",
        itemCount: 1,
        blockedItemCount: 0,
        remainingCandidateCount: 1,
        totalCents: 12_500,
        availableBalanceCents: null,
        minimumReserveCents: null,
        projectedBalanceCents: null,
        approvalDigest: `sha256:${"a".repeat(43)}`,
        approvalRevision: 0,
        createdBy: "admin@example.test",
        approvedBy: null,
        approvalTimestamp: null,
        executionClaimToken: null,
        executionStartedAt: null,
        executionCompletedAt: null,
        recoveryProcessingDate: null,
        recoveryAuthorizedBy: null,
        recoveryAuthorizedAt: null,
        recoveryReason: null,
        lastExecutionDate: null,
        createdAt: "2026-08-24T18:00:00.000Z",
        updatedAt: "2026-08-24T18:00:00.000Z",
      },
    ],
    batchReviewItems: [
      {
        batchId,
        ledgerId: "ledger_browser_demo",
        artistId: "artist_browser_demo",
        artistName: "Synthetic Artist",
        eventName: "Synthetic Browser Celebration",
        bookingId: "booking_browser_demo",
        assignmentId: "assignment_browser_demo",
        eventDate: "2026-08-21",
        closeoutVerifiedAt: "2026-08-22T18:00:00.000Z",
        service: "Face painting",
        servicePayCents: 12_500,
        travelPayCents: 0,
        bonusCents: 0,
        adjustmentCents: 0,
        deductionCents: 0,
        totalCents: 12_500,
        connectedAccountId: "acct_123456789012",
        closeoutStatus: "COMPLETE",
        stripeReadiness: "PAYOUT_READY",
        eligibilityState: "READY_FOR_OWNER_APPROVAL",
        exceptionCount: 0,
        scheduledDate: "2026-08-24",
        snapshotMatches: true,
        itemStatus: "PREPARED",
      },
    ],
    batchBlockedItems: [],
    ledgers: [],
    recentTransfers: [],
    openExceptions: [],
    artistAccounts: [account],
    artistProfileMetrics: [
      {
        artistId: "artist_browser_demo",
        unpaidAssignmentCount: 3,
        unpaidAmountCents: 37_500,
        assignmentCount: 8,
        paidAssignmentCount: 5,
        openExceptionCount: 1,
      },
    ],
    selectedArtistProfile:
      selectedArtistId === account.artistId
        ? {
            artistId: account.artistId,
            account,
            metrics: {
              unpaidAssignmentCount: 3,
              unpaidAmountCents: 37_500,
              assignmentCount: 8,
              paidAssignmentCount: 5,
              openExceptionCount: 1,
            },
            collectionPages: {
              unpaidAssignments: {
                totalCount: 3,
                returnedCount: 1,
                hasMore: true,
                nextCursor: "profile_unpaid_cursor_2",
              },
              paymentHistory: {
                totalCount: 8,
                returnedCount: 1,
                hasMore: true,
                nextCursor: "profile_payment_cursor_2",
              },
              openExceptions: {
                totalCount: 1,
                returnedCount: 1,
                hasMore: false,
                nextCursor: null,
              },
            },
            unpaidAssignments: [profileLedger()],
            paymentHistory: [
              profileLedger({
                ledgerId: "ledger_browser_paid_1",
                bookingId: "booking_browser_paid_1",
                assignmentId: "assignment_browser_paid_1",
                state: "PAID",
                batchId: "batch_browser_paid_1",
                stripeTransferId: "tr_123456789012",
                stripePayoutId: "po_123456789012",
                expectedArrival: "2026-08-25",
                reconciled: true,
              }),
            ],
            openExceptions: [
              {
                exceptionId: "exception_browser_profile_1",
                artistId: account.artistId,
                bookingId: "booking_browser_profile_1",
                assignmentId: "assignment_browser_profile_1",
                exceptionType: "SYNTHETIC_PROFILE_REVIEW",
                reasonCode: "REQUIREMENTS_PAST_DUE",
                safeReason: "Stripe requirements remain past due",
                status: "OPEN",
                ownerActionRequired: "Review the artist requirements",
                createdAt: "2026-08-24T18:30:00.000Z",
              },
            ],
          }
        : null,
    activeRosterCount: null,
    onboardingQueueUnavailable: true,
    onboardingQueue: [],
    auditHistory: [],
    webhookBacklog: { received: 0, processing: 0, failed: 0 },
    failedWebhookEvents: [],
    lastReconciliationAt: null,
  };
}

function cli(args) {
  return new Promise((resolve, reject) => {
    const cliPath = path.join(
      repoRoot,
      "node_modules",
      "@playwright",
      "cli",
      "playwright-cli.js",
    );
    const child = spawn(
      process.execPath,
      [cliPath, "--raw", `-s=${session}`, ...args],
      {
        cwd: outputDir,
        windowsHide: true,
        shell: false,
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Playwright CLI ${args[0]} failed (${code}): ${stderr || stdout}`,
          ),
        );
        return;
      }
      resolve(stdout);
    });
  });
}

function refFor(snapshotText, label) {
  const line = snapshotText
    .split(/\r?\n/)
    .find(
      (candidate) =>
        candidate.includes(label) && /\[ref=[A-Za-z0-9_-]+\]/.test(candidate),
    );
  const match = line?.match(/\[ref=([A-Za-z0-9_-]+)\]/);
  if (!match) {
    throw new Error(`Browser snapshot omitted ${label}:\n${snapshotText}`);
  }
  return match[1];
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  if (
    request.method === "GET" &&
    requestUrl.pathname === "/internal/artist-payouts"
  ) {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(
      renderArtistPayoutAdmin(
        snapshot(requestUrl.searchParams.get("artist_id")),
        { email: "owner@example.test", role: "owner" },
        nonce,
      ),
    );
    return;
  }
  if (
    request.method === "POST" &&
    request.url?.startsWith("/api/internal/artist-payouts/")
  ) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    operations.push({
      url: request.url,
      body,
      confirmationHeader: request.headers["x-hfla-payout-request"],
      idempotencyKey: request.headers["idempotency-key"],
    });
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify({ ok: true, batch: { batchId } }));
    return;
  }
  response.writeHead(404, { "content-type": "text/plain" });
  response.end("not found");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const pageUrl = `http://127.0.0.1:${address.port}/internal/artist-payouts`;

try {
  await cli(["open", pageUrl]);
  let pageSnapshot = await cli(["snapshot"]);
  assert.match(pageSnapshot, /Artist Payments/);
  assert.match(pageSnapshot, /Synthetic Browser Celebration/);
  assert.match(pageSnapshot, /PREPARE ANOTHER BATCH/);
  assert.match(pageSnapshot, /STRIPE_BALANCE_UNAVAILABLE/);

  await cli(["click", refFor(pageSnapshot, "View complete profile")]);
  pageSnapshot = await cli(["snapshot"]);
  assert.match(pageSnapshot, /Focused artist profile/);
  assert.match(pageSnapshot, /Synthetic Profile Celebration/);
  assert.match(pageSnapshot, /booking_browser_paid_1/);
  assert.match(pageSnapshot, /requirements\.past_due/);
  assert.match(pageSnapshot, /Stripe requirements remain past due/);
  assert.match(pageSnapshot, /Exact artist total: 8/);
  assert.match(pageSnapshot, /artist_id=artist_browser_demo/);
  assert.doesNotMatch(pageSnapshot, /other_assignment_private/);

  await cli([
    "fill",
    refFor(pageSnapshot, "Monday or Wednesday processing date"),
    "2026-08-24",
  ]);
  await cli([
    "click",
    refFor(pageSnapshot, "Prepare eligible assignments for owner review"),
  ]);
  pageSnapshot = await cli(["snapshot"]);
  await cli([
    "fill",
    refFor(pageSnapshot, `Type APPROVE ${batchId}`),
    `APPROVE ${batchId}`,
  ]);
  await cli([
    "click",
    refFor(pageSnapshot, "Record owner approval for 1 transfers"),
  ]);
  await cli(["resize", "390", "844"]);
  pageSnapshot = await cli(["snapshot"]);
  assert.match(pageSnapshot, /Artist payout profiles/);
  assert.match(
    pageSnapshot,
    /Stable newest-first pages with an exact global total/,
  );

  assert.equal(operations.length, 2);
  assert.equal(
    operations[0].url,
    "/api/internal/artist-payouts/batches/prepare",
  );
  assert.deepEqual(operations[0].body, { scheduledDate: "2026-08-24" });
  assert.equal(
    operations[1].url,
    `/api/internal/artist-payouts/batches/${batchId}/approve`,
  );
  assert.equal(operations[1].body.confirmation, `APPROVE ${batchId}`);
  for (const operation of operations) {
    assert.equal(operation.confirmationHeader, "owner-confirmed");
    assert.match(operation.idempotencyKey, /^ui:[a-z-]+:/);
  }
  const errors = await cli(["console", "error"]);
  assert.doesNotMatch(errors, /TypeError|ReferenceError|SyntaxError/);
  console.log(
    "Artist payout browser E2E: PASS (real Chromium, desktop + mobile, prepare + approve)",
  );
} finally {
  await cli(["close"]).catch(() => undefined);
  await new Promise((resolve) => server.close(resolve));
}
