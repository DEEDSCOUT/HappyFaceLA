// Cloudflare Pages Function — POST /api/quote-request
// Runtime: Cloudflare Workers (served via `npm run pages:dev` → wrangler pages dev dist)
// This is the authoritative runtime handler. The static Astro endpoint at
// src/pages/api/quote-request.ts is pre-rendered at build time only and is
// overridden by this function in all Cloudflare Pages environments.
//
// PROHIBITED_FIELDS: none of these must appear in request handling or responses.
// Payload is sanitized before any processing.
//
// Authorization boundary: safe stub — no CRM, no Sheets, no payment write.
// Separate authorization required before any external write is wired here.
// No Stripe. No booking_engine. No /book. No payment at quote stage.

type Env = Record<string, unknown>;

const PROHIBITED_FIELDS = new Set([
  'band_id', 'BAND-DISABLED', 'TRAVEL_CALCULATOR_ENABLED',
  'payment_allowed', 'stripe_live_allowed', 'public_ui_allowed', 'public_exposed',
  'booking_reference', 'hold_reference', 'idempotency_key', 'client_secret',
  'payment_intent', 'payment_link', 'checkout_url',
  'BOOKING_ENGINE_ENABLED', 'STRIPE_ENABLED',
  'PUBLIC_BOOK_FLOW_EXPOSED', 'PUBLIC_BOOKING_UI_ENABLED',
  'customQuoteTrigger',
]);

const ALLOWED_FIELDS = new Set([
  'eventType', 'services', 'kidsCountBucket', 'designStyle',
  'selectedDurationMinutes', 'recommendedDurationMinutes', 'branch',
  'eventDate', 'eventTime', 'eventCity', 'venueName',
  'firstName', 'lastName', 'email', 'phone',
  'specialRequests', 'wizardVersion', 'submittedAt',
  'service', 'design_style', 'public_look_slug', 'public_look_title',
  'category', 'inspiration_image_id', 'lookbook_inspirations',
]);

const LOOKBOOK_FIELDS = new Set([
  'service', 'design_style', 'public_look_slug', 'public_look_title',
  'category', 'inspiration_image_id',
]);

function sanitizeLookbookValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim().replace(/[^\w\s.,/&()+-]/g, '').slice(0, 120) || null;
}

function sanitizeLookbookInspirations(value: unknown): Array<Record<string, string | null>> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).map((entry) => {
    const item = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : {};
    return {
      public_look_slug: sanitizeLookbookValue(item.public_look_slug),
      public_look_title: sanitizeLookbookValue(item.public_look_title),
      service: sanitizeLookbookValue(item.service),
      design_style: sanitizeLookbookValue(item.design_style),
      category: sanitizeLookbookValue(item.category),
    };
  }).filter((item) =>
    item.public_look_slug &&
    /^[a-z0-9-]+$/.test(item.public_look_slug) &&
    ['face-painting', 'balloon-twisting', 'face-gems'].includes(item.service || '')
  );
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function sanitizePayload(raw: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (ALLOWED_FIELDS.has(key) && !PROHIBITED_FIELDS.has(key)) {
      if (key === 'lookbook_inspirations') {
        result[key] = sanitizeLookbookInspirations(value);
      } else {
        result[key] = LOOKBOOK_FIELDS.has(key) ? sanitizeLookbookValue(value) : value;
      }
    }
  }
  return result;
}

function validatePayload(body: Record<string, unknown>): { valid: boolean; message: string } {
  if (!body.firstName || typeof body.firstName !== 'string' || !body.firstName.trim()) {
    return { valid: false, message: 'First name is required.' };
  }
  if (!body.lastName || typeof body.lastName !== 'string' || !body.lastName.trim()) {
    return { valid: false, message: 'Last name is required.' };
  }
  if (!body.email || typeof body.email !== 'string') {
    return { valid: false, message: 'Email address is required.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return { valid: false, message: 'A valid email address is required.' };
  }
  if (!body.eventDate && !body.eventCity) {
    return { valid: false, message: 'Please include your event details.' };
  }
  return { valid: true, message: 'OK' };
}

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request } = context;

  if (request.method !== 'POST') {
    return json({ ok: false, message: 'Method not allowed.' }, 405);
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return json({ ok: false, message: 'Content-Type must be application/json.' }, 415);
  }

  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, message: 'Invalid request body.' }, 400);
  }

  // Strip prohibited and unknown fields before any processing
  const body = sanitizePayload(raw);

  const { valid, message } = validatePayload(body);
  if (!valid) {
    return json({ ok: false, message }, 422);
  }

  // Safe stub — logs non-sensitive fields only. No external write authorized.
  console.log('[quote-request] Quote request received (stub — no external write)', {
    firstName: body.firstName,
    eventType: body.eventType,
    eventDate: body.eventDate,
    eventCity: body.eventCity,
    wizardVersion: body.wizardVersion,
    submittedAt: body.submittedAt,
  });

  return json({
    ok: true,
    message: "Thank you! We've received your quote request and we'll be in touch within 1–2 business days.",
  });
};
