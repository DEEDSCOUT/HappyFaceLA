import type { D1Database } from '../booking/availability-types.ts';

export const PRIVACY_POLICY_VERSION = 'HFLA-PRIVACY-ATTRIBUTION-V1';

export const privacyRetentionPolicy = Object.freeze({
  attributionEnvelopeDays: 30,
  diagnosticDays: 30,
  rawClickIdDays: 180,
  notificationAuditDays: 180,
  genuineLeadPiiMonths: 24,
  shadowOutcomeMonths: 13,
});

export type PrivacyClassification =
  | 'pending_business_classification'
  | 'genuine_lead'
  | 'spam_bot_invalid'
  | 'internal_test'
  | 'legacy_compatibility';

export function privacyClassificationForAcceptance(input: {
  suppressionReason: string | null;
  clientContractVersion: 'atomic-v1' | 'legacy-bounded-v1';
}): PrivacyClassification {
  if (input.suppressionReason?.startsWith('internal_test')) return 'internal_test';
  if (input.clientContractVersion === 'legacy-bounded-v1') return 'legacy_compatibility';
  // Conversion suppression is not a final business classification. Heuristic
  // spam signals still reach the owner for review and must not start the
  // destructive 30-day diagnostic-retention clock on their own.
  return 'pending_business_classification';
}

export type PrivacyPurgeCounts = {
  untrackedSubjects: number;
  subjectsBackfilled: number;
  clickIdsRedacted: number;
  piiRedacted: number;
  shadowOutcomesPurged: number;
  notificationRowsPurged: number;
  operatorAuditRowsPurged: number;
  workerRunsPurged: number;
  offlineOutcomesPurged: number;
  blockedActiveRecords: number;
};

export type PrivacyPurgeSummary = {
  duplicateRun: boolean;
  dryRun: boolean;
  runId: string;
  policyVersion: typeof PRIVACY_POLICY_VERSION;
  cutoffs: Record<string, string>;
  counts: PrivacyPurgeCounts;
};

type PrivacyPurgeOptions = {
  runId: string;
  dryRun: boolean;
  actorId?: string;
  now?: Date;
  limit?: number;
};

type ClickCandidate = {
  lead_id: string;
  source_record_kind: 'ap02_canonical' | 'historical_quote_request';
  first_touch_json: string | null;
  latest_qualifying_touch_json: string | null;
  submit_touch_json: string | null;
  canonical_payload_json: string | null;
};

type PiiCandidate = {
  lead_id: string;
  source_record_kind: 'ap02_canonical' | 'historical_quote_request';
  data_classification: PrivacyClassification;
  accepted_at_utc: string;
  pii_retention_anchor_at_utc: string | null;
  pii_retention_anchor_finalized_at_utc: string | null;
  deletion_approved_at_utc: string | null;
};

const CLICK_ID_KEYS = new Set([
  'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid',
  'firstgclid', 'firstgbraid', 'firstwbraid', 'firstfbclid', 'firstmsclkid',
  'submitgclid', 'submitgbraid', 'submitwbraid', 'submitfbclid', 'submitmsclkid',
]);
const REDACTED_HASH = '0'.repeat(64);
const REDACTED_TOUCH_JSON = JSON.stringify({
  redacted: true,
  policy_version: PRIVACY_POLICY_VERSION,
});

function emptyCounts(): PrivacyPurgeCounts {
  return {
    untrackedSubjects: 0,
    subjectsBackfilled: 0,
    clickIdsRedacted: 0,
    piiRedacted: 0,
    shadowOutcomesPurged: 0,
    notificationRowsPurged: 0,
    operatorAuditRowsPurged: 0,
    workerRunsPurged: 0,
    offlineOutcomesPurged: 0,
    blockedActiveRecords: 0,
  };
}

function boundedLimit(value: number | undefined): number {
  if (!Number.isInteger(value)) return 100;
  return Math.max(1, Math.min(500, Number(value)));
}

