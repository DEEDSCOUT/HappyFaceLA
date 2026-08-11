import {
  handleQuoteRequest,
  type QuoteRequestEnv,
} from '../../src/lib/quote-request/delivery.ts';

type Env = QuoteRequestEnv & {
  CRM_WEBHOOK_URL?: string;
  CRM_WEBHOOK_SECRET?: string;
  SHEETS_WEBHOOK_URL?: string;
  SHEETS_WEBHOOK_SECRET?: string;
};

type LegacyLeadPayload = Record<string, unknown> & {
  source_page?: unknown;
  source_path?: unknown;
  services_requested?: unknown;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 6;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function stringValue(value: unknown, maxLength = 1000): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength)
    : '';
}

function safeSourcePage(input: LegacyLeadPayload, request: Request): string {
  const explicit = stringValue(input.source_page ?? input.source_path, 512);
  if (explicit) {
    try {
      const requestUrl = new URL(request.url);
      const explicitUrl = new URL(explicit, requestUrl.origin);
      if (explicitUrl.origin === requestUrl.origin) return explicitUrl.pathname || '/';
    } catch {
      // Fall through to the verified same-origin referrer.
    }
  }
  const referrer = request.headers.get('referer') || request.headers.get('referrer') || '';
  try {
    const requestUrl = new URL(request.url);
    const referrerUrl = new URL(referrer);
    return requestUrl.origin === referrerUrl.origin ? referrerUrl.pathname || '/' : '';
  } catch {
    return '';
  }
}

function formRoute(sourcePage: string): 'packages' | 'contact' {
  return sourcePage.startsWith('/packages') ? 'packages' : 'contact';
}

const ATTRIBUTION_KEYS = [
  'gclid', 'gbraid', 'wbraid',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'landing_page', 'source_path', 'referrer',
] as const;

function allowlistedLegacyAttribution(input: LegacyLeadPayload): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const prefix of ['', 'first_', 'submit_'] as const) {
    for (const key of ATTRIBUTION_KEYS) {
      const field = `${prefix}${key}`;
      if (Object.prototype.hasOwnProperty.call(input, field)) output[field] = input[field];
    }
  }
  return output;
}

/**
 * Preserve the admitted production Make/Sheets envelope without trusting an
 * arbitrary client-supplied nested object. Every field is rebuilt from the
 * route's allowlisted legacy input and sanitized before the shared handler sees
 * it. The AP-03 atomic journey remains the attribution source of truth.
 */
function legacyNotificationLead(
  input: LegacyLeadPayload,
  sourcePage: string,
): Record<string, unknown> {
  const services = Array.isArray(input.services_requested)
    ? input.services_requested.map((value) => stringValue(value, 120)).filter(Boolean)
    : [];
  return {
    first_name: stringValue(input.first_name, 80),
    last_name: stringValue(input.last_name, 80),
    phone: stringValue(input.phone, 40),
    email: stringValue(input.email, 254),
    event_date: stringValue(input.event_date, 10),
    event_start_time: stringValue(input.event_start_time, 5),
    event_city: stringValue(input.event_city, 120),
    event_address_or_cross_streets_optional: stringValue(
      input.event_address_or_cross_streets_optional,
      160,
    ),
    event_type: stringValue(input.event_type, 120),
    estimated_guest_count: stringValue(input.estimated_guest_count, 20),
    children_count_optional: stringValue(input.children_count_optional, 20),
    services_requested: services,
    budget_range: stringValue(input.budget_range, 80),
    message: stringValue(input.message, 1000),
    source_page: sourcePage,
    source_path: sourcePage,
    utm_source: stringValue(input.utm_source, 256),
    utm_medium: stringValue(input.utm_medium, 256),
    utm_campaign: stringValue(input.utm_campaign, 256),
    utm_term: stringValue(input.utm_term, 256),
    utm_content: stringValue(input.utm_content, 256),
    // The admitted Make blueprint expects these keys, but broad owner
    // notifications do not need the raw identifiers. The complete values stay
    // in the private atomic attribution record.
    gclid: stringValue(input.gclid, 512) ? '[present]' : '',
    gbraid: stringValue(input.gbraid, 512) ? '[present]' : '',
    wbraid: stringValue(input.wbraid, 512) ? '[present]' : '',
    fbclid: stringValue(input.fbclid, 512) ? '[present]' : '',
    msclkid: stringValue(input.msclkid, 512) ? '[present]' : '',
    lead_source: stringValue(input.lead_source, 120),
    campaign: stringValue(input.campaign, 120),
    selected_package: stringValue(input.selected_package ?? input.package_interest, 120),
    organization_venue_name: stringValue(input.organization_venue_name, 160),
    package_interest: stringValue(input.package_interest, 120),
    painting_window: stringValue(input.painting_window, 120),
    venue_permission_confirmed: stringValue(input.venue_permission_confirmed, 80),
    need_invoice_coi: stringValue(input.need_invoice_coi, 120),
    consent_to_contact: input.consent_to_contact === true || input.consent_to_contact === 'true',
  };
}

