import assert from "node:assert/strict";
import test from "node:test";

import { syncArtistRosterProjection } from "../../src/lib/artist-payouts/roster-projection-adapter.ts";
import {
  APPS_SCRIPT_TEST_SECRET,
  assertValidAppsScriptRequest,
  parseAppsScriptRequest,
  signedAppsScriptResponse,
} from "./apps-script-test-helpers.mjs";

const CONFIG = {
  readUrl: "https://roster-adapter.example.test/read",
  writeUrl: "https://roster-adapter.example.test/write",
  allowedOrigin: "https://roster-adapter.example.test",
  secret: APPS_SCRIPT_TEST_SECRET,
};

function projection(overrides = {}) {
  return {
    environment: "sandbox",
    artistId: "artist_A01",
    connectedAccountId: "acct_123456789012",
    onboardingStatus: "PAYOUT_READY",
    requirementsStatus: "complete",
    transfersEnabled: true,
    payoutReady: true,
    dashboardType: "express",
    preferredPayoutType: "automatic_standard",
    lastRequirementsCheckAt: "2026-08-22T19:00:00.000Z",
    onboardedDate: "2026-08-22",
    disabledReason: null,
    exceptionFlag: false,
    ...overrides,
  };
}

async function verifyRequest(url, init, expected) {
  const request = parseAppsScriptRequest(url, init);
  if (request.method === "GET") {
    assert.equal(request.endpoint.pathname, "/read");
    assert.deepEqual(request.business, {
      environment: expected.environment,
      artistId: expected.artistId,
    });
    await assertValidAppsScriptRequest({
      url,
      init,
      businessDescriptor: JSON.stringify({
        operation: "artist_roster_projection_read_v1",
        environment: expected.environment,
        artistId: expected.artistId,
      }),
      operation: "artist_roster_projection_read_v1",
    });
  } else {
    assert.equal(request.endpoint.pathname, "/write");
    assert.deepEqual(Object.keys(request.payload).sort(), [
      "expectedArtistId",
      "expectedRevision",
      "operation",
      "projection",
    ]);
    assert.deepEqual(request.payload.projection, expected);
    assert.deepEqual(Object.keys(request.payload.projection), [
      "environment",
      "artistId",
      "connectedAccountId",
      "onboardingStatus",
      "requirementsStatus",
      "transfersEnabled",
      "payoutReady",
      "dashboardType",
      "preferredPayoutType",
      "lastRequirementsCheckAt",
      "onboardedDate",
      "disabledReason",
      "exceptionFlag",
    ]);
    await assertValidAppsScriptRequest({
      url,
      init,
      businessDescriptor: JSON.stringify(request.payload),
      operation: "artist_roster_projection_v1",
    });
  }
  return request;
}

async function response(url, init, expected, payloadOrFactory) {
  await verifyRequest(url, init, expected);
  return signedAppsScriptResponse(url, init, payloadOrFactory);
}

function success(expected, revision, requestId, projectionValue) {
  return {
    ok: true,
    environment: expected.environment,
    artistId: expected.artistId,
    revision,
    requestId,
    ...(projectionValue === undefined ? {} : { projection: projectionValue }),
  };
}

test("CAS-writes the exact safe roster projection and independently reads it back", async () => {
  const expected = projection();
  const calls = [];
  const receipt = await syncArtistRosterProjection(
    expected,
    CONFIG,
    async (url, init) => {
      calls.push({ url: String(url), init });
      if (init.method === "GET" && calls.length === 1) {
        return response(url, init, expected, ({ auth }) =>
          success(expected, "roster-revision:v1:source", auth.requestId, {}),
        );
      }
      if (init.method === "POST") {
        const request = await verifyRequest(url, init, expected);
        assert.equal(
          request.payload.expectedRevision,
          "roster-revision:v1:source",
        );
        return signedAppsScriptResponse(url, init, ({ auth }) =>
          success(expected, "roster-projection:v1:applied", auth.requestId),
        );
      }
      return response(url, init, expected, ({ auth }) =>
        success(
          expected,
          "roster-projection:v1:applied",
          auth.requestId,
          expected,
        ),
      );
    },
  );
  assert.equal(calls.length, 3);
  assert.equal(receipt.artistId, expected.artistId);
  assert.equal(receipt.revision, "roster-projection:v1:applied");
  assert.equal(receipt.recovered, false);
});

test("an exact existing projection is recovered without a duplicate write", async () => {
  const expected = projection();
  let calls = 0;
  const receipt = await syncArtistRosterProjection(
    expected,
    CONFIG,
    async (url, init) => {
      calls += 1;
      assert.equal(init.method, "GET");
      return response(url, init, expected, ({ auth }) =>
        success(
          expected,
          "roster-projection:v1:existing",
          auth.requestId,
          expected,
        ),
      );
    },
  );
  assert.equal(calls, 1);
  assert.equal(receipt.recovered, true);
});

