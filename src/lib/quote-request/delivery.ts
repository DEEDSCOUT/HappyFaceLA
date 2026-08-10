import type { D1Database, D1Value } from '../booking/availability-types.ts';
import { calculateCapacity, resolveKidsCount } from '../booking/capacity-engine.ts';
import { assessEligibility } from '../booking/eligibility.ts';
import {
  assertLeadNotificationPayloadCanSend,
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
  detectDeterministicSpam,
  normalizeFormRoute,
  normalizeSubmissionId,
  payloadHash,
  type FormRoute,
  type LeadAcceptanceResponse,
} from '../forms/acceptance-contract.ts';

export const QUOTE_REQUEST_FAILURE_MESSAGE =
  'We could not submit your request. Please call/text (310) 800-2860.';

export const QUOTE_REQUEST_SUCCESS_MESSAGE = 'Your request was received.';

export type QuoteRequestEnv = {
  AVAILABILITY_D1?: D1Database;
  QUOTE_REQUESTS_D1?: D1Database;
  GOOGLE_ADS_OFFLINE_OUTBOX_ENABLED?: string;
  QUOTE_REQUEST_CRM_WEBHOOK_URL?: string;
  QUOTE_REQUEST_CRM_WEBHOOK_SECRET?: string;
  QUOTE_REQUEST_SHEET_WEBHOOK_URL?: string;
  QUOTE_REQUEST_SHEET_WEBHOOK_SECRET?: string;
  QUOTE_REQUEST_MAKE_WEBHOOK_URL?: string;
  QUOTE_REQUEST_MAKE_SHARED_SECRET?: string;
  OWNER_NOTIFICATION_EMAIL?: string;
  QUOTE_REQUEST_EMAIL_PROVIDER?: string;
  QUOTE_REQUEST_EMAIL_API_KEY?: string;
  ATTRIBUTION_RETENTION_DAYS?: string;
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
  suppressionReason: string | null;
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
};

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
  const value: SanitizedQuoteRequest = {
      submissionId,
      formRoute,
      attribution,
      payloadHash: '',
      conversionEligible: !spamReason,
      suppressionReason: spamReason,
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
      quoteRequestIdempotencyKey: submissionId,
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

  return buildCanonicalLead({
    endpoint: 'quote-request',
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
    consentAcknowledgement: body.consentAcknowledgement,
  });
}

