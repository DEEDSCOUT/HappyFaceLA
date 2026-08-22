import type { PayoutEnvironment } from "./types.ts";
import {
  isIsoInstant,
  isSafeBusinessId,
  isStripeAccountId,
} from "./validation.ts";

export interface OnboardingClaimPayload {
  version: 1;
  purpose:
    | "artist-onboarding-claim"
    | "artist-onboarding-confirmation"
    | "artist-onboarding-session";
  environment: PayoutEnvironment;
  artistId: string;
  accountId: string;
  nonce: string;
  rosterRevision: string;
  recipientEmailBinding: string;
  expiresAt: string;
}

const ONBOARDING_CHALLENGE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateOnboardingChallengeCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const characters = Array.from(
    bytes,
    (byte) => ONBOARDING_CHALLENGE_ALPHABET[byte & 31],
  ).join("");
  return `${characters.slice(0, 5)}-${characters.slice(5)}`;
}

export function normalizeOnboardingChallengeCode(
  value: unknown,
): string | null {
  if (
    typeof value !== "string" ||
    value.length < 10 ||
    value.length > 16 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }
  const normalized = value.trim().toUpperCase().replaceAll("-", "");
  return /^[2-9A-HJ-NP-Z]{10}$/.test(normalized) ? normalized : null;
}

export function assertOnboardingClaimSecret(secret: string): string {
  if (
    secret.length < 32 ||
    secret.length > 4096 ||
    secret !== secret.trim() ||
    /[\u0000-\u001f\u007f]/.test(secret)
  ) {
    throw new Error("Onboarding claim secret is not configured securely");
  }
  return secret;
}

function assertPayload(payload: OnboardingClaimPayload): void {
  if (
    payload.version !== 1 ||
    ![
      "artist-onboarding-claim",
      "artist-onboarding-confirmation",
      "artist-onboarding-session",
    ].includes(payload.purpose) ||
    !["sandbox", "live"].includes(payload.environment) ||
    !isSafeBusinessId(payload.artistId) ||
    !isStripeAccountId(payload.accountId) ||
    !isSafeBusinessId(payload.nonce) ||
    typeof payload.rosterRevision !== "string" ||
    payload.rosterRevision.length < 1 ||
    payload.rosterRevision.length > 200 ||
    payload.rosterRevision !== payload.rosterRevision.trim() ||
    /[\u0000-\u001f\u007f]/.test(payload.rosterRevision) ||
    !/^hmac-sha256:[a-f0-9]{64}$/.test(payload.recipientEmailBinding) ||
    !isIsoInstant(payload.expiresAt)
  ) {
    throw new Error("Onboarding claim payload is malformed");
  }
}

function canonicalPayload(payload: OnboardingClaimPayload): string {
  return JSON.stringify({
    version: payload.version,
    purpose: payload.purpose,
    environment: payload.environment,
    artistId: payload.artistId,
    accountId: payload.accountId,
    nonce: payload.nonce,
    rosterRevision: payload.rosterRevision,
    recipientEmailBinding: payload.recipientEmailBinding,
    expiresAt: payload.expiresAt,
  });
}

function base64UrlEncode(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error("Onboarding claim token is malformed");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const normalized = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  try {
    return Uint8Array.from(atob(normalized), (character) =>
      character.charCodeAt(0),
    );
  } catch {
    throw new Error("Onboarding claim token is malformed");
  }
}

