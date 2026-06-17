// SUPERSEDED — runtime POST handler moved to functions/api/quote-request.ts
// This Astro API route pre-renders to a static file at build time (Astro output: "static",
// no @astrojs/cloudflare adapter). It does NOT handle runtime POST requests.
// In Cloudflare Pages (wrangler pages dev / production), functions/api/quote-request.ts
// takes precedence and is the authoritative runtime endpoint.
// This file is retained as a reference implementation and for local astro dev server use.
import type { APIRoute } from 'astro';

// Prohibited internal field names — must never appear in request handling or responses
const PROHIBITED_FIELDS = new Set([
  'band_id', 'BAND-DISABLED', 'TRAVEL_CALCULATOR_ENABLED',
  'payment_allowed', 'stripe_live_allowed', 'public_ui_allowed', 'public_exposed',
  'booking_reference', 'hold_reference', 'idempotency_key', 'client_secret',
  'payment_intent', 'payment_link', 'checkout_url',
  'BOOKING_ENGINE_ENABLED', 'STRIPE_ENABLED',
  'PUBLIC_BOOK_FLOW_EXPOSED', 'PUBLIC_BOOKING_UI_ENABLED',
  'customQuoteTrigger',
]);

// Allowed fields in the party details payload
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
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email);
  if (!emailOk) {
    return { valid: false, message: 'A valid email address is required.' };
  }
  if (!body.eventDate && !body.eventCity) {
    return { valid: false, message: 'Please include your event details.' };
  }
  return { valid: true, message: 'OK' };
}

export const POST: APIRoute = async ({ request }) => {
  let raw: Record<string, unknown>;
  try {
    raw = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ ok: false, message: 'Invalid request body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Strip any prohibited or unknown fields before any processing
  const body = sanitizePayload(raw);

  // Validation
  const { valid, message } = validatePayload(body);
  if (!valid) {
    return new Response(JSON.stringify({ ok: false, message }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Safe stub — logs to console only; no CRM, no Sheets, no payment provider, no database write.
  // Authorization required before any external write is wired here.
  console.info('[quote-request] Party details received (stub — no external write)', {
    firstName: body.firstName,
    eventType: body.eventType,
    eventDate: body.eventDate,
    eventCity: body.eventCity,
    wizardVersion: body.wizardVersion,
    submittedAt: body.submittedAt,
  });

  return new Response(
    JSON.stringify({
      ok: true,
      message:
        "Thank you! We've received your party details and we'll be in touch within 1–2 business days.",
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
};

// Reject non-POST methods
export const GET: APIRoute = () =>
  new Response(JSON.stringify({ ok: false, message: 'Method not allowed.' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