function subtractDays(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function subtractUtcMonths(now: Date, months: number): string {
  const value = new Date(now.getTime());
  const day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  value.setUTCDate(Math.min(day, lastDay));
  return value.toISOString();
}

function cutoffs(now: Date): Record<string, string> {
  return {
    diagnostic: subtractDays(now, privacyRetentionPolicy.diagnosticDays),
    raw_click_ids: subtractDays(now, privacyRetentionPolicy.rawClickIdDays),
    notification_audit: subtractDays(now, privacyRetentionPolicy.notificationAuditDays),
    genuine_lead_pii: subtractUtcMonths(now, privacyRetentionPolicy.genuineLeadPiiMonths),
    shadow_outcome: subtractUtcMonths(now, privacyRetentionPolicy.shadowOutcomeMonths),
  };
}

function validateRunContract(options: PrivacyPurgeOptions): void {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(options.runId)) {
    throw new Error('Invalid privacy purge run ID.');
  }
  if (Number.isNaN((options.now ?? new Date()).getTime())) {
    throw new Error('Invalid privacy purge clock.');
  }
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(options.actorId ?? 'service_privacy_retention')) {
    throw new Error('Invalid privacy purge actor identity.');
  }
}

async function tableExists(db: D1Database, tableName: string): Promise<boolean> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name = ?`,
  ).bind(tableName).first<{ count: number }>();
  return Number(row?.count ?? 0) === 1;
}

function redactClickIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactClickIds);
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.replace(/[^A-Za-z]/g, '').toLowerCase();
    output[key] = CLICK_ID_KEYS.has(normalized) ? null : redactClickIds(child);
  }
  return output;
}

function redactJsonClickIds(raw: string | null, required: boolean): string | null {
  if (raw === null) {
    if (required) throw new Error('Required attribution envelope is missing.');
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Persisted privacy payload is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Persisted privacy payload has an invalid shape.');
  }
  return JSON.stringify(redactClickIds(parsed));
}

async function beginRun(
  db: D1Database,
  options: PrivacyPurgeOptions,
  nowIso: string,
  runCutoffs: Record<string, string>,
): Promise<boolean> {
  const result = await db.prepare(
    `INSERT INTO privacy_purge_runs (
       run_id, policy_version, mode, started_at_utc, status,
       initiated_by_actor_id, cutoffs_json,
       aggregate_counts_json, created_at_utc, updated_at_utc
     ) VALUES (?, ?, ?, ?, 'running', ?, ?, '{}', ?, ?)
     ON CONFLICT(run_id) DO NOTHING`,
  ).bind(
    options.runId,
    PRIVACY_POLICY_VERSION,
    options.dryRun ? 'dry_run' : 'apply',
    nowIso,
    options.actorId ?? 'service_privacy_retention',
    JSON.stringify(runCutoffs),
    nowIso,
    nowIso,
  ).run();
  return (result.meta?.changes ?? 0) === 1;
}

async function finishRun(
  db: D1Database,
  runId: string,
  nowIso: string,
  counts: PrivacyPurgeCounts,
): Promise<void> {
  const result = await db.prepare(
    `UPDATE privacy_purge_runs
     SET completed_at_utc = ?, status = 'completed', aggregate_counts_json = ?,
         updated_at_utc = ?
     WHERE run_id = ? AND status = 'running'`,
  ).bind(nowIso, JSON.stringify(counts), nowIso, runId).run();
  if ((result.meta?.changes ?? 0) !== 1) {
    throw new Error('Privacy purge run finalization was not fenced.');
  }
}

async function failRun(db: D1Database, runId: string, nowIso: string, error: unknown): Promise<void> {
  const code = error instanceof Error
    ? (error.name || 'privacy_purge_error').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)
    : 'privacy_purge_error';
  await db.prepare(
    `UPDATE privacy_purge_runs
     SET completed_at_utc = ?, status = 'failed', last_error_code = ?, updated_at_utc = ?
     WHERE run_id = ? AND status = 'running'`,
  ).bind(nowIso, code, nowIso, runId).run();
}

async function ensurePrivacySubjects(
  db: D1Database,
  nowIso: string,
  dryRun: boolean,
): Promise<{ untracked: number; backfilled: number }> {
  const missing = await db.prepare(
    `SELECT COUNT(*) AS count
     FROM quote_requests q
     LEFT JOIN lead_privacy_state p ON p.lead_id = q.lead_id
     WHERE p.lead_id IS NULL`,
  ).first<{ count: number }>();
  const untracked = Number(missing?.count ?? 0);
  if (dryRun || untracked === 0) return { untracked, backfilled: 0 };
  const result = await db.prepare(
    `INSERT INTO lead_privacy_state (
       lead_id, submission_id, source_record_kind, data_classification,
       accepted_at_utc, last_meaningful_interaction_at_utc,
       created_at_utc, updated_at_utc
     )
     SELECT q.lead_id, NULL, 'historical_quote_request',
       CASE
         WHEN q.is_internal_test = 1 THEN 'internal_test'
         WHEN q.qualified_status = 'spam' THEN 'spam_bot_invalid'
         ELSE 'pending_business_classification'
       END,
       q.received_at, q.received_at, ?, ?
     FROM quote_requests q
     LEFT JOIN lead_privacy_state p ON p.lead_id = q.lead_id
     WHERE p.lead_id IS NULL
     ON CONFLICT(lead_id) DO NOTHING`,
  ).bind(nowIso, nowIso).run();
  return { untracked, backfilled: Number(result.meta?.changes ?? 0) };
}

async function clickCandidates(
  db: D1Database,
  cutoff: string,
  limit: number,
): Promise<ClickCandidate[]> {
  const result = await db.prepare(
    `SELECT q.lead_id,
            COALESCE(p.source_record_kind, 'historical_quote_request') AS source_record_kind,
            i.first_touch_json, i.latest_qualifying_touch_json, i.submit_touch_json,
            q.canonical_payload_json
     FROM quote_requests q
     LEFT JOIN lead_privacy_state p ON p.lead_id = q.lead_id
     LEFT JOIN lead_submission_identity i ON i.lead_id = p.lead_id
     WHERE p.click_ids_redacted_at_utc IS NULL
       AND COALESCE(p.accepted_at_utc, q.received_at) <= ?
     ORDER BY COALESCE(p.accepted_at_utc, q.received_at), q.lead_id
     LIMIT ?`,
  ).bind(cutoff, limit).all<ClickCandidate>();
  return Array.isArray(result.results) ? result.results : [];
}

async function redactCandidateClickIds(
  db: D1Database,
  candidate: ClickCandidate,
  nowIso: string,
  hasOfflineOutbox: boolean,
): Promise<number> {
  const canonical = redactJsonClickIds(candidate.canonical_payload_json, false);
  const statements = [
    db.prepare(
      `UPDATE quote_requests SET
         gclid = NULL, gbraid = NULL, wbraid = NULL, fbclid = NULL, msclkid = NULL,
         first_gclid = NULL, first_gbraid = NULL, first_wbraid = NULL,
         submit_gclid = NULL, submit_gbraid = NULL, submit_wbraid = NULL,
         canonical_payload_json = ?
       WHERE lead_id = ?`,
    ).bind(canonical, candidate.lead_id),
  ];
  if (candidate.source_record_kind === 'ap02_canonical') {
    statements.push(db.prepare(
      `UPDATE lead_submission_identity
       SET first_touch_json = ?, latest_qualifying_touch_json = ?, submit_touch_json = ?
       WHERE lead_id = ?`,
    ).bind(
      redactJsonClickIds(candidate.first_touch_json, true),
      redactJsonClickIds(candidate.latest_qualifying_touch_json, false),
      redactJsonClickIds(candidate.submit_touch_json, true),
      candidate.lead_id,
    ));
  }
  if (hasOfflineOutbox) {
    statements.push(db.prepare(
      `DELETE FROM google_ads_offline_conversion_outbox WHERE lead_id = ?`,
    ).bind(candidate.lead_id));
  }
  statements.push(db.prepare(
    `UPDATE lead_privacy_state
     SET click_ids_redacted_at_utc = ?, updated_at_utc = ?
     WHERE lead_id = ? AND click_ids_redacted_at_utc IS NULL`,
  ).bind(nowIso, nowIso, candidate.lead_id));
  const results = await db.batch!(statements);
  if (results.some((entry) => entry.success === false || Boolean(entry.error))) {
    throw new Error('Click-ID redaction batch failed.');
  }
  if ((results[0]?.meta?.changes ?? 0) !== 1 || (results.at(-1)?.meta?.changes ?? 0) !== 1) {
    throw new Error('Click-ID redaction was not fenced to one subject.');
  }
  if (candidate.source_record_kind === 'ap02_canonical' && (results[1]?.meta?.changes ?? 0) !== 1) {
    throw new Error('Canonical attribution identity is missing.');
  }
  const offlineIndex = candidate.source_record_kind === 'ap02_canonical' ? 2 : 1;
  return hasOfflineOutbox ? Number(results[offlineIndex]?.meta?.changes ?? 0) : 0;
}

async function piiCandidates(
  db: D1Database,
  runCutoffs: Record<string, string>,
  limit: number,
): Promise<PiiCandidate[]> {
  const result = await db.prepare(
    `SELECT q.lead_id,
            COALESCE(p.source_record_kind, 'historical_quote_request') AS source_record_kind,
            COALESCE(
              p.data_classification,
              CASE
                WHEN q.is_internal_test = 1 THEN 'internal_test'
                WHEN q.qualified_status = 'spam' THEN 'spam_bot_invalid'
                ELSE 'pending_business_classification'
              END
            ) AS data_classification,
            COALESCE(p.accepted_at_utc, q.received_at) AS accepted_at_utc,
            p.pii_retention_anchor_at_utc, p.pii_retention_anchor_finalized_at_utc,
            p.deletion_approved_at_utc
     FROM quote_requests q
     LEFT JOIN lead_privacy_state p ON p.lead_id = q.lead_id
     WHERE p.pii_redacted_at_utc IS NULL AND COALESCE(p.legal_hold, 0) = 0 AND (
       (
         COALESCE(
           p.data_classification,
           CASE
             WHEN q.is_internal_test = 1 THEN 'internal_test'
             WHEN q.qualified_status = 'spam' THEN 'spam_bot_invalid'
             ELSE 'pending_business_classification'
           END
         ) IN ('spam_bot_invalid', 'internal_test')
         AND COALESCE(p.accepted_at_utc, q.received_at) <= ?
       )
       OR (
         p.data_classification = 'genuine_lead'
         AND p.pii_retention_anchor_finalized_at_utc IS NOT NULL
         AND p.pii_retention_anchor_at_utc <= ?
       )
       OR p.deletion_approved_at_utc IS NOT NULL
     )
     ORDER BY COALESCE(p.accepted_at_utc, q.received_at), q.lead_id
     LIMIT ?`,
  ).bind(runCutoffs.diagnostic, runCutoffs.genuine_lead_pii, limit).all<PiiCandidate>();
  return Array.isArray(result.results) ? result.results : [];
}

async function hasActiveNotification(db: D1Database, leadId: string): Promise<boolean> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS count FROM lead_notification_outbox
     WHERE lead_id = ? AND status IN ('pending', 'delivering', 'failed_retryable', 'needs_review')`,
  ).bind(leadId).first<{ count: number }>();
  return Number(row?.count ?? 0) > 0;
}