async function hmac(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(assertOnboardingClaimSecret(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function onboardingRecipientEmailBinding(input: {
  secret: string;
  environment: PayoutEnvironment;
  artistId: string;
  contactEmail: string;
}): Promise<string> {
  if (
    !isSafeBusinessId(input.artistId) ||
    !["sandbox", "live"].includes(input.environment) ||
    input.contactEmail.length < 3 ||
    input.contactEmail.length > 254 ||
    input.contactEmail !== input.contactEmail.trim() ||
    /[\u0000-\u0020\u007f]/.test(input.contactEmail) ||
    !/^[^@]+@[^@]+\.[^@]+$/.test(input.contactEmail)
  ) {
    throw new Error("Onboarding recipient email is malformed");
  }
  const material = [
    "HFLA-ARTIST-ONBOARDING-RECIPIENT",
    "v1",
    input.environment,
    input.artistId,
    input.contactEmail.toLowerCase(),
  ].join("\n");
  const digest = await hmac(input.secret, material);
  const hex = Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `hmac-sha256:${hex}`;
}

export async function stripeRecipientProvenance(input: {
  secret: string;
  environment: PayoutEnvironment;
  artistId: string;
  contactEmail: string;
}): Promise<string> {
  const emailBinding = await onboardingRecipientEmailBinding(input);
  const material = [
    "HFLA-STRIPE-RECIPIENT-PROVENANCE",
    "v1",
    input.environment,
    input.artistId,
    emailBinding,
  ].join("\n");
  const digest = await hmac(input.secret, material);
  const hex = Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `hmac-sha256:${hex}`;
}

export async function onboardingChallengeDigest(input: {
  secret: string;
  environment: PayoutEnvironment;
  artistId: string;
  accountId: string;
  nonce: string;
  rosterRevision: string;
  challengeCode: unknown;
}): Promise<string> {
  if (
    !["sandbox", "live"].includes(input.environment) ||
    !isSafeBusinessId(input.artistId) ||
    !isStripeAccountId(input.accountId) ||
    !isSafeBusinessId(input.nonce) ||
    typeof input.rosterRevision !== "string" ||
    input.rosterRevision.length < 1 ||
    input.rosterRevision.length > 200 ||
    input.rosterRevision !== input.rosterRevision.trim() ||
    /[\u0000-\u001f\u007f]/.test(input.rosterRevision)
  ) {
    throw new Error("Onboarding challenge binding is malformed");
  }
  const normalized =
    normalizeOnboardingChallengeCode(input.challengeCode) ??
    "INVALID-CHALLENGE";
  const material = [
    "HFLA-ARTIST-ONBOARDING-CHALLENGE",
    "v1",
    input.environment,
    input.artistId,
    input.accountId,
    input.nonce,
    input.rosterRevision,
    normalized,
  ].join("\n");
  const digest = await hmac(input.secret, material);
  const hex = Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `hmac-sha256:${hex}`;
}

export async function signOnboardingClaim(
  payload: OnboardingClaimPayload,
  secret: string,
): Promise<string> {
  assertPayload(payload);
  const encoded = base64UrlEncode(
    new TextEncoder().encode(canonicalPayload(payload)),
  );
  return `${encoded}.${base64UrlEncode(await hmac(secret, encoded))}`;
}

export async function verifyOnboardingClaim(input: {
  token: string;
  secret: string;
  expectedPurpose: OnboardingClaimPayload["purpose"];
  expectedEnvironment: PayoutEnvironment;
  now: Date;
}): Promise<OnboardingClaimPayload> {
  if (
    input.token.length < 80 ||
    input.token.length > 2048 ||
    input.token.split(".").length !== 2
  ) {
    throw new Error("Onboarding claim token is malformed");
  }
  const [encoded, signature] = input.token.split(".");
  const supplied = base64UrlDecode(signature);
  const expected = await hmac(input.secret, encoded);
  if (!constantTimeEqual(supplied, expected))
    throw new Error("Onboarding claim signature is invalid");
  let payload: OnboardingClaimPayload;
  try {
    payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(encoded)),
    ) as OnboardingClaimPayload;
  } catch {
    throw new Error("Onboarding claim token is malformed");
  }
  assertPayload(payload);
  if (
    canonicalPayload(payload) !==
    new TextDecoder().decode(base64UrlDecode(encoded))
  ) {
    throw new Error("Onboarding claim payload is not canonical");
  }
  if (
    payload.purpose !== input.expectedPurpose ||
    payload.environment !== input.expectedEnvironment
  ) {
    throw new Error("Onboarding claim scope does not match");
  }
  if (
    Number.isNaN(input.now.valueOf()) ||
    payload.expiresAt <= input.now.toISOString()
  )
    throw new Error("Onboarding claim has expired");
  return payload;
}
