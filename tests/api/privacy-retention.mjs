#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

import { handleQuoteRequest } from '../../src/lib/quote-request/delivery.ts';
import {
  PRIVACY_POLICY_VERSION,
  privacyClassificationForAcceptance,
  runPrivacyRetentionPurge,
} from '../../src/lib/privacy/retention-purge.ts';
import privacyWorker from '../../workers/privacy-retention-purge.ts';

class SqliteD1Statement {
  constructor(db, sql, values = []) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }
  bind(...values) { return new SqliteD1Statement(this.db, this.sql, values); }
  async first() {
    const row = this.db.prepare(this.sql).get(...this.values);
    return row ? { ...row } : null;
  }
  async all() {
    return {
      success: true,
      results: this.db.prepare(this.sql).all(...this.values).map((row) => ({ ...row })),
    };
  }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class SqliteD1 {
  constructor(db) { this.db = db; }
  prepare(sql) { return new SqliteD1Statement(this.db, sql); }
  async batch(statements) {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const output = [];
      for (const statement of statements) output.push(await statement.run());
      this.db.exec('COMMIT;');
      return output;
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }
}

const productionSchema = await readFile(
  new URL('../fixtures/production-quote-requests-schema.sql', import.meta.url),
  'utf8',
);
const migration = await readFile(
  new URL('../../migrations/d1/20260810_ap02a_ap03a_canonical_form_identity.sql', import.meta.url),
  'utf8',
);

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec(productionSchema);
  sqlite.exec(migration);
  sqlite.exec(`CREATE TABLE google_ads_offline_conversion_outbox (
    outbox_id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    created_at_utc TEXT NOT NULL
  );`);
  return { sqlite, db: new SqliteD1(sqlite) };
}

function submissionId(seed) {
  return `sub_${seed.repeat(32).slice(0, 32)}`;
}

function touch(path, seed, click = true) {
  return {
    gclid: click ? `GCLID-PRIVACY-${seed}` : null,
    gbraid: null,
    wbraid: null,
    utm_source: click ? 'google' : null,
    utm_medium: click ? 'cpc' : null,
    utm_campaign: click ? 'privacy-fixture' : null,
    utm_term: null,
    utm_content: null,
    landing_path: path,
    source_path: path,
    sanitized_referrer: click ? 'https://www.google.com/' : null,
    captured_at: '2026-08-10T20:00:00.000Z',
    source_confidence: click ? 'gclid' : 'direct',
  };
}

function requestFor(seed) {
  const first = touch('/plan-my-party/', seed);
  return new Request('https://happyfacesla.com/api/quote-request', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': `192.0.2.${seed.charCodeAt(0) % 200 + 1}`,
      referer: 'https://happyfacesla.com/plan-my-party/',
    },
    body: JSON.stringify({
      submission_id: submissionId(seed),
      form_route: 'plan-my-party',
      sourcePage: '/plan-my-party/',
      attribution: {
        version: 1,
        first_touch: first,
        latest_qualifying_touch: first,
        submit_touch: touch('/plan-my-party/', seed, false),
        expires_at: null,
      },
      eventType: 'birthday-party',
      services: ['face-painting'],
      kidsCountBucket: '11-18',
      kidsCountActual: 12,
      designStyle: 'quick-cheek-arm',
      eventDate: '2028-09-20',
      eventTime: '14:00',
      eventCity: 'Los Angeles',
      firstName: `Privacy${seed}`,
      lastName: 'Fixture',
      email: `privacy-${seed}@example.invalid`,
      phone: '310-555-0101',
      specialRequests: 'Customer note that must be removed at the policy boundary.',
      consentAcknowledgement: true,
    }),
  });
}

async function seed(db, seed) {
  const response = await handleQuoteRequest(requestFor(seed), { AVAILABILITY_D1: db });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  return body;
}

function subtractDays(now, days) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function subtractMonths(now, months) {
  const value = new Date(now.getTime());
  const day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() - months);
  const last = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  value.setUTCDate(Math.min(day, last));
  return value;
}