async function redactCandidatePii(
  db: D1Database,
  candidate: PiiCandidate,
  nowIso: string,
  hasOfflineOutbox: boolean,
): Promise<number> {
  const statements = [
    db.prepare(
      `UPDATE quote_requests SET
         event_date = NULL, start_time = NULL, event_city = '[redacted]', venue_name = NULL,
         customer_first_name = '[redacted]', customer_last_name = '[redacted]',
         customer_email = 'redacted@example.invalid', customer_phone = NULL,
         consent_acknowledgement = 'retention_redacted', sanitized_notes = NULL,
         lookbook_inspirations_json = '[]', client_submitted_at = NULL,
         utm_source = NULL, utm_medium = NULL, utm_campaign = NULL,
         utm_term = NULL, utm_content = NULL, gclid = NULL, gbraid = NULL,
         wbraid = NULL, fbclid = NULL, msclkid = NULL, landing_page = NULL,
         source_path = NULL, referrer = NULL, first_landing_page = NULL,
         first_source_path = NULL, first_referrer = NULL, first_utm_source = NULL,
         first_utm_medium = NULL, first_utm_campaign = NULL, first_utm_term = NULL,
         first_utm_content = NULL, first_gclid = NULL, first_gbraid = NULL,
         first_wbraid = NULL, submit_landing_page = NULL, submit_source_path = NULL,
         submit_referrer = NULL, submit_utm_source = NULL, submit_utm_medium = NULL,
         submit_utm_campaign = NULL, submit_utm_term = NULL, submit_utm_content = NULL,
         submit_gclid = NULL, submit_gbraid = NULL, submit_wbraid = NULL,
         preferred_contact_method = NULL, travel_note = NULL,
         customer_budget_provided = NULL, customer_budget_amount_cents = NULL,
         customer_budget_label = NULL, manual_review_reasons_json = '[]',
         canonical_payload_json = NULL, lost_reason = NULL, owner_review_notes = NULL,
         owner_reviewed_by = NULL, internal_test_reason = NULL
       WHERE lead_id = ?`,
    ).bind(candidate.lead_id),
  ];
  if (candidate.source_record_kind === 'ap02_canonical') {
    statements.push(db.prepare(
      `UPDATE lead_submission_identity
       SET payload_hash = ?, first_touch_json = ?, latest_qualifying_touch_json = NULL,
           submit_touch_json = ?
       WHERE lead_id = ?`,
    ).bind(REDACTED_HASH, REDACTED_TOUCH_JSON, REDACTED_TOUCH_JSON, candidate.lead_id));
  }
  if (hasOfflineOutbox) {
    statements.push(db.prepare(
      `DELETE FROM google_ads_offline_conversion_outbox WHERE lead_id = ?`,
    ).bind(candidate.lead_id));
  }
  statements.push(db.prepare(
    `DELETE FROM canonical_lead_outbox WHERE lead_id = ?`,
  ).bind(candidate.lead_id));
  statements.push(db.prepare(
    `UPDATE lead_privacy_state
     SET click_ids_redacted_at_utc = COALESCE(click_ids_redacted_at_utc, ?),
         pii_redacted_at_utc = ?,
         diagnostic_data_redacted_at_utc = CASE
           WHEN data_classification IN ('spam_bot_invalid', 'internal_test') THEN ?
           ELSE diagnostic_data_redacted_at_utc END,
         shadow_outcome_purged_at_utc = COALESCE(shadow_outcome_purged_at_utc, ?),
         deletion_completed_at_utc = CASE
           WHEN deletion_approved_at_utc IS NOT NULL THEN ? ELSE deletion_completed_at_utc END,
         updated_at_utc = ?
     WHERE lead_id = ? AND pii_redacted_at_utc IS NULL`,
  ).bind(nowIso, nowIso, nowIso, nowIso, nowIso, nowIso, candidate.lead_id));
  const results = await db.batch!(statements);
  if (results.some((entry) => entry.success === false || Boolean(entry.error))) {
    throw new Error('PII redaction batch failed.');
  }
  if ((results[0]?.meta?.changes ?? 0) !== 1 || (results.at(-1)?.meta?.changes ?? 0) !== 1) {
    throw new Error('PII redaction was not fenced to one subject.');
  }
  if (candidate.source_record_kind === 'ap02_canonical' && (results[1]?.meta?.changes ?? 0) !== 1) {
    throw new Error('Canonical identity redaction target is missing.');
  }
  const offlineIndex = candidate.source_record_kind === 'ap02_canonical' ? 2 : 1;
  return hasOfflineOutbox ? Number(results[offlineIndex]?.meta?.changes ?? 0) : 0;
}

