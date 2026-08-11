import type { D1Database, D1Value } from '../booking/availability-types.ts';
import { calculateCapacity, resolveKidsCount } from '../booking/capacity-engine.ts';
import { assessEligibility } from '../booking/eligibility.ts';
import {
  buildCanonicalLead,
  buildCanonicalNotificationPayload,
  validateLeadNotificationPayload,
  type CanonicalPlanMyPartyLead,
  type PreferredContactMethod,
} from './canonical-lead.ts';
import {
  flattenJourney,
  sanitizeJourney,
  type AttributionJourney,
} from '../attribution/atomic-attribution.ts';
import {
  createOpaqueLeadId,
  createServerSubmissionId,
  detectDeterministicSpam,
  normalizeFormRoute,
  normalizeSubmissionId,
  payloadHash,
  type FormRoute,
  type LeadAcceptanceResponse,
} from '../forms/acceptance-contract.ts';
import {
  configuredNotificationDestinations,
  drainNotificationOutbox,
  notificationRecoveryPolicy,
  type NotificationDestination,
  type NotificationRecoveryEnv,
} from './notification-recovery.ts';

export const QUOTE_REQUEST_FAILURE_MESSAGE =
  'We could not submit your request. Please call/text (310) 800-2860.';

export const QUOTE_REQUEST_SUCCESS_MESSAGE = 'Your request was received.';

export type QuoteRequestEnv = NotificationRecoveryEnv & {
  AVAILABILITY_D1?: D1Database;
  QUOTE_REQUESTS_D1?: D1Database;
  GOOGLE_ADS_OFFLINE_OUTBOX_ENABLED?: string;
  OWNER_NOTIFICATION_EMAIL?: string;
  QUOTE_REQUEST_EMAIL_PROVIDER?: string;
  QUOTE_REQUEST_EMAIL_API_KEY?: string;
  ATTRIBUTION_RETENTION_DAYS?: string;
  LEGACY_FORM_COMPAT_STARTED_AT_UTC?: string;
  LEGACY_FORM_COMPAT_UNTIL_UTC?: string;
  INTERNAL_TEST_TOKEN?: string;
  FORWARD_CONTRACT_ROLLBACK_MODE?: string;
};

type ValidationResult =
  | { ok: true; value: SanitizedQuoteRequest }
  | { ok: false; message: string };

type PersistedLeadRow = {
  lead_id: string;
  owner_notification_queued: number;
  owner_notification_sent: number;
  sheet_written: number;
  crm_posted: number;
  canonical_payload_json?: string | null;
};

type SubmissionIdentityRow = {
  submission_id: string;
  lead_id: string;
  form_route: FormRoute;
  payload_hash: string;
  conversion_eligible: number;
  suppression_reason: string | null;
};

type QuoteRequestResponse = LeadAcceptanceResponse;

type SanitizedLookbookInspiration = {
  public_look_slug: string;
  public_look_title: string | null;
  service: string | null;
  design_style: string | null;
  category: string | null;
};

type SanitizedQuoteRequest = {
  submissionId: string;
  formRoute: FormRoute;
  attribution: AttributionJourney;
  payloadHash: string;
  conversionEligible: boolean;
  notificationEligible: boolean;
  suppressionReason: string | null;
  clientContractVersion: 'atomic-v1' | 'legacy-bounded-v1';
  attributionPolicyVersion: 'AP03A-1' | 'AP03A-legacy-bounded-v1';
  eventType: string;
  services: string[];
  kidsCountBucket: string;
  kidsCountActual: number | null;
  designStyle: string;
  selectedDurationMinutes: number | null;
  recommendedDurationMinutes: number | null;
  branch: string;
  quoteOutcome: string | null;
  eventDate: string | null;
  eventTime: string | null;
  eventCity: string;
  venueName: string | null;
  travelMiles: number | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  specialRequests: string | null;
  wizardVersion: string;
  submittedAt: string | null;
  quoteRequestIdempotencyKey: string;
  consentAcknowledgement: true;
  lookbookInspirations: SanitizedLookbookInspiration[];
  preferredContactMethod: PreferredContactMethod;
  customerBudgetRaw: string | null;
  sourcePage: string | null;
  landingPage: string | null;
  sourcePath: string | null;
  referrer: string | null;
  firstLandingPage: string | null;
  firstSourcePath: string | null;
  firstReferrer: string | null;
  submitLandingPage: string | null;
  submitSourcePath: string | null;
  submitReferrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
  msclkid: string | null;
  firstUtmSource: string | null;
  firstUtmMedium: string | null;
  firstUtmCampaign: string | null;
  firstUtmTerm: string | null;
  firstUtmContent: string | null;
  firstGclid: string | null;
  firstGbraid: string | null;
  firstWbraid: string | null;
  submitUtmSource: string | null;
  submitUtmMedium: string | null;
  submitUtmCampaign: string | null;
  submitUtmTerm: string | null;
  submitUtmContent: string | null;
  submitGclid: string | null;
  submitGbraid: string | null;
  submitWbraid: string | null;
  legacyNotificationLead: Record<string, unknown> | null;
  internalTestAuthorized: boolean;
  internalTestReason: string | null;
};

type RequestContractContext = {
  legacyClient: boolean;
  legacyStorageKey: string | null;
  internalTestAuthorized: boolean;
  internalTestReason: string | null;
};

const MODERN_CONTRACT_CONTEXT: RequestContractContext = {
  legacyClient: false,
  legacyStorageKey: null,
  internalTestAuthorized: false,
  internalTestReason: null,
};

const LEGACY_COMPAT_MAX_MS = 14 * 24 * 60 * 60 * 1000;
const LEGACY_IDEMPOTENCY_RE = /^qrq_[a-z0-9-]{8,96}$/i;

const PROHIBITED_FIELDS = new Set([
  'band_id',
  'BAND-DISABLED',
  'TRAVEL_CALCULATOR_ENABLED',
  'payment_allowed',
  'stripe_live_allowed',
  'public_ui_allowed',
  'public_exposed',
  'booking_reference',
  'hold_reference',
  'idempotency_key',
  'client_secret',
  'payment_intent',
  'payment_link',
  'checkout_url',
  'checkoutUrl',
  'stripeSessionId',
  'stripe_session_id',
  'BOOKING_ENGINE_ENABLED',
  'STRIPE_ENABLED',
  'PUBLIC_BOOK_FLOW_EXPOSED',
  'PUBLIC_BOOKING_UI_ENABLED',
  'customQuoteTrigger',
]);

const SERVICE_ALLOWLIST = new Set([
  'face-painting',
  'balloon-twisting',
  'glitter-tattoos',
  'face-gems',
  'combo',
  'not-sure',
]);

const EVENT_TYPE_ALLOWLIST = new Set([
  'birthday-party',
  'school-event',
  'corporate-family-day',
  'festival-community',
  'other',
]);

const KIDS_BUCKET_ALLOWLIST = new Set([
  '1-10',
  '11-18',
  '19-25',
  '26-40',
  '40-plus',
  'not-sure',
]);

const DESIGN_STYLE_ALLOWLIST = new Set([
  'quick-cheek-arm',
  'standard-party',
  'full-face',
  'fast-event-menu',
  'not-sure',
]);