function age(sqlite, lead, acceptedAt, classification, extras = {}) {
  const iso = acceptedAt.toISOString();
  sqlite.prepare('UPDATE quote_requests SET received_at = ?, updated_at = ? WHERE lead_id = ?')
    .run(iso, iso, lead.leadId);
  sqlite.prepare('UPDATE lead_submission_identity SET accepted_at_utc = ? WHERE lead_id = ?')
    .run(iso, lead.leadId);
  sqlite.prepare(`UPDATE canonical_lead_outbox
    SET created_at_utc = ?, updated_at_utc = ? WHERE lead_id = ?`)
    .run(extras.shadowAt ?? iso, extras.shadowAt ?? iso, lead.leadId);
  sqlite.prepare(`UPDATE lead_privacy_state SET
    data_classification = ?, accepted_at_utc = ?,
    last_meaningful_interaction_at_utc = ?,
    pii_retention_anchor_at_utc = ?,
    pii_retention_anchor_finalized_at_utc = ?,
    deletion_request_id = ?, deletion_requested_at_utc = ?,
    deletion_approved_at_utc = ?, legal_hold = ?, updated_at_utc = ?
    WHERE lead_id = ?`).run(
    classification,
    iso,
    extras.lastInteraction ?? iso,
    extras.retentionAnchor ?? null,
    extras.anchorFinalized ?? null,
    extras.deletionRequestId ?? null,
    extras.deletionRequested ?? null,
    extras.deletionApproved ?? null,
    extras.legalHold ? 1 : 0,
    iso,
    lead.leadId,
  );
}

const now = new Date('2028-08-10T20:00:00.000Z');
assert.equal(
  privacyClassificationForAcceptance({
    suppressionReason: 'multiple_unsolicited_urls',
    clientContractVersion: 'atomic-v1',
  }),
  'pending_business_classification',
  'heuristic suppression cannot start the destructive 30-day spam clock',
);
assert.equal(
  privacyClassificationForAcceptance({
    suppressionReason: 'spam_marker:buy_followers',
    clientContractVersion: 'atomic-v1',
  }),
  'pending_business_classification',
  'even a strong heuristic remains reviewable until explicitly classified',
);
const diagnosticCutoff = subtractDays(now, 30);
const clickCutoff = subtractDays(now, 180);
const piiCutoff = subtractMonths(now, 24);
const shadowCutoff = subtractMonths(now, 13);
const { sqlite, db } = setup();

const internalDue = await seed(db, 'a');
age(sqlite, internalDue, diagnosticCutoff, 'internal_test');
const internalNew = await seed(db, 'b');
age(sqlite, internalNew, new Date(diagnosticCutoff.getTime() + 1), 'internal_test');

const clickDue = await seed(db, 'c');
age(sqlite, clickDue, clickCutoff, 'pending_business_classification');
const clickNew = await seed(db, 'd');
age(sqlite, clickNew, new Date(clickCutoff.getTime() + 1), 'pending_business_classification');

const genuineDue = await seed(db, 'e');
age(sqlite, genuineDue, new Date('2025-01-01T00:00:00.000Z'), 'genuine_lead', {
  retentionAnchor: piiCutoff.toISOString(),
  anchorFinalized: '2028-08-01T00:00:00.000Z',
});
const genuineUnfinalized = await seed(db, 'f');
age(sqlite, genuineUnfinalized, new Date('2025-01-01T00:00:00.000Z'), 'genuine_lead', {
  retentionAnchor: piiCutoff.toISOString(),
});

const deletionDue = await seed(db, '1');
age(sqlite, deletionDue, subtractDays(now, 10), 'pending_business_classification', {
  deletionRequestId: 'delete_request_001',
  deletionRequested: '2028-08-01T00:00:00.000Z',
  deletionApproved: '2028-08-02T00:00:00.000Z',
});

