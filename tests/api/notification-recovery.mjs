#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

import {
  drainNotificationOutbox,
  handleNotificationOperatorRequest,
  notificationQueueHealth,
  notificationRecoveryPolicy,
} from '../../src/lib/quote-request/notification-recovery.ts';
import { handleQuoteRequest } from '../../src/lib/quote-request/delivery.ts';
import notificationWorker from '../../workers/notification-recovery.ts';

class SqliteD1Statement {
  constructor(db, sql, values = []) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new SqliteD1Statement(this.db, this.sql, values);
  }

  async first() {
    const row = this.db.prepare(this.sql).get(...this.values);
    return row ? { ...row } : null;
  }

  async all() {
    const rows = this.db.prepare(this.sql).all(...this.values);
    return { success: true, results: rows.map((row) => ({ ...row })) };
  }

  async run() {
    const result = this.db.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class SqliteD1 {
  constructor(db) {
    this.db = db;
  }

  prepare(sql) {
    return new SqliteD1Statement(this.db, sql);
  }

  async batch(statements) {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.db.exec('COMMIT;');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }
}

function submissionId(seed) {
  return `sub_${seed.repeat(32).slice(0, 32)}`;
}

function touch(path, gclid = null) {
  return {
    gclid,
    gbraid: null,
    wbraid: null,
    utm_source: gclid ? 'google' : null,
    utm_medium: gclid ? 'cpc' : null,
    utm_campaign: gclid ? 'notification-recovery-fixture' : null,
    utm_term: null,
    utm_content: null,
    landing_path: path,
    source_path: path,
    sanitized_referrer: gclid ? 'https://www.google.com/' : null,
    captured_at: '2026-08-10T20:00:00.000Z',
    source_confidence: gclid ? 'gclid' : 'direct',
  };
}

function journey(path, seed) {
  const first = touch(path, `GCLID-NOTIFICATION-${seed}`);
  return {
    version: 1,
    first_touch: first,
    latest_qualifying_touch: first,
    submit_touch: touch(path),
    expires_at: null,
  };
}

function requestFor(seed) {
  return new Request('https://happyfacesla.com/api/quote-request', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': `192.0.2.${Number.parseInt(seed, 16) + 20}`,
      referer: 'https://happyfacesla.com/plan-my-party/',
    },
    body: JSON.stringify({
      submission_id: submissionId(seed),
      form_route: 'plan-my-party',
      sourcePage: '/plan-my-party/',
      attribution: journey('/plan-my-party/', seed),
      eventType: 'birthday-party',
      services: ['face-painting'],
      kidsCountBucket: '11-18',
      kidsCountActual: 12,
      designStyle: 'quick-cheek-arm',
      eventDate: '2026-09-20',
      eventTime: '14:00',
      eventCity: 'Los Angeles',
      firstName: `Recovery${seed}`,
      lastName: 'Fixture',
      email: `recovery-${seed}@example.invalid`,
      phone: '310-555-0101',
      consentAcknowledgement: true,
    }),
  });
}

const productionSchema = await readFile(
  new URL('../fixtures/production-quote-requests-schema.sql', import.meta.url),
  'utf8',
);
const migration = await readFile(
  new URL('../../migrations/d1/20260810_ap02a_ap03a_canonical_form_identity.sql', import.meta.url),
  'utf8',
);
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys = ON;');
sqlite.exec(productionSchema);
sqlite.exec(migration);
const db = new SqliteD1(sqlite);
const accepted = new Map();

async function seedLead(seed) {
  const response = await handleQuoteRequest(requestFor(seed), { AVAILABILITY_D1: db });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  accepted.set(seed, body);
  return body;
}

