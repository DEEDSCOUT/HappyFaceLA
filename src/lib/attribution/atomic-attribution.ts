export const ATTRIBUTION_VERSION = 1 as const;

export const ATTRIBUTION_VALUE_KEYS = [
  'gclid',
  'gbraid',
  'wbraid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

export type AttributionValueKey = (typeof ATTRIBUTION_VALUE_KEYS)[number];

export type AttributionSourceConfidence =
  | 'gclid'
  | 'gbraid'
  | 'wbraid'
  | 'utm_paid'
  | 'utm_other'
  | 'referrer'
  | 'direct';

export type AttributionTouch = Record<AttributionValueKey, string | null> & {
  landing_path: string;
  source_path: string;
  sanitized_referrer: string | null;
  captured_at: string;
  source_confidence: AttributionSourceConfidence;
};

export type AttributionJourney = {
  version: typeof ATTRIBUTION_VERSION;
  first_touch: AttributionTouch;
  latest_qualifying_touch: AttributionTouch | null;
  submit_touch: AttributionTouch | null;
  expires_at: string | null;
};

export type AttributionCaptureInput = {
  url: string;
  referrer?: string | null;
  capturedAt?: string;
};

export type AttributionCaptureConfig = {
  expectedOrigin?: string;
  retentionMs?: number | null;
  nowMs?: number;
};

const MAX_VALUE_LENGTH = 256;
const MAX_PATH_LENGTH = 512;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const PAID_MEDIUM_RE = /^(?:cpc|ppc|paid|paidsearch|paid-search|sem)$/i;
const HFLA_CANONICAL_HOSTS = new Set(['happyfacesla.com', 'www.happyfacesla.com']);

function cleanValue(value: unknown, maxLength = MAX_VALUE_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
  return cleaned || null;
}

function safeHttpUrl(raw: unknown, expectedOrigin: string): URL | null {
  const value = cleanValue(raw, 2048);
  if (!value) return null;
  try {
    const url = new URL(value, expectedOrigin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

function isSameExpectedSite(candidate: URL, expected: URL): boolean {
  if (candidate.origin === expected.origin) return true;
  return HFLA_CANONICAL_HOSTS.has(candidate.hostname.toLowerCase())
    && HFLA_CANONICAL_HOSTS.has(expected.hostname.toLowerCase());
}

export function sanitizePath(raw: unknown, expectedOrigin = 'https://happyfacesla.com'): string {
  const url = safeHttpUrl(raw, expectedOrigin);
  if (url) return (url.pathname || '/').slice(0, MAX_PATH_LENGTH);
  const value = cleanValue(raw, MAX_PATH_LENGTH);
  if (!value || !value.startsWith('/')) return '/';
  return (value.split(/[?#]/, 1)[0] || '/').slice(0, MAX_PATH_LENGTH);
}

export function sanitizeReferrer(
  raw: unknown,
  expectedOrigin = 'https://happyfacesla.com',
): string | null {
  const url = safeHttpUrl(raw, expectedOrigin);
  if (!url) return null;
  return `${url.origin}${url.pathname || '/'}`.slice(0, 768);
}

function sanitizeCapturedAt(raw: unknown, nowMs: number): string {
  const value = cleanValue(raw, 40);
  if (!value) return new Date(nowMs).toISOString();
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > nowMs + MAX_CLOCK_SKEW_MS) {
    return new Date(nowMs).toISOString();
  }
  return new Date(timestamp).toISOString();
}

export function deriveSourceConfidence(
  values: Partial<Record<AttributionValueKey, string | null>>,
  sanitizedReferrer: string | null,
  expectedOrigin = 'https://happyfacesla.com',
): AttributionSourceConfidence {
  if (values.gclid) return 'gclid';
  if (values.gbraid) return 'gbraid';
  if (values.wbraid) return 'wbraid';
  if (values.utm_source || values.utm_medium || values.utm_campaign || values.utm_term || values.utm_content) {
    return PAID_MEDIUM_RE.test(values.utm_medium || '') ? 'utm_paid' : 'utm_other';
  }
  if (sanitizedReferrer) {
    try {
      if (!isSameExpectedSite(new URL(sanitizedReferrer), new URL(expectedOrigin))) return 'referrer';
    } catch {
      // A malformed referrer was already sanitized away. Treat it as direct.
    }
  }
  return 'direct';
}

function emptyValues(): Record<AttributionValueKey, string | null> {
  return {
    gclid: null,
    gbraid: null,
    wbraid: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_term: null,
    utm_content: null,
  };
}

export function captureTouch(
  input: AttributionCaptureInput,
  config: AttributionCaptureConfig = {},
): AttributionTouch {
  const expectedOrigin = config.expectedOrigin || 'https://happyfacesla.com';
  const nowMs = config.nowMs ?? Date.now();
  const url = safeHttpUrl(input.url, expectedOrigin) ?? new URL(expectedOrigin);
  const values = emptyValues();

  for (const key of ATTRIBUTION_VALUE_KEYS) {
    values[key] = cleanValue(url.searchParams.get(key));
  }

  const referrer = sanitizeReferrer(input.referrer, expectedOrigin);
  const sourcePath = (url.pathname || '/').slice(0, MAX_PATH_LENGTH);
  return {
    ...values,
    landing_path: sourcePath,
    source_path: sourcePath,
    sanitized_referrer: referrer,
    captured_at: sanitizeCapturedAt(input.capturedAt, nowMs),
    source_confidence: deriveSourceConfidence(values, referrer, expectedOrigin),
  };
}

function isExternalReferrer(referrer: string | null, expectedOrigin: string): boolean {
  if (!referrer) return false;
  try {
    return !isSameExpectedSite(new URL(referrer), new URL(expectedOrigin));
  } catch {
    return false;
  }
}

export function isQualifyingTouch(
  touch: AttributionTouch,
  expectedOrigin = 'https://happyfacesla.com',
): boolean {
  return ATTRIBUTION_VALUE_KEYS.some((key) => Boolean(touch[key]))
    || isExternalReferrer(touch.sanitized_referrer, expectedOrigin);
}

function validExpiry(expiresAt: unknown, nowMs: number): boolean {
  if (expiresAt === null) return true;
  const value = cleanValue(expiresAt, 40);
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > nowMs;
}

function sanitizeTouchObject(
  value: unknown,
  config: AttributionCaptureConfig,
): AttributionTouch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const expectedOrigin = config.expectedOrigin || 'https://happyfacesla.com';
  const nowMs = config.nowMs ?? Date.now();
  const values = emptyValues();
  for (const key of ATTRIBUTION_VALUE_KEYS) values[key] = cleanValue(raw[key]);
  const referrer = sanitizeReferrer(raw.sanitized_referrer, expectedOrigin);
  return {
    ...values,
    landing_path: sanitizePath(raw.landing_path, expectedOrigin),
    source_path: sanitizePath(raw.source_path, expectedOrigin),
    sanitized_referrer: referrer,
    captured_at: sanitizeCapturedAt(raw.captured_at, nowMs),
    source_confidence: deriveSourceConfidence(values, referrer, expectedOrigin),
  };
}

export function sanitizeJourney(
  value: unknown,
  config: AttributionCaptureConfig = {},
): AttributionJourney | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== ATTRIBUTION_VERSION) return null;
  const nowMs = config.nowMs ?? Date.now();
  const expectedOrigin = config.expectedOrigin || 'https://happyfacesla.com';
  if (!validExpiry(raw.expires_at, nowMs)) return null;
  const firstTouch = sanitizeTouchObject(raw.first_touch, config);
  if (!firstTouch) return null;
  if (
    typeof config.retentionMs === 'number'
    && config.retentionMs >= 0
    && nowMs - Date.parse(firstTouch.captured_at) >= config.retentionMs
  ) {
    return null;
  }
  const sanitizedLatest = raw.latest_qualifying_touch === null
    ? null
    : sanitizeTouchObject(raw.latest_qualifying_touch, config);
  const latest = sanitizedLatest && isQualifyingTouch(sanitizedLatest, expectedOrigin)
    ? sanitizedLatest
    : null;
  const submit = raw.submit_touch === null
    ? null
    : sanitizeTouchObject(raw.submit_touch, config);
  return {
    version: ATTRIBUTION_VERSION,
    first_touch: firstTouch,
    latest_qualifying_touch: latest,
    submit_touch: submit,
    expires_at: cleanValue(raw.expires_at, 40),
  };
}

export function capturePageAttribution(
  current: AttributionJourney | null,
  input: AttributionCaptureInput,
  config: AttributionCaptureConfig = {},
): AttributionJourney {
  const nowMs = config.nowMs ?? Date.now();
  const existing = sanitizeJourney(current, { ...config, nowMs });
  const touch = captureTouch(input, { ...config, nowMs });
  const expectedOrigin = config.expectedOrigin || 'https://happyfacesla.com';
  const retentionMs = config.retentionMs ?? null;
  const expiresAt = retentionMs === null
    ? null
    : new Date(nowMs + Math.max(0, retentionMs)).toISOString();

  if (!existing) {
    return {
      version: ATTRIBUTION_VERSION,
      first_touch: touch,
      latest_qualifying_touch: isQualifyingTouch(touch, expectedOrigin) ? touch : null,
      submit_touch: null,
      expires_at: expiresAt,
    };
  }

  return {
    version: ATTRIBUTION_VERSION,
    first_touch: existing.first_touch,
    latest_qualifying_touch: isQualifyingTouch(touch, expectedOrigin)
      ? touch
      : existing.latest_qualifying_touch,
    submit_touch: null,
    expires_at: existing.expires_at,
  };
}

export function buildSubmissionJourney(
  current: AttributionJourney | null,
  input: AttributionCaptureInput,
  config: AttributionCaptureConfig = {},
): AttributionJourney {
  const captured = capturePageAttribution(current, input, config);
  return {
    ...captured,
    submit_touch: captureTouch(input, config),
  };
}

export function flattenJourney(journey: AttributionJourney): Record<string, string | null> {
  const selected = journey.latest_qualifying_touch ?? journey.first_touch;
  const submit = journey.submit_touch;
  const out: Record<string, string | null> = {
    landing_page: selected.landing_path,
    source_path: selected.source_path,
    referrer: selected.sanitized_referrer,
    first_landing_page: journey.first_touch.landing_path,
    first_source_path: journey.first_touch.source_path,
    first_referrer: journey.first_touch.sanitized_referrer,
    submit_landing_page: submit?.landing_path ?? null,
    submit_source_path: submit?.source_path ?? null,
    submit_referrer: submit?.sanitized_referrer ?? null,
  };
  for (const key of ATTRIBUTION_VALUE_KEYS) {
    out[key] = selected[key];
    out[`first_${key}`] = journey.first_touch[key];
    out[`submit_${key}`] = submit?.[key] ?? null;
  }
  return out;
}
