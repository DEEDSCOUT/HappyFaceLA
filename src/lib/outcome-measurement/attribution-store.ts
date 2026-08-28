import {
  ATTRIBUTION_CAPTURE_VERSION,
  OUTCOME_MEASUREMENT_SOURCE_SYSTEMS,
  type AttributionCaptureInput,
  type CanonicalAttributionRecord,
  type LeadAttributionRecord,
  type MeasurementCaptureResult,
  type OutcomeMeasurementD1Database,
  type OutcomeMeasurementEnv,
} from './contracts.ts';

const CLICK_ID_MAX_LENGTH = 2048;
const MARKETING_FIELD_MAX_LENGTH = 256;
const PATH_MAX_LENGTH = 512;
const SOURCE_LEAD_ID_MAX_LENGTH = 160;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const SOURCE_LEAD_ID = /^[A-Za-z0-9_:-]+$/;
const EMAIL_LIKE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_LIKE = /(?:\+?\d[\s().-]*){10,}/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const CLICK_ID_WHITESPACE = /\s/;

export class AttributionValidationError extends Error {
  constructor() {
    super('Attribution record is invalid');
    this.name = 'AttributionValidationError';
  }
}

export class AttributionIdentityConflictError extends Error {
  constructor() {
    super('Attribution identity conflicts with an immutable record');
    this.name = 'AttributionIdentityConflictError';
  }
}

function invalid(): never {
  throw new AttributionValidationError();
}

function canonicalIso(value: unknown): string {
  if (typeof value !== 'string' || !value) invalid();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) invalid();
  return parsed.toISOString();
}

function optionalClickId(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') invalid();
  if (value.length > CLICK_ID_MAX_LENGTH || CLICK_ID_WHITESPACE.test(value) || CONTROL_CHARACTER.test(value)) {
    invalid();
  }
  return value;
}

function containsLikelyPii(value: string): boolean {
  return EMAIL_LIKE.test(value) || PHONE_LIKE.test(value);
}

function optionalMarketingField(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') invalid();
  const normalized = value.trim();
  if (!normalized) return null;
  if (
    normalized.length > MARKETING_FIELD_MAX_LENGTH
    || CONTROL_CHARACTER.test(normalized)
    || containsLikelyPii(normalized)
  ) {
    invalid();
  }
  return normalized;
}

export function attributionPathOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') invalid();
  const raw = value.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw, 'https://www.happyfacesla.com');
    const path = parsed.pathname || '/';
    let decodedPath = path;
    try {
      decodedPath = decodeURIComponent(path);
    } catch {
      invalid();
    }
    if (
      path.length > PATH_MAX_LENGTH
      || CONTROL_CHARACTER.test(path)
      || containsLikelyPii(path)
      || containsLikelyPii(decodedPath)
    ) invalid();
    return path;
  } catch {
    invalid();
  }
}

function validateSourceIdentity(sourceSystem: unknown, sourceLeadId: unknown): asserts sourceSystem is AttributionCaptureInput['source_system'] {
  if (!OUTCOME_MEASUREMENT_SOURCE_SYSTEMS.includes(sourceSystem as AttributionCaptureInput['source_system'])) invalid();
  if (
    typeof sourceLeadId !== 'string'
    || !sourceLeadId
    || sourceLeadId.length > SOURCE_LEAD_ID_MAX_LENGTH
    || !SOURCE_LEAD_ID.test(sourceLeadId)
  ) {
    invalid();
  }
}

function captureStateForIdentifiers(
  gclid: string | null,
  gbraid: string | null,
  wbraid: string | null,
): 'CAPTURED' | 'QUARANTINED' {
  const hasUnsupportedBraidPair = Boolean(gbraid && wbraid);
  const hasUnsupportedGclidWbraidPair = Boolean(gclid && wbraid);
  return hasUnsupportedBraidPair || hasUnsupportedGclidWbraidPair ? 'QUARANTINED' : 'CAPTURED';
}

type CanonicalJson = null | boolean | number | string | CanonicalJson[] | { [key: string]: CanonicalJson };