const SENSITIVE_TOKEN_PATTERNS = [
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]+/gi,
  /\bwhsec_[A-Za-z0-9_]+/gi,
  /\bcs_(?:live|test)_[A-Za-z0-9_]+/gi,
  /\bpi_[A-Za-z0-9_]+/gi,
  /\bch_[A-Za-z0-9_]+/gi,
  /\bpm_[A-Za-z0-9_]+/gi,
  /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g,
];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function failure(message = QUOTE_REQUEST_FAILURE_MESSAGE, status = 500): Response {
  return json({
    ok: false,
    accepted: false,
    received: false,
    persisted: false,
    created: false,
    duplicate: false,
    conversionEligible: false,
    ownerNotificationQueued: false,
    ownerNotificationSent: false,
    sheetWritten: false,
    crmPosted: false,
    message,
  }, status);
}

function normalizeString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return redactSensitiveTokens(value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeNullableString(value: unknown, maxLength: number): string | null {
  const normalized = normalizeString(value, maxLength);
  return normalized || null;
}

const NON_CUSTOMER_VALUES = new Set([
  '',
  'not provided',
  'not available',
  'needs confirmation',
  'unavailable',
  'unknown',
  'not-sure',
  'not_provided',
  'customer budget: not provided',
]);

function isMeaningfulCustomerText(value: unknown): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const normalized = String(value).trim().toLowerCase();
  return Boolean(normalized) && !NON_CUSTOMER_VALUES.has(normalized);
}

function hasMeaningfulCustomerField(body: Record<string, unknown>, services: string[]): boolean {
  return (
    isMeaningfulCustomerText(body.firstName) ||
    isMeaningfulCustomerText(body.lastName) ||
    isMeaningfulCustomerText(body.email) ||
    isMeaningfulCustomerText(body.phone) ||
    isMeaningfulCustomerText(body.eventType) ||
    isMeaningfulCustomerText(body.eventDate) ||
    isMeaningfulCustomerText(body.eventTime) ||
    isMeaningfulCustomerText(body.eventCity) ||
    isMeaningfulCustomerText(body.venueName) ||
    services.length > 0 ||
    isMeaningfulCustomerText(body.specialRequests) ||
    isMeaningfulCustomerText(body.customerBudget) ||
    isMeaningfulCustomerText(body.budget) ||
    isMeaningfulCustomerText(body.budget_range)
  );
}

function redactSensitiveTokens(value: string): string {
  return SENSITIVE_TOKEN_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, '[redacted]'),
    value,
  );
}

function normalizeEmail(value: unknown): string {
  return normalizeString(value, 254).toLowerCase();
}

