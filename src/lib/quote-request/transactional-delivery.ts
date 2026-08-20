import type { D1Database, D1Result, D1Value } from '../booking/availability-types.ts';
import {
  assertLeadNotificationPayloadCanSend,
  buildCanonicalNotificationPayload,
  type CanonicalPlanMyPartyLead,
} from './canonical-lead.ts';

export type DeliveryDestination = 'crm' | 'sheet' | 'make';
export type DeliveryStatus = 'pending' | 'processing' | 'retry' | 'delivered' | 'dead_letter';

export type TransactionalDeliveryEnv = {
  QUOTE_REQUEST_CRM_WEBHOOK_URL?: string;
  QUOTE_REQUEST_CRM_WEBHOOK_SECRET?: string;
  QUOTE_REQUEST_SHEET_WEBHOOK_URL?: string;
  QUOTE_REQUEST_SHEET_WEBHOOK_SECRET?: string;
  QUOTE_REQUEST_MAKE_WEBHOOK_URL?: string;
  QUOTE_REQUEST_MAKE_SHARED_SECRET?: string;
  QUOTE_REQUEST_DELIVERY_ALERT_WEBHOOK_URL?: string;
  QUOTE_REQUEST_DELIVERY_ALERT_WEBHOOK_SECRET?: string;
};

export type DeliverySummary = {
  leadId: string;
  durableStateAvailable: boolean;
  crmPosted: boolean;
  sheetWritten: boolean;
  ownerNotificationSent: boolean;
  configuredDestinations: DeliveryDestination[];
  deliveredDestinations: DeliveryDestination[];
  retryDestinations: DeliveryDestination[];
  deadLetterDestinations: DeliveryDestination[];
};

type DeliveryRow = {
  lead_id: string;
  destination: DeliveryDestination;
  status: DeliveryStatus;
  attempt_count: number;
  last_attempt_at_utc: string | null;
  next_attempt_at_utc: string | null;
  delivered_at_utc: string | null;
  last_http_status: number | null;
  last_error_code: string | null;
  last_error_message: string | null;
  acknowledged_external_lead_id: string | null;
  acknowledged_internal_lead_id: string | null;
};

type CanonicalRow = {
  lead_id: string;
  canonical_payload_json: string | null;
};

type AttemptResult = {
  destination: DeliveryDestination;
  delivered: boolean;
  httpStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  acknowledgedExternalLeadId: string | null;
  acknowledgedInternalLeadId: string | null;
};

type HttpResult = {
  ok: boolean;
  status: number | null;
  body: string;
  errorCode: string | null;
  errorMessage: string | null;
};

const CRM_CONTRACT_VERSION = 'hfla-booking-control-center-v1';
const SHEET_CONTRACT_VERSION = 'hfla-sheet-mirror-v1';
const WEBHOOK_TIMEOUT_MS = 2_500;
const DELIVERY_LEASE_MS = 120_000;
const MAX_ATTEMPTS = 6;
const RETRY_SECONDS = [60, 300, 900, 3_600, 21_600];
const SAFE_ERROR_LIMIT = 180;
const INTERNAL_LEAD_ID = /^LEAD-REAL-\d{8}-\d{3,}$/;

function cleanString(value: unknown, maxLength = 512): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function envString(value: unknown): string {
  return cleanString(value, 2_048);
}

function safeError(value: unknown): string | null {
  const text = cleanString(value, SAFE_ERROR_LIMIT);
  return text || null;
}

function configuredDestinations(env: TransactionalDeliveryEnv): DeliveryDestination[] {
  const destinations: DeliveryDestination[] = [];
  if (envString(env.QUOTE_REQUEST_CRM_WEBHOOK_URL)) destinations.push('crm');
  if (envString(env.QUOTE_REQUEST_SHEET_WEBHOOK_URL)) destinations.push('sheet');
  if (envString(env.QUOTE_REQUEST_MAKE_WEBHOOK_URL)) destinations.push('make');
  return destinations;
}

function backoffSeconds(attemptCount: number): number {
  return RETRY_SECONDS[Math.min(Math.max(attemptCount - 1, 0), RETRY_SECONDS.length - 1)];
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1_000).toISOString();
}

function isRowDelivered(row: DeliveryRow | undefined): boolean {
  return row?.status === 'delivered';
}