// Map the canonical lead to the D1 row. The FIRST 37 columns preserve the original
// order/bind positions (the post-release delivery contract reads bind indices 0-36).
// Attribution (migration 0003) and canonical-completeness columns (migration 0004)
// are APPENDED, so existing bind indices are unchanged. canonical_payload_json
// preserves the full canonical lead so no field is ever lost.
function canonicalToD1Record(c: CanonicalPlanMyPartyLead, body: SanitizedQuoteRequest): Record<string, D1Value> {
  return {
    lead_id: c.leadId,
    idempotency_key: body.quoteRequestIdempotencyKey,
    source: body.formRoute,
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
    delivery_status: body.conversionEligible ? 'persisted_internal_queue' : 'suppressed_at_intake',
    owner_notification_queued: body.conversionEligible ? 1 : 0,
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
      attribution_policy_version, canonical_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 'AP03A-1', 'AP02A-1')`,
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
) {
  return db.prepare(
    `INSERT INTO lead_notification_outbox (
      notification_id, submission_id, lead_id, destination, status,
      attempt_count, last_attempt_at_utc, last_error_code,
      created_at_utc, updated_at_utc
    ) VALUES (?, ?, ?, 'owner_notification', 'pending', 0, NULL, NULL, ?, ?)`,
  ).bind(
    `notify_${leadId.slice(5)}`,
    body.submissionId,
    leadId,
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
): Promise<void> {
  if (!db.batch) throw new Error('D1 batch support is required for canonical lead acceptance.');
  const statements = [
    prepareSubmissionIdentityInsert(db, body, leadId, acceptedAt),
    prepareLeadInsert(db, record),
    prepareCanonicalOutboxInsert(db, body, leadId, acceptedAt),
  ];
  if (body.conversionEligible) {
    statements.push(prepareNotificationOutboxInsert(db, body, leadId, acceptedAt));
  }
  const results = await db.batch(statements);
  if (results.some((result) => result.success === false || Boolean(result.error))) {
    throw new Error('Canonical lead acceptance batch failed.');
  }
}

function prepareDeliveryFlagUpdate(
  db: D1Database,
  leadId: string,
  flags: { ownerNotificationSent: boolean; sheetWritten: boolean; crmPosted: boolean },
  now: string,
  claimToken: string,
) {
  const deliveryStatus =
    flags.ownerNotificationSent || flags.sheetWritten || flags.crmPosted
      ? 'persisted_optional_notification_succeeded'
      : 'persisted_internal_queue';

  return db
    .prepare(
      `UPDATE quote_requests
       SET updated_at = ?, delivery_status = ?, owner_notification_sent = ?, sheet_written = ?, crm_posted = ?
       WHERE lead_id = ?
         AND EXISTS (
           SELECT 1 FROM lead_notification_outbox
           WHERE lead_id = ? AND destination = 'owner_notification'
             AND status = 'delivering' AND claim_token = ?
         )`,
    )
    .bind(
      now,
      deliveryStatus,
      flags.ownerNotificationSent ? 1 : 0,
      flags.sheetWritten ? 1 : 0,
      flags.crmPosted ? 1 : 0,
      leadId,
      leadId,
      claimToken,
    );
}

function prepareNotificationFinalization(
  db: D1Database,
  leadId: string,
  sent: boolean,
  now: string,
  claimToken: string,
) {
  return db.prepare(
    `UPDATE lead_notification_outbox
     SET status = ?,
          attempt_count = attempt_count + 1,
          claim_token = NULL,
          lease_expires_at_utc = NULL,
          last_attempt_at_utc = ?,
         last_error_code = ?,
         updated_at_utc = ?
     WHERE lead_id = ? AND destination = 'owner_notification'
       AND status = 'delivering' AND claim_token = ?`,
  ).bind(
    sent ? 'sent' : 'failed_retryable',
    now,
    sent ? null : 'all_configured_destinations_failed',
    now,
    leadId,
    claimToken,
  );
}

function makeNotificationClaimToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `claim_${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

async function claimNotificationOutbox(db: D1Database, leadId: string): Promise<string | null> {
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseExpires = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
  const claimToken = makeNotificationClaimToken();
  const result = await db.prepare(
    `UPDATE lead_notification_outbox
     SET status = 'delivering', claim_token = ?, lease_expires_at_utc = ?, updated_at_utc = ?
     WHERE lead_id = ?
       AND destination = 'owner_notification'
       AND (
         status IN ('pending', 'failed_retryable')
         OR (status = 'delivering' AND lease_expires_at_utc < ?)
       )`,
  ).bind(claimToken, leaseExpires, nowIso, leadId, nowIso).run();
  return (result.meta?.changes ?? 0) > 0 ? claimToken : null;
}

async function finalizeNotificationAttempt(
  db: D1Database,
  leadId: string,
  flags: { ownerNotificationSent: boolean; sheetWritten: boolean; crmPosted: boolean },
  claimToken: string,
): Promise<void> {
  if (!db.batch) throw new Error('D1 batch support is required for notification finalization.');
  const now = new Date().toISOString();
  const results = await db.batch([
    prepareDeliveryFlagUpdate(db, leadId, flags, now, claimToken),
    prepareNotificationFinalization(db, leadId, flags.ownerNotificationSent, now, claimToken),
  ]);
  if (
    results.some((result) => result.success === false || Boolean(result.error))
    || results.some((result) => (result.meta?.changes ?? 0) !== 1)
  ) {
    throw new Error('Notification finalization batch failed.');
  }
}

async function hmacSignature(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function getEnvString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// The Make/Gmail/Sheets payload is now built from the canonical lead via
// buildCanonicalNotificationPayload (canonical-lead.ts), so every customer-entered
// field and every system-recommended value is delivered, truthfully labeled.

async function postWebhook(url: string, secret: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    assertLeadNotificationPayloadCanSend(payload);
  } catch (err) {
    console.error('BLANK_LEAD_EMAIL_BLOCKED', {
      timestamp: new Date().toISOString(),
      endpoint: 'quote-request',
      sourcePage: normalizeAttribution(payload.source_page),
      payloadKeysPresent: Object.keys(payload).sort(),
      missingRequiredFields: err instanceof Error
        ? (err as Error & { missingFields?: string[] }).missingFields ?? []
        : [],
      validationErrorCode: 'BLANK_LEAD_EMAIL_BLOCKED',
    });
    return false;
  }

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-lead-source': `happyfacesla-${String(payload.form_route || 'canonical-lead')}`,
  };
  if (typeof payload.lead_id === 'string') headers['x-idempotency-key'] = payload.lead_id;
  if (secret) headers['x-signature-sha256'] = await hmacSignature(secret, body);

  try {
    const response = await fetch(url, { method: 'POST', headers, body });
    return response.ok;
  } catch {
    return false;
  }
}

async function runOptionalNotifications(
  env: QuoteRequestEnv,
  canonical: CanonicalPlanMyPartyLead,
  body: SanitizedQuoteRequest,
): Promise<{ attempted: boolean; ownerNotificationSent: boolean; sheetWritten: boolean; crmPosted: boolean }> {
  const payload = {
    ...buildCanonicalNotificationPayload(canonical),
    source: body.formRoute,
    form_route: body.formRoute,
    submission_id: body.submissionId,
  };
  const crmUrl = getEnvString(env.QUOTE_REQUEST_CRM_WEBHOOK_URL);
  const sheetUrl = getEnvString(env.QUOTE_REQUEST_SHEET_WEBHOOK_URL);
  const makeUrl = getEnvString(env.QUOTE_REQUEST_MAKE_WEBHOOK_URL);
  const crmSecret = getEnvString(env.QUOTE_REQUEST_CRM_WEBHOOK_SECRET);
  const sheetSecret = getEnvString(env.QUOTE_REQUEST_SHEET_WEBHOOK_SECRET);
  const makeSecret = getEnvString(env.QUOTE_REQUEST_MAKE_SHARED_SECRET);

  let crmPosted = false;
  let sheetWritten = false;
  let makePosted = false;
  if (body.formRoute === 'plan-my-party') {
    crmPosted = crmUrl ? await postWebhook(crmUrl, crmSecret, payload) : false;
    sheetWritten = sheetUrl ? await postWebhook(sheetUrl, sheetSecret, payload) : false;
    makePosted = makeUrl ? await postWebhook(makeUrl, makeSecret, payload) : false;
  } else if (crmUrl) {
    crmPosted = await postWebhook(crmUrl, crmSecret, payload);
  } else if (makeUrl) {
    makePosted = await postWebhook(makeUrl, makeSecret, payload);
  } else if (sheetUrl) {
    sheetWritten = await postWebhook(sheetUrl, sheetSecret, payload);
  }

  return {
    attempted: Boolean(crmUrl || sheetUrl || makeUrl),
    ownerNotificationSent: crmPosted || sheetWritten || makePosted,
    sheetWritten: sheetWritten || makePosted,
    crmPosted: crmPosted || makePosted,
  };
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
      canonical: existingIdentity.conversion_eligible === 1 && existing.owner_notification_sent !== 1
        ? parsePersistedCanonical(existing)
        : null,
    };
  }

  const now = new Date().toISOString();
  const leadId = makeLeadId();
  const canonical = buildCanonical(body, leadId, now);
  if (canonical.isInternalTest) {
    body.conversionEligible = false;
    body.suppressionReason = canonical.internalTestReason
      ? `internal_test:${canonical.internalTestReason.replace(/\s+/g, '_')}`
      : 'internal_test';
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
  const record = canonicalToD1Record(canonical, body);
  const identity: SubmissionIdentityRow = {
    submission_id: body.submissionId,
    lead_id: leadId,
    form_route: body.formRoute,
    payload_hash: body.payloadHash,
    conversion_eligible: body.conversionEligible ? 1 : 0,
    suppression_reason: body.suppressionReason,
  };

  try {
    await insertAcceptedSubmission(db, body, record, leadId, now);
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
          canonical: duplicateIdentity.conversion_eligible === 1 && duplicate.owner_notification_sent !== 1
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
      owner_notification_queued: body.conversionEligible ? 1 : 0,
      owner_notification_sent: 0,
      sheet_written: 0,
      crm_posted: 0,
    }, identity),
    canonical,
  };
}

