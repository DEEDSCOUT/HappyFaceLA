import type { D1Database } from '../src/lib/booking/availability-types.ts';
import {
  drainNotificationOutbox,
  handleNotificationOperatorRequest,
  type NotificationRecoveryEnv,
} from '../src/lib/quote-request/notification-recovery.ts';

type WorkerEnv = NotificationRecoveryEnv & {
  NOTIFICATION_D1?: D1Database;
};

type ScheduledController = {
  scheduledTime: number;
  cron: string;
  noRetry(): void;
};

type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

function database(env: WorkerEnv): D1Database | null {
  // Fail closed to the dedicated, separately approved binding. Falling back to
  // another D1 binding could send recovery traffic from the wrong database.
  return env.NOTIFICATION_D1 ?? null;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    // Never expose Wrangler's local cron-test path on a deployed worker.
    if (url.pathname === '/__scheduled') return new Response('Not found', { status: 404 });
    const db = database(env);
    if (!db) return Response.json({ ok: false, error: 'Storage unavailable' }, { status: 503 });
    return handleNotificationOperatorRequest(request, db, env);
  },

  async scheduled(
    controller: ScheduledController,
    env: WorkerEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    const db = database(env);
    if (!db) {
      controller.noRetry();
      console.error('HFLA_NOTIFICATION_WORKER_STORAGE_UNAVAILABLE', {
        scheduled_time: controller.scheduledTime,
        cron: controller.cron,
      });
      throw new Error('Notification recovery storage is unavailable.');
    }
    const runId = `nwr_${controller.scheduledTime}`;
    ctx.waitUntil(
      drainNotificationOutbox(db, env, {
        now: new Date(controller.scheduledTime),
        runId,
        limit: 20,
      }).catch((error) => {
        controller.noRetry();
        console.error('HFLA_NOTIFICATION_WORKER_FAILURE', {
          run_id: runId,
          error_code: error instanceof Error ? error.name : 'unknown',
        });
        // Keep the durable failed run and surface a rejected Cron invocation so
        // Cloudflare history/monitoring cannot record this execution as healthy.
        throw error;
      }),
    );
  },
};
