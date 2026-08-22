import {
  PAYOUT_ENVIRONMENTS,
  PAYOUT_STATES,
  type PayoutEnvironment,
  type PayoutState,
} from "./types.ts";
import {
  appsScriptRequest,
  validateAppsScriptTransportEndpoint,
} from "./apps-script-transport.ts";
import {
  isIsoDate,
  isIsoInstant,
  isSafeBusinessId,
  isSpreadsheetSafeText,
  isStripeAccountId,
  sanitizeOperationalText,
} from "./validation.ts";

export interface CrmPayoutProjection {
  environment: PayoutEnvironment;
  ledgerId: string;
  bookingId: string;
  assignmentId: string;
  artistId: string;
  sourceRevision: number;
  expectedCrmRecordId: string;
  expectedCrmRevision: string;
  state: PayoutState;
  batchId: string | null;
  batchDate: string | null;
  currency: "usd";
  amountCents: number;
  connectedAccountId: string;
  transferId: string | null;
  payoutId: string | null;
  payoutStatus: string | null;
  reconciled: boolean;
  reconciledAt: string | null;
  manualPayment: {
    method: string;
    reason: string;
    evidenceReference: string;
    memo: string;
    recordedBy: string;
    recordedAt: string;
  } | null;
  lastVerifiedAt: string;
}

export type CrmPersistedProjection = Omit<
  CrmPayoutProjection,
  "expectedCrmRecordId" | "expectedCrmRevision"
>;

export interface CrmSyncReceipt {
  recordId: string;
  revision: string;
  requestId: string;
  recovered: boolean;
}

export interface CrmAdapterConfig {
  writeUrl: string;
  readUrl: string;
  allowedOrigin: string;
  secret: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxResponseClockSkewSeconds?: number;
}

interface CrmAdapterResponse {
  ok?: boolean;
  recordId?: unknown;
  revision?: unknown;
  requestId?: unknown;
  projection?: unknown;
  error?: unknown;
}

function validProviderReference(value: string | null, prefix: string): boolean {
  return (
    value === null || new RegExp(`^${prefix}_[A-Za-z0-9]{8,100}$`).test(value)
  );
}

function assertProjection(value: CrmPayoutProjection): void {
  if (
    ![
      value.ledgerId,
      value.bookingId,
      value.assignmentId,
      value.artistId,
    ].every(isSafeBusinessId)
  ) {
    throw new Error("CRM projection contains an invalid business identifier");
  }
  if (!PAYOUT_ENVIRONMENTS.includes(value.environment))
    throw new Error("CRM projection environment is invalid");
  if (!PAYOUT_STATES.includes(value.state))
    throw new Error("CRM projection state is invalid");
  if (value.currency !== "usd")
    throw new Error("CRM projection currency is invalid");
  if (typeof value.reconciled !== "boolean")
    throw new Error("CRM projection reconciliation flag is invalid");
  if (value.batchId !== null && !isSafeBusinessId(value.batchId))
    throw new Error("CRM projection batch ID is invalid");
  if (value.batchDate !== null && !isIsoDate(value.batchDate))
    throw new Error("CRM projection batch date is invalid");
  if (!isStripeAccountId(value.connectedAccountId))
    throw new Error("CRM projection account ID is invalid");
  if (!validProviderReference(value.transferId, "tr"))
    throw new Error("CRM projection transfer ID is invalid");
  if (!validProviderReference(value.payoutId, "po"))
    throw new Error("CRM projection payout ID is invalid");
  if (!Number.isSafeInteger(value.sourceRevision) || value.sourceRevision < 1) {
    throw new Error("CRM projection source revision is invalid");
  }
  if (!Number.isSafeInteger(value.amountCents) || value.amountCents <= 0) {
    throw new Error("CRM projection amount is invalid");
  }
  const revision = sanitizeOperationalText(value.expectedCrmRevision, 200);
  const recordId = sanitizeOperationalText(value.expectedCrmRecordId, 160);
  if (!recordId || recordId !== value.expectedCrmRecordId) {
    throw new Error("CRM projection requires a bounded expected record ID");
  }
  if (!revision || revision !== value.expectedCrmRevision) {
    throw new Error("CRM projection requires a bounded expected revision");
  }
  if (
    value.payoutStatus !== null &&
    !["pending", "in_transit", "paid", "failed", "canceled"].includes(
      value.payoutStatus,
    )
  ) {
    throw new Error("CRM projection payout status is invalid");
  }
  if (!isIsoInstant(value.lastVerifiedAt))
    throw new Error("CRM projection verification time is invalid");
  if (value.reconciledAt !== null && !isIsoInstant(value.reconciledAt)) {
    throw new Error("CRM projection reconciliation time is invalid");
  }
  if (value.reconciled !== (value.reconciledAt !== null)) {
    throw new Error("CRM projection reconciliation state and time disagree");
  }
  if (value.manualPayment !== null) {
    const manual = value.manualPayment;
    const expectedKeys = [
      "method",
      "reason",
      "evidenceReference",
      "memo",
      "recordedBy",
      "recordedAt",
    ].sort();
    if (
      !manual ||
      typeof manual !== "object" ||
      JSON.stringify(Object.keys(manual).sort()) !==
        JSON.stringify(expectedKeys) ||
      ![
        manual.method,
        manual.reason,
        manual.evidenceReference,
        manual.memo,
        manual.recordedBy,
      ].every((entry) => isSpreadsheetSafeText(entry, 240)) ||
      !isIsoInstant(manual.recordedAt)
    ) {
      throw new Error("CRM manual payment evidence is invalid");
    }
  }
}