const activeInternal = await seed(db, '2');
age(sqlite, activeInternal, subtractDays(now, 31), 'internal_test');
sqlite.prepare(`INSERT INTO lead_notification_outbox (
  notification_id, submission_id, lead_id, destination, status,
  next_attempt_at_utc, created_at_utc, updated_at_utc
) VALUES (?, ?, ?, 'make', 'pending', ?, ?, ?)`
).run(
  'notify_active_privacy',
  activeInternal.submissionId,
  activeInternal.leadId,
  now.toISOString(),
  diagnosticCutoff.toISOString(),
  diagnosticCutoff.toISOString(),
);

const shadowDue = await seed(db, '3');
age(sqlite, shadowDue, new Date(shadowCutoff.getTime() + 1), 'pending_business_classification', {
  shadowAt: shadowCutoff.toISOString(),
});

// A dry run must preview retention work for admitted historical quote rows
// before the separately controlled privacy-state backfill is applied.
const historicalDue = await seed(db, '5');
age(sqlite, historicalDue, clickCutoff, 'pending_business_classification');
sqlite.prepare('DELETE FROM canonical_lead_outbox WHERE lead_id = ?').run(historicalDue.leadId);
sqlite.prepare('DELETE FROM lead_privacy_state WHERE lead_id = ?').run(historicalDue.leadId);
sqlite.prepare('DELETE FROM lead_submission_identity WHERE lead_id = ?').run(historicalDue.leadId);

const notificationOld = await seed(db, '4');
age(sqlite, notificationOld, subtractDays(now, 200), 'pending_business_classification');
sqlite.prepare(`INSERT INTO lead_notification_outbox (
  notification_id, submission_id, lead_id, destination, status,
  attempt_count, max_attempts, next_attempt_at_utc, created_at_utc, updated_at_utc
) VALUES (?, ?, ?, 'sheet', 'sent', 1, 6, NULL, ?, ?)`
).run(
  'notify_old_privacy',
  notificationOld.submissionId,
  notificationOld.leadId,
  subtractDays(now, 200).toISOString(),
  subtractDays(now, 180).toISOString(),
);
sqlite.prepare(`INSERT INTO notification_operator_audit (
  action_id, notification_id, lead_id, destination, action, reason_code,
  operator_actor_id, created_at_utc
) VALUES ('privacy_action_001', 'notify_old_privacy', ?, 'sheet',
  'mark_delivered', 'fixture_verified', 'owner_shawn', ?)`
).run(notificationOld.leadId, subtractDays(now, 180).toISOString());

sqlite.prepare(`INSERT INTO notification_worker_runs (
  run_id, scheduled_at_utc, started_at_utc, completed_at_utc, status,
  created_at_utc, updated_at_utc
) VALUES ('nwr_privacy_old', ?, ?, ?, 'completed', ?, ?)`
).run(...Array(5).fill(subtractDays(now, 180).toISOString()));

sqlite.prepare(`INSERT INTO google_ads_offline_conversion_outbox
  (outbox_id, lead_id, created_at_utc) VALUES ('offline_privacy_old', ?, ?)`
).run(clickDue.leadId, clickCutoff.toISOString());

const dry = await runPrivacyRetentionPurge(db, {
  runId: 'privacy_dry_001',
  dryRun: true,
  now,
  limit: 200,
});
assert.equal(dry.policyVersion, PRIVACY_POLICY_VERSION);
assert.equal(dry.counts.piiRedacted >= 3, true);
assert.equal(dry.counts.untrackedSubjects, 1);
assert.equal(dry.counts.clickIdsRedacted >= 3, true, 'dry-run includes untracked historical rows');
assert.equal(
  sqlite.prepare('SELECT customer_first_name FROM quote_requests WHERE lead_id = ?').get(internalDue.leadId)
    .customer_first_name,
  'Privacya',
  'dry-run is mutation-free for customer records',
);
const duplicateDry = await runPrivacyRetentionPurge(db, {
  runId: 'privacy_dry_001',
  dryRun: true,
  now,
});
assert.equal(duplicateDry.duplicateRun, true);

