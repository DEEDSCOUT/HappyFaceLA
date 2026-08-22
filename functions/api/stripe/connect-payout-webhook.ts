import { getPayoutRuntimeConfig } from "../../../src/lib/artist-payouts/config.ts";
import { PayoutRepository } from "../../../src/lib/artist-payouts/repository.ts";
import {
  createStripePayoutClient,
  createStripePayoutGateway,
} from "../../../src/lib/artist-payouts/stripe-gateway.ts";
import type { PayoutRuntimeEnv } from "../../../src/lib/artist-payouts/types.ts";
import {
  createArtistRosterProjectionWriter,
  rosterProjectionConfigFromRuntimeEnv,
} from "../../../src/lib/artist-payouts/roster-projection-adapter.ts";
import {
  ConnectWebhookError,
  handleConnectPayoutWebhook,
  safeWebhookReference,
} from "../../../src/lib/artist-payouts/webhook-service.ts";

const MAX_BODY_BYTES = 256 * 1024;

function json(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

async function readRawBody(request: Request): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > MAX_BODY_BYTES
  ) {
    throw new ConnectWebhookError("WEBHOOK_BODY_TOO_LARGE", 400);
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    throw new ConnectWebhookError("WEBHOOK_BODY_TOO_LARGE", 400);
  }
  return rawBody;
}

export const onRequest = async (context: {
  request: Request;
  env: PayoutRuntimeEnv;
}): Promise<Response> => {
  if (context.request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405, {
      allow: "POST",
    });
  }
  const signature = context.request.headers.get("stripe-signature");
  if (!signature)
    return json({ ok: false, error: "Missing Stripe signature" }, 400);
  if (signature.length > 4096)
    return json({ ok: false, error: "Webhook rejected" }, 400);

  try {
    const config = getPayoutRuntimeConfig(context.env, "payout-webhook");
    if (
      !context.env.PAYOUTS_D1 ||
      !config.stripeSecretKey ||
      !config.stripeWebhookSecret
    ) {
      throw new Error("Connect payout webhook configuration is incomplete");
    }
    const rawBody = await readRawBody(context.request);
    const stripe = createStripePayoutClient(config.stripeSecretKey);
    const outcome = await handleConnectPayoutWebhook({
      rawBody,
      signature,
      dependencies: {
        stripe,
        gateway: createStripePayoutGateway({
          environment: config.environment,
          client: stripe,
          expectedPlatformAccountId: config.stripePlatformAccountId!,
        }),
        repository: new PayoutRepository(
          context.env.PAYOUTS_D1,
          config.environment,
        ),
        environment: config.environment,
        webhookSecret: config.stripeWebhookSecret,
        rosterProjectionWriter: createArtistRosterProjectionWriter(
          rosterProjectionConfigFromRuntimeEnv(context.env, config.environment),
        ),
      },
    });
    console.info("[connect-payout-webhook] handled", {
      event: safeWebhookReference(outcome.eventId),
      type: outcome.eventType,
      disposition: outcome.disposition,
    });
    return json({ received: true });
  } catch (error) {
    const status =
      error instanceof ConnectWebhookError ? error.httpStatus : 500;
    const code =
      error instanceof ConnectWebhookError
        ? error.safeCode
        : "WEBHOOK_PROCESSING_FAILED";
    console.error("[connect-payout-webhook] rejected", { code });
    return json(
      {
        ok: false,
        error: status >= 500 ? "Webhook processing failed" : "Webhook rejected",
      },
      status,
    );
  }
};