async function purgeShadowOutcomes(
  db: D1Database,
  runCutoffs: Record<string, string>,
  nowIso: string,
  limit: number,
  dryRun: boolean,
): Promise<number> {
  const rows = await db.prepare(
    `SELECT c.lead_id
     FROM canonical_lead_outbox c
     JOIN lead_privacy_state p ON p.lead_id = c.lead_id
     WHERE p.shadow_outcome_purged_at_utc IS NULL AND (
       c.created_at_utc <= ? OR (
         p.data_classification IN ('spam_bot_invalid', 'internal_test')
         AND p.accepted_at_utc <= ?
       )
     )
     ORDER BY c.created_at_utc, c.lead_id
     LIMIT ?`,
  ).bind(runCutoffs.shadow_outcome, runCutoffs.diagnostic, limit).all<{ lead_id: string }>();
  const candidates = Array.isArray(rows.results) ? rows.results : [];
  if (dryRun) return candidates.length;
  let deleted = 0;
  for (const candidate of candidates) {
    const results = await db.batch!([
      db.prepare(`DELETE FROM canonical_lead_outbox WHERE lead_id = ?`).bind(candidate.lead_id),
      db.prepare(
        `UPDATE lead_privacy_state
         SET shadow_outcome_purged_at_utc = ?, updated_at_utc = ?
         WHERE lead_id = ? AND shadow_outcome_purged_at_utc IS NULL`,
      ).bind(nowIso, nowIso, candidate.lead_id),
    ]);
    if ((results[0]?.meta?.changes ?? 0) !== 1 || (results[1]?.meta?.changes ?? 0) !== 1) {
      throw new Error('Shadow outcome purge was not fenced.');
    }
    deleted += 1;
  }
  return deleted;
}

