import assert from "node:assert/strict";
import test from "node:test";

import { handleArtistOnboardingRequest } from "../../functions/artist/payout-onboarding/[[path]].ts";
import {
  onboardingChallengeDigest,
  onboardingRecipientEmailBinding,
  signOnboardingClaim,
} from "../../src/lib/artist-payouts/onboarding-claim.ts";

const origin = "https://payouts.hfla.test";
const secret = "synthetic-onboarding-claim-secret-at-least-32-characters";
const initialNow = new Date("2026-08-22T09:00:00.000Z");
const challengeCode = "23456-789AB";
const recipientEmailBinding = await onboardingRecipientEmailBinding({
  secret,
  environment: "sandbox",
  artistId: "artist_A01",
  contactEmail: "artist@example.test",
});
const claimPayload = {
  version: 1,
  purpose: "artist-onboarding-claim",
  environment: "sandbox",
  artistId: "artist_A01",
  accountId: "acct_123456789012",
  nonce: "onboarding_claim_123456789012",
  rosterRevision: "roster-revision-7",
  recipientEmailBinding,
  expiresAt: "2026-08-23T09:00:00.000Z",
};

function cookieFrom(response, name) {
  const raw = response.headers.get("set-cookie") ?? "";
  const match = raw.match(new RegExp(`${name}=([^;,]+)`));
  return match ? `${name}=${match[1]}` : null;
}

async function fixture(overrides = {}) {
  let now = initialNow;
  let consumed = false;
  const calls = {
    consume: 0,
    links: 0,
    linkRecords: 0,
    rosterReads: 0,
  };
  const account = {
    artistId: claimPayload.artistId,
    environment: "sandbox",
    stripeAccountId: claimPayload.accountId,
    artistDisplayName: "Synthetic Artist",
    onboardingStatus: "REQUIREMENTS_PENDING",
    requirementsStatus: "pending",
    transfersStatus: "inactive",
    payoutsStatus: "inactive",
    dashboardType: "express",
    preferredPayoutType: "automatic_standard",
    lastRequirementsCheckAt: null,
    onboardedAt: null,
    disabledReason: null,
    payoutExceptionFlag: false,
    createdAt: initialNow.toISOString(),
    updatedAt: initialNow.toISOString(),
  };
  const runtime = {
    config: { environment: "sandbox", publicBaseUrl: origin },
    secret,
    repository: {
      getArtistAccount: async () => account,
      activateOnboardingSession: async (input) => {
        calls.consume += 1;
        assert.equal(input.rosterRevision, claimPayload.rosterRevision);
        const expectedChallengeDigest = await onboardingChallengeDigest({
          secret,
          environment: "sandbox",
          artistId: claimPayload.artistId,
          accountId: claimPayload.accountId,
          nonce: claimPayload.nonce,
          rosterRevision: claimPayload.rosterRevision,
          challengeCode,
        });
        if (input.challengeDigest !== expectedChallengeDigest)
          throw new Error("synthetic challenge rejected");
        if (consumed) throw new Error("synthetic claim already consumed");
        consumed = true;
        return true;
      },
      isOnboardingSessionActive: async () => overrides.sessionActive ?? true,
      recordOnboardingLinkCreated: async () => {
        calls.linkRecords += 1;
      },
    },
    stripe: {
      createOnboardingLink: async (input) => {
        calls.links += 1;
        assert.equal(input.accountId, claimPayload.accountId);
        assert.equal(
          input.refreshUrl,
          `${origin}/artist/payout-onboarding/refresh`,
        );
        return {
          url: `https://connect.stripe.com/setup/synthetic-${calls.links}`,
          expiresAt: 1_787_392_800,
        };
      },
      retrieveRecipientStatus: async () => ({
        accountId: claimPayload.accountId,
        requirementsStatus: "complete",
        transfersStatus: "active",
        payoutsStatus: "active",
        automaticPayoutsEnabled: true,
        payoutScheduleInterval: "weekly",
        payoutDestinationId: "ba_123456789012",
        currentlyDue: [],
        disabledReason: null,
      }),
    },
    resolveArtist: async (artistId) => {
      calls.rosterReads += 1;
      return {
        artistId,
        displayName: "Synthetic Artist",
        contactEmail: "artist@example.test",
        country: "US",
        legalEntityType: "individual",
        active: true,
        revision: overrides.rosterRevision ?? claimPayload.rosterRevision,
      };
    },
  };
  const dependencies = { now: () => now, runtime: () => runtime };
  const token = await signOnboardingClaim(claimPayload, secret);
  return {
    calls,
    token,
    dependencies,
    setNow: (value) => {
      now = value;
    },
  };
}

function context(request, path = "") {
  return { request, env: {}, params: { path } };
}

test("preview GET does not consume a claim or create a Stripe Account Link", async () => {
  const f = await fixture();
  const response = await handleArtistOnboardingRequest(
    context(new Request(`${origin}/artist/payout-onboarding?claim=${f.token}`)),
    f.dependencies,
  );
  assert.equal(response.status, 200);
  assert.equal(f.calls.consume, 0);
  assert.equal(f.calls.links, 0);
  assert.ok(cookieFrom(response, "__Host-hfla-payout-onboarding-confirm"));
});