function rowsByDestination(rows: DeliveryRow[]): Map<DeliveryDestination, DeliveryRow> {
  return new Map(rows.map((row) => [row.destination, row]));
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function postJson(
  url: string,
  body: string,
  headers: Record<string, string>,
): Promise<HttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    const text = (await response.text()).slice(0, 4_096);
    return {
      ok: response.ok,
      status: response.status,
      body: text,
      errorCode: response.ok ? null : `http_${response.status}`,
      errorMessage: response.ok ? null : `Webhook returned HTTP ${response.status}`,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      status: null,
      body: '',
      errorCode: timedOut ? 'timeout' : 'network_error',
      errorMessage: timedOut ? 'Webhook request timed out' : 'Webhook request failed',
    };
  } finally {
    clearTimeout(timer);
  }
}

export function parseVerifiedCrmAcknowledgement(
  body: string,
  externalLeadId: string,
): { ok: true; externalLeadId: string; internalLeadId: string } | { ok: false; code: string } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return { ok: false, code: 'crm_ack_non_json' };
  }

  const acknowledgedExternal = cleanString(parsed.externalLeadId, 120);
  const internalLeadId = cleanString(parsed.internalLeadId, 120);
  if (parsed.ok !== true || parsed.verified !== true) {
    return { ok: false, code: 'crm_ack_unverified' };
  }
  if (parsed.system !== 'booking-control-center' || parsed.sheet !== '01_LEADS') {
    return { ok: false, code: 'crm_ack_wrong_system' };
  }
  if (!acknowledgedExternal || acknowledgedExternal !== externalLeadId) {
    return { ok: false, code: 'crm_ack_lead_mismatch' };
  }
  if (!INTERNAL_LEAD_ID.test(internalLeadId)) {
    return { ok: false, code: 'crm_ack_invalid_internal_id' };
  }
  return { ok: true, externalLeadId: acknowledgedExternal, internalLeadId };
}

function parseVerifiedSheetAcknowledgement(
  body: string,
  externalLeadId: string,
): { ok: true } | { ok: false; code: string } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return { ok: false, code: 'sheet_ack_non_json' };
  }
  if (parsed.ok !== true || parsed.verified !== true) {
    return { ok: false, code: 'sheet_ack_unverified' };
  }
  if (cleanString(parsed.externalLeadId, 120) !== externalLeadId) {
    return { ok: false, code: 'sheet_ack_lead_mismatch' };
  }
  return { ok: true };
}

async function attemptCrm(
  canonical: CanonicalPlanMyPartyLead,
  env: TransactionalDeliveryEnv,
): Promise<AttemptResult> {
  const url = envString(env.QUOTE_REQUEST_CRM_WEBHOOK_URL);
  const secret = envString(env.QUOTE_REQUEST_CRM_WEBHOOK_SECRET);
  if (!url) return notConfigured('crm');
  if (!secret) return failureResult('crm', 'crm_secret_missing', 'CRM webhook secret is not configured');

  const payload = buildCanonicalNotificationPayload(canonical);
  try {
    assertLeadNotificationPayloadCanSend(payload);
  } catch {
    return failureResult('crm', 'invalid_notification_payload', 'CRM payload validation failed');
  }

  const payloadJson = JSON.stringify({
    event: 'lead_intake',
    external_lead_id: canonical.leadId,
    canonical: payload,
  });
  const envelope = JSON.stringify({
    contract_version: CRM_CONTRACT_VERSION,
    sent_at_utc: new Date().toISOString(),
    payload_json: payloadJson,
    signature_sha256: await hmacHex(secret, payloadJson),
  });
  const response = await postJson(url, envelope, {
    'content-type': 'application/json',
    'x-lead-source': 'happyfacesla-plan-my-party-crm-v1',
  });
  if (!response.ok) {
    return failureResult('crm', response.errorCode ?? 'crm_http_failure', response.errorMessage, response.status);
  }

  const acknowledgement = parseVerifiedCrmAcknowledgement(response.body, canonical.leadId);
  if (!acknowledgement.ok) {
    return failureResult('crm', acknowledgement.code, 'CRM response did not prove a verified 01_LEADS write', response.status);
  }

  return {
    destination: 'crm',
    delivered: true,
    httpStatus: response.status,
    errorCode: null,
    errorMessage: null,
    acknowledgedExternalLeadId: acknowledgement.externalLeadId,
    acknowledgedInternalLeadId: acknowledgement.internalLeadId,
  };
}

