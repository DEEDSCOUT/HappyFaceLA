// Stripe Webhook Handler — Cloudflare Pages Function
// Endpoint: /api/stripe/webhook
//
// Uses official stripe.webhooks.constructEvent for signature verification.
// Requires STRIPE_WEBHOOK_SECRET env binding with whsec_ prefix.
// Fails closed if secret is missing or has wrong prefix.

import Stripe from "stripe";

type Env = {
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
};

const REQUIRED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const onRequest = async (context: any): Promise<Response> => {
  const { request, env } = context as { request: Request; env: Env };

  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  // Validate webhook secret
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured. Failing closed.");
    return json(
      {
        ok: false,
        error: "Webhook secret is not configured on the server. Stripe webhooks cannot be processed.",
      },
      500
    );
  }

  if (!webhookSecret.startsWith("whsec_")) {
    console.error(
      `[stripe-webhook] STRIPE_WEBHOOK_SECRET has invalid prefix. Expected whsec_, got "${webhookSecret.slice(0, 4)}...". Failing closed.`
    );
    return json(
      {
        ok: false,
        error: "Webhook secret is incorrectly configured. Stripe requires a whsec_ signing secret.",
      },
      500
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return json({ ok: false, error: "Missing stripe-signature header" }, 400);
  }

  // Read raw body BEFORE any JSON parsing — required by constructEvent
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return json({ ok: false, error: "Failed to read request body" }, 400);
  }

  // Verify signature using official Stripe method
  let event: Stripe.Event;
  try {
    // Stripe SDK's constructEvent verifies the signature and returns the parsed event.
    // It needs the raw body string (before JSON.parse), not the parsed object.
    event = Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stripe-webhook] Signature verification failed: ${message}`);
    return json({ ok: false, error: "Invalid signature" }, 401);
  }

  const eventType = event.type;
  console.log(`[stripe-webhook] Received event: ${eventType} (id: ${event.id})`);

  // Process recognized event types
  if (REQUIRED_EVENTS.includes(eventType)) {
    console.log(`[stripe-webhook] Recognized event: ${eventType}`);

    switch (eventType) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[stripe-webhook] Checkout session completed — deposit received. Session: ${maskId(session.id)}`);
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[stripe-webhook] Checkout session expired. Session: ${maskId(session.id)}`);
        break;
      }
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        console.log(`[stripe-webhook] Payment intent succeeded. Amount: $${((pi.amount || 0) / 100).toFixed(2)}`);
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        console.log(`[stripe-webhook] Payment intent failed. Last error: ${pi.last_payment_error?.message || "unknown"}`);
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        console.log(`[stripe-webhook] Charge refunded. Charge: ${maskId(charge.id)}`);
        break;
      }
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        console.log(`[stripe-webhook] Dispute created. Reason: ${dispute.reason}`);
        break;
      }
    }

    return json({ received: true, type: eventType });
  }

  // Unrecognized event — acknowledge receipt
  console.log(`[stripe-webhook] Unrecognized event type: ${eventType} — acknowledged.`);
  return json({ received: true, type: eventType });
};

// Utility: mask sensitive IDs in logs
function maskId(id?: string): string {
  if (!id || id.length <= 12) return "***";
  return id.slice(0, 4) + "***" + id.slice(-4);
}