function normalizePhone(value: unknown): string | null {
  const phone = normalizeString(value, 40).replace(/[^\d+().\-\s]/g, '').trim();
  return phone || null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeWholeNumber(value: unknown): number | null {
  const number = normalizeNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function normalizeDuration(value: unknown): number | null {
  const duration = normalizeWholeNumber(value);
  if (duration === null) return null;
  return duration > 0 && duration <= 480 ? duration : null;
}

function normalizeDate(value: unknown): string | null {
  const date = normalizeString(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function normalizeTime(value: unknown): string | null {
  const time = normalizeString(value, 5);
  return /^\d{2}:\d{2}$/.test(time) ? time : null;
}

function normalizeLookbookInspirations(value: unknown): SanitizedLookbookInspiration[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).map((entry) => {
    const item = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : {};
    const slug = normalizeString(item.public_look_slug, 120).toLowerCase();
    return {
      public_look_slug: /^[a-z0-9-]+$/.test(slug) ? slug : '',
      public_look_title: normalizeNullableString(item.public_look_title, 120),
      service: normalizeService(item.service),
      design_style: normalizeDesignStyle(item.design_style),
      category: normalizeNullableString(item.category, 80),
    };
  }).filter((item) => item.public_look_slug);
}

function normalizeService(value: unknown): string | null {
  const service = normalizeString(value, 40);
  return SERVICE_ALLOWLIST.has(service) ? service : null;
}

function normalizeDesignStyle(value: unknown): string | null {
  const style = normalizeString(value, 40);
  return DESIGN_STYLE_ALLOWLIST.has(style) ? style : null;
}

function normalizePreferredContactMethod(value: unknown): PreferredContactMethod {
  const v = normalizeString(value, 20).toLowerCase().replace(/[^a-z]/g, '');
  const map: Record<string, PreferredContactMethod> = {
    text: 'text', textme: 'text', sms: 'text',
    phone: 'phone', call: 'phone', callme: 'phone', phonecall: 'phone',
    email: 'email', emailme: 'email',
    any: 'any', anyisfine: 'any', either: 'any', anyok: 'any',
  };
  return map[v] ?? 'not_provided';
}

function normalizeAttribution(value: unknown): string | null {
  return normalizeNullableString(value, 512);
}

function normalizeUrlAttribution(value: unknown): string | null {
  const raw = normalizeAttribution(value);
  if (!raw) return null;
  try {
    const url = new URL(raw, 'https://happyfacesla.com');
    url.hash = '';
    return url.toString().slice(0, 512);
  } catch {
    return raw.slice(0, 512);
  }
}

function normalizePathAttribution(value: unknown): string | null {
  const raw = normalizeAttribution(value);
  if (!raw) return null;
  if (raw.startsWith('/')) return raw.split('#')[0].slice(0, 256);
  try {
    const url = new URL(raw);
    return (url.pathname || '/').slice(0, 256);
  } catch {
    return raw.slice(0, 256);
  }
}

function deriveSafeSourcePage(raw: Record<string, unknown>, request: Request): string | null {
  const referer = request.headers.get('referer') || request.headers.get('referrer') || '';
  if (referer) {
    try {
      const requestUrl = new URL(request.url);
      const refererUrl = new URL(referer);
      if (requestUrl.origin === refererUrl.origin && refererUrl.pathname) {
        return refererUrl.pathname;
      }
    } catch {
      // Fall through to a same-origin explicit source path.
    }
  }

  const explicit = normalizeAttribution(raw.sourcePage ?? raw.source_page);
  if (explicit) {
    try {
      const requestUrl = new URL(request.url);
      const explicitUrl = new URL(explicit, requestUrl.origin);
      if (explicitUrl.origin === requestUrl.origin) return explicitUrl.pathname || '/';
      return null;
    } catch {
      return null;
    }
  }

  return null;
}

const LEGACY_NOTIFICATION_STRING_LIMITS: Readonly<Record<string, number>> = {
  first_name: 80,
  last_name: 80,
  phone: 40,
  email: 254,
  event_date: 10,
  event_start_time: 5,
  event_city: 120,
  event_address_or_cross_streets_optional: 160,
  event_type: 120,
  estimated_guest_count: 20,
  children_count_optional: 20,
  budget_range: 80,
  message: 1000,
  source_page: 256,
  source_path: 256,
  utm_source: 256,
  utm_medium: 256,
  utm_campaign: 256,
  utm_term: 256,
  utm_content: 256,
  gclid: 512,
  gbraid: 512,
  wbraid: 512,
  fbclid: 512,
  msclkid: 512,
  lead_source: 120,
  campaign: 120,
  selected_package: 120,
  organization_venue_name: 160,
  package_interest: 120,
  painting_window: 120,
  venue_permission_confirmed: 80,
  need_invoice_coi: 120,
};

function normalizeLegacyNotificationLead(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const [field, limit] of Object.entries(LEGACY_NOTIFICATION_STRING_LIMITS)) {
    normalized[field] = normalizeString(raw[field], limit);
  }
  normalized.services_requested = Array.isArray(raw.services_requested)
    ? raw.services_requested
      .slice(0, 12)
      .map((item) => normalizeString(item, 120))
      .filter(Boolean)
    : [];
  normalized.consent_to_contact = raw.consent_to_contact === true;
  return normalized;
}

export function legacyCompatibilityWindowIsActive(
  env: QuoteRequestEnv,
  nowMs = Date.now(),
): boolean {
  const startedAt = Date.parse(getEnvString(env.LEGACY_FORM_COMPAT_STARTED_AT_UTC));
  const until = Date.parse(getEnvString(env.LEGACY_FORM_COMPAT_UNTIL_UTC));
  return Number.isFinite(startedAt)
    && Number.isFinite(until)
    && until > startedAt
    && until - startedAt <= LEGACY_COMPAT_MAX_MS
    && nowMs >= startedAt
    && nowMs <= until;
}

async function secureTokenMatch(supplied: string, configured: string): Promise<boolean> {
  if (!supplied || configured.length < 32 || supplied.length > 512 || configured.length > 512) {
    return false;
  }
  const encoder = new TextEncoder();
  const [suppliedDigest, configuredDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(supplied)),
    crypto.subtle.digest('SHA-256', encoder.encode(configured)),
  ]);
  const left = new Uint8Array(suppliedDigest);
  const right = new Uint8Array(configuredDigest);
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

async function internalTestContract(
  request: Request,
  raw: Record<string, unknown>,
  env: QuoteRequestEnv,
): Promise<Pick<RequestContractContext, 'internalTestAuthorized' | 'internalTestReason'>> {
  if (raw.internal_test !== true) {
    return { internalTestAuthorized: false, internalTestReason: null };
  }
  const configured = getEnvString(env.INTERNAL_TEST_TOKEN);
  const supplied = request.headers.get('x-hfla-internal-test-token')?.trim() ?? '';
  const authorized = await secureTokenMatch(supplied, configured);
  return authorized
    ? {
        internalTestAuthorized: true,
        internalTestReason: normalizeNullableString(raw.internal_test_reason, 120)
          ?? 'owner_authorized_synthetic_test',
      }
    : { internalTestAuthorized: false, internalTestReason: null };
}

function legacyTouch(
  raw: Record<string, unknown>,
  prefix: '' | 'first_' | 'submit_',
  sourcePage: string,
  capturedAt: string,
): Record<string, unknown> {
  const get = (key: string): unknown => raw[`${prefix}${key}`];
  const path = prefix === 'submit_'
    ? sourcePage
    : get('source_path') ?? get('landing_page') ?? sourcePage;
  return {
    gclid: get('gclid') ?? null,
    gbraid: get('gbraid') ?? null,
    wbraid: get('wbraid') ?? null,
    utm_source: get('utm_source') ?? null,
    utm_medium: get('utm_medium') ?? null,
    utm_campaign: get('utm_campaign') ?? null,
    utm_term: get('utm_term') ?? null,
    utm_content: get('utm_content') ?? null,
    landing_path: path,
    source_path: path,
    sanitized_referrer: get('referrer') ?? null,
    captured_at: capturedAt,
    source_confidence: 'direct',
  };
}

async function upgradeBoundedLegacyContract(
  raw: Record<string, unknown>,
  sourcePage: string | null,
  endpointPath: string,
  env: QuoteRequestEnv,
): Promise<{ raw: Record<string, unknown>; context: RequestContractContext }> {
  const hasModernMarker = raw.submission_id !== undefined
    || raw.submissionId !== undefined
    || raw.attribution !== undefined;
  if (hasModernMarker || !legacyCompatibilityWindowIsActive(env) || !sourcePage) {
    return { raw, context: MODERN_CONTRACT_CONTEXT };
  }

  const legacyKeyRaw = normalizeString(raw.quoteRequestIdempotencyKey, 128);
  const legacyStorageKey = endpointPath.endsWith('/api/quote-request')
    && LEGACY_IDEMPOTENCY_RE.test(legacyKeyRaw)
    ? legacyKeyRaw.toLowerCase()
    : null;
  const submissionId = legacyStorageKey
    ? `sub_${(await payloadHash({ contract: 'legacy-plan-v1', legacyStorageKey })).slice(0, 32)}`
    : createServerSubmissionId();
  const capturedAt = new Date().toISOString();
  const firstTouch = legacyTouch(raw, 'first_', sourcePage, capturedAt);
  const latestTouch = legacyTouch(raw, '', sourcePage, capturedAt);
  const submitTouch = legacyTouch(raw, 'submit_', sourcePage, capturedAt);
  const formRoute = endpointPath.endsWith('/api/quote-request')
    ? 'plan-my-party'
    : normalizeFormRoute(undefined, sourcePage);

  return {
    raw: {
      ...raw,
      submission_id: submissionId,
      form_route: formRoute,
      attribution: {
        version: 1,
        first_touch: firstTouch,
        latest_qualifying_touch: latestTouch,
        submit_touch: submitTouch,
        expires_at: null,
      },
    },
    context: {
      legacyClient: true,
      legacyStorageKey,
      internalTestAuthorized: false,
      internalTestReason: null,
    },
  };
}

function comparablePath(value: string): string {
  if (value === '/') return value;
  return value.replace(/\/+$/, '') || '/';
}

function safePayloadKeys(raw: Record<string, unknown> | null): string[] {
  if (!raw) return [];
  return Object.keys(raw).sort();
}

function logQuoteValidationFailure(
  request: Request,
  raw: Record<string, unknown> | null,
  code: string,
  missingFields: string[],
): void {
  console.warn('[quote-request] invalid lead payload rejected', {
    timestamp: new Date().toISOString(),
    endpoint: 'quote-request',
    method: request.method,
    sourcePage: raw ? normalizeAttribution(raw.sourcePage ?? raw.source_page) : null,
    payloadKeysPresent: safePayloadKeys(raw),
    missingRequiredFields: missingFields,
    userAgent: request.headers.get('user-agent') || null,
    requestId: request.headers.get('cf-ray') || request.headers.get('x-request-id') || null,
    validationErrorCode: code,
  });
}

function sanitizePayload(raw: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!PROHIBITED_FIELDS.has(key)) sanitized[key] = value;
  }
  return sanitized;
}