// The admitted attribution record contains only strings and nulls. Sorted object
// keys plus ECMAScript JSON string serialization is therefore byte-equivalent to
// RFC 8785 for every value admitted by this contract.
export function canonicalizeJson(value: CanonicalJson): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`).join(',')}}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildLeadAttributionRecord(
  input: AttributionCaptureInput,
  createdAt = new Date().toISOString(),
): Promise<LeadAttributionRecord> {
  validateSourceIdentity(input.source_system, input.source_lead_id);

  const gclid = optionalClickId(input.gclid);
  const gbraid = optionalClickId(input.gbraid);
  const wbraid = optionalClickId(input.wbraid);
  const canonical: CanonicalAttributionRecord = {
    source_system: input.source_system,
    source_lead_id: input.source_lead_id,
    submitted_at: canonicalIso(input.submitted_at),
    landing_page: attributionPathOnly(input.landing_page),
    source_page: attributionPathOnly(input.source_page),
    gclid,
    gbraid,
    wbraid,
    utm_source: optionalMarketingField(input.utm_source),
    utm_medium: optionalMarketingField(input.utm_medium),
    utm_campaign: optionalMarketingField(input.utm_campaign),
    utm_term: optionalMarketingField(input.utm_term),
    utm_content: optionalMarketingField(input.utm_content),
    capture_version: ATTRIBUTION_CAPTURE_VERSION,
    capture_state: captureStateForIdentifiers(gclid, gbraid, wbraid),
  };

  const recordSha256 = await sha256Hex(canonicalizeJson(canonical as unknown as CanonicalJson));
  if (!SHA256_HEX.test(recordSha256)) invalid();

  return {
    ...canonical,
    created_at: canonicalIso(createdAt),
    record_sha256: recordSha256,
  };
}

type StoredAttributionIdentity = {
  record_sha256: string;
  capture_state: 'CAPTURED' | 'QUARANTINED';
};

async function selectStoredIdentity(
  db: OutcomeMeasurementD1Database,
  sourceSystem: string,
  sourceLeadId: string,
): Promise<StoredAttributionIdentity | null> {
  return db
    .prepare(
      `SELECT record_sha256, capture_state
       FROM lead_attribution_v1
       WHERE source_system = ? AND source_lead_id = ?
       LIMIT 1`,
    )
    .bind(sourceSystem, sourceLeadId)
    .first<StoredAttributionIdentity>();
}

export async function persistLeadAttributionRecord(
  db: OutcomeMeasurementD1Database,
  record: LeadAttributionRecord,
): Promise<'INSERTED' | 'IDEMPOTENT'> {
  const existing = await selectStoredIdentity(db, record.source_system, record.source_lead_id);
  if (existing) {
    if (existing.record_sha256 === record.record_sha256 && existing.capture_state === record.capture_state) {
      return 'IDEMPOTENT';
    }
    throw new AttributionIdentityConflictError();
  }

  try {
    const result = await db
      .prepare(
        `INSERT INTO lead_attribution_v1 (
          source_system, source_lead_id, submitted_at, landing_page, source_page,
          gclid, gbraid, wbraid,
          utm_source, utm_medium, utm_campaign, utm_term, utm_content,
          capture_version, created_at, record_sha256, capture_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.source_system,
        record.source_lead_id,
        record.submitted_at,
        record.landing_page,
        record.source_page,
        record.gclid,
        record.gbraid,
        record.wbraid,
        record.utm_source,
        record.utm_medium,
        record.utm_campaign,
        record.utm_term,
        record.utm_content,
        record.capture_version,
        record.created_at,
        record.record_sha256,
        record.capture_state,
      )
      .run();
    if (result.success === false) throw new Error('D1 insert failed');
  } catch (error) {
    const raced = await selectStoredIdentity(db, record.source_system, record.source_lead_id).catch(() => null);
    if (raced?.record_sha256 === record.record_sha256 && raced.capture_state === record.capture_state) {
      return 'IDEMPOTENT';
    }
    if (raced) throw new AttributionIdentityConflictError();
    throw error;
  }

  const stored = await selectStoredIdentity(db, record.source_system, record.source_lead_id);
  if (!stored) throw new Error('D1 insert was not durable');
  if (stored.record_sha256 !== record.record_sha256 || stored.capture_state !== record.capture_state) {
    throw new AttributionIdentityConflictError();
  }
  return 'INSERTED';
}

export function isOutcomeMeasurementCaptureEnabled(env: OutcomeMeasurementEnv): boolean {
  return env.OUTCOME_MEASUREMENT_CAPTURE_ENABLED === 'true';
}

function identifierTypes(input: AttributionCaptureInput): string[] {
  return [
    typeof input.gclid === 'string' && input.gclid ? 'GCLID' : null,
    typeof input.gbraid === 'string' && input.gbraid ? 'GBRAID' : null,
    typeof input.wbraid === 'string' && input.wbraid ? 'WBRAID' : null,
  ].filter((value): value is string => Boolean(value));
}

function emitSafeDiagnostic(result: MeasurementCaptureResult, input: AttributionCaptureInput): void {
  if (result.status === 'DISABLED' || result.status === 'CAPTURED') return;
  console.warn('[outcome-measurement] attribution capture is not eligible', {
    sourceSystem: input.source_system,
    status: result.status,
    errorCode: result.code,
    identifierTypes: identifierTypes(input),
  });
}

export async function captureAttributionBestEffort(
  env: OutcomeMeasurementEnv,
  input: AttributionCaptureInput,
  options: { createdAt?: string } = {},
): Promise<MeasurementCaptureResult> {
  if (!isOutcomeMeasurementCaptureEnabled(env)) {
    return { status: 'DISABLED', eligible: false, code: 'FEATURE_DISABLED' };
  }

  if (!env.OUTCOME_MEASUREMENT_D1) {
    const result: MeasurementCaptureResult = {
      status: 'FAILED',
      eligible: false,
      code: 'STORAGE_UNAVAILABLE',
    };
    emitSafeDiagnostic(result, input);
    return result;
  }

  try {
    const record = await buildLeadAttributionRecord(input, options.createdAt);
    const persistence = await persistLeadAttributionRecord(env.OUTCOME_MEASUREMENT_D1, record);
    const result: MeasurementCaptureResult = record.capture_state === 'QUARANTINED'
      ? {
          status: 'QUARANTINED',
          eligible: false,
          code: 'UNSUPPORTED_IDENTIFIER_SET',
          captureState: 'QUARANTINED',
          persistence,
        }
      : {
          status: 'CAPTURED',
          eligible: true,
          code: persistence,
          captureState: 'CAPTURED',
        };
    emitSafeDiagnostic(result, input);
    return result;
  } catch (error) {
    const result: MeasurementCaptureResult = {
      status: 'FAILED',
      eligible: false,
      code: error instanceof AttributionIdentityConflictError
        ? 'IDENTITY_CONFLICT'
        : error instanceof AttributionValidationError
          ? 'INVALID_ATTRIBUTION'
          : 'STORAGE_ERROR',
    };
    emitSafeDiagnostic(result, input);
    return result;
  }
}