async function purgeNotificationMetadata(
  db: D1Database,
  cutoff: string,
  nowIso: string,
  limit: number,
  dryRun: boolean,
): Promise<{ notifications: number; audits: number }> {
  const rows = await db.prepare(
    `SELECT notification_id, lead_id FROM lead_notification_outbox
     WHERE status IN ('sent', 'abandoned') AND updated_at_utc <= ?
     ORDER BY updated_at_utc, notification_id
     LIMIT ?`,
  ).bind(cutoff, limit).all<{ notification_id: string; lead_id: string }>();
  const candidates = Array.isArray(rows.results) ? rows.results : [];
  if (dryRun) {
    let audits = 0;
    for (const candidate of candidates) {
      const count = await db.prepare(
        `SELECT COUNT(*) AS count FROM notification_operator_audit WHERE notification_id = ?`,
      ).bind(candidate.notification_id).first<{ count: number }>();
      audits += Number(count?.count ?? 0);
    }
    return { notifications: candidates.length, audits };
  }
  let notifications = 0;
  let audits = 0;
  for (const candidate of candidates) {
    const results = await db.batch!([
      db.prepare(`DELETE FROM notification_operator_audit WHERE notification_id = ?`)
        .bind(candidate.notification_id),
      db.prepare(`DELETE FROM lead_notification_outbox WHERE notification_id = ?`)
        .bind(candidate.notification_id),
      db.prepare(
        `UPDATE lead_privacy_state
         SET notification_audit_purged_at_utc = ?, updated_at_utc = ?
         WHERE lead_id = ? AND NOT EXISTS (
           SELECT 1 FROM lead_notification_outbox WHERE lead_id = ?
         )`,
      ).bind(nowIso, nowIso, candidate.lead_id, candidate.lead_id),
    ]);
    if ((results[1]?.meta?.changes ?? 0) !== 1) {
      throw new Error('Notification audit purge was not fenced.');
    }
    audits += Number(results[0]?.meta?.changes ?? 0);
    notifications += 1;
  }
  return { notifications, audits };
}