async function validatePayload(
  raw: Record<string, unknown>,
  sourcePage: string | null,
  attributionRetentionMs: number | null,
  endpointPath: string,
  contract: RequestContractContext,
): Promise<ValidationResult> {
  const body = sanitizePayload(raw);
  const eventType = normalizeString(body.eventType, 60);
  const rawServices = Array.isArray(body.services) ? body.services : [];
  const services = Array.isArray(body.services)
    ? body.services.map(normalizeService).filter((item): item is string => Boolean(item))
    : [];
  const kidsCountBucketRaw = normalizeString(body.kidsCountBucket, 20);
  const kidsCountBucket = kidsCountBucketRaw || 'not-sure';
  const kidsCountActual = body.kidsCountActual === null || body.kidsCountActual === undefined
    ? null
    : normalizeWholeNumber(body.kidsCountActual);
  const designStyleRaw = normalizeString(body.designStyle, 40);
  const designStyle = designStyleRaw || 'not-sure';
  const firstName = normalizeString(body.firstName, 80);
  const lastName = normalizeString(body.lastName, 80);
  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone);
  const eventCity = normalizeString(body.eventCity, 120);
  const rawEventDate = normalizeString(body.eventDate, 20);
  const eventDate = normalizeDate(body.eventDate);
  const rawEventTime = normalizeString(body.eventTime, 20);
  const eventTime = normalizeTime(body.eventTime);
  const submissionId = normalizeSubmissionId(body.submission_id ?? body.submissionId ?? body.quoteRequestIdempotencyKey);
  const formRoute = normalizeFormRoute(body.form_route ?? body.formRoute, sourcePage);
  const sourceDerivedRoute = endpointPath.endsWith('/api/quote-request')
    ? 'plan-my-party'
    : normalizeFormRoute(undefined, sourcePage);
  const attribution = sanitizeJourney(body.attribution, {
    expectedOrigin: 'https://happyfacesla.com',
    retentionMs: attributionRetentionMs,
  });
  const consentAcknowledgement = body.consentAcknowledgement === true || body.consentAcknowledgement === 'true';

  if (!hasMeaningfulCustomerField(body, services)) {
    return { ok: false, message: 'Please include your contact information.' };
  }
  if (!sourcePage) {
    return { ok: false, message: 'Source page is required.' };
  }
  if (!submissionId) {
    return { ok: false, message: 'A secure submission identity is required.' };
  }
  if (!attribution || !attribution.submit_touch) {
    return { ok: false, message: 'A complete attribution journey is required.' };
  }
  if (formRoute !== sourceDerivedRoute) {
    return { ok: false, message: 'Form route does not match the accepted source page.' };
  }
  const acceptedSourcePath = comparablePath(sourcePage);
  if (
    comparablePath(attribution.submit_touch.landing_path) !== acceptedSourcePath
    || comparablePath(attribution.submit_touch.source_path) !== acceptedSourcePath
  ) {
    return { ok: false, message: 'Submit attribution does not match the accepted form page.' };
  }
  if (!email && !phone) {
    return { ok: false, message: 'Phone or email is required.' };
  }
  if (!firstName && !lastName && !email && !phone) {
    return { ok: false, message: 'Contact identity is required.' };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: 'A valid email address is required.' };
  }
  if (eventType && !EVENT_TYPE_ALLOWLIST.has(eventType)) {
    return { ok: false, message: 'Please select a valid event type.' };
  }
  if (rawServices.length > 0 && services.length === 0) {
    return { ok: false, message: 'Please select a valid service.' };
  }
  if (!KIDS_BUCKET_ALLOWLIST.has(kidsCountBucket)) {
    return { ok: false, message: 'Please select the number of participating children.' };
  }
  if (
    body.kidsCountActual !== undefined &&
    body.kidsCountActual !== null &&
    (kidsCountActual === null || kidsCountActual < 1 || kidsCountActual > 200)
  ) {
    return { ok: false, message: 'Please enter a whole number of children between 1 and 200.' };
  }
  if (!DESIGN_STYLE_ALLOWLIST.has(designStyle)) {
    return { ok: false, message: 'Please select a valid design style.' };
  }
  if (rawEventDate && !eventDate) {
    return { ok: false, message: 'Please enter a valid event date.' };
  }
  if (rawEventTime && !eventTime) {
    return { ok: false, message: 'Please enter a valid event time.' };
  }
  if (!consentAcknowledgement) {
    return { ok: false, message: 'Please confirm we may contact you about this request.' };
  }

  const compatibility = flattenJourney(attribution);
  const spamReason = detectDeterministicSpam({
    firstName,
    lastName,
    email,
    specialRequests: body.specialRequests,
  });
  const suppressionReason = spamReason
    || (contract.legacyClient ? 'legacy_client_compatibility' : null);
  const value: SanitizedQuoteRequest = {
      submissionId,
      formRoute,
      attribution,
      payloadHash: '',
      conversionEligible: !spamReason && !contract.legacyClient,
      // Heuristic spam remains conversion-suppressed but must reach the owner
      // for review; only a honeypot or authenticated internal test is silent.
      notificationEligible: true,
      suppressionReason,
      clientContractVersion: contract.legacyClient ? 'legacy-bounded-v1' : 'atomic-v1',
      attributionPolicyVersion: contract.legacyClient ? 'AP03A-legacy-bounded-v1' : 'AP03A-1',
      eventType,
      services,
      kidsCountBucket,
      kidsCountActual,
      designStyle,
      selectedDurationMinutes: normalizeDuration(body.selectedDurationMinutes),
      recommendedDurationMinutes: normalizeDuration(body.recommendedDurationMinutes),
      branch: normalizeString(body.branch, 40) || 'custom-quote',
      quoteOutcome: normalizeNullableString(body.quoteOutcome, 80),
      eventDate,
      eventTime,
      eventCity,
      venueName: normalizeNullableString(body.venueName, 120),
      travelMiles: normalizeNumber(body.travelMiles),
      firstName,
      lastName,
      email,
      phone,
      specialRequests: normalizeNullableString(body.specialRequests, 1000),
      wizardVersion: normalizeString(body.wizardVersion, 80) || 'guided-wizard',
      submittedAt: normalizeNullableString(body.submittedAt, 40),
      quoteRequestIdempotencyKey: contract.legacyStorageKey || quoteRequestStorageKey(submissionId),
      consentAcknowledgement: true,
      lookbookInspirations: normalizeLookbookInspirations(body.lookbook_inspirations),
      preferredContactMethod: normalizePreferredContactMethod(body.preferredContactMethod),
      customerBudgetRaw: normalizeNullableString(body.customerBudget ?? body.budget ?? body.budget_range, 80),
      sourcePage,
      landingPage: normalizePathAttribution(compatibility.landing_page),
      sourcePath: normalizePathAttribution(compatibility.source_path),
      referrer: normalizeUrlAttribution(compatibility.referrer),
      firstLandingPage: normalizePathAttribution(compatibility.first_landing_page),
      firstSourcePath: normalizePathAttribution(compatibility.first_source_path),
      firstReferrer: normalizeUrlAttribution(compatibility.first_referrer),
      submitLandingPage: normalizePathAttribution(compatibility.submit_landing_page),
      submitSourcePath: normalizePathAttribution(compatibility.submit_source_path),
      submitReferrer: normalizeUrlAttribution(compatibility.submit_referrer),
      utmSource: normalizeAttribution(compatibility.utm_source),
      utmMedium: normalizeAttribution(compatibility.utm_medium),
      utmCampaign: normalizeAttribution(compatibility.utm_campaign),
      utmTerm: normalizeAttribution(compatibility.utm_term),
      utmContent: normalizeAttribution(compatibility.utm_content),
      gclid: normalizeAttribution(compatibility.gclid),
      gbraid: normalizeAttribution(compatibility.gbraid),
      wbraid: normalizeAttribution(compatibility.wbraid),
      fbclid: null,
      msclkid: null,
      firstUtmSource: normalizeAttribution(compatibility.first_utm_source),
      firstUtmMedium: normalizeAttribution(compatibility.first_utm_medium),
      firstUtmCampaign: normalizeAttribution(compatibility.first_utm_campaign),
      firstUtmTerm: normalizeAttribution(compatibility.first_utm_term),
      firstUtmContent: normalizeAttribution(compatibility.first_utm_content),
      firstGclid: normalizeAttribution(compatibility.first_gclid),
      firstGbraid: normalizeAttribution(compatibility.first_gbraid),
      firstWbraid: normalizeAttribution(compatibility.first_wbraid),
      submitUtmSource: normalizeAttribution(compatibility.submit_utm_source),
      submitUtmMedium: normalizeAttribution(compatibility.submit_utm_medium),
      submitUtmCampaign: normalizeAttribution(compatibility.submit_utm_campaign),
      submitUtmTerm: normalizeAttribution(compatibility.submit_utm_term),
      submitUtmContent: normalizeAttribution(compatibility.submit_utm_content),
      submitGclid: normalizeAttribution(compatibility.submit_gclid),
      submitGbraid: normalizeAttribution(compatibility.submit_gbraid),
      submitWbraid: normalizeAttribution(compatibility.submit_wbraid),
      legacyNotificationLead: normalizeLegacyNotificationLead(body.legacyNotificationLead),
      internalTestAuthorized: contract.internalTestAuthorized,
      internalTestReason: contract.internalTestReason,
  };

  value.payloadHash = await payloadHash({
    formRoute: value.formRoute,
    sourcePage: value.sourcePage,
    eventType: value.eventType,
    services: value.services,
    kidsCountBucket: value.kidsCountBucket,
    kidsCountActual: value.kidsCountActual,
    designStyle: value.designStyle,
    selectedDurationMinutes: value.selectedDurationMinutes,
    recommendedDurationMinutes: value.recommendedDurationMinutes,
    branch: value.branch,
    quoteOutcome: value.quoteOutcome,
    eventDate: value.eventDate,
    eventTime: value.eventTime,
    eventCity: value.eventCity,
    venueName: value.venueName,
    travelMiles: value.travelMiles,
    firstName: value.firstName,
    lastName: value.lastName,
    email: value.email,
    phone: value.phone,
    specialRequests: value.specialRequests,
    wizardVersion: value.wizardVersion,
    consentAcknowledgement: value.consentAcknowledgement,
    lookbookInspirations: value.lookbookInspirations,
    preferredContactMethod: value.preferredContactMethod,
    customerBudgetRaw: value.customerBudgetRaw,
  });
  return { ok: true, value };
}