async function attemptSheet(
  canonical: CanonicalPlanMyPartyLead,
  env: TransactionalDeliveryEnv,
): Promise<AttemptResult> {
  const url = envString(env.QUOTE_REQUEST_SHEET_WEBHOOK_URL);
  const secret = envString(env.QUOTE_REQUEST_SHEET_WEBHOOK_SECRET);
  if (!url) return notConfigured('sheet');
  if (!secret) return failureResult('sheet', 'sheet_secret_missing', 'Sheet webhook secret is not configured');

  const payload = buildCanonicalNotificationPayload(canonical);
  try {
    assertLeadNotificationPayloadCanSend(payload);
  } catch {
    return failureResult('sheet', 'invalid_notification_payload', 'Sheet payload validation failed');
  }

  const payloadJson = JSON.stringify({
    event: 'lead_mirror',
    external_lead_id: canonical.leadId,
    canonical: payload,
  });
  const envelope = JSON.stringify({
    contract_version: SHEET_CONTRACT_VERSION,
    sent_at_utc: new Date().toISOString(),
    payload_json: payloadJson,
    signature_sha256: await hmacHex(secret, payloadJson),
  });
  const response = await postJson(url, envelope, {
    'content-type': 'application/json',
    'x-lead-source': 'happyfacesla-plan-my-party-sheet-v1',
  });
  if (!response.ok) {
    return failureResult('sheet', response.errorCode ?? 'sheet_http_failure', response.errorMessage, response.status);
  }
  const acknowledgement = parseVerifiedSheetAcknowledgement(response.body, canonical.leadId);
  if (!acknowledgement.ok) {
    return failureResult('sheet', acknowledgement.code, 'Sheet response did not prove the expected row write', response.status);
  }
  return {
    destination: 'sheet',
    delivered: true,
    httpStatus: response.status,
    errorCode: null,
    errorMessage: null,
    acknowledgedExternalLeadId: canonical.leadId,
    acknowledgedInternalLeadId: null,
  };
}

async function attemptMake(
  canonical: CanonicalPlanMyPartyLead,
  env: TransactionalDeliveryEnv,
): Promise<AttemptResult> {
  const url = envString(env.QUOTE_REQUEST_MAKE_WEBHOOK_URL);
  const secret = envString(env.QUOTE_REQUEST_MAKE_SHARED_SECRET);
  if (!url) return notConfigured('make');

  const payload = buildCanonicalNotificationPayload(canonical);
  try {
    assertLeadNotificationPayloadCanSend(payload);
  } catch {
    return failureResult('make', 'invalid_notification_payload', 'Make payload validation failed');
  }
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-lead-source': 'happyfacesla-plan-my-party',
  };
  if (secret) headers['x-signature-sha256'] = await hmacHex(secret, body);
  const response = await postJson(url, body, headers);
  if (!response.ok) {
    return failureResult('make', response.errorCode ?? 'make_http_failure', response.errorMessage, response.status);
  }
  return {
    destination: 'make',
    delivered: true,
    httpStatus: response.status,
    errorCode: null,
    errorMessage: null,
    acknowledgedExternalLeadId: null,
    acknowledgedInternalLeadId: null,
  };
}

function notConfigured(destination: DeliveryDestination): AttemptResult {
  return failureResult(destination, 'not_configured', 'Destination is not configured');
}

function failureResult(
  destination: DeliveryDestination,
  errorCode: string,
  errorMessage: string | null,
  httpStatus: number | null = null,
): AttemptResult {
  return {
    destination,
    delivered: false,
    httpStatus,
    errorCode,
    errorMessage: safeError(errorMessage),
    acknowledgedExternalLeadId: null,
    acknowledgedInternalLeadId: null,
  };
}

async function loadCanonical(db: D1Database, leadId: string): Promise<CanonicalPlanMyPartyLead | null> {
  const row = await db
    .prepare(`SELECT lead_id, canonical_payload_json FROM quote_requests WHERE lead_id = ? LIMIT 1`)
    .bind(leadId)
    .first<CanonicalRow>();
  if (!row?.canonical_payload_json) return null;
  try {
    const canonical = JSON.parse(row.canonical_payload_json) as CanonicalPlanMyPartyLead;
    return canonical?.leadId === leadId ? canonical : null;
  } catch {
    return null;
  }
}

