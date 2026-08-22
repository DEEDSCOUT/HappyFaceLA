import assert from "node:assert/strict";
import test from "node:test";
import {
  ARTIST_ROSTER_LIST_MAX_RESPONSE_BYTES,
  listActiveArtistIdentities,
  resolveActiveArtistIdentity,
} from "../../src/lib/artist-payouts/artist-roster-adapter.ts";
import { resolveCrmPayoutSource } from "../../src/lib/artist-payouts/crm-payout-source-adapter.ts";
import { canonicalSignedRead } from "../../src/lib/artist-payouts/signed-read-adapter.ts";
import {
  APPS_SCRIPT_TEST_SECRET,
  assertValidAppsScriptRequest,
  parseAppsScriptRequest,
  signedAppsScriptResponse,
} from "./apps-script-test-helpers.mjs";

const SECRET = APPS_SCRIPT_TEST_SECRET;
const TIMESTAMP = "2026-08-22T19:00:00.000Z";
const ORIGIN = "https://authoritative-source.example.test";
const ROSTER_CONFIG = {
  url: `${ORIGIN}/artist-roster`,
  allowedOrigin: ORIGIN,
  secret: SECRET,
  environment: "sandbox",
};
const ROSTER_LIST_CONFIG = {
  ...ROSTER_CONFIG,
  url: `${ORIGIN}/artist-roster-list`,
};
const CRM_CONFIG = {
  url: `${ORIGIN}/payout-ledger-source`,
  allowedOrigin: ORIGIN,
  secret: SECRET,
  environment: "sandbox",
};

function artist(overrides = {}) {
  return {
    artistId: "artist_A01",
    displayName: "Test Artist",
    contactEmail: "artist@example.test",
    country: "US",
    legalEntityType: "individual",
    active: true,
    revision: "roster-revision-17",
    ...overrides,
  };
}