function persistedProjection(
  value: CrmPayoutProjection,
): CrmPersistedProjection {
  const manual = value.manualPayment;
  return {
    environment: value.environment,
    ledgerId: value.ledgerId,
    bookingId: value.bookingId,
    assignmentId: value.assignmentId,
    artistId: value.artistId,
    sourceRevision: value.sourceRevision,
    state: value.state,
    batchId: value.batchId,
    batchDate: value.batchDate,
    currency: value.currency,
    amountCents: value.amountCents,
    connectedAccountId: value.connectedAccountId,
    transferId: value.transferId,
    payoutId: value.payoutId,
    payoutStatus: value.payoutStatus,
    reconciled: value.reconciled,
    reconciledAt: value.reconciledAt,
    manualPayment:
      manual === null
        ? null
        : {
            method: manual.method,
            reason: manual.reason,
            evidenceReference: manual.evidenceReference,
            memo: manual.memo,
            recordedBy: manual.recordedBy,
            recordedAt: manual.recordedAt,
          },
    lastVerifiedAt: value.lastVerifiedAt,
  };
}

function projectionWritePayload(value: CrmPayoutProjection): {
  operation: "artist_payout_projection_v1";
  expectedRecordId: string;
  expectedRevision: string;
  projection: CrmPersistedProjection;
} {
  return {
    operation: "artist_payout_projection_v1",
    expectedRecordId: value.expectedCrmRecordId,
    expectedRevision: value.expectedCrmRevision,
    projection: persistedProjection(value),
  };
}

function canonicalWrite(value: CrmPayoutProjection): string {
  return JSON.stringify(projectionWritePayload(value));
}

function canonicalRead(value: CrmPayoutProjection): string {
  return JSON.stringify({
    operation: "artist_payout_read_v1",
    environment: value.environment,
    ledgerId: value.ledgerId,
    bookingId: value.bookingId,
    assignmentId: value.assignmentId,
    expectedRecordId: value.expectedCrmRecordId,
  });
}

function transportConfig(
  url: string,
  environment: PayoutEnvironment,
  config: CrmAdapterConfig,
) {
  return {
    url,
    allowedOrigin: config.allowedOrigin,
    secret: config.secret,
    environment,
    timeoutMs: config.timeoutMs,
    maxResponseBytes: config.maxResponseBytes,
    maxResponseClockSkewSeconds: config.maxResponseClockSkewSeconds,
  };
}

function isExactProjectionReadback(
  value: unknown,
  expected: CrmPersistedProjection,
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const expectedRecord = expected as unknown as Record<string, unknown>;
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expectedRecord).sort();
  return (
    JSON.stringify(actualKeys) === JSON.stringify(expectedKeys) &&
    expectedKeys.every(
      (key) =>
        JSON.stringify(actual[key]) === JSON.stringify(expectedRecord[key]),
    )
  );
}

export function isExactCrmProjectionReadback(
  value: unknown,
  expected: CrmPayoutProjection,
): boolean {
  assertProjection(expected);
  return isExactProjectionReadback(value, persistedProjection(expected));
}

function adapterResponse(
  value: unknown,
  label: "read" | "write",
): CrmAdapterResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`CRM ${label} returned an invalid signed payload`);
  }
  const result = value as CrmAdapterResponse;
  const actual = Object.keys(result).sort();
  const expected =
    result.ok === true
      ? label === "read"
        ? ["ok", "projection", "recordId", "requestId", "revision"].sort()
        : ["ok", "recordId", "requestId", "revision"].sort()
      : ["error", "ok"].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`CRM ${label} signed payload has an invalid shape`);
  }
  if (result.ok !== true) throw new Error(`CRM ${label} failed closed`);
  return result;
}

function responseIdentity(result: CrmAdapterResponse): {
  recordId: string;
  revision: string;
  requestId: string;
} {
  const recordId = sanitizeOperationalText(result.recordId, 160);
  const revision = sanitizeOperationalText(result.revision, 200);
  const requestId = sanitizeOperationalText(result.requestId, 160);
  if (!recordId || !revision || !requestId)
    throw new Error("CRM response omitted persistence identity");
  return { recordId, revision, requestId };
}