function seedOutbox(seed, destination, options = {}) {
  const lead = accepted.get(seed);
  const now = options.now ?? '2026-08-10T20:00:00.000Z';
  const status = options.status ?? 'pending';
  const claimToken = options.claimToken ?? null;
  const leaseExpires = options.leaseExpires ?? null;
  const nextAttempt = options.nextAttempt ?? (['pending', 'failed_retryable'].includes(status) ? now : null);
  const deadLettered = ['needs_review', 'abandoned'].includes(status) ? now : null;
  sqlite.prepare(
    `INSERT INTO lead_notification_outbox (
       notification_id, submission_id, lead_id, destination, status,
       attempt_count, max_attempts, next_attempt_at_utc, claim_token,
       lease_expires_at_utc, last_error_code, dead_lettered_at_utc,
       created_at_utc, updated_at_utc
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `note_${seed}_${destination}`,
    lead.submissionId,
    lead.leadId,
    destination,
    status,
    options.attemptCount ?? 0,
    options.maxAttempts ?? notificationRecoveryPolicy.defaultMaxAttempts,
    nextAttempt,
    claimToken,
    leaseExpires,
    options.errorCode ?? null,
    deadLettered,
    now,
    now,
  );
  return lead;
}

function row(seed, destination) {
  return {
    ...sqlite.prepare(
      `SELECT * FROM lead_notification_outbox WHERE notification_id = ?`,
    ).get(`note_${seed}_${destination}`),
  };
}

function strictAckFetch(calls, status = 200, duplicate = false) {
  return async (url, init) => {
    const payload = JSON.parse(String(init.body));
    const destination = String(url).includes('/crm') ? 'crm' : String(url).includes('/sheet') ? 'sheet' : 'make';
    calls.push({ url: String(url), init, payload });
    return Response.json(
      {
        ok: true,
        leadId: payload.lead_id,
        destination,
        persisted: true,
        duplicate,
      },
      { status },
    );
  };
}

const baseTime = new Date('2026-08-10T20:05:00.000Z');

assert.equal(notificationRecoveryPolicy.defaultMaxAttempts, 6);
assert.deepEqual(notificationRecoveryPolicy.retryDelaysSeconds, [60, 300, 900, 3600, 21600]);
assert.equal(notificationRecoveryPolicy.maximumMaxAttempts, 10);

// One scheduled run delivers once, records a fenced finalization, and a replay
// of the same scheduler run ID cannot dispatch again.
await seedLead('1');
const successLead = seedOutbox('1', 'crm');
const successCalls = [];
const successEnv = { QUOTE_REQUEST_CRM_WEBHOOK_URL: 'https://fixture.invalid/crm' };
const success = await drainNotificationOutbox(db, successEnv, {
  now: baseTime,
  runId: 'nwr_success_001',
  fetchImpl: strictAckFetch(successCalls),
});
assert.deepEqual(
  { examined: success.examined, claimed: success.claimed, sent: success.sent },
  { examined: 1, claimed: 1, sent: 1 },
);
assert.equal(successCalls.length, 1);
assert.equal(successCalls[0].init.headers['x-idempotency-key'], successLead.leadId);
assert.equal(successCalls[0].payload.lead_id, successLead.leadId);
assert.equal(row('1', 'crm').status, 'sent');
assert.equal(row('1', 'crm').attempt_count, 1);
assert.equal(row('1', 'crm').last_acknowledgement, 'strict');
const duplicateRun = await drainNotificationOutbox(db, successEnv, {
  now: baseTime,
  runId: 'nwr_success_001',
  fetchImpl: strictAckFetch(successCalls),
});
assert.equal(duplicateRun.duplicateRun, true);
assert.equal(successCalls.length, 1);

// A receiver may report that it already durably persisted the lead. That is a
// successful idempotent acknowledgement, not a duplicate business outcome.
await seedLead('e');
seedOutbox('e', 'sheet');
const duplicateAckCalls = [];
await drainNotificationOutbox(
  db,
  { QUOTE_REQUEST_SHEET_WEBHOOK_URL: 'https://fixture.invalid/sheet' },
  { now: baseTime, fetchImpl: strictAckFetch(duplicateAckCalls, 200, true) },
);
assert.equal(duplicateAckCalls.length, 1);
assert.equal(row('e', 'sheet').status, 'sent');
assert.equal(row('e', 'sheet').last_acknowledgement, 'strict');

// A destination whose idempotency is not independently proven never receives
// a blind automatic retry after a timeout or post-send ambiguity.
await seedLead('2');
seedOutbox('2', 'make');
let ambiguousCalls = 0;
const ambiguousFetch = async () => {
  ambiguousCalls += 1;
  throw new TypeError('fixture network loss');
};
const ambiguous = await drainNotificationOutbox(
  db,
  { QUOTE_REQUEST_MAKE_WEBHOOK_URL: 'https://fixture.invalid/make' },
  { now: baseTime, fetchImpl: ambiguousFetch },
);
assert.equal(ambiguous.needsReview, 1);
assert.equal(ambiguousCalls, 1);
assert.equal(row('2', 'make').status, 'needs_review');
assert.match(row('2', 'make').last_error_code, /^ambiguous_delivery:/);
await drainNotificationOutbox(
  db,
  { QUOTE_REQUEST_MAKE_WEBHOOK_URL: 'https://fixture.invalid/make' },
  { now: new Date(baseTime.getTime() + 60_000), fetchImpl: ambiguousFetch },
);
assert.equal(ambiguousCalls, 1, 'needs-review delivery is not resent automatically');

// A confirmed operator inspection can authorize exactly one retry. The action
// itself is idempotent and records a durable audit row.
const operatorToken = 'operator-fixture-token';
const operatorRequest = new Request('https://worker.invalid/operator/recover', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${operatorToken}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    lead_id: accepted.get('2').leadId,
    destination: 'make',
    action: 'retry',
    action_id: 'operator_retry_001',
    reason_code: 'receiver_checked_no_record',
    confirmed_downstream_checked: true,
  }),
});
const operatorReplayRequest = operatorRequest.clone();
const operatorResponse = await handleNotificationOperatorRequest(
  operatorRequest,
  db,
  { NOTIFICATION_OPERATOR_TOKEN: operatorToken },
  new Date(baseTime.getTime() + 120_000),
);
assert.equal(operatorResponse.status, 200);
assert.equal(row('2', 'make').status, 'pending');
assert.equal(
  sqlite.prepare('SELECT count(*) AS count FROM notification_operator_audit WHERE action_id = ?').get('operator_retry_001').count,
  1,
);
const replayOperatorResponse = await handleNotificationOperatorRequest(
  operatorReplayRequest,
  db,
  { NOTIFICATION_OPERATOR_TOKEN: operatorToken },
  new Date(baseTime.getTime() + 120_000),
);
assert.equal(replayOperatorResponse.status, 409);
const operatorSuccessCalls = [];
await drainNotificationOutbox(
  db,
  { QUOTE_REQUEST_MAKE_WEBHOOK_URL: 'https://fixture.invalid/make' },
  {
    now: new Date(baseTime.getTime() + 120_000),
    fetchImpl: strictAckFetch(operatorSuccessCalls),
  },
);
assert.equal(operatorSuccessCalls.length, 1);
assert.equal(row('2', 'make').status, 'sent');

// A generic JSON ok or bare HTTP 2xx is not a durable destination-level
// acknowledgement and must never set sent=true.
await seedLead('b');
seedOutbox('b', 'crm');
await drainNotificationOutbox(db, successEnv, {
  now: baseTime,
  fetchImpl: async () => Response.json({ ok: true }),
});
assert.equal(row('b', 'crm').status, 'needs_review');
assert.equal(row('b', 'crm').last_acknowledgement, 'legacy_json_ok');
assert.match(row('b', 'crm').last_error_code, /legacy_acknowledgement_unverified/);

await seedLead('c');
seedOutbox('c', 'make');
await drainNotificationOutbox(
  db,
  { QUOTE_REQUEST_MAKE_WEBHOOK_URL: 'https://fixture.invalid/make' },
  { now: baseTime, fetchImpl: async () => new Response('', { status: 200 }) },
);
assert.equal(row('c', 'make').status, 'needs_review');
assert.equal(row('c', 'make').last_acknowledgement, 'legacy_http_2xx');
assert.match(row('c', 'make').last_error_code, /legacy_http_2xx_unverified/);

// Only explicitly verified destinations receive scheduled retries. The retry
// delay is deterministic and the persisted canonical payload is byte-stable.
await seedLead('3');
seedOutbox('3', 'crm');
const retryBodies = [];
let retryAttempt = 0;
const retryFetch = async (url, init) => {
  retryAttempt += 1;
  retryBodies.push(String(init.body));
  if (retryAttempt === 1) return new Response('temporary', { status: 503 });
  return strictAckFetch([])(url, init);
};
const verifiedEnv = {
  QUOTE_REQUEST_CRM_WEBHOOK_URL: 'https://fixture.invalid/crm',
  NOTIFICATION_AUTO_RETRY_DESTINATIONS: 'crm',
};
const scheduled = await drainNotificationOutbox(db, verifiedEnv, { now: baseTime, fetchImpl: retryFetch });
assert.equal(scheduled.retryScheduled, 1);
assert.equal(row('3', 'crm').status, 'failed_retryable');
assert.equal(row('3', 'crm').next_attempt_at_utc, '2026-08-10T20:06:00.000Z');
await drainNotificationOutbox(db, verifiedEnv, {
  now: new Date('2026-08-10T20:05:59.999Z'),
  fetchImpl: retryFetch,
});
assert.equal(retryAttempt, 1);
await drainNotificationOutbox(db, verifiedEnv, {
  now: new Date('2026-08-10T20:06:00.000Z'),
  fetchImpl: retryFetch,
});
assert.equal(retryAttempt, 2);
assert.equal(row('3', 'crm').status, 'sent');
assert.equal(retryBodies[0], retryBodies[1], 'retry payload is reconstructed from the accepted canonical record');

// Attempt ceilings poison/dead-letter a row rather than retrying forever.
await seedLead('4');
seedOutbox('4', 'crm', { attemptCount: 4, maxAttempts: 5 });
const exhausted = await drainNotificationOutbox(db, verifiedEnv, {
  now: baseTime,
  fetchImpl: async () => new Response('temporary', { status: 503 }),
});
assert.equal(exhausted.needsReview, 1);
assert.equal(row('4', 'crm').status, 'needs_review');
assert.match(row('4', 'crm').last_error_code, /^max_attempts_exhausted:/);
assert.equal(row('4', 'crm').attempt_count, 5);

// The default policy uses every documented interval: one initial attempt plus
// five retries, then terminal review on attempt six.
await seedLead('d');
seedOutbox('d', 'crm');
const retrySchedule = [
  ['2026-08-10T20:05:00.000Z', '2026-08-10T20:06:00.000Z'],
  ['2026-08-10T20:06:00.000Z', '2026-08-10T20:11:00.000Z'],
  ['2026-08-10T20:11:00.000Z', '2026-08-10T20:26:00.000Z'],
  ['2026-08-10T20:26:00.000Z', '2026-08-10T21:26:00.000Z'],
  ['2026-08-10T21:26:00.000Z', '2026-08-11T03:26:00.000Z'],
];
for (const [attemptAt, nextAttemptAt] of retrySchedule) {
  const summary = await drainNotificationOutbox(db, verifiedEnv, {
    now: new Date(attemptAt),
    fetchImpl: async () => new Response('temporary', { status: 503 }),
  });
  assert.equal(summary.retryScheduled, 1);
  assert.equal(row('d', 'crm').next_attempt_at_utc, nextAttemptAt);
}
const defaultExhausted = await drainNotificationOutbox(db, verifiedEnv, {
  now: new Date('2026-08-11T03:26:00.000Z'),
  fetchImpl: async () => new Response('temporary', { status: 503 }),
});
assert.equal(defaultExhausted.needsReview, 1);
assert.equal(row('d', 'crm').attempt_count, 6);
assert.equal(row('d', 'crm').status, 'needs_review');

// An expired unverified lease represents a possible post-send crash and is
// never reclaimed. A verified receiver may be reclaimed under a new fenced token.
await seedLead('5');
seedOutbox('5', 'make', {
  status: 'delivering',
  attemptCount: 1,
  claimToken: `claim_${'5'.repeat(32)}`,
  leaseExpires: '2026-08-10T20:04:59.000Z',
});
let expiredUnverifiedFetches = 0;
await drainNotificationOutbox(
  db,
  { QUOTE_REQUEST_MAKE_WEBHOOK_URL: 'https://fixture.invalid/make' },
  {
    now: baseTime,
    fetchImpl: async () => {
      expiredUnverifiedFetches += 1;
      return new Response('', { status: 200 });
    },
  },
);
assert.equal(expiredUnverifiedFetches, 0);
assert.equal(row('5', 'make').status, 'needs_review');

await seedLead('6');
seedOutbox('6', 'crm', {
  status: 'delivering',
  attemptCount: 1,
  claimToken: `claim_${'6'.repeat(32)}`,
  leaseExpires: '2026-08-10T20:04:59.000Z',
});
const expiredVerifiedCalls = [];
await drainNotificationOutbox(db, verifiedEnv, {
  now: baseTime,
  fetchImpl: strictAckFetch(expiredVerifiedCalls),
});
assert.equal(expiredVerifiedCalls.length, 1);
assert.equal(row('6', 'crm').status, 'sent');
assert.equal(row('6', 'crm').attempt_count, 2);

// Two worker invocations racing for one row result in one network dispatch.
await seedLead('7');
seedOutbox('7', 'crm');
const raceCalls = [];
await Promise.all([
  drainNotificationOutbox(db, successEnv, { now: baseTime, fetchImpl: strictAckFetch(raceCalls) }),
  drainNotificationOutbox(db, successEnv, { now: baseTime, fetchImpl: strictAckFetch(raceCalls) }),
]);
assert.equal(raceCalls.length, 1);
assert.equal(row('7', 'crm').status, 'sent');

// Corrupt persisted payloads are quarantined without leaving the database.
await seedLead('8');
seedOutbox('8', 'crm');
sqlite.prepare('UPDATE quote_requests SET canonical_payload_json = ? WHERE lead_id = ?').run(
  '{"leadId":"wrong"}',
  accepted.get('8').leadId,
);
let poisonFetches = 0;
await drainNotificationOutbox(db, successEnv, {
  now: baseTime,
  fetchImpl: async () => {
    poisonFetches += 1;
    return new Response('', { status: 200 });
  },
});
assert.equal(poisonFetches, 0);
assert.equal(row('8', 'crm').status, 'needs_review');
assert.equal(row('8', 'crm').last_error_code, 'invalid_persisted_canonical');

// Operator mark-delivered records the downstream inspection and updates the
// compatibility flags without issuing a webhook.
await seedLead('9');
seedOutbox('9', 'sheet', { status: 'needs_review', errorCode: 'ambiguous_delivery:timeout' });
const markDeliveredRequest = new Request('https://worker.invalid/operator/recover', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${operatorToken}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    lead_id: accepted.get('9').leadId,
    destination: 'sheet',
    action: 'mark_delivered',
    action_id: 'operator_mark_001',
    reason_code: 'sheet_row_verified',
    confirmed_downstream_checked: true,
  }),
});
assert.equal(
  (await handleNotificationOperatorRequest(
    markDeliveredRequest,
    db,
    { NOTIFICATION_OPERATOR_TOKEN: operatorToken },
    baseTime,
  )).status,
  200,
);
assert.equal(row('9', 'sheet').status, 'sent');
const markedQuote = sqlite.prepare(
  'SELECT owner_notification_sent, sheet_written, crm_posted FROM quote_requests WHERE lead_id = ?',
).get(accepted.get('9').leadId);
assert.deepEqual(
  { ...markedQuote },
  { owner_notification_sent: 1, sheet_written: 1, crm_posted: 0 },
);

await seedLead('a');
seedOutbox('a', 'make', { status: 'needs_review', errorCode: 'poison_fixture' });
const abandonBody = {
  lead_id: accepted.get('a').leadId,
  destination: 'make',
  action: 'abandon',
  action_id: 'operator_abandon_001',
  reason_code: 'invalid_destination_record',
  confirmed_downstream_checked: true,
};
function abandonRequest() {
  return new Request('https://worker.invalid/operator/recover', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${operatorToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(abandonBody),
  });
}
assert.equal(
  (await handleNotificationOperatorRequest(
    abandonRequest(),
    db,
    { NOTIFICATION_OPERATOR_TOKEN: operatorToken },
    baseTime,
  )).status,
  200,
);
const abandonedUpdatedAt = row('a', 'make').updated_at_utc;
assert.equal(row('a', 'make').status, 'abandoned');
assert.equal(row('a', 'make').last_operator_action_id, 'operator_abandon_001');
assert.equal(
  (await handleNotificationOperatorRequest(
    abandonRequest(),
    db,
    { NOTIFICATION_OPERATOR_TOKEN: operatorToken },
    new Date(baseTime.getTime() + 60_000),
  )).status,
  409,
);
assert.equal(row('a', 'make').updated_at_utc, abandonedUpdatedAt, 'duplicate abandon action is mutation-free');

// Even an operator-confirmed retry cannot exceed the immutable code ceiling.
await seedLead('f');
seedOutbox('f', 'crm', {
  status: 'needs_review',
  attemptCount: notificationRecoveryPolicy.maximumMaxAttempts,
  maxAttempts: notificationRecoveryPolicy.maximumMaxAttempts,
  errorCode: 'max_attempts_exhausted:http_503',
});
const hardCeilingResponse = await handleNotificationOperatorRequest(
  new Request('https://worker.invalid/operator/recover', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${operatorToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      lead_id: accepted.get('f').leadId,
      destination: 'crm',
      action: 'retry',
      action_id: 'operator_retry_ceiling_001',
      reason_code: 'receiver_checked_no_record',
      confirmed_downstream_checked: true,
    }),
  }),
  db,
  { NOTIFICATION_OPERATOR_TOKEN: operatorToken },
  baseTime,
);
assert.equal(hardCeilingResponse.status, 409);
assert.equal(row('f', 'crm').status, 'needs_review');
assert.equal(row('f', 'crm').attempt_count, notificationRecoveryPolicy.maximumMaxAttempts);
assert.equal(
  sqlite.prepare('SELECT count(*) AS count FROM notification_operator_audit WHERE action_id = ?')
    .get('operator_retry_ceiling_001').count,
  0,
);

// Health and alert output is aggregate-only: it exposes no lead identity or PII.
const health = await notificationQueueHealth(db, new Date('2026-08-10T20:20:00.000Z'));
assert.equal(health.needsReview >= 1, true);
assert.equal(health.alertCodes.includes('needs_review_present'), true);
const alertCalls = [];
await drainNotificationOutbox(
  db,
  { NOTIFICATION_ALERT_WEBHOOK_URL: 'https://fixture.invalid/alerts' },
  {
    now: new Date('2026-08-10T20:20:00.000Z'),
    runId: 'nwr_alerts_001',
    fetchImpl: async (url, init) => {
      alertCalls.push({ url: String(url), body: String(init.body) });
      return new Response(null, { status: 204 });
    },
  },
);
assert.equal(alertCalls.length, 1);
assert.equal(alertCalls[0].body.includes('lead_'), false);
assert.equal(alertCalls[0].body.includes('@example.invalid'), false);

// A run-level failure is durably closed as failed; if even that write cannot
// complete, the original running row becomes a stale-run alert.
const failureDb = {
  prepare(sql) {
    if (sql.includes('SELECT n.notification_id')) {
      return {
        bind() { return this; },
        async all() { throw new Error('fixture_candidate_read_failure'); },
      };
    }
    return db.prepare(sql);
  },
  batch: db.batch.bind(db),
};
await assert.rejects(
  drainNotificationOutbox(failureDb, {}, {
    now: baseTime,
    runId: 'nwr_failure_001',
    fetchImpl: strictAckFetch([]),
  }),
  /fixture_candidate_read_failure/,
);
assert.deepEqual(
  {
    ...sqlite.prepare(
      'SELECT status, completed_at_utc, last_error_code FROM notification_worker_runs WHERE run_id = ?',
    ).get('nwr_failure_001'),
  },
  {
    status: 'failed',
    completed_at_utc: baseTime.toISOString(),
    last_error_code: 'Error',
  },
);

const failedHealth = await notificationQueueHealth(db, new Date('2026-08-10T20:21:00.000Z'));
assert.equal(failedHealth.failedWorkerRuns, 1);
assert.equal(failedHealth.alertCodes.includes('failed_worker_run_present'), true);
const failedRunAlertCalls = [];
const recoverySummary = await drainNotificationOutbox(
  db,
  { NOTIFICATION_ALERT_WEBHOOK_URL: 'https://fixture.invalid/alerts' },
  {
    now: new Date('2026-08-10T20:21:00.000Z'),
    runId: 'nwr_failure_alert_001',
    fetchImpl: async (url, init) => {
      failedRunAlertCalls.push({ url: String(url), body: String(init.body) });
      return new Response(null, { status: 204 });
    },
  },
);
assert.equal(recoverySummary.alerts.includes('failed_worker_run_present'), true);
assert.equal(failedRunAlertCalls.length, 1);
const failedRunAlertPayload = JSON.parse(failedRunAlertCalls[0].body);
assert.equal(failedRunAlertPayload.alert_codes.includes('failed_worker_run_present'), true);
assert.equal(failedRunAlertCalls[0].body.includes('lead_'), false);
assert.equal(failedRunAlertCalls[0].body.includes('@example.invalid'), false);
assert.equal(
  typeof sqlite.prepare('SELECT alerted_at_utc FROM notification_worker_runs WHERE run_id = ?')
    .get('nwr_failure_001').alerted_at_utc,
  'string',
);
const clearedFailedHealth = await notificationQueueHealth(db, new Date('2026-08-10T20:21:00.000Z'));
assert.equal(clearedFailedHealth.failedWorkerRuns, 0);
assert.equal(clearedFailedHealth.alertCodes.includes('failed_worker_run_present'), false);

// A crash that leaves a durable run in `running` is detected after the lease
// horizon, fenced to terminal failed state, and surfaced through the same
// aggregate-only alert path.
sqlite.prepare(
  `INSERT INTO notification_worker_runs (
     run_id, scheduled_at_utc, started_at_utc, status,
     created_at_utc, updated_at_utc
   ) VALUES (?, ?, ?, 'running', ?, ?)`,
).run(
  'nwr_stale_001',
  '2026-08-10T20:20:00.000Z',
  '2026-08-10T20:20:00.000Z',
  '2026-08-10T20:20:00.000Z',
  '2026-08-10T20:20:00.000Z',
);
const staleHealth = await notificationQueueHealth(db, new Date('2026-08-10T20:30:00.000Z'));
assert.equal(staleHealth.staleWorkerRuns, 1);
assert.equal(staleHealth.alertCodes.includes('stale_worker_run_present'), true);
const staleAlertCalls = [];
const staleRecovery = await drainNotificationOutbox(
  db,
  { NOTIFICATION_ALERT_WEBHOOK_URL: 'https://fixture.invalid/alerts' },
  {
    now: new Date('2026-08-10T20:30:00.000Z'),
    runId: 'nwr_stale_recovery_001',
    fetchImpl: async (url, init) => {
      staleAlertCalls.push({ url: String(url), body: String(init.body) });
      return new Response(null, { status: 204 });
    },
  },
);
assert.equal(staleRecovery.alerts.includes('failed_worker_run_present'), true);
assert.equal(staleAlertCalls.length, 1);
assert.deepEqual(
  {
    ...sqlite.prepare(
      'SELECT status, completed_at_utc, last_error_code, alerted_at_utc FROM notification_worker_runs WHERE run_id = ?',
    ).get('nwr_stale_001'),
  },
  {
    status: 'failed',
    completed_at_utc: '2026-08-10T20:30:00.000Z',
    last_error_code: 'stale_worker_run_timeout',
    alerted_at_utc: '2026-08-10T20:30:00.000Z',
  },
);
assert.equal(
  (await notificationQueueHealth(db, new Date('2026-08-10T20:30:00.000Z'))).staleWorkerRuns,
  0,
);

// A scheduled failure remains a rejected invocation after its durable failed
// run is recorded, allowing Cron history/monitoring to observe it.
let scheduledFailurePromise;
let scheduledFailureNoRetry = 0;
const scheduledFailureTime = Date.parse('2026-08-10T20:31:00.000Z');
await notificationWorker.scheduled(
  {
    scheduledTime: scheduledFailureTime,
    cron: '* * * * *',
    noRetry() { scheduledFailureNoRetry += 1; },
  },
  { NOTIFICATION_D1: failureDb },
  { waitUntil(promise) { scheduledFailurePromise = promise; } },
);
assert.ok(scheduledFailurePromise instanceof Promise);
await assert.rejects(scheduledFailurePromise, /fixture_candidate_read_failure/);
assert.equal(scheduledFailureNoRetry, 1);
assert.equal(
  sqlite.prepare('SELECT status FROM notification_worker_runs WHERE run_id = ?')
    .get(`nwr_${scheduledFailureTime}`).status,
  'failed',
);

// The Worker never falls back to a similarly named Pages binding. Missing the
// dedicated NOTIFICATION_D1 binding is a visible, non-retried failure.
let missingBindingNoRetry = 0;
await assert.rejects(
  notificationWorker.scheduled(
    {
      scheduledTime: Date.parse('2026-08-10T20:32:00.000Z'),
      cron: '* * * * *',
      noRetry() { missingBindingNoRetry += 1; },
    },
    { QUOTE_REQUESTS_D1: db },
    { waitUntil() { throw new Error('waitUntil must not run without storage'); } },
  ),
  /storage is unavailable/,
);
assert.equal(missingBindingNoRetry, 1);

// The worker has no public cron-test route and its operator surface fails closed.
const blockedScheduled = await notificationWorker.fetch(
  new Request('https://worker.invalid/__scheduled'),
  { NOTIFICATION_D1: db },
);
assert.equal(blockedScheduled.status, 404);
const wrongBindingHealth = await notificationWorker.fetch(
  new Request('https://worker.invalid/operator/health', {
    headers: { authorization: `Bearer ${operatorToken}` },
  }),
  { QUOTE_REQUESTS_D1: db, NOTIFICATION_OPERATOR_TOKEN: operatorToken },
);
assert.equal(wrongBindingHealth.status, 503);
const unauthorizedHealth = await notificationWorker.fetch(
  new Request('https://worker.invalid/operator/health'),
  { NOTIFICATION_D1: db, NOTIFICATION_OPERATOR_TOKEN: operatorToken },
);
assert.equal(unauthorizedHealth.status, 401);
const authorizedHealth = await notificationWorker.fetch(
  new Request('https://worker.invalid/operator/health', {
    headers: { authorization: `Bearer ${operatorToken}` },
  }),
  { NOTIFICATION_D1: db, NOTIFICATION_OPERATOR_TOKEN: operatorToken },
);
assert.equal(authorizedHealth.status, 200);

sqlite.close();
console.log('PASS notification retry, fencing, dead-letter, operator recovery, and alert fixtures');