function hasConfiguredNotificationDestination(env: QuoteRequestEnv): boolean {
  return Boolean(
    getEnvString(env.QUOTE_REQUEST_CRM_WEBHOOK_URL)
    || getEnvString(env.QUOTE_REQUEST_SHEET_WEBHOOK_URL)
    || getEnvString(env.QUOTE_REQUEST_MAKE_WEBHOOK_URL)
  );
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
  const parsed = await validatePayload(
    raw,
    sourcePage,
    attributionRetentionMs(env),
    new URL(request.url).pathname,
  );
  if (!parsed.ok) {
    logQuoteValidationFailure(request, raw, 'invalid_payload', [parsed.message]);
    return failure(parsed.message, 400);
  }

  const db = getPersistenceDb(env);
  if (!db) return failure();

  const { response: persistedResponse, canonical } = await persistQuoteRequest(db, parsed.value);
  if (!persistedResponse.ok) return persistedResponse;

  let persisted: QuoteRequestResponse;
  try {
    persisted = await persistedResponse.clone().json() as QuoteRequestResponse;
  } catch {
    return persistedResponse;
  }

  if (!persisted.leadId || !persisted.conversionEligible || !canonical) {
    return persistedResponse;
  }

  if (!hasConfiguredNotificationDestination(env)) return persistedResponse;

  let claimToken: string | null = null;
  try {
    claimToken = await claimNotificationOutbox(db, persisted.leadId);
  } catch {
    return persistedResponse;
  }
  if (!claimToken) return persistedResponse;

  const flags = await runOptionalNotifications(env, canonical, parsed.value);
  if (!flags.attempted) return persistedResponse;

  try {
    await finalizeNotificationAttempt(db, persisted.leadId, flags, claimToken);
  } catch {
    return persistedResponse;
  }

  return json({
    ...persisted,
    ownerNotificationSent: flags.ownerNotificationSent,
    sheetWritten: flags.sheetWritten,
    crmPosted: flags.crmPosted,
  });
}
