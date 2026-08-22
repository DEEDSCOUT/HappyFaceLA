#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";

import { syncCrmPayoutProjection } from "../../src/lib/artist-payouts/crm-adapter.ts";
import {
  APPS_SCRIPT_TEST_SECRET,
  assertValidAppsScriptRequest,
  parseAppsScriptRequest,
  signedAppsScriptResponse,
} from "./apps-script-test-helpers.mjs";

function projection(overrides = {}) {
  return {
    environment: "sandbox",
    ledgerId: "ledger_A01",
    bookingId: "booking_A01",
    assignmentId: "assignment_A01",
    artistId: "artist_A01",
    sourceRevision: 3,
    expectedCrmRecordId: "artist-payment-record-1",
    expectedCrmRevision: "crm-revision-41",
    state: "PAYOUT_PENDING",
    batchId: "batch_20260819",
    batchDate: "2026-08-19",
    currency: "usd",
    amountCents: 22_750,
    connectedAccountId: "acct_123456789012",
    transferId: "tr_123456789012",
    payoutId: "po_123456789012",
    payoutStatus: "pending",
    reconciled: false,
    reconciledAt: null,
    manualPayment: null,
    lastVerifiedAt: "2026-08-19T17:00:00.000Z",
    ...overrides,
  };
}

const config = {
  writeUrl: "https://crm-adapter.example.test/write",
  readUrl: "https://crm-adapter.example.test/read",
  allowedOrigin: "https://crm-adapter.example.test",
  secret: APPS_SCRIPT_TEST_SECRET,
};

const storedProjection = (source) => {
  const {
    expectedCrmRecordId: _recordIgnored,
    expectedCrmRevision: _revisionIgnored,
    ...stored
  } = source;
  return stored;
};

function readDescriptor(source) {
  return JSON.stringify({
    operation: "artist_payout_read_v1",
    environment: source.environment,
    ledgerId: source.ledgerId,
    bookingId: source.bookingId,
    assignmentId: source.assignmentId,
    expectedRecordId: source.expectedCrmRecordId,
  });
}

async function verifyCrmRequest(url, init, source) {
  const request = parseAppsScriptRequest(url, init);
  if (request.method === "GET") {
    assert.equal(request.endpoint.pathname, "/read");
    assert.deepEqual(request.business, {
      environment: source.environment,
      ledgerId: source.ledgerId,
      bookingId: source.bookingId,
      assignmentId: source.assignmentId,
      recordId: source.expectedCrmRecordId,
    });
    await assertValidAppsScriptRequest({
      url,
      init,
      businessDescriptor: readDescriptor(source),
      operation: "artist_payout_read_v1",
    });
  } else {
    assert.equal(request.endpoint.pathname, "/write");
    assert.deepEqual(Object.keys(request.payload).sort(), [
      "expectedRecordId",
      "expectedRevision",
      "operation",
      "projection",
    ]);
    await assertValidAppsScriptRequest({
      url,
      init,
      businessDescriptor: JSON.stringify(request.payload),
      operation: "artist_payout_projection_v1",
    });
  }
  return request;
}

async function signedCrmResponse(url, init, source, payloadOrFactory) {
  await verifyCrmRequest(url, init, source);
  return signedAppsScriptResponse(url, init, payloadOrFactory);
}

function successPayload(source, revision, requestId, projectionValue) {
  return {
    ok: true,
    recordId: source.expectedCrmRecordId,
    revision,
    requestId,
    ...(projectionValue === undefined ? {} : { projection: projectionValue }),
  };
}

test("pre-reads, writes, and independently reads back exact safe fields", async () => {
  const source = projection();
  const calls = [];
  const receipt = await syncCrmPayoutProjection(
    source,
    config,
    async (url, init) => {
      calls.push({ url: String(url), init });
      if (init.method === "GET" && calls.length === 1) {
        return signedCrmResponse(url, init, source, ({ auth }) =>
          successPayload(
            source,
            source.expectedCrmRevision,
            auth.requestId,
            {},
          ),
        );
      }
      if (init.method === "POST") {
        return signedCrmResponse(url, init, source, ({ auth }) =>
          successPayload(source, "crm-revision-42", auth.requestId),
        );
      }
      return signedCrmResponse(url, init, source, ({ auth }) =>
        successPayload(
          source,
          "crm-revision-42",
          auth.requestId,
          Object.fromEntries(
            Object.entries(storedProjection(source)).reverse(),
          ),
        ),
      );
    },
  );
  const finalRequest = parseAppsScriptRequest(
    calls.at(-1).url,
    calls.at(-1).init,
  );
  assert.deepEqual(receipt, {
    recordId: source.expectedCrmRecordId,
    revision: "crm-revision-42",
    requestId: finalRequest.auth.requestId,
    recovered: false,
  });
  assert.equal(calls.length, 3);
  const post = parseAppsScriptRequest(calls[1].url, calls[1].init);
  assert.equal(post.payload.operation, "artist_payout_projection_v1");
  assert.equal(post.payload.expectedRecordId, source.expectedCrmRecordId);
  assert.deepEqual(Object.keys(post.payload.projection), [
    "environment",
    "ledgerId",
    "bookingId",
    "assignmentId",
    "artistId",
    "sourceRevision",
    "state",
    "batchId",
    "batchDate",
    "currency",
    "amountCents",
    "connectedAccountId",
    "transferId",
    "payoutId",
    "payoutStatus",
    "reconciled",
    "reconciledAt",
    "manualPayment",
    "lastVerifiedAt",
  ]);
  assert.equal("expectedCrmRecordId" in post.payload.projection, false);
  assert.equal("expectedCrmRevision" in post.payload.projection, false);
  assert.equal(JSON.stringify(post.payload).includes("bank"), false);
  assert.equal(JSON.stringify(post.payload).includes("email"), false);
});

