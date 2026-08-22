import type { PayoutEnvironment } from "./types.ts";
import { isIsoInstant, isSafeBusinessId } from "./validation.ts";

export interface AppsScriptTransportConfig {
  url: string;
  allowedOrigin: string;
  secret: string;
  environment: PayoutEnvironment;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxResponseClockSkewSeconds?: number;
}

export interface AppsScriptTransportOptions {
  clock?: { now(): Date };
  requestIdFactory?: () => string;
}

interface AppsScriptRequestInput {
  operation: string;
  method: "GET" | "POST";
  businessDescriptor: string;
  query?: readonly (readonly [string, string])[];
  payload?: unknown;
  config: AppsScriptTransportConfig;
  options?: AppsScriptTransportOptions;
}

interface ResponseAuth {
  algorithm: string;
  version: string;
  environment: PayoutEnvironment;
  operation: string;
  requestId: string;
  timestamp: string;
  payloadSha256: string;
  signature: string;
}

const ALGORITHM = "HFLA-HMAC-SHA256";
const VERSION = "v1";
const DOMAIN = "HFLA-APPS-SCRIPT-TRANSPORT";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_CONFIGURED_RESPONSE_BYTES = 192 * 1024;
const DEFAULT_MAX_RESPONSE_CLOCK_SKEW_SECONDS = 300;
const MAX_REDIRECTS = 2;
const MAX_POST_BYTES = 64 * 1024;
const RESPONSE_AUTH_KEYS = [
  "algorithm",
  "version",
  "environment",
  "operation",
  "requestId",
  "timestamp",
  "payloadSha256",
  "signature",
] as const;

function exactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new Error(`${label} contains missing or unapproved fields`);
  }
}

function parseAllowedOrigin(value: string): string {
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new Error(
      "Apps Script allowed origin must be an absolute HTTPS origin",
    );
  }
  if (
    origin.protocol !== "https:" ||
    origin.port ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    value !== origin.origin
  ) {
    throw new Error(
      "Apps Script allowed origin must be a credential-free HTTPS origin",
    );
  }
  return origin.origin;
}

function parseEndpoint(value: string, allowedOrigin: string): URL {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error("Apps Script endpoint must be an absolute HTTPS URL");
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.origin !== allowedOrigin ||
    endpoint.hash ||
    endpoint.search ||
    endpoint.pathname === "/" ||
    endpoint.href !== value ||
    !/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(endpoint.pathname) ||
    endpoint.pathname.includes("..") ||
    endpoint.pathname.includes("//")
  ) {
    throw new Error(
      "Apps Script endpoint is outside the configured HTTPS allowlist or is not canonical",
    );
  }
  return endpoint;
}

export function validateAppsScriptTransportEndpoint(input: {
  url: string;
  allowedOrigin: string;
}): URL {
  return parseEndpoint(input.url, parseAllowedOrigin(input.allowedOrigin));
}

function parseSecret(value: string): string {
  if (
    value.length < 32 ||
    value.length > 4096 ||
    value !== value.trim() ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    throw new Error("Apps Script HMAC secret is not configured securely");
  }
  return value;
}

function parseBoundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const parsed = value ?? fallback;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} is invalid`);
  }
  return parsed;
}

function now(options: AppsScriptTransportOptions | undefined): Date {
  const value = options?.clock?.now() ?? new Date();
  if (Number.isNaN(value.valueOf())) {
    throw new Error("Apps Script transport clock returned an invalid instant");
  }
  return value;
}

function requestId(options: AppsScriptTransportOptions | undefined): string {
  const value =
    options?.requestIdFactory?.() ?? `apps_script_${crypto.randomUUID()}`;
  if (!isSafeBusinessId(value)) {
    throw new Error("Apps Script request ID is malformed");
  }
  return value;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(digest));
}

export async function hmacSha256Hex(
  secret: string,
  value: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(digest));
}

function constantTimeEqual(left: string, right: string): boolean {
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |=
      (index < left.length ? left.charCodeAt(index) : 0) ^
      (index < right.length ? right.charCodeAt(index) : 0);
  }
  return mismatch === 0;
}

export function canonicalAppsScriptRequest(input: {
  operation: string;
  environment: PayoutEnvironment;
  method: "GET" | "POST";
  origin: string;
  path: string;
  timestamp: string;
  requestId: string;
  businessSha256: string;
}): string {
  return [
    DOMAIN,
    VERSION,
    "request",
    input.operation,
    input.environment,
    input.method,
    input.origin,
    input.path,
    input.timestamp,
    input.requestId,
    input.businessSha256,
  ].join("\n");
}

export function canonicalAppsScriptResponse(input: {
  operation: string;
  environment: PayoutEnvironment;
  requestId: string;
  timestamp: string;
  payloadSha256: string;
}): string {
  return [
    DOMAIN,
    VERSION,
    "response",
    input.operation,
    input.environment,
    input.requestId,
    input.timestamp,
    input.payloadSha256,
  ].join("\n");
}

function redirectOrigins(initialOrigin: string): ReadonlySet<string> {
  const origins = new Set([initialOrigin]);
  if (initialOrigin === "https://script.google.com") {
    origins.add("https://script.googleusercontent.com");
  }
  return origins;
}

function validateRedirectTarget(
  value: string,
  current: URL,
  allowedOrigins: ReadonlySet<string>,
): URL {
  let target: URL;
  try {
    target = new URL(value, current);
  } catch {
    throw new Error("Apps Script returned a malformed redirect");
  }
  if (
    target.protocol !== "https:" ||
    target.port ||
    target.username ||
    target.password ||
    target.hash ||
    !allowedOrigins.has(target.origin)
  ) {
    throw new Error(
      "Apps Script redirected outside the Google execution allowlist",
    );
  }
  if (
    current.origin === "https://script.googleusercontent.com" &&
    target.origin !== current.origin
  ) {
    throw new Error("Apps Script redirected away from the Google content host");
  }
  return target;
}

async function fetchWithBoundedRedirects(
  endpoint: URL,
  init: RequestInit,
  fetcher: typeof fetch,
  allowedOrigins: ReadonlySet<string>,
): Promise<Response> {
  let current = new URL(endpoint);
  let method = String(init.method ?? "GET").toUpperCase();
  let body = init.body;
  let headers = new Headers(init.headers);
  for (let count = 0; count <= MAX_REDIRECTS; count += 1) {
    const response = await fetcher(current, {
      ...init,
      method,
      body,
      headers,
      redirect: "manual",
    });
    const redirect = [301, 302, 303].includes(response.status);
    if (!redirect) {
      const finalUrl = response.url ? new URL(response.url) : current;
      if (
        finalUrl.protocol !== "https:" ||
        finalUrl.port ||
        !allowedOrigins.has(finalUrl.origin)
      ) {
        throw new Error(
          "Apps Script response came from outside the Google execution allowlist",
        );
      }
      if (
        endpoint.origin === "https://script.google.com" &&
        finalUrl.origin !== "https://script.googleusercontent.com"
      ) {
        throw new Error(
          "Apps Script response did not come from the Google content host",
        );
      }
      return response;
    }
    if (count === MAX_REDIRECTS) {
      throw new Error("Apps Script exceeded the redirect limit");
    }
    const location = response.headers.get("location");
    if (!location) throw new Error("Apps Script redirect omitted its location");
    current = validateRedirectTarget(location, current, allowedOrigins);
    method = "GET";
    body = undefined;
    headers = new Headers();
  }
  throw new Error("Apps Script redirect processing failed");
}

async function readBoundedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > maxBytes
  ) {
    throw new Error("Apps Script response is too large");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error("Apps Script response is too large");
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Apps Script returned invalid UTF-8");
  }
}

async function verifyResponseEnvelope(input: {
  raw: string;
  operation: string;
  environment: PayoutEnvironment;
  requestId: string;
  secret: string;
  currentTime: Date;
  maxClockSkewSeconds: number;
}): Promise<unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.raw) as unknown;
  } catch {
    throw new Error("Apps Script returned malformed JSON");
  }
  exactKeys(parsed, ["payload", "auth"], "Apps Script response envelope");
  exactKeys(
    parsed.auth,
    RESPONSE_AUTH_KEYS,
    "Apps Script response authentication",
  );
  const auth = parsed.auth as unknown as ResponseAuth;
  if (
    auth.algorithm !== ALGORITHM ||
    auth.version !== VERSION ||
    auth.environment !== input.environment ||
    auth.operation !== input.operation ||
    auth.requestId !== input.requestId ||
    !isIsoInstant(auth.timestamp) ||
    !/^[a-f0-9]{64}$/.test(auth.payloadSha256) ||
    !/^v1=[a-f0-9]{64}$/.test(auth.signature)
  ) {
    throw new Error("Apps Script response authentication is invalid");
  }
  if (
    Math.abs(input.currentTime.valueOf() - Date.parse(auth.timestamp)) >
    input.maxClockSkewSeconds * 1000
  ) {
    throw new Error("Apps Script response is outside the replay window");
  }
  const payloadJson = JSON.stringify(parsed.payload);
  if (payloadJson === undefined) {
    throw new Error("Apps Script response payload is invalid");
  }
  const payloadSha256 = await sha256Hex(payloadJson);
  if (!constantTimeEqual(payloadSha256, auth.payloadSha256)) {
    throw new Error("Apps Script response payload digest is invalid");
  }
  const canonical = canonicalAppsScriptResponse({
    operation: input.operation,
    environment: input.environment,
    requestId: input.requestId,
    timestamp: auth.timestamp,
    payloadSha256,
  });
  const expected = `v1=${await hmacSha256Hex(input.secret, canonical)}`;
  if (!constantTimeEqual(expected, auth.signature)) {
    throw new Error("Apps Script response signature is invalid");
  }
  return parsed.payload;
}

export async function appsScriptRequest(
  input: AppsScriptRequestInput,
  fetcher: typeof fetch = fetch,
): Promise<{ payload: unknown; requestId: string }> {
  if (!/^[a-z][a-z0-9_]{2,79}$/.test(input.operation)) {
    throw new Error("Apps Script operation is malformed");
  }
  if (
    typeof input.businessDescriptor !== "string" ||
    input.businessDescriptor.length < 1 ||
    input.businessDescriptor.length > MAX_POST_BYTES
  ) {
    throw new Error("Apps Script business descriptor is invalid");
  }
  if (
    input.config.environment !== "sandbox" &&
    input.config.environment !== "live"
  ) {
    throw new Error("Apps Script environment is invalid");
  }
  const endpoint = validateAppsScriptTransportEndpoint(input.config);
  const secret = parseSecret(input.config.secret);
  const timeoutMs = parseBoundedInteger(
    input.config.timeoutMs,
    DEFAULT_TIMEOUT_MS,
    250,
    30_000,
    "Apps Script timeout",
  );
  const operationMaxResponseBytes =
    input.operation === "artist_roster_list_v1"
      ? MAX_CONFIGURED_RESPONSE_BYTES
      : DEFAULT_MAX_RESPONSE_BYTES;
  const maxResponseBytes = parseBoundedInteger(
    input.config.maxResponseBytes,
    DEFAULT_MAX_RESPONSE_BYTES,
    1024,
    operationMaxResponseBytes,
    "Apps Script response bound",
  );
  const maxClockSkewSeconds = parseBoundedInteger(
    input.config.maxResponseClockSkewSeconds,
    DEFAULT_MAX_RESPONSE_CLOCK_SKEW_SECONDS,
    30,
    600,
    "Apps Script response clock skew",
  );
  const requestTime = now(input.options);
  const timestamp = requestTime.toISOString();
  const correlationId = requestId(input.options);
  const businessSha256 = await sha256Hex(input.businessDescriptor);
  const canonical = canonicalAppsScriptRequest({
    operation: input.operation,
    environment: input.config.environment,
    method: input.method,
    origin: endpoint.origin,
    path: endpoint.pathname,
    timestamp,
    requestId: correlationId,
    businessSha256,
  });
  const auth = {
    algorithm: ALGORITHM,
    version: VERSION,
    environment: input.config.environment,
    operation: input.operation,
    requestId: correlationId,
    timestamp,
    signature: `v1=${await hmacSha256Hex(secret, canonical)}`,
  };

  let body: string | undefined;
  if (input.method === "GET") {
    if (input.payload !== undefined || !input.query?.length) {
      throw new Error("Apps Script GET request contract is invalid");
    }
    const names = new Set<string>();
    for (const [name, value] of input.query) {
      if (
        !/^[A-Za-z][A-Za-z0-9]{1,39}$/.test(name) ||
        names.has(name) ||
        typeof value !== "string" ||
        value.length < 1 ||
        value.length > 500
      ) {
        throw new Error("Apps Script GET query is invalid");
      }
      names.add(name);
      endpoint.searchParams.set(name, value);
    }
    endpoint.searchParams.set("hflaAlgorithm", auth.algorithm);
    endpoint.searchParams.set("hflaVersion", auth.version);
    endpoint.searchParams.set("hflaEnvironment", auth.environment);
    endpoint.searchParams.set("hflaOperation", auth.operation);
    endpoint.searchParams.set("hflaRequestId", auth.requestId);
    endpoint.searchParams.set("hflaTimestamp", auth.timestamp);
    endpoint.searchParams.set("hflaSignature", auth.signature);
  } else {
    if (input.query !== undefined || input.payload === undefined) {
      throw new Error("Apps Script POST request contract is invalid");
    }
    body = JSON.stringify({ auth, payload: input.payload });
    if (new TextEncoder().encode(body).byteLength > MAX_POST_BYTES) {
      throw new Error("Apps Script POST body is too large");
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort("Apps Script request timeout"),
    timeoutMs,
  );
  try {
    const response = await fetchWithBoundedRedirects(
      endpoint,
      {
        method: input.method,
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body,
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      },
      fetcher,
      redirectOrigins(endpoint.origin),
    );
    if (!response.ok) throw new Error("Apps Script request failed");
    const raw = await readBoundedText(response, maxResponseBytes);
    const payload = await verifyResponseEnvelope({
      raw,
      operation: input.operation,
      environment: input.config.environment,
      requestId: correlationId,
      secret,
      currentTime: now(input.options),
      maxClockSkewSeconds,
    });
    return { payload, requestId: correlationId };
  } finally {
    clearTimeout(timer);
  }
}
