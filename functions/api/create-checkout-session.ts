// POST /api/create-checkout-session — PUBLIC-BOOKING-R13-R4
// Creates a Stripe Checkout Session only after D1 availability is confirmed
// and a server-side slot hold is created.

import Stripe from 'stripe';
import { calculateCapacity, resolveKidsCount } from '../../src/lib/booking/capacity-engine.ts';
import { assessEligibility } from '../../src/lib/booking/eligibility.ts';
import type {
  BookingRecordWithSlot,
  D1Database,
} from '../../src/lib/booking/availability-types.ts';
import { findEligibleAvailabilitySlot } from '../../src/lib/booking/availability-store.ts';
import {
  readJsonObject,
  sanitizeSafeString,
  validateCheckoutSessionRequest,
} from '../../src/lib/booking/availability-validation.ts';
import { checkoutCanProceed, paymentAllowedWithHold } from '../../src/lib/booking/payment-gate.ts';
import { createSlotHold, HOLD_TTL_SECONDS, releaseHeldSlot } from '../../src/lib/booking/slot-holds.ts';
import { buildSlotAuditEvent, writeSlotAuditEvent } from '../../src/lib/booking/slot-audit.ts';

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

type Env = {
  AVAILABILITY_D1?: D1Database;
  BOOKINGS_KV?: KVNamespace;
  STRIPE_SECRET_KEY?: string;
  PUBLIC_SITE_URL?: string;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function generateBookingId(): string {
  const ts = Date.now().toString(36);
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `book_${ts}_${rand}`;
}

function isUsableStripeKey(value: string | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.startsWith('sk_test_') || trimmed.startsWith('rk_test_');
}

export const onRequestPost = async (
  context: { request: Request; env: Env },
): Promise<Response> => {
  const { request, env } = context;

  const stripeKey = env.STRIPE_SECRET_KEY?.trim();
  if (!isUsableStripeKey(stripeKey)) {
    console.error('[create-checkout] Stripe test-mode key is not configured');
    return json({ ok: false, error: 'Payment service not configured' }, 503);
  }

  if (!env.BOOKINGS_KV) {
    console.error('[create-checkout] BOOKINGS_KV is not configured');
    return json({ ok: false, error: 'Booking storage is not configured' }, 503);
  }

  const body = await readJsonObject(request);
  if (!body.ok) return json({ ok: false, error: body.error }, 400);

  const parsed = validateCheckoutSessionRequest(body.value);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);

  const {
    eventType,
    services,
    kidsCountBucket,
    kidsCountActual,
    designStyle,
    durationMinutes,
    travelMiles,
  } = parsed.value;

  const kidsCount = resolveKidsCount(kidsCountBucket, kidsCountActual);
  const capacity = calculateCapacity({
    kidsCount,
    designStyle,
    bookedDurationMinutes: durationMinutes,
  });

  const eligibility = assessEligibility({
    eventType,
    services,
    kidsCount,
    designStyle,
    durationMinutes,
    travelMiles,
    capacityResult: capacity,
  });

  if (eligibility.status !== 'instant-book' || !eligibility.pricing) {
    return json({
      ok: false,
      error: 'Event is not eligible for instant booking',
      reasons: eligibility.reasons,
    }, 400);
  }

  const lookup = await findEligibleAvailabilitySlot(env.AVAILABILITY_D1, {
    ...parsed.value,
    requiredCapacityUnits: capacity.requiredArtistCount,
  });

  if (!checkoutCanProceed(lookup.response) || !lookup.slot) {
    return json({
      ok: false,
      error: 'Availability is not confirmed for Availability Hold checkout',
      availability: lookup.response,
    }, 409);
  }

  const bookingId = generateBookingId();
  const hold = await createSlotHold(env.AVAILABILITY_D1, {
    slotId: lookup.slot.slotId,
    bookingId,
    requiredCapacityUnits: capacity.requiredArtistCount,
    idempotencyKey: `${bookingId}:${lookup.slot.slotId}`,
    holdDurationMinutes: HOLD_TTL_SECONDS / 60,
  });

  if (!hold.ok) {
    return json({
      ok: false,
      error: 'Availability could not be safely held for checkout',
      availability: {
        status: 'unknown',
        paymentAllowed: false,
        customerMessage: hold.customerMessage,
      },
    }, 409);
  }

  const availability = paymentAllowedWithHold(hold);
  const { eventTotalCents, retainerCents } = eligibility.pricing;
  const artistCount = capacity.requiredArtistCount;
  const serviceType = services.includes('face-gems') ? 'two-service' : 'one-service';
  const now = new Date().toISOString();
  const origin = env.PUBLIC_SITE_URL ?? new URL(request.url).origin;

  const initialRecord: BookingRecordWithSlot = {
    bookingId,
    slotId: hold.slotId,
    holdId: hold.holdId,
    eventDate: parsed.value.eventDate,
    eventTime: parsed.value.startTime,
    serviceType,
    durationMinutes,
    kidsCount,
    designStyle,
    artistCount,
    eventTotalCents,
    retainerCents,
    travelMiles,
    travelFeeCents: eligibility.pricing.travelFeeCents,
    paymentStatus: 'pending',
    stripeSessionId: null,
    customReviewRequired: false,
    eligibilityStatus: 'instant-book',
    customerEmail: sanitizeSafeString(parsed.value.customerEmail, 254),
    eventCity: sanitizeSafeString(parsed.value.eventCity, 120),
    availabilityConfirmed: true,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await env.BOOKINGS_KV.put(`booking:${bookingId}`, JSON.stringify(initialRecord), {
      expirationTtl: 60 * 60 * 24 * 90,
    });
  } catch (error) {
    await releaseHeldSlot(env.AVAILABILITY_D1, hold.holdId);
    console.error(`[create-checkout] KV initial write failed: ${redactRuntimeError(error)}`);
    return json({ ok: false, error: 'Booking storage could not be prepared' }, 503);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2026-05-27.dahlia' });
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: retainerCents,
            product_data: {
              name: 'Availability Hold - Happy Faces LA',
              description:
                `Availability Hold only. Happy Faces LA sends final confirmation after artist availability review. Face painting · ${durationMinutes / 60}h · ${artistCount} artist${artistCount > 1 ? 's' : ''} · ${kidsCount} children`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        booking_id: bookingId,
        slot_id: hold.slotId,
        hold_id: hold.holdId,
      },
      ...(parsed.value.customerEmail.includes('@')
        ? { customer_email: parsed.value.customerEmail.slice(0, 254) }
        : {}),
      custom_fields: [
        {
          key: 'phone',
          label: { type: 'custom', custom: 'Phone number (for day-of contact)' },
          type: 'text',
          optional: true,
        },
      ],
      success_url: `${origin}/booking-confirmed?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/plan-my-party`,
      payment_intent_data: {
        description: `Happy Faces LA availability hold - ${bookingId}`,
      },
    });
  } catch (error) {
    await releaseHeldSlot(env.AVAILABILITY_D1, hold.holdId);
    console.error(`[create-checkout] Stripe session creation failed: ${redactRuntimeError(error)}`);
    return json({ ok: false, error: 'Payment session could not be created' }, 502);
  }

  if (!session.url) {
    await releaseHeldSlot(env.AVAILABILITY_D1, hold.holdId);
    return json({ ok: false, error: 'Payment session could not be prepared' }, 502);
  }

  const record: BookingRecordWithSlot = {
    ...initialRecord,
    stripeSessionId: session.id,
    updatedAt: new Date().toISOString(),
  };

  try {
    await env.BOOKINGS_KV.put(`booking:${bookingId}`, JSON.stringify(record), {
      expirationTtl: 60 * 60 * 24 * 90,
    });
  } catch (error) {
    await releaseHeldSlot(env.AVAILABILITY_D1, hold.holdId);
    console.error(`[create-checkout] KV final write failed: ${redactRuntimeError(error)}`);
    return json({ ok: false, error: 'Booking storage could not be finalized' }, 503);
  }

  await writeSlotAuditEvent(
    env.AVAILABILITY_D1,
    buildSlotAuditEvent({
      slotId: hold.slotId,
      holdId: hold.holdId,
      bookingId,
      eventType: 'checkout_session_created',
      actorType: 'public_api',
      safeDetails: {
        paymentAllowed: true,
        capacityUnits: capacity.requiredArtistCount,
        eventDate: parsed.value.eventDate,
        startTime: parsed.value.startTime,
        travelZone: parsed.value.travelZone,
      },
    }),
  );

  return json({
    ok: true,
    checkoutUrl: session.url,
    availability,
  });
};

function redactRuntimeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 240);
  if (typeof error === 'string') return error.slice(0, 240);
  return 'unknown error';
}