test("a committed write with a lost acknowledgement is recovered by readback", async () => {
  const expected = projection();
  let reads = 0;
  let writes = 0;
  const receipt = await syncArtistRosterProjection(
    expected,
    CONFIG,
    async (url, init) => {
      if (init.method === "POST") {
        writes += 1;
        await verifyRequest(url, init, expected);
        throw new Error("synthetic response loss");
      }
      reads += 1;
      return response(url, init, expected, ({ auth }) =>
        reads === 1
          ? success(expected, "roster-revision:v1:source", auth.requestId, {})
          : success(
              expected,
              "roster-projection:v1:applied",
              auth.requestId,
              expected,
            ),
      );
    },
  );
  assert.equal(reads, 2);
  assert.equal(writes, 1);
  assert.equal(receipt.recovered, true);
});

test("identity substitution and readback disagreement fail closed", async (t) => {
  const expected = projection();
  await t.test("identity", async () => {
    await assert.rejects(
      syncArtistRosterProjection(expected, CONFIG, async (url, init) =>
        signedAppsScriptResponse(url, init, ({ auth }) => ({
          ok: true,
          environment: "sandbox",
          artistId: "artist_B02",
          revision: "roster-revision:v1:source",
          requestId: auth.requestId,
          projection: {},
        })),
      ),
      /identity/,
    );
  });
  await t.test("readback", async () => {
    let calls = 0;
    await assert.rejects(
      syncArtistRosterProjection(expected, CONFIG, async (url, init) => {
        calls += 1;
        if (init.method === "GET" && calls === 1) {
          return response(url, init, expected, ({ auth }) =>
            success(expected, "roster-revision:v1:source", auth.requestId, {}),
          );
        }
        if (init.method === "POST") {
          return response(url, init, expected, ({ auth }) =>
            success(expected, "roster-projection:v1:applied", auth.requestId),
          );
        }
        return response(url, init, expected, ({ auth }) =>
          success(
            expected,
            "roster-projection:v1:other",
            auth.requestId,
            projection({ onboardingStatus: "RESTRICTED", exceptionFlag: true }),
          ),
        );
      }),
      /independent readback/,
    );
  });
});

test("contradictory projections and unsafe endpoints fail before network", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return Response.json({ ok: true });
  };
  await assert.rejects(
    syncArtistRosterProjection(
      projection({ payoutReady: false }),
      CONFIG,
      fetcher,
    ),
    /readiness state/,
  );
  await assert.rejects(
    syncArtistRosterProjection(
      projection({
        onboardingStatus: "RESTRICTED",
        requirementsStatus: "past_due",
        transfersEnabled: false,
        payoutReady: false,
        exceptionFlag: false,
      }),
      CONFIG,
      fetcher,
    ),
    /exception state/,
  );
  await assert.rejects(
    syncArtistRosterProjection(
      projection(),
      { ...CONFIG, writeUrl: "https://evil.example.test/write" },
      fetcher,
    ),
    /allowlist/,
  );
  await assert.rejects(
    syncArtistRosterProjection(
      projection(),
      { ...CONFIG, secret: "short" },
      fetcher,
    ),
    /secret/,
  );
  assert.equal(calls, 0);
});

test("rejects every spreadsheet formula prefix in roster free text before network", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return Response.json({ ok: true });
  };
  for (const prefix of ["=", "+", "-", "@"]) {
    await assert.rejects(
      syncArtistRosterProjection(
        projection({
          onboardingStatus: "RESTRICTED",
          requirementsStatus: "past_due",
          transfersEnabled: false,
          payoutReady: false,
          disabledReason: `${prefix}unsafe`,
          exceptionFlag: true,
        }),
        CONFIG,
        fetcher,
      ),
      /disabled reason/,
    );
  }
  assert.equal(calls, 0);
});

test("restricted status preserves an active transfer capability without claiming payout readiness", async () => {
  const expected = projection({
    onboardingStatus: "RESTRICTED",
    requirementsStatus: "past_due",
    transfersEnabled: true,
    payoutReady: false,
    disabledReason: "requirements_past_due",
    exceptionFlag: true,
  });
  const receipt = await syncArtistRosterProjection(
    expected,
    CONFIG,
    async (url, init) =>
      response(url, init, expected, ({ auth }) =>
        success(
          expected,
          "roster-projection:v1:restricted",
          auth.requestId,
          expected,
        ),
      ),
  );
  assert.equal(receipt.recovered, true);
});