function getPersistenceDb(env: QuoteRequestEnv): D1Database | undefined {
  return env.QUOTE_REQUESTS_D1 ?? env.AVAILABILITY_D1;
}

function makeLeadId(): string {
  return createOpaqueLeadId();
}

/**
 * quote_requests is an admitted legacy production table whose CHECK constraint
 * only accepts qrq_* idempotency keys. Keep that storage contract stable while
 * lead_submission_identity owns the new public sub_* identity.
 */
export function quoteRequestStorageKey(submissionId: string): string {
  const normalized = normalizeSubmissionId(submissionId);
  if (!normalized) throw new Error('A valid submission identity is required.');
  return `qrq_${normalized.slice(4)}`;
}

function attributionRetentionMs(env: QuoteRequestEnv): number | null {
  const days = Number(env.ATTRIBUTION_RETENTION_DAYS);
  if (!Number.isFinite(days) || days <= 0) return null;
  return Math.min(days, 365) * 24 * 60 * 60 * 1000;
}

function getTravelBand(travelMiles: number | null): string {
  if (travelMiles === null) return 'unknown';
  if (travelMiles <= 20) return 'local-0-20';
  if (travelMiles <= 40) return 'zone-20-40';
  if (travelMiles <= 60) return 'zone-40-60-manual';
  return 'custom-over-60';
}

function buildCanonical(body: SanitizedQuoteRequest, leadId: string, now: string): CanonicalPlanMyPartyLead {
  const durationMinutes = body.selectedDurationMinutes ?? body.recommendedDurationMinutes;
  const travelMiles = body.travelMiles;
  let requiredArtistCount: number | null = null;
  let serviceWindowMinutes: number | null = null;
  let quoteClassification = body.quoteOutcome ?? null;
  let eventTotalCents: number | null = null;
  let retainerCents: number | null = null;
  let pricingModel: string | null = null;

  if (durationMinutes !== null) {
    const kidsCount = resolveKidsCount(body.kidsCountBucket, body.kidsCountActual);
    const capacity = calculateCapacity({
      kidsCount,
      designStyle: body.designStyle,
      bookedDurationMinutes: durationMinutes,
    });
    requiredArtistCount = capacity.requiredArtistCount;
    serviceWindowMinutes = capacity.serviceWindowMinutes;
    const eligibility = assessEligibility({
      eventType: body.eventType,
      services: body.services,
      kidsCount,
      designStyle: body.designStyle,
      durationMinutes,
      travelMiles: travelMiles ?? 0,
      capacityResult: capacity,
    });
    if (!quoteClassification) {
      quoteClassification = eligibility.status === 'instant-book' ? 'instant-quote-eligible' : 'custom-quote-required';
    }
    if (eligibility.pricing) {
      eventTotalCents = eligibility.pricing.eventTotalCents;
      retainerCents = eligibility.pricing.retainerCents;
      pricingModel = eligibility.pricing.pricingModel;
    }
  }

  const canonical = buildCanonicalLead({
    endpoint: body.formRoute === 'plan-my-party' ? 'quote-request' : 'lead-adapter',
    leadId,
    createdAt: now,
    sourcePage: body.sourcePage,
    sourceConfidence: (
      body.attribution.latest_qualifying_touch
      ?? body.attribution.first_touch
    ).source_confidence,
    landingPage: body.landingPage,
    sourcePath: body.sourcePath,
    referrer: body.referrer,
    firstLandingPage: body.firstLandingPage,
    firstSourcePath: body.firstSourcePath,
    firstReferrer: body.firstReferrer,
    submitLandingPage: body.submitLandingPage,
    submitSourcePath: body.submitSourcePath,
    submitReferrer: body.submitReferrer,
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    phone: body.phone,
    preferredContactMethod: body.preferredContactMethod,
    eventType: body.eventType,
    eventDate: body.eventDate,
    startTime: body.eventTime,
    eventCity: body.eventCity,
    venueOrAddress: body.venueName,
    services: body.services,
    childCountBucket: body.kidsCountBucket,
    childCountActual: body.kidsCountActual,
    designStyle: body.designStyle,
    selectedDurationMinutes: body.selectedDurationMinutes,
    recommendedDurationMinutes: body.recommendedDurationMinutes,
    serviceWindowMinutes,
    requiredArtistCount,
    travelMiles,
    hasExactAddress: Boolean(body.venueName),
    quoteClassification,
    recommendationSummary: null,
    systemEstimatedTotalCents: eventTotalCents,
    systemRetainerCents: retainerCents,
    pricingModel,
    customerBudgetRaw: body.customerBudgetRaw,
    notes: body.specialRequests,
    utmSource: body.utmSource,
    utmMedium: body.utmMedium,
    utmCampaign: body.utmCampaign,
    utmTerm: body.utmTerm,
    utmContent: body.utmContent,
    gclid: body.gclid,
    gbraid: body.gbraid,
    wbraid: body.wbraid,
    fbclid: body.fbclid,
    msclkid: body.msclkid,
    firstUtmSource: body.firstUtmSource,
    firstUtmMedium: body.firstUtmMedium,
    firstUtmCampaign: body.firstUtmCampaign,
    firstUtmTerm: body.firstUtmTerm,
    firstUtmContent: body.firstUtmContent,
    firstGclid: body.firstGclid,
    firstGbraid: body.firstGbraid,
    firstWbraid: body.firstWbraid,
    submitUtmSource: body.submitUtmSource,
    submitUtmMedium: body.submitUtmMedium,
    submitUtmCampaign: body.submitUtmCampaign,
    submitUtmTerm: body.submitUtmTerm,
    submitUtmContent: body.submitUtmContent,
    submitGclid: body.submitGclid,
    submitGbraid: body.submitGbraid,
    submitWbraid: body.submitWbraid,
    internalTestAuthorized: body.internalTestAuthorized,
    internalTestReason: body.internalTestReason,
    consentAcknowledgement: body.consentAcknowledgement,
  });
  return {
    ...canonical,
    submissionId: body.submissionId,
    formRoute: body.formRoute,
    legacyNotificationLead: body.legacyNotificationLead,
  };
}

