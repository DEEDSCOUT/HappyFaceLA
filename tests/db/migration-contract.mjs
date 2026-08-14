#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const sql = await readFile(
  new URL('../../migrations/d1/20260810_ap02a_ap03a_canonical_form_identity.sql', import.meta.url),
  'utf8',
);
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(sql);

const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
).all().map((row) => row.name);
assert.deepEqual(tables, [
  'canonical_lead_outbox',
  'lead_notification_outbox',
  'lead_privacy_state',
  'lead_submission_identity',
  'notification_alert_state',
  'notification_operator_audit',
  'notification_worker_runs',
  'privacy_purge_runs',
]);

const submissionId = `sub_${'a'.repeat(32)}`;
const leadId = `lead_${'b'.repeat(32)}`;
db.prepare(`INSERT INTO lead_submission_identity (
  submission_id, lead_id, form_route, payload_hash, accepted_at_utc,
  conversion_eligible, suppression_reason, first_touch_json,
  latest_qualifying_touch_json, submit_touch_json
) VALUES (?, ?, 'contact', ?, ?, 1, NULL, '{}', NULL, '{}')`).run(
  submissionId,
  leadId,
  'c'.repeat(64),
  '2026-08-10T18:00:00.000Z',
);
db.prepare(`INSERT INTO canonical_lead_outbox (
  outbox_id, submission_id, lead_id, conversion_eligible, status,
  suppression_reason, payload_hash, created_at_utc, updated_at_utc
) VALUES ('cfo_fixture', ?, ?, 0, 'shadow_pending',
  'pending_business_classification', ?, ?, ?)`
).run(submissionId, leadId, 'c'.repeat(64), '2026-08-10T18:00:00.000Z', '2026-08-10T18:00:00.000Z');
db.prepare(`INSERT INTO lead_privacy_state (
  lead_id, submission_id, source_record_kind, data_classification,
  accepted_at_utc, last_meaningful_interaction_at_utc,
  created_at_utc, updated_at_utc
) VALUES (?, ?, 'ap02_canonical', 'pending_business_classification', ?, ?, ?, ?)`
).run(
  leadId,
  submissionId,
  '2026-08-10T18:00:00.000Z',
  '2026-08-10T18:00:00.000Z',
  '2026-08-10T18:00:00.000Z',
  '2026-08-10T18:00:00.000Z',
);
db.prepare(`INSERT INTO lead_notification_outbox (
  notification_id, submission_id, lead_id, destination, next_attempt_at_utc,
  created_at_utc, updated_at_utc
) VALUES ('notify_fixture', ?, ?, 'make', ?, ?, ?)`
).run(
  submissionId,
  leadId,
  '2026-08-10T18:00:00.000Z',
  '2026-08-10T18:00:00.000Z',
  '2026-08-10T18:00:00.000Z',
);
const claimA = `claim_${'a'.repeat(32)}`;
const claimB = `claim_${'b'.repeat(32)}`;
db.prepare(`UPDATE lead_notification_outbox
  SET status = 'delivering', claim_token = ?, lease_expires_at_utc = ?,
      next_attempt_at_utc = NULL, attempt_count = attempt_count + 1
  WHERE lead_id = ?`).run(claimA, '2026-08-10T17:59:00.000Z', leadId);
const reclaimed = db.prepare(`UPDATE lead_notification_outbox
  SET status = 'delivering', claim_token = ?, lease_expires_at_utc = ?
  WHERE lead_id = ? AND status = 'delivering' AND lease_expires_at_utc < ?`
).run(claimB, '2026-08-10T18:05:00.000Z', leadId, '2026-08-10T18:00:00.000Z');
assert.equal(reclaimed.changes, 1);
const staleFinalizer = db.prepare(`UPDATE lead_notification_outbox
  SET status = 'failed_retryable', next_attempt_at_utc = ?,
      claim_token = NULL, lease_expires_at_utc = NULL
  WHERE lead_id = ? AND status = 'delivering' AND claim_token = ?`
).run('2026-08-10T18:02:00.000Z', leadId, claimA);
assert.equal(staleFinalizer.changes, 0, 'expired worker cannot overwrite the new claim');
const currentFinalizer = db.prepare(`UPDATE lead_notification_outbox
  SET status = 'sent', next_attempt_at_utc = NULL,
      claim_token = NULL, lease_expires_at_utc = NULL, last_attempt_at_utc = ?
  WHERE lead_id = ? AND status = 'delivering' AND claim_token = ?`
).run('2026-08-10T18:01:00.000Z', leadId, claimB);
assert.equal(currentFinalizer.changes, 1);
const notification = db.prepare(
  'SELECT status, attempt_count, max_attempts, claim_token, lease_expires_at_utc FROM lead_notification_outbox WHERE lead_id = ?',
).get(leadId);
assert.deepEqual(
  { ...notification },
  { status: 'sent', attempt_count: 1, max_attempts: 6, claim_token: null, lease_expires_at_utc: null },
);
assert.throws(
  () => db.prepare(
    'UPDATE lead_notification_outbox SET attempt_count = 7 WHERE lead_id = ?',
  ).run(leadId),
  /CHECK constraint failed/,
  'durable attempt count cannot exceed the persisted ceiling',
);