function closeout(overrides = {}) {
  return {
    assignmentExists: true,
    bookingIdValid: true,
    assignmentIdValid: true,
    eventCompleted: true,
    actualEndTime: "2026-08-21T23:30:00.000Z",
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

function crmSource(overrides = {}) {
  return {
    recordId: "crm_record_A01",
    revision: "crm-revision-41",
    sourceRevision: 7,
    bookingId: "booking_A01",
    assignmentId: "assignment_A01",
    artistId: "artist_A01",
    artistName: "Test Artist",
    eventName: "Synthetic Celebration",
    eventDate: "2026-08-21",
    closeoutVerifiedAt: "2026-08-22T18:30:00.000Z",
    service: "Face painting",
    servicePayCents: 20_000,
    travelPayCents: 2_500,
    bonusCents: 500,
    adjustmentCents: -250,
    deductionCents: 0,
    totalApprovedPayCents: 22_750,
    priorPayment: {
      disposition: "CLEAR",
      reasonCodes: [],
      legacyPaymentMethodPresent: true,
      legacyPaymentHandlePresent: true,
    },
    closeout: closeout(),
    ...overrides,
  };
}

function options(requestId) {
  return {
    clock: { now: () => new Date(TIMESTAMP) },
    requestIdFactory: () => requestId,
  };
}

async function verifySourceRequest({
  url,
  init,
  operation,
  config,
  queryName,
  queryValue,
}) {
  const request = parseAppsScriptRequest(url, init);
  assert.equal(request.endpoint.origin, config.allowedOrigin);
  assert.equal(request.endpoint.pathname, new URL(config.url).pathname);
  assert.deepEqual(request.business, { [queryName]: queryValue });
  const canonicalQuery = new URLSearchParams([
    [queryName, queryValue],
  ]).toString();
  const descriptor = canonicalSignedRead({
    operation,
    origin: request.endpoint.origin,
    path: request.endpoint.pathname,
    canonicalQuery,
    timestamp: request.auth.timestamp,
    requestId: request.auth.requestId,
    environment: "sandbox",
  });
  return assertValidAppsScriptRequest({
    url,
    init,
    businessDescriptor: descriptor,
    secret: SECRET,
    operation,
  });
}

function rosterSummary(artistId, overrides = {}) {
  return {
    artistId,
    displayName: `Artist ${artistId}`,
    revision: `revision:${artistId}`,
    ...overrides,
  };
}

async function listRosterPages(pages, observeResponse) {
  let call = 0;
  let requestNumber = 0;
  const result = await listActiveArtistIdentities(
    ROSTER_LIST_CONFIG,
    async (url, init) => {
      const page = typeof pages === "function" ? pages(call) : pages[call];
      assert.ok(page, `Missing synthetic roster page ${call + 1}`);
      call += 1;
      const response = await signedAppsScriptResponse(
        url,
        init,
        ({ auth }) => ({
          ok: true,
          requestId: auth.requestId,
          environment: "sandbox",
          rosterRevision: "roster-list-revision-1",
          totalActiveCount: page.artists?.length ?? 0,
          artists: [],
          nextAfterArtistId: null,
          complete: true,
          ...page,
        }),
      );
      await observeResponse?.(response, call);
      return response;
    },
    {
      clock: { now: () => new Date(TIMESTAMP) },
      requestIdFactory: () => `roster_list_case_${++requestNumber}`,
    },
  );
  return { result, calls: call };
}

test("artist roster exact success uses canonical signed GET and returns only approved identity fields", async () => {
  const requestId = "read_artist_001";
  let calls = 0;
  const expectedArtist = artist();
  const result = await resolveActiveArtistIdentity(
    expectedArtist.artistId,
    ROSTER_CONFIG,
    async (url, init) => {
      calls += 1;
      const request = await verifySourceRequest({
        url,
        init,
        operation: "artist_roster_read_v1",
        config: ROSTER_CONFIG,
        queryName: "artistId",
        queryValue: "artist_A01",
      });
      assert.equal(request.auth.requestId, requestId);
      assert.equal(request.auth.timestamp, TIMESTAMP);
      assert.equal(init.body, undefined);
      assert.equal(
        `${String(url)}${String(init.body)}`.includes(SECRET),
        false,
      );
      return signedAppsScriptResponse(url, init, ({ auth }) => ({
        ok: true,
        requestId: auth.requestId,
        environment: "sandbox",
        artist: expectedArtist,
      }));
    },
    options(requestId),
  );
  assert.equal(calls, 1);
  assert.deepEqual(result, { environment: "sandbox", ...expectedArtist });
});

test("artist roster list retrieves a complete ordered summary-only onboarding inventory", async () => {
  const pages = [
    {
      artists: [
        {
          artistId: "artist_A01",
          displayName: "First Artist",
          revision: "roster-revision-1",
        },
      ],
      nextAfterArtistId: "artist_A01",
      complete: false,
    },
    {
      artists: [
        {
          artistId: "artist_B02",
          displayName: "Second Artist",
          revision: "roster-revision-2",
        },
      ],
      nextAfterArtistId: null,
      complete: true,
    },
  ];
  let call = 0;
  const result = await listActiveArtistIdentities(
    ROSTER_LIST_CONFIG,
    async (url, init) => {
      const expectedAfter = call === 0 ? "START" : "artist_A01";
      await verifySourceRequest({
        url,
        init,
        operation: "artist_roster_list_v1",
        config: ROSTER_LIST_CONFIG,
        queryName: "afterArtistId",
        queryValue: expectedAfter,
      });
      const page = pages[call++];
      return signedAppsScriptResponse(url, init, ({ auth }) => ({
        ok: true,
        requestId: auth.requestId,
        environment: "sandbox",
        rosterRevision: "roster-list-revision-1",
        totalActiveCount: 2,
        ...page,
      }));
    },
    {
      clock: { now: () => new Date(TIMESTAMP) },
      requestIdFactory: () => `roster_list_${call + 1}`,
    },
  );
  assert.equal(call, 2);
  assert.equal(result.totalActiveCount, 2);
  assert.deepEqual(
    result.artists.map(({ artistId, displayName }) => ({
      artistId,
      displayName,
    })),
    [
      { artistId: "artist_A01", displayName: "First Artist" },
      { artistId: "artist_B02", displayName: "Second Artist" },
    ],
  );
  assert.equal(Object.hasOwn(result.artists[0], "contactEmail"), false);
});

test("artist roster list admits a 120-character Artist ID and rejects 121 characters", async () => {
  const maxArtistId = `A${"a".repeat(119)}`;
  const accepted = await listRosterPages([
    {
      totalActiveCount: 1,
      artists: [rosterSummary(maxArtistId)],
    },
  ]);
  assert.equal(accepted.result.artists[0].artistId, maxArtistId);

  await assert.rejects(
    listRosterPages([
      {
        totalActiveCount: 1,
        artists: [rosterSummary(`A${"a".repeat(120)}`)],
      },
    ]),
    /identity is malformed/,
  );
});

test("artist roster list rejects revision and total-count drift between signed pages", async (t) => {
  for (const [name, secondPage] of [
    ["revision drift", { rosterRevision: "roster-list-revision-2" }],
    ["total drift", { totalActiveCount: 3 }],
  ]) {
    await t.test(name, async () => {
      await assert.rejects(
        listRosterPages([
          {
            totalActiveCount: 2,
            artists: [rosterSummary("artist_A01")],
            nextAfterArtistId: "artist_A01",
            complete: false,
          },
          {
            totalActiveCount: 2,
            artists: [rosterSummary("artist_B02")],
            ...secondPage,
          },
        ]),
        /changed during paginated retrieval/,
      );
    });
  }
});

test("artist roster list rejects duplicates and reordering within or across pages", async (t) => {
  const cases = [
    {
      name: "duplicate within one page",
      pages: [
        {
          totalActiveCount: 2,
          artists: [rosterSummary("artist_A01"), rosterSummary("artist_A01")],
        },
      ],
      expected: /not strictly ordered and unique/,
    },
    {
      name: "reordered within one page",
      pages: [
        {
          totalActiveCount: 2,
          artists: [rosterSummary("artist_B02"), rosterSummary("artist_A01")],
        },
      ],
      expected: /not strictly ordered and unique/,
    },
    {
      name: "reordered across pages",
      pages: [
        {
          totalActiveCount: 2,
          artists: [rosterSummary("artist_B02")],
          nextAfterArtistId: "artist_B02",
          complete: false,
        },
        {
          totalActiveCount: 2,
          artists: [rosterSummary("artist_A01")],
        },
      ],
      expected: /repeated or reordered an identity/,
    },
  ];
  for (const entry of cases) {
    await t.test(entry.name, async () => {
      await assert.rejects(listRosterPages(entry.pages), entry.expected);
    });
  }
});

test("artist roster list rejects contradictory continuation state", async (t) => {
  const cases = [
    {
      name: "incomplete page points anywhere but its last Artist ID",
      page: {
        totalActiveCount: 2,
        artists: [rosterSummary("artist_A01")],
        nextAfterArtistId: "artist_B02",
        complete: false,
      },
    },
    {
      name: "incomplete page is empty",
      page: {
        totalActiveCount: 1,
        artists: [],
        nextAfterArtistId: "artist_A01",
        complete: false,
      },
    },
    {
      name: "complete page supplies a continuation",
      page: {
        totalActiveCount: 1,
        artists: [rosterSummary("artist_A01")],
        nextAfterArtistId: "artist_A01",
        complete: true,
      },
    },
  ];
  for (const entry of cases) {
    await t.test(entry.name, async () => {
      await assert.rejects(
        listRosterPages([entry.page]),
        /continuation is contradictory/,
      );
    });
  }
});

test("artist roster list enforces total, page-size, final-count, and page-count bounds", async (t) => {
  await t.test("total above 10,000", async () => {
    await assert.rejects(
      listRosterPages([
        {
          totalActiveCount: 10_001,
          artists: [],
        },
      ]),
      /total is outside its safe bound/,
    );
  });
  await t.test("page above 100 rows", async () => {
    await assert.rejects(
      listRosterPages([
        {
          totalActiveCount: 101,
          artists: Array.from({ length: 101 }, (_, index) =>
            rosterSummary(`artist_${String(index).padStart(3, "0")}`),
          ),
        },
      ]),
      /page is outside its safe bound/,
    );
  });
  await t.test("final count differs from the declared total", async () => {
    await assert.rejects(
      listRosterPages([
        {
          totalActiveCount: 2,
          artists: [rosterSummary("artist_A01")],
        },
      ]),
      /total does not match the complete inventory/,
    );
  });
  await t.test("more than 100 incomplete pages", async () => {
    await assert.rejects(
      listRosterPages((index) => {
        const artistId = `artist_${String(index).padStart(3, "0")}`;
        return {
          totalActiveCount: 101,
          artists: [rosterSummary(artistId)],
          nextAfterArtistId: artistId,
          complete: false,
        };
      }),
      /exceeded its bounded page count/,
    );
  });
});

test("artist roster list accepts a worst-case 100-row UTF-8 JSON page under its named 192 KiB cap", async () => {
  const artists = Array.from({ length: 100 }, (_, index) =>
    rosterSummary(`A${String(index).padStart(3, "0")}_${"a".repeat(115)}`, {
      displayName: "\u0800".repeat(160),
      revision: "\u0801".repeat(200),
    }),
  );
  let responseBytes = 0;
  const { result } = await listRosterPages(
    [{ totalActiveCount: artists.length, artists }],
    async (response) => {
      responseBytes = (await response.clone().arrayBuffer()).byteLength;
    },
  );
  assert.ok(responseBytes > 64 * 1024);
  assert.ok(responseBytes <= ARTIST_ROSTER_LIST_MAX_RESPONSE_BYTES);
  assert.equal(result.artists.length, 100);
  assert.equal(
    result.artists.every((entry) => entry.artistId.length === 120),
    true,
  );
});

test("CRM payout source exact success preserves the authoritative finance formula and every closeout control", async () => {
  const requestId = "read_crm_001";
  const expectedSource = crmSource();
  const result = await resolveCrmPayoutSource(
    expectedSource.recordId,
    CRM_CONFIG,
    async (url, init) => {
      await verifySourceRequest({
        url,
        init,
        operation: "crm_payout_source_read_v1",
        config: CRM_CONFIG,
        queryName: "crmRecordId",
        queryValue: "crm_record_A01",
      });
      return signedAppsScriptResponse(url, init, ({ auth }) => ({
        ok: true,
        requestId: auth.requestId,
        environment: "sandbox",
        source: expectedSource,
      }));
    },
    options(requestId),
  );
  assert.deepEqual(result, { environment: "sandbox", ...expectedSource });
  assert.equal(Object.keys(result.closeout).length, 20);
});

test("both adapters reject substituted authoritative identities", async () => {
  await assert.rejects(
    resolveActiveArtistIdentity(
      "artist_A01",
      ROSTER_CONFIG,
      async (url, init) =>
        signedAppsScriptResponse(url, init, ({ auth }) => ({
          ok: true,
          requestId: auth.requestId,
          environment: "sandbox",
          artist: artist({ artistId: "artist_B02" }),
        })),
      options("read_artist_002"),
    ),
    /substituted artist identity/,
  );
  await assert.rejects(
    resolveCrmPayoutSource(
      "crm_record_A01",
      CRM_CONFIG,
      async (url, init) =>
        signedAppsScriptResponse(url, init, ({ auth }) => ({
          ok: true,
          requestId: auth.requestId,
          environment: "sandbox",
          source: crmSource({ recordId: "crm_record_B02" }),
        })),
      options("read_crm_002"),
    ),
    /substituted record identity/,
  );
});

test("CRM adapter rejects a tampered formula total", async () => {
  await assert.rejects(
    resolveCrmPayoutSource(
      "crm_record_A01",
      CRM_CONFIG,
      async (url, init) =>
        signedAppsScriptResponse(url, init, ({ auth }) => ({
          ok: true,
          requestId: auth.requestId,
          environment: "sandbox",
          source: crmSource({ totalApprovedPayCents: 99_999 }),
        })),
      options("read_crm_003"),
    ),
    /does not match its component amounts/,
  );
});

test("artist roster rejects inactive identities", async () => {
  await assert.rejects(
    resolveActiveArtistIdentity(
      "artist_A01",
      ROSTER_CONFIG,
      async (url, init) =>
        signedAppsScriptResponse(url, init, ({ auth }) => ({
          ok: true,
          requestId: auth.requestId,
          environment: "sandbox",
          artist: artist({ active: false }),
        })),
      options("read_artist_003"),
    ),
    /inactive/,
  );
});

test("unapproved response fields are rejected instead of accepting unsafe roster or finance data", async () => {
  await assert.rejects(
    resolveActiveArtistIdentity(
      "artist_A01",
      ROSTER_CONFIG,
      async (url, init) =>
        signedAppsScriptResponse(url, init, ({ auth }) => ({
          ok: true,
          requestId: auth.requestId,
          environment: "sandbox",
          artist: { ...artist(), taxId: "not-approved" },
        })),
      options("read_artist_004"),
    ),
    /unapproved fields/,
  );
  await assert.rejects(
    resolveCrmPayoutSource(
      "crm_record_A01",
      CRM_CONFIG,
      async (url, init) =>
        signedAppsScriptResponse(url, init, ({ auth }) => ({
          ok: true,
          requestId: auth.requestId,
          environment: "sandbox",
          source: { ...crmSource(), bankAccount: "not-approved" },
        })),
      options("read_crm_004"),
    ),
    /unapproved fields/,
  );
});

test("malformed identity and unsafe configuration fail before any network call", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return Response.json({ ok: true });
  };
  await assert.rejects(
    resolveActiveArtistIdentity("../artist", ROSTER_CONFIG, fetcher),
    /lookup ID/,
  );
  await assert.rejects(
    resolveActiveArtistIdentity(
      "artist_A01",
      {
        ...ROSTER_CONFIG,
        allowedOrigin: "http://authoritative-source.example.test",
      },
      fetcher,
    ),
    /allowed origin/,
  );
  await assert.rejects(
    resolveActiveArtistIdentity(
      "artist_A01",
      { ...ROSTER_CONFIG, url: "https://evil.example.test/roster" },
      fetcher,
    ),
    /allowlist/,
  );
  await assert.rejects(
    resolveCrmPayoutSource(
      "crm_record_A01",
      { ...CRM_CONFIG, url: `${CRM_CONFIG.url}?mode=unsafe` },
      fetcher,
    ),
    /canonical/,
  );
  await assert.rejects(
    resolveCrmPayoutSource(
      "crm_record_A01",
      { ...CRM_CONFIG, secret: "short" },
      fetcher,
    ),
    /HMAC secret/,
  );
  await assert.rejects(
    resolveCrmPayoutSource(
      "crm_record_A01",
      { ...CRM_CONFIG, timeoutMs: 31_000 },
      fetcher,
    ),
    /timeout/,
  );
  assert.equal(calls, 0);
});