// Map the canonical lead to the D1 row. The FIRST 37 columns preserve the original
// order/bind positions (the post-release delivery contract reads bind indices 0-36).
// Attribution (migration 0003) and canonical-completeness columns (migration 0004)
// are APPENDED, so existing bind indices are unchanged. canonical_payload_json
// preserves the full canonical lead so no field is ever lost.
function canonicalToD1Record(
  c: CanonicalPlanMyPartyLead,
  body: SanitizedQuoteRequest,
  notificationQueued: boolean,
): Record<string, D1Value> {
  return {
    lead_id: c.leadId,
    idempotency_key: body.quoteRequestIdempotencyKey,
    // The live table has CHECK (source = 'plan-my-party'). The authoritative
    // route is stored in lead_submission_identity.form_route, source_page, and
    // canonical_payload_json; this field remains a legacy compatibility value.
    source: 'plan-my-party',
    received_at: c.createdAt,
    updated_at: c.createdAt,
    event_type: c.eventType,
    event_date: c.eventDate,
    start_time: c.startTime,
    event_city: c.eventCity,
    venue_name: c.venueOrAddress,
    travel_miles: c.travelMiles,
    travel_band: getTravelBand(c.travelMiles),
    travel_fee_estimate_cents: c.travelFeeCents ?? 0,
    services_json: JSON.stringify(c.services),
    kids_count_bucket: c.childCountBucket,
    kids_count_actual: c.childCountActual,
    design_style: c.designStyle,
    service_window_minutes: c.serviceWindowMinutes,
    required_artist_count: c.requiredArtistCount,
    quote_outcome: c.quoteClassification ?? 'custom-review',
    pricing_event_total_cents: c.systemEstimatedTotalCents,
    pricing_retainer_cents: c.systemRetainerCents,
    pricing_model: c.pricingModel,
    customer_first_name: c.firstName,
    customer_last_name: c.lastName,
    customer_email: c.email,
    customer_phone: c.phone,
    consent_acknowledgement: 'contact-about-request',
    sanitized_notes: c.notes,
    lookbook_inspirations_json: JSON.stringify(body.lookbookInspirations),
    wizard_version: body.wizardVersion,
    client_submitted_at: body.submittedAt,
    // Preserve the admitted live CHECK constraint. Suppression and shadow
    // eligibility are represented in the additive identity/outbox tables.
    delivery_status: 'persisted_internal_queue',
    owner_notification_queued: notificationQueued ? 1 : 0,
    owner_notification_sent: 0,
    sheet_written: 0,
    crm_posted: 0,
    // appended — migration 0003 attribution (now populated)
    source_page: c.sourcePage,
    utm_source: c.utmSource,
    utm_medium: c.utmMedium,
    utm_campaign: c.utmCampaign,
    utm_term: c.utmTerm,
    utm_content: c.utmContent,
    gclid: c.gclid,
    gbraid: c.gbraid,
    wbraid: c.wbraid,
    fbclid: c.fbclid,
    msclkid: c.msclkid,
    landing_page: c.landingPage,
    source_path: c.sourcePath,
    referrer: c.referrer,
    first_landing_page: c.firstLandingPage,
    first_source_path: c.firstSourcePath,
    first_referrer: c.firstReferrer,
    first_utm_source: c.firstUtmSource,
    first_utm_medium: c.firstUtmMedium,
    first_utm_campaign: c.firstUtmCampaign,
    first_utm_term: c.firstUtmTerm,
    first_utm_content: c.firstUtmContent,
    first_gclid: c.firstGclid,
    first_gbraid: c.firstGbraid,
    first_wbraid: c.firstWbraid,
    submit_landing_page: c.submitLandingPage,
    submit_source_path: c.submitSourcePath,
    submit_referrer: c.submitReferrer,
    submit_utm_source: c.submitUtmSource,
    submit_utm_medium: c.submitUtmMedium,
    submit_utm_campaign: c.submitUtmCampaign,
    submit_utm_term: c.submitUtmTerm,
    submit_utm_content: c.submitUtmContent,
    submit_gclid: c.submitGclid,
    submit_gbraid: c.submitGbraid,
    submit_wbraid: c.submitWbraid,
    source_confidence: c.sourceConfidence,
    // appended — migration 0004 canonical-completeness columns
    preferred_contact_method: c.preferredContactMethod,
    child_count_confidence: c.childCountConfidence,
    duration_minutes: c.durationMinutes,
    duration_source: c.durationSource,
    computed_end_time: c.computedEndTime,
    travel_source: c.travelSource,
    travel_note: c.travelNote,
    customer_budget_provided: c.customerBudgetProvided ? 1 : 0,
    customer_budget_amount_cents: c.customerBudgetAmountCents,
    customer_budget_label: c.customerBudgetLabel,
    pricing_source: c.pricingSource,
    manual_review_reasons_json: JSON.stringify(c.manualReviewReasons),
    qualified_status: body.suppressionReason?.startsWith('spam') ? 'spam' : c.qualifiedStatus,
    quote_sent_status: c.quoteSentStatus,
    booked_status: c.bookedStatus,
    booked_revenue_cents: c.bookedRevenueCents,
    booked_revenue_currency: c.bookedRevenueCurrency,
    lost_reason: c.lostReason,
    duplicate_of_lead_id: c.duplicateOfLeadId,
    owner_review_notes: c.ownerReviewNotes,
    owner_reviewed_at_utc: null,
    owner_reviewed_by: null,
    is_internal_test: c.isInternalTest ? 1 : 0,
    internal_test_reason: c.internalTestReason,
    canonical_payload_json: JSON.stringify(c),
  };
}

async function selectExistingLead(db: D1Database, idempotencyKey: string): Promise<PersistedLeadRow | null> {
  return db
    .prepare(
      `SELECT lead_id, owner_notification_queued, owner_notification_sent, sheet_written, crm_posted,
              canonical_payload_json
       FROM quote_requests
       WHERE idempotency_key = ?
       LIMIT 1`,
    )
    .bind(idempotencyKey)
    .first<PersistedLeadRow>();
}

async function selectSubmissionIdentity(
  db: D1Database,
  submissionId: string,
): Promise<SubmissionIdentityRow | null> {
  return db
    .prepare(
      `SELECT submission_id, lead_id, form_route, payload_hash, conversion_eligible, suppression_reason
       FROM lead_submission_identity
       WHERE submission_id = ?
       LIMIT 1`,
    )
    .bind(submissionId)
    .first<SubmissionIdentityRow>();
}

