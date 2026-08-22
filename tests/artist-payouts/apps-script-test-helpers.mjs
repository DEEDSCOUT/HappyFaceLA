import assert from "node:assert/strict";

import {
  canonicalAppsScriptRequest,
  canonicalAppsScriptResponse,
  hmacSha256Hex,
  sha256Hex,
} from "../../src/lib/artist-payouts/apps-script-transport.ts";

export const APPS_SCRIPT_TEST_SECRET =
  "synthetic-hmac-secret-with-at-least-32-characters";

const REQUEST_QUERY_KEYS = [
  "hflaAlgorithm",
  "hflaVersion",
  "hflaEnvironment",
  "hflaOperation",
  "hflaRequestId",
  "hflaTimestamp",
  "hflaSignature",
];

export function parseAppsScriptRequest(url, init) {
  const endpoint = new URL(String(url));
  const method = String(init.method ?? "GET").toUpperCase();
  if (method === "GET") {
    const auth = {
      algorithm: endpoint.searchParams.get("hflaAlgorithm"),
      version: endpoint.searchParams.get("hflaVersion"),
      environment: endpoint.searchParams.get("hflaEnvironment"),
      operation: endpoint.searchParams.get("hflaOperation"),
      requestId: endpoint.searchParams.get("hflaRequestId"),
      timestamp: endpoint.searchParams.get("hflaTimestamp"),
      signature: endpoint.searchParams.get("hflaSignature"),
    };
    const business = Object.fromEntries(
      [...endpoint.searchParams.entries()].filter(
        ([key]) => !REQUEST_QUERY_KEYS.includes(key),
      ),
    );
    return { endpoint, method, auth, business, payload: undefined };
  }
  assert.equal(method, "POST");
  const envelope = JSON.parse(String(init.body));
  assert.deepEqual(Object.keys(envelope).sort(), ["auth", "payload"]);
  return {
    endpoint,
    method,
    auth: envelope.auth,
    business: undefined,
    payload: envelope.payload,
  };
}

export async function assertValidAppsScriptRequest({
  url,
  init,
  businessDescriptor,
  secret = APPS_SCRIPT_TEST_SECRET,
  operation,
  environment = "sandbox",
}) {
  const request = parseAppsScriptRequest(url, init);
  assert.equal(request.auth.algorithm, "HFLA-HMAC-SHA256");
  assert.equal(request.auth.version, "v1");
  assert.equal(request.auth.environment, environment);
  assert.equal(request.auth.operation, operation);
  assert.match(request.auth.requestId, /^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/);
  assert.match(
    request.auth.timestamp,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  );
  const businessSha256 = await sha256Hex(businessDescriptor);
  const canonical = canonicalAppsScriptRequest({
    operation,
    environment,
    method: request.method,
    origin: request.endpoint.origin,
    path: request.endpoint.pathname,
    timestamp: request.auth.timestamp,
    requestId: request.auth.requestId,
    businessSha256,
  });
  assert.equal(
    request.auth.signature,
    `v1=${await hmacSha256Hex(secret, canonical)}`,
  );
  const headers = new Headers(init.headers);
  assert.equal(headers.get("accept"), "application/json");
  assert.equal(init.redirect, "manual");
  assert.equal(init.credentials, "omit");
  assert.equal(init.referrerPolicy, "no-referrer");
  return request;
}

export async function signedAppsScriptResponse(
  url,
  init,
  payloadOrFactory,
  {
    secret = APPS_SCRIPT_TEST_SECRET,
    timestamp,
    authOverrides = {},
    payloadDigestOverride,
    signatureOverride,
    status = 200,
    headers = {},
  } = {},
) {
  const request = parseAppsScriptRequest(url, init);
  const payload =
    typeof payloadOrFactory === "function"
      ? payloadOrFactory(request)
      : payloadOrFactory;
  const responseTimestamp = timestamp ?? request.auth.timestamp;
  const payloadJson = JSON.stringify(payload);
  const payloadSha256 = payloadDigestOverride ?? (await sha256Hex(payloadJson));
  const canonical = canonicalAppsScriptResponse({
    operation: authOverrides.operation ?? request.auth.operation,
    environment: authOverrides.environment ?? request.auth.environment,
    requestId: authOverrides.requestId ?? request.auth.requestId,
    timestamp: responseTimestamp,
    payloadSha256,
  });
  const auth = {
    algorithm: "HFLA-HMAC-SHA256",
    version: "v1",
    environment: request.auth.environment,
    operation: request.auth.operation,
    requestId: request.auth.requestId,
    timestamp: responseTimestamp,
    payloadSha256,
    signature: `v1=${await hmacSha256Hex(secret, canonical)}`,
    ...authOverrides,
  };
  if (signatureOverride !== undefined) auth.signature = signatureOverride;
  return new Response(JSON.stringify({ payload, auth }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