async function ensureDeliveryRows(
  db: D1Database,
  leadId: string,
  destinations: DeliveryDestination[],
): Promise<boolean> {
  const now = new Date().toISOString();
  try {
    for (const destination of destinations) {
      await db
        .prepare(
          `INSERT INTO quote_request_delivery_outbox (
             lead_id, destination, status, attempt_count, created_at_utc, updated_at_utc
           ) VALUES (?, ?, 'pending', 0, ?, ?)
           ON CONFLICT(lead_id, destination) DO NOTHING`,
        )
        .bind(leadId, destination, now, now)
        .run();
    }
    return true;
  } catch (error) {
    console.error('[quote-request-delivery] durable delivery table unavailable', {
      leadId,
      code: 'delivery_outbox_unavailable',
      error: safeError(error instanceof Error ? error.message : String(error)),
    });
    return false;
  }
}

async function loadDeliveryRows(db: D1Database, leadId: string): Promise<DeliveryRow[]> {
  const result = await db
    .prepare(
      `SELECT lead_id, destination, status, attempt_count, last_attempt_at_utc,
              next_attempt_at_utc, delivered_at_utc, last_http_status,
              last_error_code, last_error_message, acknowledged_external_lead_id,
              acknowledged_internal_lead_id
       FROM quote_request_delivery_outbox
       WHERE lead_id = ?`,
    )
    .bind(leadId)
    .all<DeliveryRow>();
  return result.results ?? [];
}

async function claimDelivery(
  db: D1Database,
  leadId: string,
  destination: DeliveryDestination,
  force: boolean,
): Promise<DeliveryRow | null> {
  const now = new Date().toISOString();
  const leaseUntil = new Date(Date.now() + DELIVERY_LEASE_MS).toISOString();
  const statusClause = force
    ? `(status IN ('pending', 'retry', 'dead_letter') OR (status = 'processing' AND next_attempt_at_utc <= ?))`
    : `((status IN ('pending', 'retry') AND (next_attempt_at_utc IS NULL OR next_attempt_at_utc <= ?))
       OR (status = 'processing' AND next_attempt_at_utc <= ?))`;
  const bindings: D1Value[] = force
    ? [now, leaseUntil, now, leadId, destination, now]
    : [now, leaseUntil, now, leadId, destination, now, now];
  const result = await db
    .prepare(
      `UPDATE quote_request_delivery_outbox
       SET status = 'processing', attempt_count = attempt_count + 1,
           last_attempt_at_utc = ?, next_attempt_at_utc = ?, updated_at_utc = ?
       WHERE lead_id = ? AND destination = ? AND ${statusClause}`,
    )
    .bind(...bindings)
    .run();
  if ((result.meta?.changes ?? 0) < 1) return null;
  const rows = await loadDeliveryRows(db, leadId);
  return rows.find((row) => row.destination === destination) ?? null;
}

async function recordAttempt(
  db: D1Database,
  row: DeliveryRow,
  result: AttemptResult,
): Promise<DeliveryStatus> {
  const now = new Date().toISOString();
  const exhausted = !result.delivered && row.attempt_count >= MAX_ATTEMPTS;
  const status: DeliveryStatus = result.delivered ? 'delivered' : exhausted ? 'dead_letter' : 'retry';
  const nextAttempt = result.delivered || exhausted
    ? null
    : addSeconds(now, backoffSeconds(row.attempt_count));
  await db
    .prepare(
      `UPDATE quote_request_delivery_outbox
       SET status = ?, next_attempt_at_utc = ?, delivered_at_utc = ?,
           last_http_status = ?, last_error_code = ?, last_error_message = ?,
           acknowledged_external_lead_id = ?, acknowledged_internal_lead_id = ?,
           updated_at_utc = ?
       WHERE lead_id = ? AND destination = ?`,
    )
    .bind(
      status,
      nextAttempt,
      result.delivered ? now : null,
      result.httpStatus,
      result.errorCode,
      result.errorMessage,
      result.acknowledgedExternalLeadId,
      result.acknowledgedInternalLeadId,
      now,
      row.lead_id,
      row.destination,
    )
    .run();
  return status;
}

async function syncCompatibilityFlags(db: D1Database, leadId: string, rows: DeliveryRow[]): Promise<void> {
  const byDestination = rowsByDestination(rows);
  const crmDelivered = isRowDelivered(byDestination.get('crm'));
  const explicitSheetDelivered = isRowDelivered(byDestination.get('sheet'));
  const makeDelivered = isRowDelivered(byDestination.get('make'));
  const anyDelivered = crmDelivered || explicitSheetDelivered || makeDelivered;
  await db
    .prepare(
      `UPDATE quote_requests
       SET updated_at = ?, delivery_status = ?, owner_notification_sent = ?,
           sheet_written = ?, crm_posted = ?
       WHERE lead_id = ?`,
    )
    .bind(
      new Date().toISOString(),
      anyDelivered ? 'persisted_optional_notification_succeeded' : 'persisted_internal_queue',
      makeDelivered ? 1 : 0,
      crmDelivered || explicitSheetDelivered ? 1 : 0,
      crmDelivered ? 1 : 0,
      leadId,
    )
    .run();
}