const QUOTE_REQUEST_INSERT_COLUMNS = [
  'lead_id',
  'idempotency_key',
  'source',
  'received_at',
  'updated_at',
  'event_type',
  'event_date',
  'start_time',
  'event_city',
  'venue_name',
  'travel_miles',
  'travel_band',
  'travel_fee_estimate_cents',
  'services_json',
  'kids_count_bucket',
  'kids_count_actual',
  'design_style',
  'service_window_minutes',
  'required_artist_count',
  'quote_outcome',
  'pricing_event_total_cents',
  'pricing_retainer_cents',
  'pricing_model',
  'customer_first_name',
  'customer_last_name',
  'customer_email',
  'customer_phone',
  'consent_acknowledgement',
  'sanitized_notes',
  'lookbook_inspirations_json',
  'wizard_version',
  'client_submitted_at',
  'delivery_status',
  'owner_notification_queued',
  'owner_notification_sent',
  'sheet_written',
  'crm_posted',
  'source_page',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'msclkid',
  'landing_page',
  'source_path',
  'referrer',
  'first_landing_page',
  'first_source_path',
  'first_referrer',
  'first_utm_source',
  'first_utm_medium',
  'first_utm_campaign',
  'first_utm_term',
  'first_utm_content',
  'first_gclid',
  'first_gbraid',
  'first_wbraid',
  'submit_landing_page',
  'submit_source_path',
  'submit_referrer',
  'submit_utm_source',
  'submit_utm_medium',
  'submit_utm_campaign',
  'submit_utm_term',
  'submit_utm_content',
  'submit_gclid',
  'submit_gbraid',
  'submit_wbraid',
  'source_confidence',
  'preferred_contact_method',
  'child_count_confidence',
  'duration_minutes',
  'duration_source',
  'computed_end_time',
  'travel_source',
  'travel_note',
  'customer_budget_provided',
  'customer_budget_amount_cents',
  'customer_budget_label',
  'pricing_source',
  'manual_review_reasons_json',
  'qualified_status',
  'quote_sent_status',
  'booked_status',
  'booked_revenue_cents',
  'booked_revenue_currency',
  'lost_reason',
  'duplicate_of_lead_id',
  'owner_review_notes',
  'owner_reviewed_at_utc',
  'owner_reviewed_by',
  'is_internal_test',
  'internal_test_reason',
  'canonical_payload_json',
] as const;

function prepareLeadInsert(db: D1Database, record: Record<string, D1Value>) {
  const placeholders = QUOTE_REQUEST_INSERT_COLUMNS.map(() => '?').join(', ');
  const columns = QUOTE_REQUEST_INSERT_COLUMNS.join(', ');
  return db
    .prepare(`INSERT INTO quote_requests (${columns}) VALUES (${placeholders})`)
    .bind(...QUOTE_REQUEST_INSERT_COLUMNS.map((column) => record[column] ?? null));
}

function prepareSubmissionIdentityInsert(
  db: D1Database,
  body: SanitizedQuoteRequest,
  leadId: string,
  acceptedAt: string,
) {
  return db.prepare(
    `INSERT INTO lead_submission_identity (
      submission_id, lead_id, form_route, payload_hash, accepted_at_utc,
      conversion_eligible, suppression_reason, business_duplicate_of_lead_id,
      first_touch_json, latest_qualifying_touch_json, submit_touch_json,
      client_contract_version, attribution_policy_version, canonical_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'AP02A-1')`,
  ).bind(
    body.submissionId,
    leadId,
    body.formRoute,
    body.payloadHash,
    acceptedAt,
    body.conversionEligible ? 1 : 0,
    body.suppressionReason,
    JSON.stringify(body.attribution.first_touch),
    body.attribution.latest_qualifying_touch
      ? JSON.stringify(body.attribution.latest_qualifying_touch)
      : null,
    JSON.stringify(body.attribution.submit_touch),
    body.clientContractVersion,
    body.attributionPolicyVersion,
  );
}

function prepareCanonicalOutboxInsert(
  db: D1Database,
  body: SanitizedQuoteRequest,
  leadId: string,
  acceptedAt: string,
) {
  return db.prepare(
    `INSERT INTO canonical_lead_outbox (
      outbox_id, submission_id, lead_id, event_name, conversion_eligible,
      status, suppression_reason, payload_hash, canonical_version,
      created_at_utc, updated_at_utc
    ) VALUES (?, ?, ?, 'genuine_form_lead', ?, ?, ?, ?, 'AP02A-1', ?, ?)`,
  ).bind(
    `cfo_${leadId.slice(5)}`,
    body.submissionId,
    leadId,
    0,
    body.conversionEligible ? 'shadow_pending' : 'suppressed',
    body.conversionEligible ? 'pending_business_classification' : body.suppressionReason,
    body.payloadHash,
    acceptedAt,
    acceptedAt,
  );
}

function prepareNotificationOutboxInsert(
  db: D1Database,
  body: SanitizedQuoteRequest,
  leadId: string,
  acceptedAt: string,
  destination: NotificationDestination,
) {
  return db.prepare(
    `INSERT INTO lead_notification_outbox (
      notification_id, submission_id, lead_id, destination, status,
      attempt_count, max_attempts, next_attempt_at_utc,
      last_attempt_at_utc, last_error_code,
      created_at_utc, updated_at_utc
    ) VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, NULL, NULL, ?, ?)`,
  ).bind(
    `notify_${destination}_${leadId.slice(5)}`,
    body.submissionId,
    leadId,
    destination,
    notificationRecoveryPolicy.defaultMaxAttempts,
    acceptedAt,
    acceptedAt,
    acceptedAt,
  );
}

async function insertAcceptedSubmission(
  db: D1Database,
  body: SanitizedQuoteRequest,
  record: Record<string, D1Value>,
  leadId: string,
  acceptedAt: string,
  notificationDestinations: NotificationDestination[],
): Promise<void> {
  if (!db.batch) throw new Error('D1 batch support is required for canonical lead acceptance.');
  const statements = [
    prepareSubmissionIdentityInsert(db, body, leadId, acceptedAt),
    prepareLeadInsert(db, record),
    prepareCanonicalOutboxInsert(db, body, leadId, acceptedAt),
  ];
  if (body.notificationEligible) {
    for (const destination of notificationDestinations) {
      statements.push(prepareNotificationOutboxInsert(db, body, leadId, acceptedAt, destination));
    }
  }
  const results = await db.batch(statements);
  if (results.some((result) => result.success === false || Boolean(result.error))) {
    throw new Error('Canonical lead acceptance batch failed.');
  }
}

function getEnvString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function forwardContractRollbackMode(env: QuoteRequestEnv): boolean {
  return ['1', 'true', 'yes', 'on'].includes(
    getEnvString(env.FORWARD_CONTRACT_ROLLBACK_MODE).toLowerCase(),
  );
}

function success(
  row: PersistedLeadRow,
  identity: SubmissionIdentityRow,
  duplicate = false,
  created = !duplicate,
): Response {
  return json({
    ok: true,
    accepted: true,
    received: true,
    leadId: row.lead_id,
    submissionId: identity.submission_id,
    formRoute: identity.form_route,
    persisted: true,
    created,
    ownerNotificationQueued: row.owner_notification_queued === 1,
    ownerNotificationSent: row.owner_notification_sent === 1,
    sheetWritten: row.sheet_written === 1,
    crmPosted: row.crm_posted === 1,
    duplicate,
    conversionEligible: identity.conversion_eligible === 1,
    suppressionReason: identity.suppression_reason || undefined,
    message: QUOTE_REQUEST_SUCCESS_MESSAGE,
  });
}

