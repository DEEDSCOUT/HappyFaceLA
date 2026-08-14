import type { D1Database, D1Value } from '../booking/availability-types.ts';
import {
  assertLeadNotificationPayloadCanSend,
  buildCanonicalNotificationPayload,
  type CanonicalPlanMyPartyLead,
} from './canonical-lead.ts';

export type NotificationDestination = 'crm' | 'sheet' | 'make';

export type NotificationRecoveryEnv = {
  QUOTE_REQUEST_CRM_WEBHOOK_URL?: string;
  QUOTE_REQUEST_CRM_WEBHOOK_SECRET?: string;
  QUOTE_REQUEST_SHEET_WEBHOOK_URL?: string;
  QUOTE_REQUEST_SHEET_WEBHOOK_SECRET?: string;
  QUOTE_REQUEST_MAKE_WEBHOOK_URL?: string;
  QUOTE_REQUEST_MAKE_SHARED_SECRET?: string;
  NOTIFICATION_AUTO_RETRY_DESTINATIONS?: string;
  NOTIFICATION_ALERT_WEBHOOK_URL?: string;
  NOTIFICATION_OPERATOR_TOKEN?: string;
  NOTIFICATION_OPERATOR_ACTOR_ID?: string;
};

export type NotificationAttemptResult = {
  destination: NotificationDestination;
  attempted: boolean;
  delivered: boolean;
  outcome: 'delivered' | 'permanent_failure' | 'ambiguous_failure';
  errorCode: string | null;
  httpStatus: number | null;
  acknowledgement: 'strict' | 'legacy_http_2xx' | 'legacy_json_ok' | 'none';
};

export type NotificationDrainSummary = {
  duplicateRun: boolean;
  examined: number;
  claimed: number;
  sent: number;
  retryScheduled: number;
  needsReview: number;
  skipped: number;
  alerts: string[];
};

export type NotificationQueueHealth = {
  pending: number;
  failedRetryable: number;
  delivering: number;
  needsReview: number;
  expiredLeases: number;
  oldestDueAgeSeconds: number;
  staleWorkerRuns: number;
  failedWorkerRuns: number;
  failedWorkerRunIds: string[];
  failedWorkerRunCutoffUtc: string;
  alertCodes: string[];
};

type NotificationOutboxRow = {
  notification_id: string;
  submission_id: string;
  lead_id: string;
  destination: NotificationDestination;
  status: 'pending' | 'delivering' | 'sent' | 'failed_retryable' | 'needs_review' | 'abandoned';
  attempt_count: number;
  max_attempts: number;
  next_attempt_at_utc: string | null;
  claim_token: string | null;
  lease_expires_at_utc: string | null;
  canonical_payload_json: string | null;
};

type DrainOptions = {
  now?: Date;
  limit?: number;
  runId?: string;
  leadId?: string;
  fetchImpl?: typeof fetch;
};

type OperatorAction = 'retry' | 'mark_delivered' | 'abandon';

// One initial attempt plus the five fixed retry intervals below. This value is
// persisted per row so a later code change cannot silently rewrite the policy
// for already-accepted notifications.
const DEFAULT_MAX_ATTEMPTS = 6;
const MAX_MAX_ATTEMPTS = 10;
const LEASE_MS = 5 * 60 * 1000;
const RETRY_DELAYS_SECONDS = [60, 300, 900, 3600, 21600] as const;
const WORKER_STALE_MS = 5 * 60 * 1000;
const ALERT_AGE_MS = 5 * 60 * 1000;
const ALERT_COOLDOWN_MS = 15 * 60 * 1000;
const ALERT_RETRY_MS = 5 * 60 * 1000;

function envString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function boundedLimit(value: number | undefined): number {
  if (!Number.isInteger(value)) return 20;
  return Math.max(1, Math.min(50, Number(value)));
}

function makeClaimToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `claim_${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function isLeadId(value: unknown): value is string {
  return typeof value === 'string' && /^lead_[0-9a-f]{32}$/.test(value);
}

function destinationUrl(env: NotificationRecoveryEnv, destination: NotificationDestination): string {
  if (destination === 'crm') return envString(env.QUOTE_REQUEST_CRM_WEBHOOK_URL);
  if (destination === 'sheet') return envString(env.QUOTE_REQUEST_SHEET_WEBHOOK_URL);
  return envString(env.QUOTE_REQUEST_MAKE_WEBHOOK_URL);
}

function destinationSecret(env: NotificationRecoveryEnv, destination: NotificationDestination): string {
  if (destination === 'crm') return envString(env.QUOTE_REQUEST_CRM_WEBHOOK_SECRET);
  if (destination === 'sheet') return envString(env.QUOTE_REQUEST_SHEET_WEBHOOK_SECRET);
  return envString(env.QUOTE_REQUEST_MAKE_SHARED_SECRET);
}

export function configuredNotificationDestinations(
  env: NotificationRecoveryEnv,
  formRoute: CanonicalPlanMyPartyLead['formRoute'],
): NotificationDestination[] {
  const configured = (['crm', 'sheet', 'make'] as const).filter((destination) => Boolean(destinationUrl(env, destination)));
  if (formRoute === 'plan-my-party') return [...configured];
  if (configured.includes('crm')) return ['crm'];
  if (configured.includes('make')) return ['make'];
  if (configured.includes('sheet')) return ['sheet'];
  return [];
}

function autoRetryVerified(env: NotificationRecoveryEnv, destination: NotificationDestination): boolean {
  const values = envString(env.NOTIFICATION_AUTO_RETRY_DESTINATIONS)
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return values.includes(destination);
}

function notificationPayload(canonical: CanonicalPlanMyPartyLead): Record<string, unknown> {
  const formRoute = canonical.formRoute ?? 'plan-my-party';
  const base = {
    ...buildCanonicalNotificationPayload(canonical),
    source: formRoute,
    form_route: formRoute,
    submission_id: canonical.submissionId ?? null,
  };
  if (formRoute === 'plan-my-party') return base;
  return {
    ...base,
    leadId: canonical.leadId,
    submittedAt: canonical.createdAt,
    lead: canonical.legacyNotificationLead ?? {},
    legacy_lead: canonical.legacyNotificationLead ?? {},
    canonical: base,
  };
}

async function hmacSignature(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseAcknowledgement(
  text: string,
  canonical: CanonicalPlanMyPartyLead,
  destination: NotificationDestination,
): 'strict' | 'legacy_json_ok' | 'none' {
  if (!text.trim() || text.length > 4096) return 'none';
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed.ok !== true) return 'none';
    if (
      parsed.leadId === canonical.leadId
      && parsed.destination === destination
      && parsed.persisted === true
      && typeof parsed.duplicate === 'boolean'
    ) return 'strict';
    return 'legacy_json_ok';
  } catch {
    return 'none';
  }
}

export async function deliverNotificationDestination(
  env: NotificationRecoveryEnv,
  canonical: CanonicalPlanMyPartyLead,
  destination: NotificationDestination,
  fetchImpl: typeof fetch = fetch,
): Promise<NotificationAttemptResult> {
  const url = destinationUrl(env, destination);
  if (!url) {
    return {
      destination,
      attempted: false,
      delivered: false,
      outcome: 'permanent_failure',
      errorCode: 'destination_not_configured',
      httpStatus: null,
      acknowledgement: 'none',
    };
  }

  const payload = notificationPayload(canonical);
  try {
    assertLeadNotificationPayloadCanSend(payload);
  } catch {
    return {
      destination,
      attempted: false,
      delivered: false,
      outcome: 'permanent_failure',
      errorCode: 'invalid_notification_payload',
      httpStatus: null,
      acknowledgement: 'none',
    };
  }

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-lead-source': (canonical.formRoute ?? 'plan-my-party') === 'plan-my-party'
      ? 'happyfacesla-plan-my-party'
      : 'happyfacesla-cloudflare-pages',
    'x-idempotency-key': canonical.leadId,
  };
  const secret = destinationSecret(env, destination);
  if (secret) headers['x-signature-sha256'] = await hmacSignature(secret, body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
      redirect: 'error',
    });
    if (!response.ok) {
      return {
        destination,
        attempted: true,
        delivered: false,
        outcome: response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429
          ? 'permanent_failure'
          : 'ambiguous_failure',
        errorCode: `http_${response.status}`,
        httpStatus: response.status,
        acknowledgement: 'none',
      };
    }
    const acknowledgement = parseAcknowledgement(await response.text(), canonical, destination);
    if (acknowledgement === 'strict') {
      return {
        destination,
        attempted: true,
        delivered: true,
        outcome: 'delivered',
        errorCode: null,
        httpStatus: response.status,
        acknowledgement,
      };
    }
    const recordedAcknowledgement = destination === 'make' && acknowledgement === 'none'
      ? 'legacy_http_2xx'
      : acknowledgement;
    return {
      destination,
      attempted: true,
      delivered: false,
      outcome: 'ambiguous_failure',
      errorCode: acknowledgement === 'legacy_json_ok'
        ? 'legacy_acknowledgement_unverified'
        : destination === 'make'
          ? 'legacy_http_2xx_unverified'
          : 'invalid_acknowledgement',
      httpStatus: response.status,
      acknowledgement: recordedAcknowledgement,
    };
  } catch (error) {
    return {
      destination,
      attempted: true,
      delivered: false,
      outcome: 'ambiguous_failure',
      errorCode: error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'network_error',
      httpStatus: null,
      acknowledgement: 'none',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseCanonical(row: NotificationOutboxRow): CanonicalPlanMyPartyLead | null {
  if (!row.canonical_payload_json) return null;
  try {
    const parsed = JSON.parse(row.canonical_payload_json) as Partial<CanonicalPlanMyPartyLead>;
    return parsed && parsed.leadId === row.lead_id ? parsed as CanonicalPlanMyPartyLead : null;
  } catch {
    return null;
  }
}

async function listCandidates(
  db: D1Database,
  nowIso: string,
  limit: number,
  leadId?: string,
): Promise<NotificationOutboxRow[]> {
  const leadClause = leadId ? 'AND n.lead_id = ?' : '';
  const statement = db.prepare(
    `SELECT n.notification_id, n.submission_id, n.lead_id, n.destination,
            n.status, n.attempt_count, n.max_attempts, n.next_attempt_at_utc,
            n.claim_token, n.lease_expires_at_utc, q.canonical_payload_json
     FROM lead_notification_outbox n
     LEFT JOIN quote_requests q ON q.lead_id = n.lead_id
     WHERE (
       (n.status IN ('pending', 'failed_retryable') AND n.next_attempt_at_utc <= ?)
       OR (n.status = 'delivering' AND n.lease_expires_at_utc < ?)
     )
     ${leadClause}
     ORDER BY COALESCE(n.next_attempt_at_utc, n.lease_expires_at_utc, n.created_at_utc), n.notification_id
     LIMIT ?`,
  );
  const result = leadId
    ? await statement.bind(nowIso, nowIso, leadId, limit).all<NotificationOutboxRow>()
    : await statement.bind(nowIso, nowIso, limit).all<NotificationOutboxRow>();
  return Array.isArray(result.results) ? result.results : [];
}

async function moveToNeedsReview(
  db: D1Database,
  row: NotificationOutboxRow,
  nowIso: string,
  errorCode: string,
  requireClaimToken?: string,
): Promise<boolean> {
  const tokenClause = requireClaimToken
    ? "AND status = 'delivering' AND claim_token = ?"
    : 'AND status = ? AND attempt_count = ?';
  const values: D1Value[] = [errorCode, nowIso, nowIso, row.notification_id];
  if (requireClaimToken) values.push(requireClaimToken);
  else values.push(row.status, row.attempt_count);
  const result = await db.prepare(
    `UPDATE lead_notification_outbox
     SET status = 'needs_review', next_attempt_at_utc = NULL,
         claim_token = NULL, lease_expires_at_utc = NULL,
         last_error_code = ?, dead_lettered_at_utc = ?, updated_at_utc = ?
     WHERE notification_id = ? ${tokenClause}`,
  ).bind(...values).run();
  return (result.meta?.changes ?? 0) === 1;
}

async function claimRow(
  db: D1Database,
  row: NotificationOutboxRow,
  now: Date,
): Promise<string | null> {
  const nowIso = now.toISOString();
  const claimToken = makeClaimToken();
  const leaseExpires = new Date(now.getTime() + LEASE_MS).toISOString();
  const result = await db.prepare(
    `UPDATE lead_notification_outbox
     SET status = 'delivering', claim_token = ?, lease_expires_at_utc = ?,
         next_attempt_at_utc = NULL, attempt_count = attempt_count + 1,
         last_attempt_at_utc = ?, updated_at_utc = ?
     WHERE notification_id = ?
       AND attempt_count < max_attempts
       AND (
         (status IN ('pending', 'failed_retryable') AND next_attempt_at_utc <= ?)
         OR (status = 'delivering' AND lease_expires_at_utc < ?)
       )`,
  ).bind(claimToken, leaseExpires, nowIso, nowIso, row.notification_id, nowIso, nowIso).run();
  return (result.meta?.changes ?? 0) === 1 ? claimToken : null;
}

function retryAt(now: Date, attemptCount: number): string {
  const index = Math.min(Math.max(attemptCount - 1, 0), RETRY_DELAYS_SECONDS.length - 1);
  return new Date(now.getTime() + RETRY_DELAYS_SECONDS[index] * 1000).toISOString();
}

async function finalizeAttempt(
  db: D1Database,
  row: NotificationOutboxRow,
  claimToken: string,
  result: NotificationAttemptResult,
  now: Date,
  verifiedForRetry: boolean,
): Promise<'sent' | 'failed_retryable' | 'needs_review' | 'skipped'> {
  const nowIso = now.toISOString();
  const attemptCount = row.attempt_count + 1;
  let status: 'sent' | 'failed_retryable' | 'needs_review';
  let errorCode: string | null = result.errorCode;
  let nextAttempt: string | null = null;
  let deadLetteredAt: string | null = null;

  if (result.delivered) {
    status = 'sent';
    errorCode = null;
  } else if (result.outcome === 'ambiguous_failure' && !verifiedForRetry) {
    status = 'needs_review';
    errorCode = `ambiguous_delivery:${result.errorCode ?? 'unknown'}`;
    deadLetteredAt = nowIso;
  } else if (result.outcome === 'permanent_failure' || attemptCount >= row.max_attempts) {
    status = 'needs_review';
    errorCode = attemptCount >= row.max_attempts
      ? `max_attempts_exhausted:${result.errorCode ?? 'unknown'}`
      : result.errorCode;
    deadLetteredAt = nowIso;
  } else {
    status = 'failed_retryable';
    nextAttempt = retryAt(now, attemptCount);
  }

  const outboxUpdate = db.prepare(
    `UPDATE lead_notification_outbox
     SET status = ?, next_attempt_at_utc = ?, claim_token = NULL,
         lease_expires_at_utc = NULL, last_error_code = ?, last_http_status = ?,
         last_acknowledgement = ?, dead_lettered_at_utc = ?, updated_at_utc = ?
     WHERE notification_id = ? AND status = 'delivering' AND claim_token = ?
       AND EXISTS (
         SELECT 1 FROM quote_requests WHERE lead_id = ? AND updated_at = ?
       )`,
  ).bind(
    status,
    nextAttempt,
    errorCode,
    result.httpStatus,
    result.acknowledgement,
    deadLetteredAt,
    nowIso,
    row.notification_id,
    claimToken,
    row.lead_id,
    nowIso,
  );
  const quoteUpdate = db.prepare(
    `UPDATE quote_requests
     SET updated_at = ?,
         delivery_status = CASE WHEN ? = 1 THEN 'persisted_optional_notification_succeeded' ELSE delivery_status END,
         owner_notification_sent = CASE WHEN ? = 1 THEN 1 ELSE owner_notification_sent END,
         sheet_written = CASE WHEN ? = 1 THEN 1 ELSE sheet_written END,
         crm_posted = CASE WHEN ? = 1 THEN 1 ELSE crm_posted END
     WHERE lead_id = ?
       AND EXISTS (
         SELECT 1 FROM lead_notification_outbox
         WHERE notification_id = ? AND status = 'delivering' AND claim_token = ?
       )`,
  ).bind(
    nowIso,
    result.delivered ? 1 : 0,
    result.delivered ? 1 : 0,
    result.delivered && (row.destination === 'sheet' || row.destination === 'make') ? 1 : 0,
    result.delivered && (row.destination === 'crm' || row.destination === 'make') ? 1 : 0,
    row.lead_id,
    row.notification_id,
    claimToken,
  );

  if (!db.batch) throw new Error('D1 batch support is required for notification finalization.');
  const finalized = await db.batch([quoteUpdate, outboxUpdate]);
  if (finalized.some((entry) => entry.success === false || Boolean(entry.error))) {
    throw new Error('Notification finalization batch failed.');
  }
  if ((finalized[1]?.meta?.changes ?? 0) !== 1) return 'skipped';
  return status;
}

async function processRow(
  db: D1Database,
  env: NotificationRecoveryEnv,
  row: NotificationOutboxRow,
  now: Date,
  fetchImpl: typeof fetch,
): Promise<'sent' | 'failed_retryable' | 'needs_review' | 'skipped'> {
  const verifiedForRetry = autoRetryVerified(env, row.destination);
  if (row.status === 'delivering' && !verifiedForRetry) {
    return await moveToNeedsReview(
      db,
      row,
      now.toISOString(),
      'ambiguous_delivery:expired_lease',
      row.claim_token ?? undefined,
    ) ? 'needs_review' : 'skipped';
  }
  if (row.attempt_count >= row.max_attempts) {
    return await moveToNeedsReview(db, row, now.toISOString(), 'max_attempts_exhausted:preclaim')
      ? 'needs_review'
      : 'skipped';
  }
  const canonical = parseCanonical(row);
  if (!canonical) {
    return await moveToNeedsReview(db, row, now.toISOString(), 'invalid_persisted_canonical')
      ? 'needs_review'
      : 'skipped';
  }
  const claimToken = await claimRow(db, row, now);
  if (!claimToken) return 'skipped';
  const result = await deliverNotificationDestination(env, canonical, row.destination, fetchImpl);
  return finalizeAttempt(db, row, claimToken, result, now, verifiedForRetry);
}

async function beginWorkerRun(db: D1Database, runId: string, nowIso: string): Promise<boolean> {
  const result = await db.prepare(
    `INSERT INTO notification_worker_runs (
       run_id, scheduled_at_utc, started_at_utc, status,
       examined_count, claimed_count, sent_count, retry_scheduled_count,
       needs_review_count, skipped_count, alert_codes_json, created_at_utc, updated_at_utc
     ) VALUES (?, ?, ?, 'running', 0, 0, 0, 0, 0, 0, '[]', ?, ?)
     ON CONFLICT(run_id) DO NOTHING`,
  ).bind(runId, nowIso, nowIso, nowIso, nowIso).run();
  return (result.meta?.changes ?? 0) === 1;
}

async function closeStaleWorkerRuns(db: D1Database, now: Date): Promise<void> {
  const nowIso = now.toISOString();
  const staleIso = new Date(now.getTime() - WORKER_STALE_MS).toISOString();
  await db.prepare(
    `UPDATE notification_worker_runs
     SET completed_at_utc = ?, status = 'failed',
         last_error_code = 'stale_worker_run_timeout', updated_at_utc = ?
     WHERE status = 'running' AND started_at_utc < ?`,
  ).bind(nowIso, nowIso, staleIso).run();
}

async function finishWorkerRun(
  db: D1Database,
  runId: string,
  nowIso: string,
  summary: NotificationDrainSummary,
): Promise<void> {
  const result = await db.prepare(
    `UPDATE notification_worker_runs
     SET completed_at_utc = ?, status = 'completed', examined_count = ?,
         claimed_count = ?, sent_count = ?, retry_scheduled_count = ?,
         needs_review_count = ?, skipped_count = ?, alert_codes_json = ?,
         updated_at_utc = ?
     WHERE run_id = ? AND status = 'running'`,
  ).bind(
    nowIso,
    summary.examined,
    summary.claimed,
    summary.sent,
    summary.retryScheduled,
    summary.needsReview,
    summary.skipped,
    JSON.stringify(summary.alerts),
    nowIso,
    runId,
  ).run();
  if ((result.meta?.changes ?? 0) !== 1) {
    throw new Error('Notification worker run finalization was not fenced to one running row.');
  }
}

async function failWorkerRun(
  db: D1Database,
  runId: string,
  nowIso: string,
  error: unknown,
): Promise<void> {
  const errorCode = error instanceof Error
    ? error.name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'worker_error'
    : 'worker_error';
  await db.prepare(
    `UPDATE notification_worker_runs
     SET completed_at_utc = ?, status = 'failed', last_error_code = ?, updated_at_utc = ?
     WHERE run_id = ? AND status = 'running'`,
  ).bind(nowIso, errorCode, nowIso, runId).run();
}

export async function notificationQueueHealth(
  db: D1Database,
  now = new Date(),
): Promise<NotificationQueueHealth> {
  const nowIso = now.toISOString();
  const staleIso = new Date(now.getTime() - WORKER_STALE_MS).toISOString();
  const row = await db.prepare(
    `SELECT
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN status = 'failed_retryable' THEN 1 ELSE 0 END) AS failed_retryable,
       SUM(CASE WHEN status = 'delivering' THEN 1 ELSE 0 END) AS delivering,
       SUM(CASE WHEN status = 'needs_review' THEN 1 ELSE 0 END) AS needs_review,
       SUM(CASE WHEN status = 'delivering' AND lease_expires_at_utc < ? THEN 1 ELSE 0 END) AS expired_leases,
       MIN(CASE WHEN status IN ('pending', 'failed_retryable') THEN next_attempt_at_utc ELSE NULL END) AS oldest_due
     FROM lead_notification_outbox`,
  ).bind(nowIso).first<Record<string, D1Value>>();
  const stale = await db.prepare(
    `SELECT COUNT(*) AS count FROM notification_worker_runs
     WHERE status = 'running' AND started_at_utc < ?`,
  ).bind(staleIso).first<{ count: number }>();
  const failed = await db.prepare(
    `SELECT COUNT(*) AS count FROM notification_worker_runs
     WHERE status = 'failed' AND alerted_at_utc IS NULL AND completed_at_utc <= ?`,
  ).bind(nowIso).first<{ count: number }>();
  const failedRows = await db.prepare(
    `SELECT run_id FROM notification_worker_runs
     WHERE status = 'failed' AND alerted_at_utc IS NULL AND completed_at_utc <= ?
     ORDER BY completed_at_utc, run_id
     LIMIT 100`,
  ).bind(nowIso).all<{ run_id: string }>();
  const failedWorkerRunIds = Array.isArray(failedRows.results)
    ? failedRows.results.map((candidate) => candidate.run_id)
    : [];
  const oldestDue = typeof row?.oldest_due === 'string' ? Date.parse(row.oldest_due) : NaN;
  const oldestDueAgeSeconds = Number.isFinite(oldestDue) && oldestDue <= now.getTime()
    ? Math.floor((now.getTime() - oldestDue) / 1000)
    : 0;
  const health: NotificationQueueHealth = {
    pending: Number(row?.pending ?? 0),
    failedRetryable: Number(row?.failed_retryable ?? 0),
    delivering: Number(row?.delivering ?? 0),
    needsReview: Number(row?.needs_review ?? 0),
    expiredLeases: Number(row?.expired_leases ?? 0),
    oldestDueAgeSeconds,
    staleWorkerRuns: Number(stale?.count ?? 0),
    failedWorkerRuns: Number(failed?.count ?? 0),
    failedWorkerRunIds,
    failedWorkerRunCutoffUtc: nowIso,
    alertCodes: [],
  };
  if (health.oldestDueAgeSeconds * 1000 > ALERT_AGE_MS) health.alertCodes.push('oldest_due_over_5m');
  if (health.expiredLeases > 0) health.alertCodes.push('expired_lease_present');
  if (health.needsReview > 0) health.alertCodes.push('needs_review_present');
  if (health.staleWorkerRuns > 0) health.alertCodes.push('stale_worker_run_present');
  if (health.failedWorkerRuns > 0) health.alertCodes.push('failed_worker_run_present');
  return health;
}

async function emitAlerts(
  env: NotificationRecoveryEnv,
  health: NotificationQueueHealth,
  now: Date,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  if (health.alertCodes.length === 0) return true;
  const safeAlert = {
    system: 'hfla-notification-recovery',
    timestamp: now.toISOString(),
    alert_codes: health.alertCodes,
    counts: {
      pending: health.pending,
      failed_retryable: health.failedRetryable,
      delivering: health.delivering,
      needs_review: health.needsReview,
      expired_leases: health.expiredLeases,
      stale_worker_runs: health.staleWorkerRuns,
      failed_worker_runs: health.failedWorkerRuns,
      failed_worker_run_ids: health.failedWorkerRunIds,
      failed_worker_run_cutoff_utc: health.failedWorkerRunCutoffUtc,
      oldest_due_age_seconds: health.oldestDueAgeSeconds,
    },
  };
  console.error('HFLA_NOTIFICATION_QUEUE_ALERT', safeAlert);
  const url = envString(env.NOTIFICATION_ALERT_WEBHOOK_URL);
  if (!url) return false;
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(safeAlert),
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    // Queue state is already durable. Alert transport is deliberately best-effort.
    return false;
  }
}

async function alertFingerprint(health: NotificationQueueHealth): Promise<string> {
  const material = JSON.stringify({
    alert_codes: [...health.alertCodes].sort(),
    failed_worker_run_ids: [...health.failedWorkerRunIds].sort(),
    pending: health.pending,
    failed_retryable: health.failedRetryable,
    delivering: health.delivering,
    needs_review: health.needsReview,
    expired_leases: health.expiredLeases,
    stale_worker_runs: health.staleWorkerRuns,
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

async function shouldSendAlert(
  db: D1Database,
  health: NotificationQueueHealth,
  now: Date,
): Promise<{ send: boolean; fingerprint: string }> {
  const fingerprint = await alertFingerprint(health);
  const state = await db.prepare(
    `SELECT fingerprint_sha256, next_eligible_at_utc
     FROM notification_alert_state WHERE alert_key = 'queue_health'`,
  ).first<{ fingerprint_sha256: string; next_eligible_at_utc: string }>();
  if (!state) return { send: true, fingerprint };
  return {
    send: state.fingerprint_sha256 !== fingerprint
      || Date.parse(state.next_eligible_at_utc) <= now.getTime(),
    fingerprint,
  };
}

async function recordAlertAttempt(
  db: D1Database,
  health: NotificationQueueHealth,
  fingerprint: string,
  now: Date,
  delivered: boolean,
): Promise<void> {
  const nowIso = now.toISOString();
  const nextEligible = new Date(
    now.getTime() + (delivered ? ALERT_COOLDOWN_MS : ALERT_RETRY_MS),
  ).toISOString();
  await db.prepare(
    `INSERT INTO notification_alert_state (
       alert_key, fingerprint_sha256, alert_codes_json, failed_run_ids_json,
       failed_run_cutoff_utc, last_attempt_at_utc, last_delivered_at_utc,
       next_eligible_at_utc, delivery_status, updated_at_utc
     ) VALUES ('queue_health', ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(alert_key) DO UPDATE SET
       fingerprint_sha256 = excluded.fingerprint_sha256,
       alert_codes_json = excluded.alert_codes_json,
       failed_run_ids_json = excluded.failed_run_ids_json,
       failed_run_cutoff_utc = excluded.failed_run_cutoff_utc,
       last_attempt_at_utc = excluded.last_attempt_at_utc,
       last_delivered_at_utc = excluded.last_delivered_at_utc,
       next_eligible_at_utc = excluded.next_eligible_at_utc,
       delivery_status = excluded.delivery_status,
       updated_at_utc = excluded.updated_at_utc`,
  ).bind(
    fingerprint,
    JSON.stringify(health.alertCodes),
    JSON.stringify(health.failedWorkerRunIds),
    health.failedWorkerRunCutoffUtc,
    nowIso,
    delivered ? nowIso : null,
    nextEligible,
    delivered ? 'delivered' : 'failed',
    nowIso,
  ).run();
}

async function markFailedWorkerRunsAlerted(
  db: D1Database,
  health: NotificationQueueHealth,
  nowIso: string,
): Promise<void> {
  if (health.failedWorkerRunIds.length === 0) return;
  const placeholders = health.failedWorkerRunIds.map(() => '?').join(', ');
  await db.prepare(
    `UPDATE notification_worker_runs
     SET alerted_at_utc = ?, updated_at_utc = ?
     WHERE status = 'failed' AND alerted_at_utc IS NULL
       AND completed_at_utc <= ? AND run_id IN (${placeholders})`,
  ).bind(
    nowIso,
    nowIso,
    health.failedWorkerRunCutoffUtc,
    ...health.failedWorkerRunIds,
  ).run();
}

async function processHealthAlert(
  db: D1Database,
  env: NotificationRecoveryEnv,
  health: NotificationQueueHealth,
  now: Date,
  fetchImpl: typeof fetch,
): Promise<void> {
  if (health.alertCodes.length === 0) {
    await db.prepare(
      `DELETE FROM notification_alert_state WHERE alert_key = 'queue_health'`,
    ).run();
    return;
  }
  const decision = await shouldSendAlert(db, health, now);
  if (!decision.send) return;
  const delivered = await emitAlerts(env, health, now, fetchImpl);
  await recordAlertAttempt(db, health, decision.fingerprint, now, delivered);
  if (delivered && health.failedWorkerRuns > 0) {
    await markFailedWorkerRunsAlerted(db, health, now.toISOString());
  }
}

export async function drainNotificationOutbox(
  db: D1Database,
  env: NotificationRecoveryEnv,
  options: DrainOptions = {},
): Promise<NotificationDrainSummary> {
  const now = options.now ?? new Date();
  const fetchImpl = options.fetchImpl ?? fetch;
  const summary: NotificationDrainSummary = {
    duplicateRun: false,
    examined: 0,
    claimed: 0,
    sent: 0,
    retryScheduled: 0,
    needsReview: 0,
    skipped: 0,
    alerts: [],
  };
  if (options.runId && !await beginWorkerRun(db, options.runId, now.toISOString())) {
    summary.duplicateRun = true;
    return summary;
  }
  try {
    if (options.runId) await closeStaleWorkerRuns(db, now);
    const candidates = await listCandidates(db, now.toISOString(), boundedLimit(options.limit), options.leadId);
    summary.examined = candidates.length;
    for (const row of candidates) {
      const outcome = await processRow(db, env, row, now, fetchImpl);
      if (outcome !== 'skipped') summary.claimed += 1;
      if (outcome === 'sent') summary.sent += 1;
      else if (outcome === 'failed_retryable') summary.retryScheduled += 1;
      else if (outcome === 'needs_review') summary.needsReview += 1;
      else summary.skipped += 1;
    }
    const health = await notificationQueueHealth(db, now);
    summary.alerts = health.alertCodes;
    if (options.runId) {
      await processHealthAlert(db, env, health, now, fetchImpl);
    }
    if (options.runId) await finishWorkerRun(db, options.runId, now.toISOString(), summary);
    return summary;
  } catch (error) {
    if (options.runId) {
      try {
        await failWorkerRun(db, options.runId, now.toISOString(), error);
        const health = await notificationQueueHealth(db, now);
        await processHealthAlert(db, env, health, now, fetchImpl);
      } catch {
        // The durable running row becomes a stale-run alert if D1 itself is unavailable.
      }
    }
    throw error;
  }
}

async function secureTokenEquals(actual: string, expected: string): Promise<boolean> {
  if (!actual || expected.length < 32 || actual.length > 512 || expected.length > 512) return false;
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(actual)),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(expected)),
  ]);
  const left = new Uint8Array(actualHash);
  const right = new Uint8Array(expectedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function safeJson(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

export async function handleNotificationOperatorRequest(
  request: Request,
  db: D1Database,
  env: NotificationRecoveryEnv,
  now = new Date(),
): Promise<Response> {
  const expected = envString(env.NOTIFICATION_OPERATOR_TOKEN);
  const operatorActorId = envString(env.NOTIFICATION_OPERATOR_ACTOR_ID);
  const authorization = request.headers.get('authorization') ?? '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!await secureTokenEquals(supplied, expected)) return safeJson({ ok: false, error: 'Unauthorized' }, 401);
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(operatorActorId)) {
    return safeJson({ ok: false, error: 'Operator identity unavailable' }, 503);
  }

  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/operator/health') {
    return safeJson({ ok: true, health: await notificationQueueHealth(db, now) });
  }
  if (request.method !== 'POST' || url.pathname !== '/operator/recover') {
    return safeJson({ ok: false, error: 'Not found' }, 404);
  }

  const text = await request.text();
  if (!text || text.length > 4096) return safeJson({ ok: false, error: 'Invalid request' }, 400);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return safeJson({ ok: false, error: 'Invalid request' }, 400);
  }
  const leadId = body.lead_id;
  const destination = body.destination;
  const action = body.action;
  const actionId = typeof body.action_id === 'string' ? body.action_id.trim() : '';
  const reasonCode = typeof body.reason_code === 'string'
    ? body.reason_code.replace(/[^a-z0-9_-]/gi, '_').slice(0, 80)
    : '';
  if (
    !isLeadId(leadId)
    || !['crm', 'sheet', 'make'].includes(String(destination))
    || !['retry', 'mark_delivered', 'abandon'].includes(String(action))
    || !/^[A-Za-z0-9_-]{8,80}$/.test(actionId)
    || !reasonCode
    || body.confirmed_downstream_checked !== true
  ) return safeJson({ ok: false, error: 'Invalid recovery contract' }, 400);

  const typedDestination = destination as NotificationDestination;
  const typedAction = action as OperatorAction;
  const nowIso = now.toISOString();
  const audit = db.prepare(
    `INSERT INTO notification_operator_audit (
       action_id, notification_id, lead_id, destination, action, reason_code,
       operator_actor_id, created_at_utc
     )
     SELECT ?, notification_id, lead_id, destination, ?, ?, ?, ?
     FROM lead_notification_outbox
     WHERE lead_id = ? AND destination = ? AND status = 'needs_review'
       AND (? = 0 OR attempt_count < ?)
       AND (? = 0 OR EXISTS (SELECT 1 FROM quote_requests WHERE lead_id = ?))
     ON CONFLICT(action_id) DO NOTHING`,
  ).bind(
    actionId,
    typedAction,
    reasonCode,
    operatorActorId,
    nowIso,
    leadId,
    typedDestination,
    typedAction === 'retry' ? 1 : 0,
    MAX_MAX_ATTEMPTS,
    typedAction === 'mark_delivered' ? 1 : 0,
    leadId,
  );
  const nextStatus = typedAction === 'retry' ? 'pending' : typedAction === 'mark_delivered' ? 'sent' : 'abandoned';
  const update = db.prepare(
    `UPDATE lead_notification_outbox
     SET status = ?, next_attempt_at_utc = ?, claim_token = NULL,
         lease_expires_at_utc = NULL, dead_lettered_at_utc = ?,
         last_error_code = ?, operator_retry_count = operator_retry_count + ?,
         max_attempts = CASE WHEN ? = 1 AND attempt_count >= max_attempts AND max_attempts < ?
           THEN max_attempts + 1 ELSE max_attempts END,
         last_operator_action_id = ?, updated_at_utc = ?
     WHERE lead_id = ? AND destination = ? AND status = 'needs_review'
       AND (last_operator_action_id IS NULL OR last_operator_action_id != ?)
       AND (? = 0 OR attempt_count < ?)
       AND (? = 0 OR EXISTS (SELECT 1 FROM quote_requests WHERE lead_id = ?))
       AND EXISTS (
         SELECT 1 FROM notification_operator_audit
         WHERE action_id = ? AND lead_id = ? AND destination = ? AND action = ?
       )`,
  ).bind(
    nextStatus,
    typedAction === 'retry' ? nowIso : null,
    typedAction === 'retry' || typedAction === 'mark_delivered' ? null : nowIso,
    typedAction === 'mark_delivered' ? null : `operator:${typedAction}:${reasonCode}`,
    typedAction === 'retry' ? 1 : 0,
    typedAction === 'retry' ? 1 : 0,
    MAX_MAX_ATTEMPTS,
    actionId,
    nowIso,
    leadId,
    typedDestination,
    actionId,
    typedAction === 'retry' ? 1 : 0,
    MAX_MAX_ATTEMPTS,
    typedAction === 'mark_delivered' ? 1 : 0,
    leadId,
    actionId,
    leadId,
    typedDestination,
    typedAction,
  );
  const quoteUpdate = db.prepare(
    `UPDATE quote_requests
     SET updated_at = ?,
         delivery_status = CASE WHEN ? = 1 THEN 'persisted_optional_notification_succeeded' ELSE delivery_status END,
         owner_notification_sent = CASE WHEN ? = 1 THEN 1 ELSE owner_notification_sent END,
         sheet_written = CASE WHEN ? = 1 THEN 1 ELSE sheet_written END,
         crm_posted = CASE WHEN ? = 1 THEN 1 ELSE crm_posted END
     WHERE ? = 1 AND lead_id = ?
       AND EXISTS (
         SELECT 1 FROM lead_notification_outbox
         WHERE lead_id = ? AND destination = ? AND status = 'sent' AND last_operator_action_id = ?
       )`,
  ).bind(
    nowIso,
    typedAction === 'mark_delivered' ? 1 : 0,
    typedAction === 'mark_delivered' ? 1 : 0,
    typedAction === 'mark_delivered' && (typedDestination === 'sheet' || typedDestination === 'make') ? 1 : 0,
    typedAction === 'mark_delivered' && (typedDestination === 'crm' || typedDestination === 'make') ? 1 : 0,
    typedAction === 'mark_delivered' ? 1 : 0,
    leadId,
    leadId,
    typedDestination,
    actionId,
  );
  if (!db.batch) throw new Error('D1 batch support is required for operator recovery.');
  const [audited, updated, quoteUpdated] = await db.batch([audit, update, quoteUpdate]);
  if (
    (updated.meta?.changes ?? 0) !== 1
    || (audited.meta?.changes ?? 0) !== 1
    || (typedAction === 'mark_delivered' && (quoteUpdated.meta?.changes ?? 0) !== 1)
  ) {
    return safeJson({ ok: false, error: 'Recovery target not available' }, 409);
  }
  return safeJson({
    ok: true,
    lead_id: leadId,
    destination: typedDestination,
    action: typedAction,
    status: nextStatus,
    action_id: actionId,
  });
}

export const notificationRecoveryPolicy = Object.freeze({
  defaultMaxAttempts: DEFAULT_MAX_ATTEMPTS,
  maximumMaxAttempts: MAX_MAX_ATTEMPTS,
  leaseMilliseconds: LEASE_MS,
  retryDelaysSeconds: [...RETRY_DELAYS_SECONDS],
  workerStaleMilliseconds: WORKER_STALE_MS,
  queueAgeAlertMilliseconds: ALERT_AGE_MS,
  alertCooldownMilliseconds: ALERT_COOLDOWN_MS,
  alertRetryMilliseconds: ALERT_RETRY_MS,
});
