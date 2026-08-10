#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

import { onRequest as handleLead } from '../../functions/api/lead.ts';
import { shouldEmitTechnicalEvent } from '../../src/lib/forms/acceptance-contract.ts';
import {
  handleQuoteRequest,
  quoteRequestStorageKey,
} from '../../src/lib/quote-request/delivery.ts';

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
  return `sub_${seed.padEnd(32, '0').slice(0, 32)}`;
}

function touch(path, click = {}) {
  return {
    gclid: click.gclid ?? null,
    gbraid: click.gbraid ?? null,
    wbraid: click.wbraid ?? null,
    utm_source: click.utm_source ?? null,
    utm_medium: click.utm_medium ?? null,
    utm_campaign: click.utm_campaign ?? null,
    utm_term: null,
    utm_content: null,
    landing_path: path,
    source_path: path,
    sanitized_referrer: click.gclid || click.gbraid || click.wbraid
      ? 'https://www.google.com/'
      : null,
    captured_at: '2026-08-10T18:00:00.000Z',
    source_confidence: click.gclid ? 'gclid' : click.gbraid ? 'gbraid' : click.wbraid ? 'wbraid' : 'direct',
  };
}

function journey(path, click) {
  const first = touch(path, click);
  return {
    version: 1,
    first_touch: first,
    latest_qualifying_touch: click ? first : null,
    submit_touch: touch(path),
    expires_at: null,
  };
}

