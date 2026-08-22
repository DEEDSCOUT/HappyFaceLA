#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  authenticatePayoutActor,
  verifyCloudflareAccessJwt,
} from "../../src/lib/artist-payouts/auth.ts";

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const originalFetch = globalThis.fetch;

function base64Url(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

async function keyPair(kid) {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { ...pair, jwk: { ...jwk, kid, alg: "RS256", use: "sig" }, kid };
}

async function jwt(key, claims, headerOverrides = {}) {
  const header = base64Url(
    new TextEncoder().encode(
      JSON.stringify({
        alg: "RS256",
        typ: "JWT",
        kid: key.kid,
        ...headerOverrides,
      }),
    ),
  );
  const payload = base64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64Url(signature)}`;
}

function env(domain, overrides = {}) {
  return {
    CF_ACCESS_TEAM_DOMAIN: domain,
    CF_ACCESS_AUD: "payout-audience",
    PAYOUT_OWNER_EMAILS: "owner@example.test",
    PAYOUT_ADMIN_EMAILS: "admin@example.test",
    ...overrides,
  };
}

function claims(domain, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: `https://${domain}`,
    aud: ["payout-audience"],
    email: "owner@example.test",
    sub: "synthetic-user",
    iat: now - 10,
    exp: now + 300,
    ...overrides,
  };
}

test("accepts current and previous Cloudflare Access signing keys", async () => {
  const domain = "auth-a.cloudflareaccess.com";
  const current = await keyPair("current-a");
  const previous = await keyPair("previous-a");
  globalThis.fetch = async () =>
    Response.json({ keys: [current.jwk, previous.jwk] });
  assert.equal(
    (
      await verifyCloudflareAccessJwt(
        await jwt(current, claims(domain)),
        env(domain),
      )
    ).email,
    "owner@example.test",
  );
  assert.equal(
    (
      await verifyCloudflareAccessJwt(
        await jwt(previous, claims(domain)),
        env(domain),
      )
    ).sub,
    "synthetic-user",
  );
});

test("refreshes a warm JWKS cache once when Stripe Access rotates kid", async () => {
  const domain = "auth-rotation.cloudflareaccess.com";
  const oldKey = await keyPair("old-rotation");
  const newKey = await keyPair("new-rotation");
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({
      keys: calls === 1 ? [oldKey.jwk] : [newKey.jwk, oldKey.jwk],
    });
  };
  await verifyCloudflareAccessJwt(
    await jwt(oldKey, claims(domain)),
    env(domain),
  );
  await verifyCloudflareAccessJwt(
    await jwt(newKey, claims(domain)),
    env(domain),
  );
  assert.equal(calls, 2);
});

test("rejects wrong kid, issuer, audience, expiry, nbf, and algorithm", async () => {
  const domain = "auth-negative.cloudflareaccess.com";
  const key = await keyPair("valid-negative");
  const wrong = await keyPair("wrong-negative");
  globalThis.fetch = async () => Response.json({ keys: [key.jwk] });
  const now = Math.floor(Date.now() / 1000);
  const cases = [
    jwt(wrong, claims(domain)),
    jwt(key, claims(domain, { iss: "https://evil.cloudflareaccess.com" })),
    jwt(key, claims(domain, { aud: "wrong-audience" })),
    jwt(key, claims(domain, { exp: now - 1 })),
    jwt(key, claims(domain, { nbf: now + 120 })),
    jwt(key, claims(domain), { alg: "none" }),
  ];
  for (const tokenPromise of cases) {
    await assert.rejects(
      verifyCloudflareAccessJwt(await tokenPromise, env(domain)),
    );
  }
});

test("JWKS outage and invalid team domain fail closed", async () => {
  const key = await keyPair("outage");
  const domain = "auth-outage.cloudflareaccess.com";
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  await assert.rejects(
    verifyCloudflareAccessJwt(await jwt(key, claims(domain)), env(domain)),
    /Unable to retrieve/,
  );
  await assert.rejects(
    verifyCloudflareAccessJwt(
      await jwt(key, claims(domain)),
      env("not-access.example.test"),
    ),
    /cloudflareaccess/,
  );
});

test("maps only allowlisted identities to owner/admin and enforces owner actions", async () => {
  const request = new Request("https://admin.example.test", {
    headers: { "cf-access-jwt-assertion": "synthetic" },
  });
  const owner = await authenticatePayoutActor(
    request,
    env("role.cloudflareaccess.com"),
    "owner",
    async () => ({ email: "owner@example.test" }),
  );
  assert.deepEqual(owner, { email: "owner@example.test", role: "owner" });
  const admin = await authenticatePayoutActor(
    request,
    env("role.cloudflareaccess.com"),
    "admin",
    async () => ({ email: "admin@example.test" }),
  );
  assert.deepEqual(admin, { email: "admin@example.test", role: "admin" });
  await assert.rejects(
    authenticatePayoutActor(
      request,
      env("role.cloudflareaccess.com"),
      "owner",
      async () => ({ email: "admin@example.test" }),
    ),
    /Owner/,
  );
  await assert.rejects(
    authenticatePayoutActor(
      request,
      env("role.cloudflareaccess.com"),
      "admin",
      async () => ({ email: "unknown@example.test" }),
    ),
    /not authorized/,
  );
});

let passed = 0;
try {
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
} finally {
  globalThis.fetch = originalFetch;
}
console.log(`\nPayout authorization: ${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exitCode = 1;
