// Stripe Webhook Handler — Cloudflare Pages Function
// Endpoint: /api/stripe/webhook
//
// Uses official Stripe signature verification. A completed Checkout Session
// reserves the D1 slot before the booking record is marked paid.

import Stripe from 'stripe';
import type { D1Database } from '../../../src/lib/booking/availability-types.ts';
import {
  parseJsonRecord,
  validateStripeWebhookSlotUpdate,
} from '../../../src/lib/booking/availability-validation.ts';
import { maskId } from '../../../src/lib/booking/availability-store.ts';
import { reserveHeldSlot } from '../../../src/lib/booking/slot-holds.ts';
import { buildSlotAuditEvent, writeSlotAuditEvent } from '../../../src/lib/booking/slot-audit.ts';

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

type Env = {
  AVAILABILITY_D1?: D1Database;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  BOOKINGS_KV?: KVNamespace;
};

const REQUIRED_EVENTS = [
  'checkout.session.completed',
  'checkout.session.expired',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded',
  'charge.dispute.created',
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

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured. Failing closed.');
    return json(
      {
        ok: false,
        error: 'Webhook secret is not configured on the server. Stripe webhooks cannot be processed.',
      },
      500,
    );
  }

  if (!webhookSecret.startsWith('whsec_')) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET has invalid prefix. Failing closed.');
    return json(
      {
        ok: false,
        error: 'Webhook secret is incorrectly configured. Stripe requires a whsec_ signing secret.',
      },
      500,
    );
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return json({ ok: false, error: 'Missing stripe-signature header' }, 400);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return json({ ok: false, error: 'Failed to read request body' }, 400);
  }

  let event: Stripe.Event;
  try {
    event = await Stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[stripe-webhook] Signature verification failed: ${message.slice(0, 240)}`);
    return json({ ok: false, error: 'Invalid signature' }, 401);
  }

  const eventType = event.type;
  console.log(`[stripe-webhook] Received event: ${eventType} (id: ${maskId(event.id)})`);

  if (REQUIRED_EVENTS.includes(eventType)) {
    switch (eventType) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[stripe-webhook] Checkout session completed. Session: ${maskId(session.id)}`);
        const outcome = await handleCheckoutCompleted(session, event.id, env);
        if (outcome.status === 'failed') {
          return json({ ok: false, error: outcome.error }, 500);
        }
        break;
      }
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[stripe-webhook] Checkout session expired. Session: ${maskId(session.id)}`);
        break;
      }
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        console.log(`[stripe-webhook] Payment intent succeeded. PaymentIntent: ${maskId(pi.id)}`);
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        console.log(`[stripe-webhook] Payment intent failed. PaymentIntent: ${maskId(pi.id)}`);
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        console.log(`[stripe-webhook] Charge refunded. Charge: ${maskId(charge.id)}`);
        break;
      }
      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute;
        console.log(`[stripe-webhook] Dispute created. Dispute: ${maskId(dispute.id)}`);
        break;
      }
    }

    return json({ received: true, type: eventType });
  }

  console.log(`[stripe-webhook] Unrecognized event type: ${eventType} — acknowledged.`);
  return json({ received: true, type: eventType });
};

type CheckoutCompletedOutcome =
  | { status: 'updated'; bookingId: string }
  | { status: 'duplicate'; bookingId: string | null }
  | { status: 'failed'; error: string };

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  eventId: string,
  env: Env,
): Promise<CheckoutCompletedOutcome> {
  if (!env.BOOKINGS_KV) {
    console.warn('[stripe-webhook] BOOKINGS_KV is not bound — cannot persist retainer_paid status');
    return { status: 'failed', error: 'Storage not configured' };
  }

  const metadata = session.metadata ?? {};
  const slotUpdate = validateStripeWebhookSlotUpdate({
    bookingId: metadata.booking_id,
    slotId: metadata.slot_id,
    holdId: metadata.hold_id,
    stripeSessionId: session.id,
    stripeEventId: eventId,
  });
  if (!slotUpdate.ok) {
    console.warn(`[stripe-webhook] checkout.session.completed metadata rejected: ${slotUpdate.error}`);
    return { status: 'failed', error: 'Checkout metadata invalid' };
  }

  const idempotencyKey = `stripe_event:${eventId}`;
  try {
    const already = await env.BOOKINGS_KV.get(idempotencyKey);
    if (already) {
      console.log(`[stripe-webhook] Event ${maskId(eventId)} already processed — skipping`);
      return { status: 'duplicate', bookingId: slotUpdate.value.bookingId };
    }
  } catch (error) {
    console.error(`[stripe-webhook] KV idempotency check failed: ${redactRuntimeError(error)}`);
    return { status: 'failed', error: 'Idempotency check failed' };
  }

  const reservation = await reserveHeldSlot(env.AVAILABILITY_D1, slotUpdate.value);
  if (!reservation.ok) {
    console.error(`[stripe-webhook] D1 slot reservation failed: ${reservation.error}`);
    return { status: 'failed', error: 'Slot reservation failed' };
  }

  try {
    const raw = await env.BOOKINGS_KV.get(`booking:${slotUpdate.value.bookingId}`);
    if (!raw) {
      console.warn(`[stripe-webhook] Booking record not found for ${slotUpdate.value.bookingId}`);
      return { status: 'failed', error: 'Booking record not found' };
    }
    const record = parseJsonRecord(raw);
    if (!record.ok) {
      console.warn(`[stripe-webhook] Booking record JSON rejected for ${slotUpdate.value.bookingId}`);
      return { status: 'failed', error: 'Booking record malformed' };
    }

    const updatedRecord: Record<string, unknown> = {
      ...record.value,
      paymentStatus: 'retainer_paid',
      stripeSessionId: session.id,
      slotId: slotUpdate.value.slotId,
      holdId: slotUpdate.value.holdId,
      updatedAt: new Date().toISOString(),
    };

    await env.BOOKINGS_KV.put(`booking:${slotUpdate.value.bookingId}`, JSON.stringify(updatedRecord), {
      expirationTtl: 60 * 60 * 24 * 90,
    });

    await env.BOOKINGS_KV.put(idempotencyKey, 'processed', { expirationTtl: 60 * 60 * 48 });

    await writeSlotAuditEvent(
      env.AVAILABILITY_D1,
      buildSlotAuditEvent({
        slotId: slotUpdate.value.slotId,
        holdId: slotUpdate.value.holdId,
        bookingId: slotUpdate.value.bookingId,
        eventType: 'checkout_session_completed_reserved',
        actorType: 'stripe_webhook',
        safeDetails: {
          paymentAllowed: true,
          action: reservation.duplicate ? 'duplicate_webhook_acknowledged' : 'slot_reserved',
        },
      }),
    );

    console.log(`[stripe-webhook] Booking ${slotUpdate.value.bookingId} marked retainer_paid`);
    return { status: 'updated', bookingId: slotUpdate.value.bookingId };
  } catch (error) {
    console.error(`[stripe-webhook] KV update failed for ${slotUpdate.value.bookingId}: ${redactRuntimeError(error)}`);
    return { status: 'failed', error: 'KV update failed' };
  }
}

function redactRuntimeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 240);
  if (typeof error === 'string') return error.slice(0, 240);
  return 'unknown error';
}