function request(endpoint, sourcePage, body, ip, extraHeaders = {}) {
  return new Request(`https://happyfacesla.com${endpoint}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': ip,
      referer: `https://happyfacesla.com${sourcePage}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

const productionSchema = await readFile(
  new URL('../fixtures/production-quote-requests-schema.sql', import.meta.url),
  'utf8',
);
const proposedMigration = await readFile(
  new URL('../../migrations/d1/20260810_ap02a_ap03a_canonical_form_identity.sql', import.meta.url),
  'utf8',
);

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys = ON;');
sqlite.exec(productionSchema);
sqlite.exec(proposedMigration);
const db = new SqliteD1(sqlite);
const env = { AVAILABILITY_D1: db };
const compatibilityEnv = {
  ...env,
  LEGACY_FORM_COMPAT_STARTED_AT_UTC: new Date(Date.now() - 60_000).toISOString(),
  LEGACY_FORM_COMPAT_UNTIL_UTC: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
};

const routes = [
  {
    route: 'plan-my-party',
    endpoint: '/api/quote-request',
    sourcePage: '/plan-my-party/',
    id: submissionId('a'),
    body: {
      submission_id: submissionId('a'),
      form_route: 'plan-my-party',
      sourcePage: '/plan-my-party/',
      attribution: journey('/plan-my-party/', { gclid: 'GCLID-PRODUCTION-SCHEMA' }),
      eventType: 'birthday-party',
      services: ['face-painting'],
      kidsCountBucket: '11-18',
      kidsCountActual: 12,
      designStyle: 'quick-cheek-arm',
      eventDate: '2026-09-15',
      eventTime: '14:00',
      eventCity: 'Los Angeles',
      firstName: 'Schema',
      lastName: 'Fixture',
      email: 'schema-plan@example.invalid',
      phone: '310-555-0101',
      consentAcknowledgement: true,
    },
  },
  {
    route: 'packages',
    endpoint: '/api/lead',
    sourcePage: '/packages/',
    id: submissionId('b'),
    body: {
      submission_id: submissionId('b'),
      form_route: 'packages',
      source_page: '/packages/',
      attribution: journey('/packages/', { gbraid: 'GBRAID-PRODUCTION-SCHEMA' }),
      first_name: 'Schema',
      last_name: 'Fixture',
      email: 'schema-packages@example.invalid',
      phone: '310-555-0102',
      event_type: 'Birthday party',
      event_date: '2026-09-16',
      event_start_time: '15:00',
      event_city: 'Los Angeles',
      estimated_guest_count: '15',
      services_requested: ['Face Painting + Balloon Twisting'],
      consent_to_contact: true,
    },
  },
  {
    route: 'contact',
    endpoint: '/api/lead',
    sourcePage: '/contact/',
    id: submissionId('c'),
    body: {
      submission_id: submissionId('c'),
      form_route: 'contact',
      source_page: '/contact/',
      attribution: journey('/contact/', { wbraid: 'WBRAID-PRODUCTION-SCHEMA' }),
      first_name: 'Schema',
      last_name: 'Fixture',
      email: 'schema-contact@example.invalid',
      phone: '310-555-0103',
      event_type: 'School event',
      event_date: '2026-09-17',
      event_start_time: '16:00',
      event_city: 'Los Angeles',
      estimated_guest_count: '25',
      services_requested: ['Face Painting'],
      consent_to_contact: true,
    },
  },
];

for (let index = 0; index < routes.length; index += 1) {
  const fixture = routes[index];
  const req = request(fixture.endpoint, fixture.sourcePage, fixture.body, `192.0.2.${index + 10}`);
  const response = fixture.endpoint === '/api/lead'
    ? await handleLead({ request: req, env })
    : await handleQuoteRequest(req, env);
  const body = await response.json();
  assert.equal(response.status, 200, `${fixture.route} accepted by exact production schema`);
  assert.equal(body.accepted, true, `${fixture.route} accepted`);
  assert.equal(body.formRoute, fixture.route, `${fixture.route} authoritative route`);
  assert.equal(body.submissionId, fixture.id, `${fixture.route} public identity preserved`);

  const identity = sqlite.prepare(
    'SELECT form_route FROM lead_submission_identity WHERE submission_id = ?',
  ).get(fixture.id);
  assert.equal(identity.form_route, fixture.route, `${fixture.route} persisted in additive identity table`);

  const quote = sqlite.prepare(
    'SELECT idempotency_key, source, source_page FROM quote_requests WHERE lead_id = ?',
  ).get(body.leadId);
  assert.equal(quote.idempotency_key, quoteRequestStorageKey(fixture.id));
  assert.match(quote.idempotency_key, /^qrq_[a-f0-9]{32}$/);
  assert.equal(quote.source, 'plan-my-party', 'legacy storage CHECK remains unchanged');
  assert.equal(quote.source_page, fixture.sourcePage);
}

assert.equal(sqlite.prepare('SELECT count(*) AS count FROM quote_requests').get().count, 3);
assert.equal(sqlite.prepare('SELECT count(*) AS count FROM lead_submission_identity').get().count, 3);
assert.equal(sqlite.prepare('SELECT count(*) AS count FROM canonical_lead_outbox').get().count, 3);
assert.equal(sqlite.prepare('SELECT count(*) AS count FROM lead_notification_outbox').get().count, 3);

// Old Plan My Party tabs have a stable qrq_* key. During the explicit bounded
// window it is deterministically mapped to one sub_* identity and remains
// retry-safe, including when the response is lost.
const oldPlanKey = 'qrq_old-open-tab-plan-001';
const oldPlanPayload = {
  quoteRequestIdempotencyKey: oldPlanKey,
  source_page: '/plan-my-party/',
  eventType: 'birthday-party',
  services: ['face-painting'],
  kidsCountBucket: '11-18',
  kidsCountActual: 12,
  designStyle: 'quick-cheek-arm',
  eventDate: '2026-09-20',
  eventTime: '13:00',
  eventCity: 'Los Angeles',
  firstName: 'Old',
  lastName: 'Plan Tab',
  email: 'old-plan@example.invalid',
  phone: '310-555-0110',
  consentAcknowledgement: true,
  gclid: 'GCLID-OLD-PLAN',
  first_gclid: 'GCLID-OLD-PLAN',
  first_source_path: '/',
  submit_source_path: '/plan-my-party/',
};
async function oldPlanCall(ip) {
  const response = await handleQuoteRequest(
    request('/api/quote-request', '/plan-my-party/', oldPlanPayload, ip),
    compatibilityEnv,
  );
  return { response, body: await response.json() };
}
const oldPlanFirst = await oldPlanCall('192.0.2.40');
const oldPlanRetry = await oldPlanCall('192.0.2.41');
assert.equal(oldPlanFirst.response.status, 200);
assert.equal(oldPlanFirst.body.conversionEligible, false, 'legacy contract cannot become trusted canonical outcome');
assert.equal(oldPlanFirst.body.suppressionReason, 'legacy_client_compatibility');
assert.equal(oldPlanRetry.body.leadId, oldPlanFirst.body.leadId, 'lost-response retry reuses durable identity');
assert.equal(oldPlanRetry.body.duplicate, true);
const oldPlanIdentity = sqlite.prepare(
  `SELECT submission_id, client_contract_version, attribution_policy_version
   FROM lead_submission_identity WHERE lead_id = ?`,
).get(oldPlanFirst.body.leadId);
assert.equal(oldPlanIdentity.client_contract_version, 'legacy-bounded-v1');
assert.equal(oldPlanIdentity.attribution_policy_version, 'AP03A-legacy-bounded-v1');
assert.match(oldPlanIdentity.submission_id, /^sub_[a-f0-9]{32}$/);
assert.equal(
  sqlite.prepare('SELECT idempotency_key FROM quote_requests WHERE lead_id = ?').get(oldPlanFirst.body.leadId).idempotency_key,
  oldPlanKey,
);

// Model a qrq_* row accepted immediately before cutover and retried afterward:
// the historical lead is returned without creating an additive identity or a
// second quote row.
sqlite.prepare('DELETE FROM lead_notification_outbox WHERE lead_id = ?').run(oldPlanFirst.body.leadId);
sqlite.prepare('DELETE FROM canonical_lead_outbox WHERE lead_id = ?').run(oldPlanFirst.body.leadId);
sqlite.prepare('DELETE FROM lead_submission_identity WHERE lead_id = ?').run(oldPlanFirst.body.leadId);
const historicalRetry = await oldPlanCall('192.0.2.42');
assert.equal(historicalRetry.response.status, 200);
assert.equal(historicalRetry.body.leadId, oldPlanFirst.body.leadId);
assert.equal(historicalRetry.body.duplicate, true);
assert.equal(
  sqlite.prepare('SELECT count(*) AS count FROM lead_submission_identity WHERE lead_id = ?').get(oldPlanFirst.body.leadId).count,
  0,
  'historical retry remains read-only with respect to additive identity tables',
);

// Old Packages/Contact tabs had no client identity. The compatibility path
// preserves valid customer delivery but cannot prove retry identity; each retry
// is deliberately shadow-suppressed and the residual duplicate risk is explicit.
const oldLeadPayload = {
  first_name: 'Old',
  last_name: 'Lead Tab',
  email: 'old-lead@example.invalid',
  phone: '310-555-0111',
  event_type: 'Birthday party',
  event_date: '2026-09-21',
  event_start_time: '14:00',
  event_city: 'Los Angeles',
  estimated_guest_count: '20',
  services_requested: ['Face Painting'],
  consent_to_contact: true,
};
async function oldLeadCall(sourcePage, ip) {
  const raw = { ...oldLeadPayload, source_page: sourcePage };
  const response = await handleLead({
    request: request('/api/lead', sourcePage, raw, ip),
    env: compatibilityEnv,
  });
  return { response, body: await response.json() };
}
const oldPackagesFirst = await oldLeadCall('/packages/', '192.0.2.50');
const oldPackagesRetry = await oldLeadCall('/packages/', '192.0.2.51');
const oldContact = await oldLeadCall('/contact/', '192.0.2.52');
assert.equal(oldPackagesFirst.response.status, 200);
assert.equal(oldPackagesFirst.body.formRoute, 'packages');
assert.equal(oldPackagesFirst.body.conversionEligible, false);
assert.equal(oldPackagesFirst.body.ownerNotificationQueued, true);
assert.notEqual(
  oldPackagesFirst.body.leadId,
  oldPackagesRetry.body.leadId,
  'old no-ID retry remains at-least-once and must be monitored during the bounded window',
);
assert.equal(oldContact.response.status, 200);
assert.equal(oldContact.body.formRoute, 'contact');
for (const result of [oldPackagesFirst, oldPackagesRetry, oldContact]) {
  const identity = sqlite.prepare(
    'SELECT client_contract_version, conversion_eligible, suppression_reason FROM lead_submission_identity WHERE lead_id = ?',
  ).get(result.body.leadId);
  assert.deepEqual(
    { ...identity },
    {
      client_contract_version: 'legacy-bounded-v1',
      conversion_eligible: 0,
      suppression_reason: 'legacy_client_compatibility',
    },
  );
}

// Modern-looking but incomplete payloads never fall through to legacy mode.
const missingAttribution = structuredClone(routes[0].body);
delete missingAttribution.attribution;
const missingAttributionResponse = await handleQuoteRequest(
  request('/api/quote-request', '/plan-my-party/', missingAttribution, '192.0.2.60'),
  compatibilityEnv,
);
assert.equal(missingAttributionResponse.status, 400);
const missingSubmission = structuredClone(routes[0].body);
delete missingSubmission.submission_id;
const missingSubmissionResponse = await handleQuoteRequest(
  request('/api/quote-request', '/plan-my-party/', missingSubmission, '192.0.2.61'),
  compatibilityEnv,
);
assert.equal(missingSubmissionResponse.status, 400);

// The legacy path is fail-closed without a valid, no-more-than-14-day window.
const disabledLegacy = await handleQuoteRequest(
  request('/api/quote-request', '/plan-my-party/', oldPlanPayload, '192.0.2.62'),
  env,
);
assert.equal(disabledLegacy.status, 400);
const expiredEnv = {
  ...env,
  LEGACY_FORM_COMPAT_STARTED_AT_UTC: '2026-07-01T00:00:00.000Z',
  LEGACY_FORM_COMPAT_UNTIL_UTC: '2026-07-08T00:00:00.000Z',
};
const expiredLegacy = await handleQuoteRequest(
  request('/api/quote-request', '/plan-my-party/', oldPlanPayload, '192.0.2.63'),
  expiredEnv,
);
assert.equal(expiredLegacy.status, 400);

// A raw application rollback to the pre-AP02 response contract is unsafe for
// already-open new clients: the old APIs returned only ok/leadId and therefore
// cannot satisfy the new accepted/persisted/created decision. A rollback build
// must keep the forward response bridge even if shadow plumbing is disabled.
const preAp02SuccessResponse = {
  ok: true,
  leadId: 'legacy-uuid-without-acceptance-contract',
};
assert.equal(
  shouldEmitTechnicalEvent(preAp02SuccessResponse),
  false,
  'new client does not recognize a pre-AP02 success response',
);
const requiredRollbackBridgeResponse = {
  ok: true,
  accepted: true,
  received: true,
  persisted: true,
  created: true,
  duplicate: false,
  conversionEligible: false,
  leadId: 'lead_00000000000000000000000000000000',
  submissionId: submissionId('rollback-bridge'),
  formRoute: 'contact',
};
assert.equal(
  requiredRollbackBridgeResponse.accepted && requiredRollbackBridgeResponse.persisted,
  true,
  'rollback bridge preserves the new browser success contract',
);
assert.equal(
  shouldEmitTechnicalEvent(requiredRollbackBridgeResponse),
  false,
  'rollback bridge remains outcome-suppressed while preserving browser success semantics',
);

// Suppressed modern submissions still fit the admitted live delivery_status
// CHECK and never receive a notification outbox row.
const internalPayload = structuredClone(routes[0].body);
internalPayload.submission_id = submissionId('d');
internalPayload.firstName = 'HFL Tracking Test';
internalPayload.specialRequests = 'INTERNAL TRACKING TEST - DO NOT QUOTE - DO NOT BOOK';
internalPayload.internal_test = true;
internalPayload.internal_test_reason = 'owner_approved_schema_fixture';
const internalTestToken = 'owner-authorized-test-token-000000000001';
const internalResponse = await handleQuoteRequest(
  request(
    '/api/quote-request',
    '/plan-my-party/',
    internalPayload,
    '192.0.2.70',
    { 'x-hfla-internal-test-token': internalTestToken },
  ),
  { ...env, INTERNAL_TEST_TOKEN: internalTestToken },
);
const internalBody = await internalResponse.json();
assert.equal(internalResponse.status, 200);
assert.equal(internalBody.conversionEligible, false);
assert.equal(internalBody.ownerNotificationQueued, false);
const internalRow = sqlite.prepare(
  'SELECT delivery_status, owner_notification_queued FROM quote_requests WHERE lead_id = ?',
).get(internalBody.leadId);
assert.deepEqual(
  { ...internalRow },
  { delivery_status: 'persisted_internal_queue', owner_notification_queued: 0 },
);
assert.equal(
  sqlite.prepare('SELECT count(*) AS count FROM lead_notification_outbox WHERE lead_id = ?').get(internalBody.leadId).count,
  0,
);

sqlite.close();
console.log('PASS production schema, bounded old-client compatibility, retries, and suppression fixtures');