const applied = await runPrivacyRetentionPurge(db, {
  runId: 'privacy_apply_001',
  dryRun: false,
  now,
  limit: 200,
});
assert.equal(applied.counts.blockedActiveRecords, 1);
assert.equal(applied.counts.subjectsBackfilled, 1);
assert.equal(
  sqlite.prepare('SELECT source_record_kind FROM lead_privacy_state WHERE lead_id = ?')
    .get(historicalDue.leadId).source_record_kind,
  'historical_quote_request',
);
assert.equal(
  sqlite.prepare('SELECT gclid FROM quote_requests WHERE lead_id = ?').get(historicalDue.leadId).gclid,
  null,
);
assert.equal(
  sqlite.prepare('SELECT customer_email FROM quote_requests WHERE lead_id = ?').get(internalDue.leadId)
    .customer_email,
  'redacted@example.invalid',
);
assert.notEqual(
  sqlite.prepare('SELECT customer_email FROM quote_requests WHERE lead_id = ?').get(internalNew.leadId)
    .customer_email,
  'redacted@example.invalid',
  'a diagnostic record one millisecond inside the boundary remains active',
);
const clickDueRow = sqlite.prepare(
  'SELECT customer_email, gclid, canonical_payload_json FROM quote_requests WHERE lead_id = ?',
).get(clickDue.leadId);
assert.notEqual(clickDueRow.customer_email, 'redacted@example.invalid');
assert.equal(clickDueRow.gclid, null);
assert.equal(clickDueRow.canonical_payload_json.includes('GCLID-PRIVACY-c'), false);
assert.notEqual(
  sqlite.prepare('SELECT gclid FROM quote_requests WHERE lead_id = ?').get(clickNew.leadId).gclid,
  null,
  'a click ID one millisecond inside the boundary is retained',
);
assert.equal(
  sqlite.prepare('SELECT customer_email FROM quote_requests WHERE lead_id = ?').get(genuineDue.leadId)
    .customer_email,
  'redacted@example.invalid',
);
assert.notEqual(
  sqlite.prepare('SELECT customer_email FROM quote_requests WHERE lead_id = ?').get(genuineUnfinalized.leadId)
    .customer_email,
  'redacted@example.invalid',
  'genuine PII is never purged before the retention anchor is finalized',
);
assert.equal(
  sqlite.prepare('SELECT deletion_completed_at_utc FROM lead_privacy_state WHERE lead_id = ?')
    .get(deletionDue.leadId).deletion_completed_at_utc,
  now.toISOString(),
);
assert.notEqual(
  sqlite.prepare('SELECT customer_email FROM quote_requests WHERE lead_id = ?').get(activeInternal.leadId)
    .customer_email,
  'redacted@example.invalid',
  'an unresolved notification blocks destructive redaction and is surfaced',
);
assert.equal(
  sqlite.prepare('SELECT count(*) AS count FROM canonical_lead_outbox WHERE lead_id = ?')
    .get(shadowDue.leadId).count,
  0,
);
assert.equal(
  sqlite.prepare('SELECT count(*) AS count FROM lead_notification_outbox WHERE notification_id = ?')
    .get('notify_old_privacy').count,
  0,
);
assert.equal(
  sqlite.prepare('SELECT count(*) AS count FROM notification_operator_audit WHERE action_id = ?')
    .get('privacy_action_001').count,
  0,
);
assert.equal(
  sqlite.prepare('SELECT count(*) AS count FROM notification_worker_runs WHERE run_id = ?')
    .get('nwr_privacy_old').count,
  0,
);
assert.equal(
  sqlite.prepare('SELECT count(*) AS count FROM google_ads_offline_conversion_outbox').get().count,
  0,
);
assert.equal(
  sqlite.prepare('SELECT aggregate_counts_json FROM privacy_purge_runs WHERE run_id = ?')
    .get('privacy_apply_001').aggregate_counts_json.includes('@'),
  false,
  'durable purge evidence is aggregate and non-PII',
);

