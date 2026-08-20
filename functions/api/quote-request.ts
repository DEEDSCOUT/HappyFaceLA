// Cloudflare Pages Function - POST /api/quote-request
//
// Authoritative runtime wrapper for the durable quote-request handler.
// The Astro route under src/pages/api is local-dev reference only.
//
// Delivery safety: the persistence handler is deliberately invoked with all legacy
// webhook bindings removed. External delivery is then handled by the verified,
// destination-specific outbox below so a Make 2xx can never imply a CRM write.

import { handleQuoteRequest, type QuoteRequestEnv } from '../../src/lib/quote-request/delivery.ts';
import {
  deliverPersistedQuoteRequest,
  reconcileDueQuoteRequestDeliveries,
  type TransactionalDeliveryEnv,
} from '../../src/lib/quote-request/transactional-delivery.ts';

type RuntimeEnv = QuoteRequestEnv & TransactionalDeliveryEnv;

type PagesFunctionContext = {
  request: Request;
  env: RuntimeEnv;
  waitUntil?: (promise: Promise<unknown>) => void;
};

type PersistedResponse = {
  ok?: boolean;
  received?: boolean;
  leadId?: string;
  persisted?: boolean;
  ownerNotificationSent?: boolean;
  sheetWritten?: boolean;
  crmPosted?: boolean;
};

function persistenceOnlyEnv(env: RuntimeEnv): QuoteRequestEnv {
  return {
    ...env,
    QUOTE_REQUEST_CRM_WEBHOOK_URL: undefined,
    QUOTE_REQUEST_CRM_WEBHOOK_SECRET: undefined,
    QUOTE_REQUEST_SHEET_WEBHOOK_URL: undefined,
    QUOTE_REQUEST_SHEET_WEBHOOK_SECRET: undefined,
    QUOTE_REQUEST_MAKE_WEBHOOK_URL: undefined,
    QUOTE_REQUEST_MAKE_SHARED_SECRET: undefined,
  };
}

function jsonResponse(body: Record<string, unknown>, original: Response): Response {
  const headers = new Headers(original.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(body), {
    status: original.status,
    headers,
  });
}

export const onRequest = async (context: PagesFunctionContext): Promise<Response> => {
  const { request, env } = context;
  const persistedResponse = await handleQuoteRequest(request, persistenceOnlyEnv(env));
  if (!persistedResponse.ok) return persistedResponse;

  let persisted: PersistedResponse;
  try {
    persisted = await persistedResponse.clone().json() as PersistedResponse;
  } catch {
    return persistedResponse;
  }

  const db = env.QUOTE_REQUESTS_D1 ?? env.AVAILABILITY_D1;
  if (!db || !persisted.persisted || !persisted.leadId) return persistedResponse;

  let delivery;
  try {
    // Current-lead delivery remains bounded by a 2.5s per-destination timeout and
    // destinations run concurrently. Durable D1 persistence has already succeeded,
    // so a downstream outage cannot lose the inquiry or turn the browser request into
    // a failed form submission after acceptance.
    delivery = await deliverPersistedQuoteRequest(db, persisted.leadId, env);
  } catch (error) {
    console.error('[quote-request] transactional delivery failed after persistence', {
      leadId: persisted.leadId,
      code: 'transactional_delivery_exception',
      error: error instanceof Error ? error.name : 'unknown_error',
    });
    return persistedResponse;
  }

  // Opportunistically heal older pending deliveries without adding latency to the
  // customer response. This is bounded and uses the same lease/idempotency controls.
  if (context.waitUntil) {
    context.waitUntil(
      reconcileDueQuoteRequestDeliveries(db, env, {
        limit: 3,
        excludeLeadId: persisted.leadId,
      }).catch((error) => {
        console.error('[quote-request] background delivery reconciliation failed', {
          code: 'background_delivery_reconciliation_exception',
          error: error instanceof Error ? error.name : 'unknown_error',
        });
      }),
    );
  }

  return jsonResponse({
    ...persisted,
    ownerNotificationSent: delivery.ownerNotificationSent,
    sheetWritten: delivery.sheetWritten,
    crmPosted: delivery.crmPosted,
  }, persistedResponse);
};