async function purgeWorkerRuns(
  db: D1Database,
  cutoff: string,
  limit: number,
  dryRun: boolean,
): Promise<number> {
  const rows = await db.prepare(
    `SELECT run_id FROM notification_worker_runs
     WHERE status IN ('completed', 'failed') AND completed_at_utc <= ?
     ORDER BY completed_at_utc, run_id
     LIMIT ?`,
  ).bind(cutoff, limit).all<{ run_id: string }>();
  const candidates = Array.isArray(rows.results) ? rows.results : [];
  if (dryRun || candidates.length === 0) return candidates.length;
  const placeholders = candidates.map(() => '?').join(', ');
  const result = await db.prepare(
    `DELETE FROM notification_worker_runs WHERE run_id IN (${placeholders})`,
  ).bind(...candidates.map((candidate) => candidate.run_id)).run();
  return Number(result.meta?.changes ?? 0);
}

async function purgeAgedOfflineOutcomes(
  db: D1Database,
  cutoff: string,
  limit: number,
  dryRun: boolean,
): Promise<number> {
  if (!await tableExists(db, 'google_ads_offline_conversion_outbox')) return 0;
  const rows = await db.prepare(
    `SELECT outbox_id FROM google_ads_offline_conversion_outbox
     WHERE created_at_utc <= ?
     ORDER BY created_at_utc, outbox_id
     LIMIT ?`,
  ).bind(cutoff, limit).all<{ outbox_id: string }>();
  const candidates = Array.isArray(rows.results) ? rows.results : [];
  if (dryRun || candidates.length === 0) return candidates.length;
  const placeholders = candidates.map(() => '?').join(', ');
  const result = await db.prepare(
    `DELETE FROM google_ads_offline_conversion_outbox WHERE outbox_id IN (${placeholders})`,
  ).bind(...candidates.map((candidate) => candidate.outbox_id)).run();
  return Number(result.meta?.changes ?? 0);
}

