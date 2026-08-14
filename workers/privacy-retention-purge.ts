import type { D1Database } from '../src/lib/booking/availability-types.ts';
import { runPrivacyRetentionPurge } from '../src/lib/privacy/retention-purge.ts';

type PrivacyWorkerEnv = {
  PRIVACY_D1?: D1Database;
  PRIVACY_PURGE_APPLY_ENABLED?: string;
  PRIVACY_PURGE_BATCH_SIZE?: string;
  PRIVACY_PURGE_OPERATOR_TOKEN?: string;
  PRIVACY_PURGE_OPERATOR_ACTOR_ID?: string;
};

type ScheduledController = {
  scheduledTime: number;
  cron: string;
  noRetry(): void;
};

type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

function envString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function enabled(value: unknown): boolean {
  return ['1', 'true', 'yes', 'on'].includes(envString(value).toLowerCase());
}

function batchSize(value: unknown): number {
  const parsed = Number.parseInt(envString(value), 10);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(500, parsed)) : 100;
}

async function secureTokenEquals(actual: string, expected: string): Promise<boolean> {
  if (!actual || !expected || expected.length < 32) return false;
  const encoder = new TextEncoder();
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(actualHash);
  const right = new Uint8Array(expectedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export default {
  async fetch(request: Request, env: PrivacyWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/operator/privacy-purge') {
      return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    const authorization = request.headers.get('authorization') ?? '';
    const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!await secureTokenEquals(supplied, envString(env.PRIVACY_PURGE_OPERATOR_TOKEN))) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!/^[A-Za-z0-9_-]{3,80}$/.test(envString(env.PRIVACY_PURGE_OPERATOR_ACTOR_ID))) {
      return Response.json({ ok: false, error: 'Operator identity unavailable' }, { status: 503 });
    }
    if (!env.PRIVACY_D1) {
      return Response.json({ ok: false, error: 'Storage unavailable' }, { status: 503 });
    }
    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return Response.json({ ok: false, error: 'Invalid request' }, { status: 400 });
    }
    const mode = body.mode;
    const runId = typeof body.run_id === 'string' ? body.run_id : '';
    if (!['dry_run', 'apply'].includes(String(mode)) || !/^[A-Za-z0-9_-]{8,80}$/.test(runId)) {
      return Response.json({ ok: false, error: 'Invalid purge contract' }, { status: 400 });
    }
    if (mode === 'apply' && !enabled(env.PRIVACY_PURGE_APPLY_ENABLED)) {
      return Response.json({ ok: false, error: 'Apply mode is disabled' }, { status: 403 });
    }
    const summary = await runPrivacyRetentionPurge(env.PRIVACY_D1, {
      runId,
      dryRun: mode === 'dry_run',
      actorId: envString(env.PRIVACY_PURGE_OPERATOR_ACTOR_ID),
      limit: batchSize(env.PRIVACY_PURGE_BATCH_SIZE),
    });
    return Response.json({ ok: true, summary }, {
      headers: { 'cache-control': 'no-store' },
    });
  },

  async scheduled(
    controller: ScheduledController,
    env: PrivacyWorkerEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    if (!env.PRIVACY_D1) {
      controller.noRetry();
      throw new Error('Privacy purge storage is unavailable.');
    }
    const apply = enabled(env.PRIVACY_PURGE_APPLY_ENABLED);
    const runId = `ppr_${controller.scheduledTime}`;
    ctx.waitUntil(runPrivacyRetentionPurge(env.PRIVACY_D1, {
      runId,
      dryRun: !apply,
      actorId: 'service_privacy_retention',
      now: new Date(controller.scheduledTime),
      limit: batchSize(env.PRIVACY_PURGE_BATCH_SIZE),
    }).catch((error) => {
      controller.noRetry();
      throw error;
    }));
  },
};