async function persistQuoteRequest(
  db: D1Database,
  body: SanitizedQuoteRequest,
  env: QuoteRequestEnv,
): Promise<{ response: Response; canonical: CanonicalPlanMyPartyLead | null }> {
  let existingIdentity: SubmissionIdentityRow | null;
  try {
    existingIdentity = await selectSubmissionIdentity(db, body.submissionId);
  } catch {
    return { response: failure(), canonical: null };
  }
  if (existingIdentity) {
    if (existingIdentity.payload_hash !== body.payloadHash) {
      return { response: failure('Submission identity conflicts with the original accepted payload.', 409), canonical: null };
    }
    const existing = await selectExistingLead(db, body.quoteRequestIdempotencyKey);
    if (!existing) return { response: failure(), canonical: null };
    return {
      response: success(existing, existingIdentity, true, false),
      canonical: existing.owner_notification_queued === 1 && existing.owner_notification_sent !== 1
        ? parsePersistedCanonical(existing)
        : null,
    };
  }

  // A Plan My Party tab opened before cutover can retry a qrq_* submission
  // that already exists but has no additive identity row. Return the durable
  // historical lead without mutating or duplicating it.
  if (body.clientContractVersion === 'legacy-bounded-v1') {
    try {
      const historical = await selectExistingLead(db, body.quoteRequestIdempotencyKey);
      if (historical) {
        return {
          response: success(historical, {
            submission_id: body.submissionId,
            lead_id: historical.lead_id,
            form_route: body.formRoute,
            payload_hash: body.payloadHash,
            conversion_eligible: 0,
            suppression_reason: 'legacy_historical_retry',
          }, true, false),
          canonical: null,
        };
      }
    } catch {
      return { response: failure(), canonical: null };
    }
  }

  const now = new Date().toISOString();
  const leadId = makeLeadId();
  const canonical = buildCanonical(body, leadId, now);
  if (canonical.isInternalTest) {
    body.conversionEligible = false;
    body.notificationEligible = false;
    body.suppressionReason = canonical.internalTestReason
      ? `internal_test:${canonical.internalTestReason.replace(/\s+/g, '_')}`
      : 'internal_test';
  }
  if (forwardContractRollbackMode(env)) {
    body.conversionEligible = false;
    body.suppressionReason = 'forward_contract_rollback';
  }
  const notificationValidation = validateLeadNotificationPayload(buildCanonicalNotificationPayload(canonical));
  if (!notificationValidation.ok) {
    console.error('BLANK_LEAD_EMAIL_BLOCKED', {
      timestamp: new Date().toISOString(),
      endpoint: 'quote-request',
      sourcePage: canonical.sourcePage,
      payloadKeysPresent: Object.keys(buildCanonicalNotificationPayload(canonical)).sort(),
      missingRequiredFields: notificationValidation.missingFields,
      validationErrorCode: notificationValidation.code,
    });
    return { response: failure('Invalid lead payload.', 400), canonical: null };
  }
  const notificationDestinations = body.notificationEligible
    ? configuredNotificationDestinations(env, body.formRoute)
    : [];
  const notificationQueued = notificationDestinations.length > 0;
  const record = canonicalToD1Record(canonical, body, notificationQueued);
  const identity: SubmissionIdentityRow = {
    submission_id: body.submissionId,
    lead_id: leadId,
    form_route: body.formRoute,
    payload_hash: body.payloadHash,
    conversion_eligible: body.conversionEligible ? 1 : 0,
    suppression_reason: body.suppressionReason,
  };

  try {
    await insertAcceptedSubmission(
      db,
      body,
      record,
      leadId,
      now,
      notificationDestinations,
    );
  } catch {
    try {
      const duplicateIdentity = await selectSubmissionIdentity(db, body.submissionId);
      const duplicate = await selectExistingLead(db, body.quoteRequestIdempotencyKey);
      if (duplicateIdentity && duplicate) {
        if (duplicateIdentity.payload_hash !== body.payloadHash) {
          return { response: failure('Submission identity conflicts with the original accepted payload.', 409), canonical: null };
        }
        return {
          response: success(duplicate, duplicateIdentity, true, false),
          canonical: duplicate.owner_notification_queued === 1 && duplicate.owner_notification_sent !== 1
            ? parsePersistedCanonical(duplicate)
            : null,
        };
      }
    } catch {
      // Fall through to fail closed.
    }
    return { response: failure(), canonical: null };
  }

  return {
    response: success({
      lead_id: leadId,
      owner_notification_queued: notificationQueued ? 1 : 0,
      owner_notification_sent: 0,
      sheet_written: 0,
      crm_posted: 0,
    }, identity),
    canonical,
  };
}

function parsePersistedCanonical(row: PersistedLeadRow): CanonicalPlanMyPartyLead | null {
  if (!row.canonical_payload_json) return null;
  try {
    const parsed = JSON.parse(row.canonical_payload_json) as Partial<CanonicalPlanMyPartyLead>;
    return parsed && parsed.leadId === row.lead_id
      ? parsed as CanonicalPlanMyPartyLead
      : null;
  } catch {
    return null;
  }
}

export async function handleQuoteRequest(request: Request, env: QuoteRequestEnv): Promise<Response> {
  if (request.method !== 'POST') {
    return failure('Method not allowed.', 405);
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return failure('Content-Type must be application/json.', 415);
  }

  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    logQuoteValidationFailure(request, null, 'malformed_json', ['json_body']);
    return failure('Invalid request body.', 400);
  }

  if (normalizeString(raw.honeypot, 200)) {
    return json({
      ok: true,
      accepted: false,
      received: false,
      persisted: false,
      created: false,
      duplicate: false,
      conversionEligible: false,
      suppressionReason: 'honeypot',
      ownerNotificationQueued: false,
      ownerNotificationSent: false,
      sheetWritten: false,
      crmPosted: false,
      message: QUOTE_REQUEST_SUCCESS_MESSAGE,
    });
  }

  const sourcePage = deriveSafeSourcePage(raw, request);
  const endpointPath = new URL(request.url).pathname;
  const upgraded = await upgradeBoundedLegacyContract(raw, sourcePage, endpointPath, env);
  const testContract = await internalTestContract(request, upgraded.raw, env);
  const parsed = await validatePayload(
    upgraded.raw,
    sourcePage,
    attributionRetentionMs(env),
    endpointPath,
    { ...upgraded.context, ...testContract },
  );
  if (!parsed.ok) {
    logQuoteValidationFailure(request, raw, 'invalid_payload', [parsed.message]);
    return failure(parsed.message, 400);
  }

  const db = getPersistenceDb(env);
  if (!db) return failure();

  const { response: persistedResponse } = await persistQuoteRequest(db, parsed.value, env);
  if (!persistedResponse.ok) return persistedResponse;

  let persisted: QuoteRequestResponse;
  try {
    persisted = await persistedResponse.clone().json() as QuoteRequestResponse;
  } catch {
    return persistedResponse;
  }

  if (!persisted.leadId || !persisted.ownerNotificationQueued) {
    return persistedResponse;
  }

  try {
    await drainNotificationOutbox(db, env, {
      leadId: persisted.leadId,
      limit: 3,
    });
  } catch {
    return persistedResponse;
  }

  try {
    const refreshed = await selectExistingLead(db, parsed.value.quoteRequestIdempotencyKey);
    if (!refreshed) return persistedResponse;
    return json({
      ...persisted,
      ownerNotificationSent: refreshed.owner_notification_sent === 1,
      sheetWritten: refreshed.sheet_written === 1,
      crmPosted: refreshed.crm_posted === 1,
    });
  } catch {
    return persistedResponse;
  }
}