assert.throws(() => db.prepare(`INSERT INTO lead_submission_identity (
  submission_id, lead_id, form_route, payload_hash, accepted_at_utc,
  conversion_eligible, suppression_reason, first_touch_json, submit_touch_json
) VALUES (?, ?, 'contact', ?, ?, 1, NULL, '{}', '{}')`).run(
  `sub_${'a'.repeat(31)}z`,
  `lead_${'d'.repeat(32)}`,
  'e'.repeat(64),
  '2026-08-10T18:00:00.000Z',
), /CHECK constraint failed/);

assert.throws(() => db.prepare(`INSERT INTO lead_notification_outbox (
  notification_id, submission_id, lead_id, destination, next_attempt_at_utc,
  created_at_utc, updated_at_utc
) VALUES ('notify_duplicate', ?, ?, 'make', ?, ?, ?)`
).run(
  submissionId,
  leadId,
  '2026-08-10T18:00:00.000Z',
  '2026-08-10T18:00:00.000Z',
  '2026-08-10T18:00:00.000Z',
), /UNIQUE constraint failed/);

db.prepare(`INSERT INTO notification_worker_runs (
  run_id, scheduled_at_utc, started_at_utc, status, created_at_utc, updated_at_utc
) VALUES ('nwr_fixture', ?, ?, 'running', ?, ?)`
).run(
  '2026-08-10T18:00:00.000Z',
  '2026-08-10T18:00:00.000Z',
  '2026-08-10T18:00:00.000Z',
  '2026-08-10T18:00:00.000Z',
);
db.prepare(`UPDATE notification_worker_runs
  SET status = 'completed', completed_at_utc = ?, updated_at_utc = ?
  WHERE run_id = 'nwr_fixture'`
).run('2026-08-10T18:01:00.000Z', '2026-08-10T18:01:00.000Z');

db.prepare(`INSERT INTO notification_alert_state (
  alert_key, fingerprint_sha256, alert_codes_json, failed_run_ids_json,
  failed_run_cutoff_utc, last_attempt_at_utc, last_delivered_at_utc,
  next_eligible_at_utc, delivery_status, updated_at_utc
) VALUES ('queue_health', ?, '[]', '[]', ?, ?, ?, ?, 'delivered', ?)`
).run(
  'd'.repeat(64),
  '2026-08-10T18:01:00.000Z',
  '2026-08-10T18:01:00.000Z',
  '2026-08-10T18:01:00.000Z',
  '2026-08-10T18:16:00.000Z',
  '2026-08-10T18:01:00.000Z',
);

db.prepare(`INSERT INTO notification_operator_audit (
  action_id, notification_id, lead_id, destination, action, reason_code,
  operator_actor_id, created_at_utc
) VALUES ('action_001', 'notify_fixture', ?, 'make', 'mark_delivered',
  'verified_existing', 'owner_shawn', ?)`
).run(leadId, '2026-08-10T18:02:00.000Z');

db.prepare(`INSERT INTO privacy_purge_runs (
  run_id, policy_version, mode, started_at_utc, completed_at_utc, status,
  initiated_by_actor_id, cutoffs_json, aggregate_counts_json, created_at_utc, updated_at_utc
) VALUES ('purge_001', 'HFLA-PRIVACY-ATTRIBUTION-V1', 'dry_run', ?, ?,
  'completed', 'owner_shawn', '{}', '{}', ?, ?)`
).run(
  '2026-08-10T18:00:00.000Z',
  '2026-08-10T18:00:00.000Z',
  '2026-08-10T18:00:00.000Z',
  '2026-08-10T18:00:00.000Z',
);

assert.throws(() => db.prepare(`INSERT INTO canonical_lead_outbox (
  outbox_id, submission_id, lead_id, conversion_eligible, status,
  suppression_reason, payload_hash, created_at_utc, updated_at_utc
) VALUES ('cfo_bad', ?, ?, 1, 'shadow_pending', NULL, ?, ?, ?)`
).run(submissionId, leadId, 'f'.repeat(64), '2026-08-10T18:00:00.000Z', '2026-08-10T18:00:00.000Z'), /CHECK constraint failed/);

db.close();
console.log('PASS AP-02A/AP-03A migration schema and constraints');