test("retry recognizes an exact already-applied revision without a duplicate write", async () => {
  const source = projection();
  let calls = 0;
  const receipt = await syncCrmPayoutProjection(
    source,
    config,
    async (url, init) => {
      calls += 1;
      assert.equal(init.method, "GET");
      return signedCrmResponse(url, init, source, ({ auth }) =>
        successPayload(
          source,
          "crm-revision-42",
          auth.requestId,
          storedProjection(source),
        ),
      );
    },
  );
  assert.equal(calls, 1);
  assert.equal(receipt.recovered, true);
  assert.equal(receipt.revision, "crm-revision-42");
});

test("recovers when write commits but the response is lost", async () => {
  const source = projection();
  let reads = 0;
  let writes = 0;
  const receipt = await syncCrmPayoutProjection(
    source,
    config,
    async (url, init) => {
      if (init.method === "GET") {
        reads += 1;
        return signedCrmResponse(url, init, source, ({ auth }) =>
          reads === 1
            ? successPayload(
                source,
                source.expectedCrmRevision,
                auth.requestId,
                {},
              )
            : successPayload(
                source,
                "crm-revision-42",
                auth.requestId,
                storedProjection(source),
              ),
        );
      }
      writes += 1;
      await verifyCrmRequest(url, init, source);
      throw new Error("synthetic connection reset after commit");
    },
  );
  assert.equal(writes, 1);
  assert.equal(reads, 2);
  assert.equal(receipt.recovered, true);
});

test("true revision mismatch fails closed before write", async () => {
  const source = projection();
  let writes = 0;
  await assert.rejects(
    syncCrmPayoutProjection(source, config, async (url, init) => {
      if (init.method === "POST") writes += 1;
      return signedCrmResponse(url, init, source, ({ auth }) =>
        successPayload(source, "crm-revision-99", auth.requestId, {
          ...storedProjection(source),
          state: "PAID",
        }),
      );
    }),
    /revision conflict/,
  );
  assert.equal(writes, 0);
});

test("readback mismatch after write fails closed", async () => {
  const source = projection();
  let calls = 0;
  await assert.rejects(
    syncCrmPayoutProjection(source, config, async (url, init) => {
      calls += 1;
      if (init.method === "GET" && calls === 1) {
        return signedCrmResponse(url, init, source, ({ auth }) =>
          successPayload(
            source,
            source.expectedCrmRevision,
            auth.requestId,
            {},
          ),
        );
      }
      if (init.method === "POST") {
        return signedCrmResponse(url, init, source, ({ auth }) =>
          successPayload(source, "crm-revision-42", auth.requestId),
        );
      }
      return signedCrmResponse(url, init, source, ({ auth }) =>
        successPayload(source, "crm-revision-42", auth.requestId, {
          ...storedProjection(source),
          state: "PAID",
        }),
      );
    }),
    /independent readback/,
  );
});

test("wrong CRM record identity fails closed before any write", async () => {
  const source = projection();
  let writes = 0;
  await assert.rejects(
    syncCrmPayoutProjection(source, config, async (url, init) => {
      if (init.method === "POST") writes += 1;
      return signedCrmResponse(url, init, source, ({ auth }) => ({
        ok: true,
        recordId: "artist-payment-record-substituted",
        revision: source.expectedCrmRevision,
        requestId: auth.requestId,
        projection: {},
      }));
    }),
    /record identity conflict/,
  );
  assert.equal(writes, 0);
});

test("rejects unsafe configuration and malformed fields before network", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return Response.json({ ok: true });
  };
  await assert.rejects(
    syncCrmPayoutProjection(
      projection(),
      { ...config, allowedOrigin: "http://crm.example.test" },
      fetcher,
    ),
    /allowed origin/,
  );
  await assert.rejects(
    syncCrmPayoutProjection(
      projection(),
      { ...config, writeUrl: "https://evil.example.test/write" },
      fetcher,
    ),
    /allowlist/,
  );
  await assert.rejects(
    syncCrmPayoutProjection(
      projection(),
      { ...config, secret: "short" },
      fetcher,
    ),
    /secret/,
  );
  await assert.rejects(
    syncCrmPayoutProjection(projection({ transferId: "bad" }), config, fetcher),
    /transfer ID/,
  );
  await assert.rejects(
    syncCrmPayoutProjection(projection({ state: "UNKNOWN" }), config, fetcher),
    /state/,
  );
  assert.equal(calls, 0);
});

test("rejects every spreadsheet formula prefix in every manual-payment free-text field before network", async () => {
  const fields = [
    "method",
    "reason",
    "evidenceReference",
    "memo",
    "recordedBy",
  ];
  const prefixes = ["=", "+", "-", "@"];
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return Response.json({ ok: true });
  };
  const manualPayment = {
    method: "cash",
    reason: "Approved offline exception",
    evidenceReference: "synthetic_evidence_001",
    memo: "Synthetic manual payment",
    recordedBy: "owner_example_test",
    recordedAt: "2026-08-19T17:00:00.000Z",
  };
  for (const field of fields) {
    for (const prefix of prefixes) {
      await assert.rejects(
        syncCrmPayoutProjection(
          projection({
            manualPayment: {
              ...manualPayment,
              [field]: `${prefix}unsafe`,
            },
          }),
          config,
          fetcher,
        ),
        /manual payment evidence/,
      );
    }
  }
  assert.equal(calls, 0);
});