function normalizeServiceValues(value: unknown): string[] {
  const normalized = stringValue(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const aliases: Record<string, string[]> = {
    'face-painting': ['face-painting'],
    'balloon-twisting': ['balloon-twisting'],
    'balloon-twister': ['balloon-twisting'],
    'glitter-tattoos': ['glitter-tattoos'],
    'face-gems': ['face-gems'],
    'soccer-fan-paint-bar': ['face-painting'],
    'face-painting-balloon-twisting': ['face-painting', 'balloon-twisting'],
    'premium-party-package': ['combo'],
    'party-package': ['combo'],
    'large-event-school-corporate': ['not-sure'],
    combo: ['combo'],
  };
  return aliases[normalized] || [];
}

function normalizeServices(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap(normalizeServiceValues))];
}

function normalizeEventType(value: unknown): string {
  const normalized = stringValue(value, 100).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (normalized.includes('birthday')) return 'birthday-party';
  if (normalized.includes('school')) return 'school-event';
  if (normalized.includes('corporate')) return 'corporate-family-day';
  if (normalized.includes('festival') || normalized.includes('community')) return 'festival-community';
  return normalized ? 'other' : '';
}

function kidsBucket(value: unknown): string {
  const raw = stringValue(value, 40);
  const number = /^\d+$/.test(raw) ? Number(raw) : null;
  if (number === null) return 'not-sure';
  if (number <= 10) return '1-10';
  if (number <= 18) return '11-18';
  if (number <= 25) return '19-25';
  if (number <= 40) return '26-40';
  return '40-plus';
}

function customerNotes(input: LegacyLeadPayload): string | null {
  const rawServices = Array.isArray(input.services_requested)
    ? input.services_requested.map((value) => stringValue(value, 120)).filter(Boolean)
    : [];
  const parts = [
    stringValue(input.message),
    rawServices.length ? `Customer service selection: ${rawServices.join(', ')}` : '',
    stringValue(input.event_type)
      ? `Customer event type: ${stringValue(input.event_type, 120)}`
      : '',
    stringValue(input.selected_package ?? input.package_interest)
      ? `Package interest: ${stringValue(input.selected_package ?? input.package_interest, 120)}`
      : '',
    stringValue(input.organization_venue_name)
      ? `Organization or venue: ${stringValue(input.organization_venue_name, 160)}`
      : '',
    stringValue(input.painting_window)
      ? `Requested painting window: ${stringValue(input.painting_window, 120)}`
      : '',
    stringValue(input.venue_permission_confirmed)
      ? `Venue permission: ${stringValue(input.venue_permission_confirmed, 80)}`
      : '',
    stringValue(input.need_invoice_coi)
      ? `Invoice / COI: ${stringValue(input.need_invoice_coi, 120)}`
      : '',
    stringValue(input.campaign)
      ? `Form campaign label: ${stringValue(input.campaign, 120)}`
      : '',
  ].filter(Boolean);
  return parts.join('\n\n').slice(0, 1000) || null;
}

