// /api/admin/lead-delivery-reconciliation
// Protected operational endpoint for delivery health and bounded retry.
// It exposes no customer PII and performs no Google Ads or payment action.

import type { D1Database } from '../../../src/lib/booking/availability-types.ts';
import {
  getQuoteRequestDeliveryHealth,
  reconcileDueQuoteRequestDeliveries,
  requeueDeadLetterDelivery,
  type DeliveryDestination,
  type TransactionalDeliveryEnv,
} from '../../../src/lib/quote-request/transactional-delivery.ts';

type Env = TransactionalDeliveryEnv & {
  AVAILABILITY_D1?: D1Database;
  QUOTE_REQUESTS_D1?: D1Database;
  LEAD_DELIVERY_ADMIN_TOKEN?: string;
};

type Context = { request: Request; env: Env };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function clean(value: unknown, limit = 120): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function isDestination(value: string): value is DeliveryDestination {
  return value === 'crm' || value === 'sheet' || value === 'make';
}

async function timingSafeEqual(presented: string, configured: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [presentedHash, configuredHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(presented)),
    crypto.subtle.digest('SHA-256', encoder.encode(configured)),
  ]);
  const a = new Uint8Array(presentedHash);
  const b = new Uint8Array(configuredHash);
  let diff = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return diff === 0;
}

async function authorize(request: Request, env: Env): Promise<boolean> {
  const configured = clean(env.LEAD_DELIVERY_ADMIN_TOKEN, 512);
  if (!configured) return false;
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
  const header = request.headers.get('x-admin-token')?.trim() ?? '';
  const presented = bearer || header;
  return Boolean(presented) && timingSafeEqual(presented, configured);
}

export const onRequest = async ({ request, env }: Context): Promise<Response> => {
  if (!(await authorize(request, env))) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const db = env.QUOTE_REQUESTS_D1 ?? env.AVAILABILITY_D1;
  if (!db) return json({ ok: false, error: 'Delivery database is not configured' }, 503);

  if (request.method === 'GET') {
    const health = await getQuoteRequestDeliveryHealth(db);
    return json(health, health.ok ? 200 : 503);
  }

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid JSON payload' }, 400);
  }

  const requeueLeadId = clean(body.requeueLeadId);
  const destinationValue = clean(body.destination, 20);
  if (destinationValue && !isDestination(destinationValue)) {
    return json({ ok: false, error: 'Invalid destination' }, 400);
  }

  let requeued = 0;
  if (requeueLeadId) {
    requeued = await requeueDeadLetterDelivery(
      db,
      requeueLeadId,
      destinationValue ? destinationValue as DeliveryDestination : null,
    );
  }

  const numericLimit = Number(body.limit);
  const limit = Number.isFinite(numericLimit) ? Math.max(1, Math.min(Math.trunc(numericLimit), 20)) : 5;
  const reconciliation = await reconcileDueQuoteRequestDeliveries(db, env, { limit });
  const health = await getQuoteRequestDeliveryHealth(db);

  return json({
    ok: reconciliation.durableStateAvailable && health.ok,
    requeued,
    processedLeadIds: reconciliation.processedLeadIds,
    counts: health.counts,
  }, reconciliation.durableStateAvailable && health.ok ? 200 : 503);
};
