// /api/admin/closed-loop-outcome-writeback
// Draft-only closed-loop outcome writeback path for standalone owner review sheet rows.

import type { D1Database } from '../../../src/lib/booking/availability-types.ts';
import { readJsonObject, sanitizeSafeString } from '../../../src/lib/booking/availability-validation.ts';
import {
  handleOutcomeWriteback,
  type OutcomeWritebackEnv,
} from '../../../src/lib/quote-request/outcome-writeback.ts';

type Env = OutcomeWritebackEnv & {
  AVAILABILITY_D1?: D1Database;
  QUOTE_REQUESTS_D1?: D1Database;
  CLOSED_LOOP_OUTCOME_WRITEBACK_TOKEN?: string;
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

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const admin = await authenticateAdmin(context.request, context.env);
  if (!admin.ok) return json({ ok: false, error: admin.error }, admin.status);

  if (context.request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  const body = await readJsonObject(context.request);
  if (!body.ok) return json({ ok: false, error: body.error }, 400);

  const result = await handleOutcomeWriteback(
    context.env.QUOTE_REQUESTS_D1 ?? context.env.AVAILABILITY_D1,
    body.value,
    context.env,
    admin.actorLabel,
  );
  return json(result, result.status);
};

async function authenticateAdmin(
  request: Request,
  env: Env,
): Promise<{ ok: true; actorLabel: string } | { ok: false; status: number; error: string }> {
  const configured = env.CLOSED_LOOP_OUTCOME_WRITEBACK_TOKEN?.trim();
  if (!configured) {
    console.error('[closed-loop-outcome-writeback] CLOSED_LOOP_OUTCOME_WRITEBACK_TOKEN is not configured');
    return { ok: false, status: 503, error: 'Closed-loop writeback admin access is not configured' };
  }

  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const headerToken = request.headers.get('x-admin-token')?.trim();
  const presented = bearer || headerToken;
  if (!presented || !(await timingSafeTokenEqual(presented, configured))) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const actorLabel =
    sanitizeSafeString(request.headers.get('x-admin-actor') ?? 'closed_loop_admin', 80) ||
    'closed_loop_admin';
  return { ok: true, actorLabel };
}

async function timingSafeTokenEqual(presented: string, configured: string): Promise<boolean> {
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