function adaptLegacyLead(input: LegacyLeadPayload, request: Request): Record<string, unknown> {
  const sourcePage = safeSourcePage(input, request);
  const childrenRaw = stringValue(input.children_count_optional, 20)
    || stringValue(input.estimated_guest_count, 20);
  const childCount = /^\d+$/.test(childrenRaw) ? Number(childrenRaw) : null;
  return {
    ...allowlistedLegacyAttribution(input),
    legacyNotificationLead: legacyNotificationLead(input, sourcePage),
    submission_id: input.submission_id ?? input.submissionId,
    form_route: formRoute(sourcePage),
    sourcePage,
    eventType: normalizeEventType(input.event_type),
    services: normalizeServices(input.services_requested),
    kidsCountBucket: kidsBucket(childrenRaw),
    kidsCountActual: childCount && childCount <= 200 ? childCount : null,
    designStyle: 'not-sure',
    branch: 'legacy-form-adapter',
    eventDate: stringValue(input.event_date, 10) || null,
    eventTime: stringValue(input.event_start_time, 5) || null,
    eventCity: stringValue(input.event_city, 120),
    venueName: stringValue(input.event_address_or_cross_streets_optional, 160) || null,
    firstName: stringValue(input.first_name, 80),
    lastName: stringValue(input.last_name, 80),
    email: stringValue(input.email, 254),
    phone: stringValue(input.phone, 40) || null,
    specialRequests: customerNotes(input),
    customerBudget: stringValue(input.budget_range, 80) || null,
    preferredContactMethod: stringValue(input.preferred_contact_method, 20) || 'not_provided',
    consentAcknowledgement: input.consent_to_contact === true || input.consent_to_contact === 'true',
    submittedAt: stringValue(input.submitted_at, 40) || null,
    attribution: input.attribution,
    honeypot: input.honeypot,
    // These two fields are the only synthetic-test controls admitted through
    // this adapter. The shared handler still requires boolean true plus the
    // matching x-hfla-internal-test-token header before it suppresses anything.
    internal_test: input.internal_test,
    internal_test_reason: input.internal_test_reason,
  };
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const existing = rateLimitMap.get(ip);
  if (!existing || now >= existing.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (existing.count >= RATE_LIMIT_MAX) return true;
  existing.count += 1;
  return false;
}

function mappedEnv(env: Env): QuoteRequestEnv {
  return {
    ...env,
    QUOTE_REQUEST_CRM_WEBHOOK_URL: env.QUOTE_REQUEST_CRM_WEBHOOK_URL || env.CRM_WEBHOOK_URL,
    QUOTE_REQUEST_CRM_WEBHOOK_SECRET: env.QUOTE_REQUEST_CRM_WEBHOOK_SECRET || env.CRM_WEBHOOK_SECRET,
    QUOTE_REQUEST_SHEET_WEBHOOK_URL: env.QUOTE_REQUEST_SHEET_WEBHOOK_URL || env.SHEETS_WEBHOOK_URL,
    QUOTE_REQUEST_SHEET_WEBHOOK_SECRET: env.QUOTE_REQUEST_SHEET_WEBHOOK_SECRET || env.SHEETS_WEBHOOK_SECRET,
  };
}

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return json({ ok: false, error: 'Unsupported media type' }, 415);

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (isRateLimited(ip)) return json({ ok: false, error: 'Too many requests' }, 429);

  let input: LegacyLeadPayload;
  try {
    input = await request.json() as LegacyLeadPayload;
  } catch {
    return json({ ok: false, error: 'Invalid JSON payload' }, 400);
  }

  const canonicalRequest = new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(adaptLegacyLead(input, request)),
  });
  return handleQuoteRequest(canonicalRequest, mappedEnv(env));
};