function summaryFromRows(
  leadId: string,
  durableStateAvailable: boolean,
  destinations: DeliveryDestination[],
  rows: DeliveryRow[],
): DeliverySummary {
  const map = rowsByDestination(rows);
  const deliveredDestinations = destinations.filter((destination) => map.get(destination)?.status === 'delivered');
  const retryDestinations = destinations.filter((destination) => {
    const status = map.get(destination)?.status;
    return status === 'pending' || status === 'processing' || status === 'retry';
  });
  const deadLetterDestinations = destinations.filter((destination) => map.get(destination)?.status === 'dead_letter');
  const crmPosted = deliveredDestinations.includes('crm');
  const sheetWritten = crmPosted || deliveredDestinations.includes('sheet');
  return {
    leadId,
    durableStateAvailable,
    crmPosted,
    sheetWritten,
    ownerNotificationSent: deliveredDestinations.includes('make'),
    configuredDestinations: destinations,
    deliveredDestinations,
    retryDestinations,
    deadLetterDestinations,
  };
}

async function sendDeadLetterAlert(
  env: TransactionalDeliveryEnv,
  leadId: string,
  destination: DeliveryDestination,
  attemptCount: number,
  result: AttemptResult,
): Promise<void> {
  const safePayload = {
    event: 'lead_delivery_dead_letter',
    lead_id: leadId,
    destination,
    attempt_count: attemptCount,
    error_code: result.errorCode,
    http_status: result.httpStatus,
    occurred_at_utc: new Date().toISOString(),
  };
  console.error('[quote-request-delivery] dead letter', safePayload);

  const url = envString(env.QUOTE_REQUEST_DELIVERY_ALERT_WEBHOOK_URL);
  if (!url) return;
  const body = JSON.stringify(safePayload);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-lead-source': 'happyfacesla-delivery-alert',
  };
  const secret = envString(env.QUOTE_REQUEST_DELIVERY_ALERT_WEBHOOK_SECRET);
  if (secret) headers['x-signature-sha256'] = await hmacHex(secret, body);
  await postJson(url, body, headers);
}

async function attemptDestination(
  destination: DeliveryDestination,
  canonical: CanonicalPlanMyPartyLead,
  env: TransactionalDeliveryEnv,
): Promise<AttemptResult> {
  if (destination === 'crm') return attemptCrm(canonical, env);
  if (destination === 'sheet') return attemptSheet(canonical, env);
  return attemptMake(canonical, env);
}

export async function deliverPersistedQuoteRequest(
  db: D1Database,
  leadId: string,
  env: TransactionalDeliveryEnv,
  options: { force?: boolean } = {},
): Promise<DeliverySummary> {
  const canonical = await loadCanonical(db, leadId);
  const destinations = configuredDestinations(env);
  if (!canonical || destinations.length === 0) {
    return summaryFromRows(leadId, true, destinations, []);
  }

  const durableStateAvailable = await ensureDeliveryRows(db, leadId, destinations);
  if (!durableStateAvailable) {
    const directResults = await Promise.all(destinations.map((destination) => attemptDestination(destination, canonical, env)));
    const pseudoRows = directResults.map<DeliveryRow>((result) => ({
      lead_id: leadId,
      destination: result.destination,
      status: result.delivered ? 'delivered' : 'retry',
      attempt_count: 1,
      last_attempt_at_utc: new Date().toISOString(),
      next_attempt_at_utc: null,
      delivered_at_utc: result.delivered ? new Date().toISOString() : null,
      last_http_status: result.httpStatus,
      last_error_code: result.errorCode,
      last_error_message: result.errorMessage,
      acknowledged_external_lead_id: result.acknowledgedExternalLeadId,
      acknowledged_internal_lead_id: result.acknowledgedInternalLeadId,
    }));
    return summaryFromRows(leadId, false, destinations, pseudoRows);
  }

  const initialRows = await loadDeliveryRows(db, leadId);
  const initialMap = rowsByDestination(initialRows);
  const claimable = destinations.filter((destination) => {
    const row = initialMap.get(destination);
    return options.force || !row || row.status !== 'delivered';
  });

  const claims = await Promise.all(
    claimable.map(async (destination) => ({
      destination,
      row: await claimDelivery(db, leadId, destination, Boolean(options.force)),
    })),
  );
  const claimed = claims.filter((entry): entry is { destination: DeliveryDestination; row: DeliveryRow } => Boolean(entry.row));
  const attempted = await Promise.all(
    claimed.map(async ({ destination, row }) => ({
      row,
      result: await attemptDestination(destination, canonical, env),
    })),
  );

  for (const { row, result } of attempted) {
    const status = await recordAttempt(db, row, result);
    if (status === 'dead_letter') {
      await sendDeadLetterAlert(env, leadId, row.destination, row.attempt_count, result);
    }
  }

  const finalRows = await loadDeliveryRows(db, leadId);
  await syncCompatibilityFlags(db, leadId, finalRows);
  return summaryFromRows(leadId, true, destinations, finalRows);
}

