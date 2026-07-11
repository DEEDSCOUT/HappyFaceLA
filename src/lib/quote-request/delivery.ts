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
};

type QuoteRequestResponse = {
  ok: boolean;
  received: boolean;
  leadId?: string;
  persisted: boolean;
  ownerNotificationQueued: boolean;
  ownerNotificationSent: boolean;
  sheetWritten: boolean;
  crmPosted: boolean;
  duplicate?: boolean;
  message: string;
};

type SanitizedLookbookInspiration = {
  public_look_slug: string;
  public_look_title: string | null;
  service: string | null;
  design_style: string | null;
  category: string | null;
};

type SanitizedQuoteRequest = {
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
    received: false,
    persisted: false,
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

function normalizeIdempotencyKey(value: unknown): string {
  const key = normalizeString(value, 96);
  return /^qrq_[a-z0-9-]{16,90}$/i.test(key) ? key : '';
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
    const url = new URL(raw, 'https://www.happyfacesla.com');
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
  const explicit = normalizeAttribution(raw.sourcePage ?? raw.source_page);
  if (explicit) return explicit;

  const referer = request.headers.get('referer') || request.headers.get('referrer') || '';
  if (!referer) return null;

  try {
    const requestUrl = new URL(request.url);
    const refererUrl = new URL(referer);
    if (requestUrl.hostname === refererUrl.hostname && refererUrl.pathname) {
      return refererUrl.pathname;
    }
  } catch {
    return null;
  }

  return null;
}

function makeQuoteRequestIdempotencyKey(): string {
  const random = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `qrq_${random.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80).toLowerCase()}`;
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

function validatePayload(raw: Record<string, unknown>, sourcePage: string | null): ValidationResult {
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
  const idempotencyKey = normalizeIdempotencyKey(body.quoteRequestIdempotencyKey) || makeQuoteRequestIdempotencyKey();
  const consentAcknowledgement = body.consentAcknowledgement === true || body.consentAcknowledgement === 'true';

  if (!hasMeaningfulCustomerField(body, services)) {
    return { ok: false, message: 'Please include your contact information.' };
  }
  if (!sourcePage) {
    return { ok: false, message: 'Source page is required.' };
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

  return {
    ok: true,
    value: {
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
      quoteRequestIdempotencyKey: idempotencyKey,
      consentAcknowledgement: true,
      lookbookInspirations: normalizeLookbookInspirations(body.lookbook_inspirations),
      preferredContactMethod: normalizePreferredContactMethod(body.preferredContactMethod),
      customerBudgetRaw: normalizeNullableString(body.customerBudget ?? body.budget ?? body.budget_range, 80),
      sourcePage,
      landingPage: normalizeUrlAttribution(body.landing_page),
      sourcePath: normalizePathAttribution(body.source_path),
      referrer: normalizeUrlAttribution(body.referrer),
      firstLandingPage: normalizeUrlAttribution(body.first_landing_page),
      firstSourcePath: normalizePathAttribution(body.first_source_path),
      firstReferrer: normalizeUrlAttribution(body.first_referrer),
      submitLandingPage: normalizeUrlAttribution(body.submit_landing_page),
      submitSourcePath: normalizePathAttribution(body.submit_source_path),
      submitReferrer: normalizeUrlAttribution(body.submit_referrer),
      utmSource: normalizeAttribution(body.utm_source),
      utmMedium: normalizeAttribution(body.utm_medium),
      utmCampaign: normalizeAttribution(body.utm_campaign),
      utmTerm: normalizeAttribution(body.utm_term),
      utmContent: normalizeAttribution(body.utm_content),
      gclid: normalizeAttribution(body.gclid),
      gbraid: normalizeAttribution(body.gbraid),
      wbraid: normalizeAttribution(body.wbraid),
      fbclid: normalizeAttribution(body.fbclid),
      msclkid: normalizeAttribution(body.msclkid),
      firstUtmSource: normalizeAttribution(body.first_utm_source),
      firstUtmMedium: normalizeAttribution(body.first_utm_medium),
      firstUtmCampaign: normalizeAttribution(body.first_utm_campaign),
      firstUtmTerm: normalizeAttribution(body.first_utm_term),
      firstUtmContent: normalizeAttribution(body.first_utm_content),
      firstGclid: normalizeAttribution(body.first_gclid),
      firstGbraid: normalizeAttribution(body.first_gbraid),
      firstWbraid: normalizeAttribution(body.first_wbraid),
      submitUtmSource: normalizeAttribution(body.submit_utm_source),
      submitUtmMedium: normalizeAttribution(body.submit_utm_medium),
      submitUtmCampaign: normalizeAttribution(body.submit_utm_campaign),
      submitUtmTerm: normalizeAttribution(body.submit_utm_term),
      submitUtmContent: normalizeAttribution(body.submit_utm_content),
      submitGclid: normalizeAttribution(body.submit_gclid),
      submitGbraid: normalizeAttribution(body.submit_gbraid),
      submitWbraid: normalizeAttribution(body.submit_wbraid),
    },
  };
}

function getPersistenceDb(env: QuoteRequestEnv): D1Database | undefined {
  return env.QUOTE_REQUESTS_D1 ?? env.AVAILABILITY_D1;
}

function makeLeadId(): string {
  const random = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `lead_${random.replace(/[^a-zA-Z0-9]/g, '').slice(0, 28).toLowerCase()}`;
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
    delivery_status: 'persisted_internal_queue',
    owner_notification_queued: 1,
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
    qualified_status: c.qualifiedStatus,
    qualified_at_utc: c.qualifiedAtUtc,
    quote_sent_status: c.quoteSentStatus,
    quote_sent_at_utc: c.quoteSentAtUtc,
    booked_status: c.bookedStatus,
    booked_at_utc: c.bookedAtUtc,
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
      `SELECT lead_id, owner_notification_queued, owner_notification_sent, sheet_written, crm_posted
       FROM quote_requests
       WHERE idempotency_key = ?
       LIMIT 1`,
    )
    .bind(idempotencyKey)
    .first<PersistedLeadRow>();
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
  'qualified_at_utc',
  'quote_sent_status',
  'quote_sent_at_utc',
  'booked_status',
  'booked_at_utc',
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

async function insertLead(db: D1Database, record: Record<string, D1Value>): Promise<void> {
  const placeholders = QUOTE_REQUEST_INSERT_COLUMNS.map(() => '?').join(', ');
  const columns = QUOTE_REQUEST_INSERT_COLUMNS.join(', ');
  await db
    .prepare(`INSERT INTO quote_requests (${columns}) VALUES (${placeholders})`)
    .bind(...QUOTE_REQUEST_INSERT_COLUMNS.map((column) => record[column] ?? null))
    .run();
}

async function updateDeliveryFlags(
  db: D1Database,
  leadId: string,
  flags: { ownerNotificationSent: boolean; sheetWritten: boolean; crmPosted: boolean },
): Promise<void> {
  const deliveryStatus =
    flags.ownerNotificationSent || flags.sheetWritten || flags.crmPosted
      ? 'persisted_optional_notification_succeeded'
      : 'persisted_internal_queue';

  await db
    .prepare(
      `UPDATE quote_requests
       SET updated_at = ?, delivery_status = ?, owner_notification_sent = ?, sheet_written = ?, crm_posted = ?
       WHERE lead_id = ?`,
    )
    .bind(
      new Date().toISOString(),
      deliveryStatus,
      flags.ownerNotificationSent ? 1 : 0,
      flags.sheetWritten ? 1 : 0,
      flags.crmPosted ? 1 : 0,
      leadId,
    )
    .run();
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
    'x-lead-source': 'happyfacesla-plan-my-party',
  };
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
): Promise<{ ownerNotificationSent: boolean; sheetWritten: boolean; crmPosted: boolean }> {
  const payload = buildCanonicalNotificationPayload(canonical);
  const crmUrl = getEnvString(env.QUOTE_REQUEST_CRM_WEBHOOK_URL);
  const sheetUrl = getEnvString(env.QUOTE_REQUEST_SHEET_WEBHOOK_URL);
  const makeUrl = getEnvString(env.QUOTE_REQUEST_MAKE_WEBHOOK_URL);
  const crmSecret = getEnvString(env.QUOTE_REQUEST_CRM_WEBHOOK_SECRET);
  const sheetSecret = getEnvString(env.QUOTE_REQUEST_SHEET_WEBHOOK_SECRET);
  const makeSecret = getEnvString(env.QUOTE_REQUEST_MAKE_SHARED_SECRET);

  const crmPosted = crmUrl ? await postWebhook(crmUrl, crmSecret, payload) : false;
  const sheetWritten = sheetUrl ? await postWebhook(sheetUrl, sheetSecret, payload) : false;
  const makePosted = makeUrl ? await postWebhook(makeUrl, makeSecret, payload) : false;

  return {
    ownerNotificationSent: crmPosted || sheetWritten || makePosted,
    sheetWritten: sheetWritten || makePosted,
    crmPosted: crmPosted || makePosted,
  };
}

function success(row: PersistedLeadRow, duplicate = false): Response {
  return json({
    ok: true,
    received: true,
    leadId: row.lead_id,
    persisted: true,
    ownerNotificationQueued: row.owner_notification_queued === 1,
    ownerNotificationSent: row.owner_notification_sent === 1,
    sheetWritten: row.sheet_written === 1,
    crmPosted: row.crm_posted === 1,
    duplicate,
    message: QUOTE_REQUEST_SUCCESS_MESSAGE,
  });
}

async function persistQuoteRequest(
  db: D1Database,
  body: SanitizedQuoteRequest,
): Promise<{ response: Response; canonical: CanonicalPlanMyPartyLead | null }> {
  let existing: PersistedLeadRow | null;
  try {
    existing = await selectExistingLead(db, body.quoteRequestIdempotencyKey);
  } catch {
    return { response: failure(), canonical: null };
  }
  if (existing) return { response: success(existing, true), canonical: null };

  const now = new Date().toISOString();
  const leadId = makeLeadId();
  const canonical = buildCanonical(body, leadId, now);
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

  try {
    await insertLead(db, record);
  } catch {
    try {
      const duplicate = await selectExistingLead(db, body.quoteRequestIdempotencyKey);
      if (duplicate) return { response: success(duplicate, true), canonical: null };
    } catch {
      // Fall through to fail closed.
    }
    return { response: failure(), canonical: null };
  }

  return {
    response: success({
      lead_id: leadId,
      owner_notification_queued: 1,
      owner_notification_sent: 0,
      sheet_written: 0,
      crm_posted: 0,
    }),
    canonical,
  };
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

  const sourcePage = deriveSafeSourcePage(raw, request);
  const parsed = validatePayload(raw, sourcePage);
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

  if (!persisted.leadId || persisted.duplicate || !canonical) return persistedResponse;

  const flags = await runOptionalNotifications(env, canonical);
  if (!flags.ownerNotificationSent && !flags.sheetWritten && !flags.crmPosted) {
    return persistedResponse;
  }

  try {
    await updateDeliveryFlags(db, persisted.leadId, flags);
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