export async function readCrmPayoutProjection(
  projection: CrmPayoutProjection,
  config: CrmAdapterConfig,
  fetcher: typeof fetch = fetch,
): Promise<CrmSyncReceipt & { projection: unknown }> {
  assertProjection(projection);
  const transport = await appsScriptRequest(
    {
      operation: "artist_payout_read_v1",
      method: "GET",
      businessDescriptor: canonicalRead(projection),
      query: [
        ["environment", projection.environment],
        ["ledgerId", projection.ledgerId],
        ["bookingId", projection.bookingId],
        ["assignmentId", projection.assignmentId],
        ["recordId", projection.expectedCrmRecordId],
      ],
      config: transportConfig(config.readUrl, projection.environment, config),
    },
    fetcher,
  );
  const result = adapterResponse(transport.payload, "read");
  const identity = responseIdentity(result);
  if (
    identity.recordId !== projection.expectedCrmRecordId ||
    identity.requestId !== transport.requestId
  ) {
    throw new Error("CRM independent read returned the wrong record");
  }
  return { ...identity, projection: result.projection, recovered: false };
}

export async function syncCrmPayoutProjection(
  projection: CrmPayoutProjection,
  config: CrmAdapterConfig,
  fetcher: typeof fetch = fetch,
): Promise<CrmSyncReceipt> {
  assertProjection(projection);
  const writeEndpoint = validateAppsScriptTransportEndpoint({
    url: config.writeUrl,
    allowedOrigin: config.allowedOrigin,
  });
  const readEndpoint = validateAppsScriptTransportEndpoint({
    url: config.readUrl,
    allowedOrigin: config.allowedOrigin,
  });
  if (writeEndpoint.href === readEndpoint.href) {
    throw new Error("CRM read and write endpoints must be distinct");
  }

  const expectedPersisted = persistedProjection(projection);
  const readCurrent = async (): Promise<CrmAdapterResponse> => {
    const transport = await appsScriptRequest(
      {
        operation: "artist_payout_read_v1",
        method: "GET",
        businessDescriptor: canonicalRead(projection),
        query: [
          ["environment", projection.environment],
          ["ledgerId", projection.ledgerId],
          ["bookingId", projection.bookingId],
          ["assignmentId", projection.assignmentId],
          ["recordId", projection.expectedCrmRecordId],
        ],
        config: transportConfig(
          readEndpoint.href,
          projection.environment,
          config,
        ),
      },
      fetcher,
    );
    const result = adapterResponse(transport.payload, "read");
    if (responseIdentity(result).requestId !== transport.requestId) {
      throw new Error("CRM read payload request identity is invalid");
    }
    return result;
  };

  const existing = await readCurrent();
  const existingIdentity = responseIdentity(existing);
  if (existingIdentity.recordId !== projection.expectedCrmRecordId) {
    throw new Error("CRM record identity conflict requires owner review");
  }
  if (existingIdentity.revision !== projection.expectedCrmRevision) {
    if (isExactProjectionReadback(existing.projection, expectedPersisted)) {
      return { ...existingIdentity, recovered: true };
    }
    throw new Error("CRM revision conflict requires owner review");
  }

  const writePayload = projectionWritePayload(projection);
  let writeResult: CrmAdapterResponse | null = null;
  let writeError: unknown = null;
  try {
    const transport = await appsScriptRequest(
      {
        operation: "artist_payout_projection_v1",
        method: "POST",
        businessDescriptor: canonicalWrite(projection),
        payload: writePayload,
        config: transportConfig(
          writeEndpoint.href,
          projection.environment,
          config,
        ),
      },
      fetcher,
    );
    writeResult = adapterResponse(transport.payload, "write");
    if (responseIdentity(writeResult).requestId !== transport.requestId) {
      throw new Error("CRM write payload request identity is invalid");
    }
  } catch (error) {
    writeError = error;
  }

  let verified: CrmAdapterResponse;
  try {
    verified = await readCurrent();
  } catch (readError) {
    if (writeError) {
      throw new AggregateError(
        [writeError, readError],
        "CRM write outcome is ambiguous and requires review",
        { cause: readError },
      );
    }
    throw readError;
  }
  const verifiedIdentity = responseIdentity(verified);
  if (verifiedIdentity.recordId !== projection.expectedCrmRecordId) {
    throw new Error("CRM independent readback returned the wrong record");
  }
  const applied =
    verifiedIdentity.revision !== projection.expectedCrmRevision &&
    isExactProjectionReadback(verified.projection, expectedPersisted);
  if (!applied) {
    if (writeError)
      throw new AggregateError(
        [writeError],
        "CRM write outcome is ambiguous and requires review",
      );
    throw new Error(
      "CRM independent readback did not match the requested safe projection",
    );
  }
  if (writeResult) {
    const writeIdentity = responseIdentity(writeResult);
    if (
      writeIdentity.revision !== verifiedIdentity.revision ||
      writeIdentity.recordId !== verifiedIdentity.recordId
    ) {
      throw new Error(
        "CRM write acknowledgement and independent readback disagree",
      );
    }
  }
  return { ...verifiedIdentity, recovered: writeError !== null };
}
