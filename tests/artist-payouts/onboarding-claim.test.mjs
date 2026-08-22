import assert from "node:assert/strict";
import test from "node:test";

import {
  generateOnboardingChallengeCode,
  normalizeOnboardingChallengeCode,
  onboardingChallengeDigest,
  onboardingRecipientEmailBinding,
  signOnboardingClaim,
  verifyOnboardingClaim,
} from "../../src/lib/artist-payouts/onboarding-claim.ts";

const secret = "synthetic-onboarding-claim-secret-at-least-32-characters";
const recipientEmailBinding = await onboardingRecipientEmailBinding({
  secret,
  environment: "sandbox",
  artistId: "artist_A01",
  contactEmail: "artist@example.test",
});
const payload = {
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

test("generates and binds a normalized high-entropy onboarding challenge", async () => {
  const challengeCode = generateOnboardingChallengeCode();
  assert.match(challengeCode, /^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/);
  assert.equal(
    normalizeOnboardingChallengeCode(challengeCode.toLowerCase()),
    challengeCode.replaceAll("-", ""),
  );
  const input = {
    secret,
    environment: "sandbox",
    artistId: payload.artistId,
    accountId: payload.accountId,
    nonce: payload.nonce,
    rosterRevision: payload.rosterRevision,
    challengeCode,
  };
  const digest = await onboardingChallengeDigest(input);
  assert.match(digest, /^hmac-sha256:[a-f0-9]{64}$/);
  assert.equal(
    await onboardingChallengeDigest({
      ...input,
      challengeCode: challengeCode.toLowerCase(),
    }),
    digest,
  );
  assert.notEqual(
    await onboardingChallengeDigest({ ...input, artistId: "artist_A02" }),
    digest,
  );
  assert.notEqual(
    await onboardingChallengeDigest({ ...input, challengeCode: "wrong" }),
    digest,
  );
});

test("signs and verifies an exact source-bound onboarding claim", async () => {
  const token = await signOnboardingClaim(payload, secret);
  const verified = await verifyOnboardingClaim({
    token,
    secret,
    expectedPurpose: "artist-onboarding-claim",
    expectedEnvironment: "sandbox",
    now: new Date("2026-08-22T09:00:00.000Z"),
  });
  assert.deepEqual(verified, payload);
});

test("rejects tampering, expiry, purpose, and environment substitution", async () => {
  const token = await signOnboardingClaim(payload, secret);
  await assert.rejects(
    verifyOnboardingClaim({
      token: `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`,
      secret,
      expectedPurpose: "artist-onboarding-claim",
      expectedEnvironment: "sandbox",
      now: new Date("2026-08-22T09:00:00.000Z"),
    }),
    /signature/,
  );
  await assert.rejects(
    verifyOnboardingClaim({
      token,
      secret,
      expectedPurpose: "artist-onboarding-claim",
      expectedEnvironment: "sandbox",
      now: new Date(payload.expiresAt),
    }),
    /expired/,
  );
  await assert.rejects(
    verifyOnboardingClaim({
      token,
      secret,
      expectedPurpose: "artist-onboarding-session",
      expectedEnvironment: "sandbox",
      now: new Date("2026-08-22T09:00:00.000Z"),
    }),
    /scope/,
  );
  await assert.rejects(
    verifyOnboardingClaim({
      token,
      secret,
      expectedPurpose: "artist-onboarding-claim",
      expectedEnvironment: "live",
      now: new Date("2026-08-22T09:00:00.000Z"),
    }),
    /scope/,
  );
});

test("rejects weak secrets and malformed identity payloads before signing", async () => {
  await assert.rejects(signOnboardingClaim(payload, "weak"), /secret/);
  await assert.rejects(
    signOnboardingClaim({ ...payload, accountId: "acct_substituted" }, secret),
    /payload/,
  );
  await assert.rejects(
    signOnboardingClaim({ ...payload, rosterRevision: " changed " }, secret),
    /payload/,
  );
});