export async function reconcileDueQuoteRequestDeliveries(
  db: D1Database,
  env: TransactionalDeliveryEnv,
  options: { limit?: number; excludeLeadId?: string | null } = {},
): Promise<{ processedLeadIds: string[]; durableStateAvailable: boolean }> {
  const limit = Math.max(1, Math.min(options.limit ?? 3, 20));
  const now = new Date().toISOString();
  try {
    const result = await db
      .prepare(
        `SELECT DISTINCT q.lead_id
         FROM quote_request_delivery_outbox d
         JOIN quote_requests q ON q.lead_id = d.lead_id
         WHERE (
           (d.status IN ('pending', 'retry') AND (d.next_attempt_at_utc IS NULL OR d.next_attempt_at_utc <= ?))
           OR (d.status = 'processing' AND d.next_attempt_at_utc <= ?)
         )
         AND (? IS NULL OR q.lead_id <> ?)
         ORDER BY d.updated_at_utc ASC
         LIMIT ?`,
      )
      .bind(now, now, options.excludeLeadId ?? null, options.excludeLeadId ?? null, limit)
      .all<{ lead_id: string }>();
    const leadIds = (result.results ?? []).map((row) => row.lead_id).filter(Boolean);
    for (const leadId of leadIds) {
      await deliverPersistedQuoteRequest(db, leadId, env);
    }
    return { processedLeadIds: leadIds, durableStateAvailable: true };
  } catch (error) {
    console.error('[quote-request-delivery] reconciliation unavailable', {
      code: 'delivery_reconciliation_unavailable',
      error: safeError(error instanceof Error ? error.message : String(error)),
    });
    return { processedLeadIds: [], durableStateAvailable: false };
  }
}

export async function getQuoteRequestDeliveryHealth(
  db: D1Database,
): Promise<{ ok: boolean; counts: Record<DeliveryStatus, number> }> {
  const counts: Record<DeliveryStatus, number> = {
    pending: 0,
    processing: 0,
    retry: 0,
    delivered: 0,
    dead_letter: 0,
  };
  try {
    const result = await db
      .prepare(`SELECT status, COUNT(*) AS count FROM quote_request_delivery_outbox GROUP BY status`)
      .all<{ status: DeliveryStatus; count: number }>();
    for (const row of result.results ?? []) {
      if (row.status in counts) counts[row.status] = Number(row.count) || 0;
    }
    return { ok: true, counts };
  } catch {
    return { ok: false, counts };
  }
}

export async function requeueDeadLetterDelivery(
  db: D1Database,
  leadId: string,
  destination?: DeliveryDestination | null,
): Promise<number> {
  const now = new Date().toISOString();
  const statement = destination
    ? db.prepare(
        `UPDATE quote_request_delivery_outbox
         SET status = 'retry', next_attempt_at_utc = ?, last_error_code = NULL,
             last_error_message = NULL, updated_at_utc = ?
         WHERE lead_id = ? AND destination = ? AND status = 'dead_letter'`,
      ).bind(now, now, leadId, destination)
    : db.prepare(
        `UPDATE quote_request_delivery_outbox
         SET status = 'retry', next_attempt_at_utc = ?, last_error_code = NULL,
             last_error_message = NULL, updated_at_utc = ?
         WHERE lead_id = ? AND status = 'dead_letter'`,
      ).bind(now, now, leadId);
  const result: D1Result = await statement.run();
  return result.meta?.changes ?? 0;
}