test("same-origin confirmation POST consumes once and redirects without exposing the raw Account Link", async () => {
  const f = await fixture();
  const preview = await handleArtistOnboardingRequest(
    context(new Request(`${origin}/artist/payout-onboarding?claim=${f.token}`)),
    f.dependencies,
  );
  const confirmationCookie = cookieFrom(
    preview,
    "__Host-hfla-payout-onboarding-confirm",
  );
  assert.ok(confirmationCookie);
  const response = await handleArtistOnboardingRequest(
    context(
      new Request(`${origin}/artist/payout-onboarding`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: confirmationCookie,
          origin,
        },
        body: new URLSearchParams({
          claim: f.token,
          contactEmail: "artist@example.test",
          challengeCode,
        }),
      }),
    ),
    f.dependencies,
  );
  assert.equal(response.status, 303);
  assert.match(
    response.headers.get("location"),
    /^https:\/\/connect\.stripe\.com\//,
  );
  assert.equal(f.calls.consume, 1);
  assert.equal(f.calls.links, 1);
  assert.equal(f.calls.linkRecords, 1);
  assert.ok(cookieFrom(response, "__Host-hfla-payout-onboarding"));
  assert.equal((await response.text()).includes("connect.stripe.com"), false);
});

test("rejects a recipient email mismatch before consuming the invitation", async () => {
  const f = await fixture();
  const preview = await handleArtistOnboardingRequest(
    context(new Request(`${origin}/artist/payout-onboarding?claim=${f.token}`)),
    f.dependencies,
  );
  const confirmationCookie = cookieFrom(
    preview,
    "__Host-hfla-payout-onboarding-confirm",
  );
  const response = await handleArtistOnboardingRequest(
    context(
      new Request(`${origin}/artist/payout-onboarding`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: confirmationCookie,
          origin,
        },
        body: new URLSearchParams({
          claim: f.token,
          contactEmail: "wrong@example.test",
          challengeCode,
        }),
      }),
    ),
    f.dependencies,
  );
  assert.equal(response.status, 400);
  assert.equal(f.calls.consume, 0);
  assert.equal(f.calls.links, 0);
});

test("rejects an incorrect out-of-band challenge before creating a Stripe Account Link", async () => {
  const f = await fixture();
  const preview = await handleArtistOnboardingRequest(
    context(new Request(`${origin}/artist/payout-onboarding?claim=${f.token}`)),
    f.dependencies,
  );
  const confirmationCookie = cookieFrom(
    preview,
    "__Host-hfla-payout-onboarding-confirm",
  );
  const response = await handleArtistOnboardingRequest(
    context(
      new Request(`${origin}/artist/payout-onboarding`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: confirmationCookie,
          origin,
        },
        body: new URLSearchParams({
          claim: f.token,
          contactEmail: "artist@example.test",
          challengeCode: "ZZZZZ-ZZZZZ",
        }),
      }),
    ),
    f.dependencies,
  );
  assert.equal(response.status, 400);
  assert.equal(f.calls.consume, 1);
  assert.equal(f.calls.links, 0);
  assert.equal(f.calls.linkRecords, 0);
});

test("refresh GET is non-mutating and same-origin POST creates a replacement link", async () => {
  const f = await fixture();
  const sessionPayload = {
    ...claimPayload,
    purpose: "artist-onboarding-session",
    nonce: "session_123456789012",
    expiresAt: "2026-08-22T09:30:00.000Z",
  };
  const session = await signOnboardingClaim(sessionPayload, secret);
  const cookie = `__Host-hfla-payout-onboarding=${session}`;
  const preview = await handleArtistOnboardingRequest(
    context(
      new Request(`${origin}/artist/payout-onboarding/refresh`, {
        headers: { cookie },
      }),
      "refresh",
    ),
    f.dependencies,
  );
  assert.equal(preview.status, 200);
  assert.equal(f.calls.links, 0);
  const redirect = await handleArtistOnboardingRequest(
    context(
      new Request(`${origin}/artist/payout-onboarding/refresh`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie,
          origin,
        },
        body: "",
      }),
      "refresh",
    ),
    f.dependencies,
  );
  assert.equal(redirect.status, 303);
  assert.equal(f.calls.links, 1);
});

test("rejects stale roster revision and expired session before mutation", async () => {
  const staleRoster = await fixture({ rosterRevision: "roster-revision-8" });
  const stale = await handleArtistOnboardingRequest(
    context(
      new Request(
        `${origin}/artist/payout-onboarding?claim=${staleRoster.token}`,
      ),
    ),
    staleRoster.dependencies,
  );
  assert.equal(stale.status, 400);
  assert.equal(staleRoster.calls.consume, 0);
  assert.equal(staleRoster.calls.links, 0);

  const expired = await fixture();
  const session = await signOnboardingClaim(
    {
      ...claimPayload,
      purpose: "artist-onboarding-session",
      nonce: "session_123456789012",
      expiresAt: "2026-08-22T09:30:00.000Z",
    },
    secret,
  );
  expired.setNow(new Date("2026-08-22T09:31:00.000Z"));
  const response = await handleArtistOnboardingRequest(
    context(
      new Request(`${origin}/artist/payout-onboarding/refresh`, {
        headers: { cookie: `__Host-hfla-payout-onboarding=${session}` },
      }),
      "refresh",
    ),
    expired.dependencies,
  );
  assert.equal(response.status, 400);
  assert.equal(expired.calls.links, 0);
});