const idempotent = await runPrivacyRetentionPurge(db, {
  runId: 'privacy_apply_002',
  dryRun: false,
  now,
  limit: 200,
});
assert.equal(idempotent.counts.clickIdsRedacted, 0);
assert.equal(idempotent.counts.piiRedacted, 0);
assert.equal(idempotent.counts.shadowOutcomesPurged, 0);
assert.equal(idempotent.counts.blockedActiveRecords, 1);

const invalidSetup = setup();
const invalidLead = await seed(invalidSetup.db, '9');
age(invalidSetup.sqlite, invalidLead, clickCutoff, 'pending_business_classification');
invalidSetup.sqlite.prepare('UPDATE quote_requests SET canonical_payload_json = ? WHERE lead_id = ?')
  .run('{invalid-json', invalidLead.leadId);
await assert.rejects(
  runPrivacyRetentionPurge(invalidSetup.db, {
    runId: 'privacy_fail_001',
    dryRun: false,
    now,
  }),
  /valid JSON/,
);
assert.notEqual(
  invalidSetup.sqlite.prepare('SELECT gclid FROM quote_requests WHERE lead_id = ?').get(invalidLead.leadId).gclid,
  null,
  'a malformed bounded batch fails before any subject mutation',
);
assert.equal(
  invalidSetup.sqlite.prepare('SELECT status FROM privacy_purge_runs WHERE run_id = ?').get('privacy_fail_001').status,
  'failed',
);

const operatorToken = 'privacy-operator-token-that-is-at-least-32-characters';
const blockedApply = await privacyWorker.fetch(
  new Request('https://worker.invalid/operator/privacy-purge', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${operatorToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ mode: 'apply', run_id: 'privacy_operator_001' }),
  }),
  {
    PRIVACY_D1: db,
    PRIVACY_PURGE_OPERATOR_TOKEN: operatorToken,
    PRIVACY_PURGE_OPERATOR_ACTOR_ID: 'owner_shawn',
    PRIVACY_PURGE_APPLY_ENABLED: 'false',
  },
);
assert.equal(blockedApply.status, 403, 'production apply requires a separate explicit runtime gate');

const operatorDryRun = await privacyWorker.fetch(
  new Request('https://worker.invalid/operator/privacy-purge', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${operatorToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ mode: 'dry_run', run_id: 'privacy_operator_dry_001' }),
  }),
  {
    PRIVACY_D1: db,
    PRIVACY_PURGE_OPERATOR_TOKEN: operatorToken,
    PRIVACY_PURGE_OPERATOR_ACTOR_ID: 'owner_shawn',
    PRIVACY_PURGE_APPLY_ENABLED: 'false',
  },
);
assert.equal(operatorDryRun.status, 200);
assert.equal(
  sqlite.prepare('SELECT initiated_by_actor_id FROM privacy_purge_runs WHERE run_id = ?')
    .get('privacy_operator_dry_001').initiated_by_actor_id,
  'owner_shawn',
);

let scheduledPromise;
let noRetryCount = 0;
await privacyWorker.scheduled(
  {
    scheduledTime: now.getTime() + 60_000,
    cron: '15 9 * * *',
    noRetry() { noRetryCount += 1; },
  },
  { PRIVACY_D1: db, PRIVACY_PURGE_APPLY_ENABLED: 'false' },
  { waitUntil(promise) { scheduledPromise = promise; } },
);
await scheduledPromise;
assert.equal(noRetryCount, 0);
assert.equal(
  sqlite.prepare('SELECT mode FROM privacy_purge_runs WHERE run_id = ?')
    .get(`ppr_${now.getTime() + 60_000}`).mode,
  'dry_run',
);
assert.equal(
  sqlite.prepare('SELECT initiated_by_actor_id FROM privacy_purge_runs WHERE run_id = ?')
    .get(`ppr_${now.getTime() + 60_000}`).initiated_by_actor_id,
  'service_privacy_retention',
);

invalidSetup.sqlite.close();
sqlite.close();
console.log('PASS privacy retention boundaries, dry-run, redaction, deletion, and purge Worker gates');