export async function runPrivacyRetentionPurge(
  db: D1Database,
  options: PrivacyPurgeOptions,
): Promise<PrivacyPurgeSummary> {
  validateRunContract(options);
  if (!options.dryRun && !db.batch) {
    throw new Error('D1 batch support is required for privacy purge apply mode.');
  }
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const runCutoffs = cutoffs(now);
  const counts = emptyCounts();
  if (!await beginRun(db, options, nowIso, runCutoffs)) {
    return {
      duplicateRun: true,
      dryRun: options.dryRun,
      runId: options.runId,
      policyVersion: PRIVACY_POLICY_VERSION,
      cutoffs: runCutoffs,
      counts,
    };
  }
  try {
    const limit = boundedLimit(options.limit);
    const tracked = await ensurePrivacySubjects(db, nowIso, options.dryRun);
    counts.untrackedSubjects = tracked.untracked;
    counts.subjectsBackfilled = tracked.backfilled;
    const hasOfflineOutbox = await tableExists(db, 'google_ads_offline_conversion_outbox');

    const clickRows = await clickCandidates(db, runCutoffs.raw_click_ids, limit);
    // Validate the entire bounded batch before mutating any subject.
    for (const candidate of clickRows) {
      redactJsonClickIds(candidate.canonical_payload_json, false);
      if (candidate.source_record_kind === 'ap02_canonical') {
        redactJsonClickIds(candidate.first_touch_json, true);
        redactJsonClickIds(candidate.latest_qualifying_touch_json, false);
        redactJsonClickIds(candidate.submit_touch_json, true);
      }
    }
    counts.clickIdsRedacted = clickRows.length;
    if (!options.dryRun) {
      for (const candidate of clickRows) {
        counts.offlineOutcomesPurged += await redactCandidateClickIds(
          db,
          candidate,
          nowIso,
          hasOfflineOutbox,
        );
      }
    }

    const piiRows = await piiCandidates(db, runCutoffs, limit);
    for (const candidate of piiRows) {
      if (await hasActiveNotification(db, candidate.lead_id)) {
        counts.blockedActiveRecords += 1;
        continue;
      }
      counts.piiRedacted += 1;
      if (!options.dryRun) {
        counts.offlineOutcomesPurged += await redactCandidatePii(
          db,
          candidate,
          nowIso,
          hasOfflineOutbox,
        );
      }
    }

    counts.shadowOutcomesPurged = await purgeShadowOutcomes(
      db,
      runCutoffs,
      nowIso,
      limit,
      options.dryRun,
    );

    const notification = await purgeNotificationMetadata(
      db,
      runCutoffs.notification_audit,
      nowIso,
      limit,
      options.dryRun,
    );
    counts.notificationRowsPurged = notification.notifications;
    counts.operatorAuditRowsPurged = notification.audits;
    counts.workerRunsPurged = await purgeWorkerRuns(
      db,
      runCutoffs.notification_audit,
      limit,
      options.dryRun,
    );
    counts.offlineOutcomesPurged += await purgeAgedOfflineOutcomes(
      db,
      runCutoffs.raw_click_ids,
      limit,
      options.dryRun,
    );

    await finishRun(db, options.runId, nowIso, counts);
    return {
      duplicateRun: false,
      dryRun: options.dryRun,
      runId: options.runId,
      policyVersion: PRIVACY_POLICY_VERSION,
      cutoffs: runCutoffs,
      counts,
    };
  } catch (error) {
    try {
      await failRun(db, options.runId, nowIso, error);
    } catch {
      // If D1 itself is unavailable, preserve the original failure.
    }
    throw error;
  }
}
