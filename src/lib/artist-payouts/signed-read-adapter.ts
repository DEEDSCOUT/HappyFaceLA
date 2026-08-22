import {
  appsScriptRequest,
  type AppsScriptTransportOptions,
} from "./apps-script-transport.ts";
import { isSafeBusinessId } from "./validation.ts";
import type { PayoutEnvironment } from "./types.ts";

export interface SignedReadAdapterConfig {
  url: string;
  allowedOrigin: string;
  secret: string;
  environment: PayoutEnvironment;
  timeoutMs?: number;
  maxResponseClockSkewSeconds?: number;
}

export type SignedReadAdapterOptions = AppsScriptTransportOptions;

interface SignedReadInput {
  operation: string;
  queryName: string;
  queryValue: string;
  config: SignedReadAdapterConfig;
  options?: SignedReadAdapterOptions;
  maxResponseBytes?: number;
}

const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_CONFIGURED_RESPONSE_BYTES = 192 * 1024;

export function canonicalSignedRead(input: {
  operation: string;
  origin: string;
  path: string;
  canonicalQuery: string;
  timestamp: string;
  requestId: string;
  environment: PayoutEnvironment;
}): string {
  return [
    "HFLA-HMAC-SHA256",
    "v1",
    input.operation,
    input.environment,
    "GET",
    input.origin,
    input.path,
    input.canonicalQuery,
    input.timestamp,
    input.requestId,
  ].join("\n");
}

export async function signedJsonRead(
  input: SignedReadInput,
  fetcher: typeof fetch = fetch,
): Promise<{ value: unknown; requestId: string }> {
  if (!/^[a-z][a-z0-9_]{2,79}$/.test(input.operation)) {
    throw new Error("Source adapter operation is malformed");
  }
  if (!/^[A-Za-z][A-Za-z0-9]{1,39}$/.test(input.queryName)) {
    throw new Error("Source adapter query name is malformed");
  }
  if (!isSafeBusinessId(input.queryValue)) {
    throw new Error("Source adapter query identity is malformed");
  }
  const maxBytes = input.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1024 ||
    maxBytes > MAX_CONFIGURED_RESPONSE_BYTES
  ) {
    throw new Error("Source adapter response bound is invalid");
  }

  let endpoint: URL;
  try {
    endpoint = new URL(input.config.url);
  } catch {
    throw new Error("Source adapter endpoint must be an absolute HTTPS URL");
  }
  const requestDate = input.options?.clock?.now() ?? new Date();
  if (Number.isNaN(requestDate.valueOf())) {
    throw new Error("Source adapter clock returned an invalid instant");
  }
  const timestamp = requestDate.toISOString();
  const correlationId =
    input.options?.requestIdFactory?.() ?? `apps_script_${crypto.randomUUID()}`;
  if (!isSafeBusinessId(correlationId)) {
    throw new Error("Source adapter request ID is malformed");
  }
  const canonicalQuery = new URLSearchParams([
    [input.queryName, input.queryValue],
  ]).toString();
  const canonical = canonicalSignedRead({
    operation: input.operation,
    origin: endpoint.origin,
    path: endpoint.pathname,
    canonicalQuery,
    timestamp,
    requestId: correlationId,
    environment: input.config.environment,
  });
  const result = await appsScriptRequest(
    {
      operation: input.operation,
      method: "GET",
      businessDescriptor: canonical,
      query: [[input.queryName, input.queryValue]],
      config: { ...input.config, maxResponseBytes: maxBytes },
      options: {
        clock: { now: () => new Date(requestDate) },
        requestIdFactory: () => correlationId,
      },
    },
    fetcher,
  );
  return { value: result.payload, requestId: result.requestId };
}

export function assertExactObject(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actualKeys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expected)) {
    throw new Error(`${label} contains missing or unapproved fields`);
  }
}

export function assertBoundedOperationalText(
  value: unknown,
  maxLength: number,
  label: string,
): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maxLength
  ) {
    throw new Error(`${label} is missing or outside its allowed bound`);
  }
  const normalized = value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized !== value)
    throw new Error(`${label} contains unsafe formatting`);
  return value;
}
