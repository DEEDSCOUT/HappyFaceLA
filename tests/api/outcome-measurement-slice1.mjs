#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { onRequest as handleLead } from '../../functions/api/lead.ts';
import {
  AttributionIdentityConflictError,
  buildLeadAttributionRecord,
  canonicalizeJson,
  captureAttributionBestEffort,
  isOutcomeMeasurementCaptureEnabled,
  persistLeadAttributionRecord,
} from '../../src/lib/outcome-measurement/attribution-store.ts';
import { ATTRIBUTION_CAPTURE_VERSION } from '../../src/lib/outcome-measurement/contracts.ts';
import { handleQuoteRequest } from '../../src/lib/quote-request/delivery.ts';
import { verifyOutcomeMeasurementCoverage } from '../../scripts/verify-outcome-measurement-coverage.mjs';

const tests = [];
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
let requestCounter = 0;
let fetchCalls = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function installSuccessfulFetch() {
  fetchCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    fetchCalls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

function jsonRequest(path, payload) {
  requestCounter += 1;
  return new Request(`https://www.happyfacesla.com${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': `192.0.2.${requestCounter}`,
      'cf-ray': `slice1-${requestCounter}`,
      'user-agent': 'outcome-measurement-slice1-test',
    },
    body: JSON.stringify(payload),
  });
}

function parseInsert(sql, args) {
  const columns = sql
    .slice(sql.indexOf('(') + 1, sql.indexOf(') VALUES'))
    .split(',')
    .map((column) => column.trim());
  return Object.fromEntries(columns.map((column, index) => [column, args[index]]));
}

class AttributionMockD1 {
  constructor({ unavailable = false, alwaysConflict = false } = {}) {
    this.rows = new Map();
    this.unavailable = unavailable;
    this.alwaysConflict = alwaysConflict;
    this.operations = 0;
  }

  key(sourceSystem, sourceLeadId) {
    return `${sourceSystem}\u0000${sourceLeadId}`;
  }

  prepare(sql) {
    this.operations += 1;
    if (this.unavailable) throw new Error('synthetic storage unavailable');
    const db = this;
    return {
      bind(...args) {
        return {
          async first() {
            if (db.alwaysConflict) {
              return { record_sha256: 'f'.repeat(64), capture_state: 'CAPTURED' };
            }
            const row = db.rows.get(db.key(args[0], args[1]));
            return row
              ? { record_sha256: row.record_sha256, capture_state: row.capture_state }
              : null;
          },
          async run() {
            const row = parseInsert(sql, args);
            const key = db.key(row.source_system, row.source_lead_id);
            if (db.rows.has(key)) throw new Error('unique constraint');
            db.rows.set(key, row);
            return { success: true, meta: { changes: 1 } };
          },
        };
      },
    };
  }
}

class QuoteCoreMockD1 {
  constructor() {
    this.byIdempotency = new Map();
    this.byLeadId = new Map();
  }

  prepare(sql) {
    const db = this;
    return {
      bind(...args) {
        return {
          async first() {
            if (sql.includes('WHERE idempotency_key')) {
              return db.byIdempotency.get(args[0]) ?? null;
            }
            return null;
          },
          async run() {
            if (sql.trim().startsWith('INSERT INTO quote_requests')) {
              const row = parseInsert(sql, args);
              row.owner_notification_queued = row.owner_notification_queued ?? 1;
              row.owner_notification_sent = row.owner_notification_sent ?? 0;
              row.sheet_written = row.sheet_written ?? 0;
              row.crm_posted = row.crm_posted ?? 0;
              db.byLeadId.set(row.lead_id, row);
              db.byIdempotency.set(row.idempotency_key, {
                lead_id: row.lead_id,
                owner_notification_queued: row.owner_notification_queued,
                owner_notification_sent: row.owner_notification_sent,
                sheet_written: row.sheet_written,
                crm_posted: row.crm_posted,
              });
            } else if (sql.trim().startsWith('UPDATE quote_requests')) {
              const row = db.byLeadId.get(args[5]);
              if (row) {
                row.owner_notification_sent = args[2];
                row.sheet_written = args[3];
                row.crm_posted = args[4];
              }
            }
            return { success: true, meta: { changes: 1 } };
          },
        };
      },
    };
  }
}

function attributionInput(overrides = {}) {
  return {
    source_system: 'HFLA_WEB_LEAD',
    source_lead_id: 'lead_slice1_test_001',
    submitted_at: '2026-08-28T17:15:00.000Z',
    landing_page: 'https://www.happyfacesla.com/pricing/?utm_source=google&gclid=NOT-STORED-IN-PATH#quote',
    source_page: '/pricing/?ignored=yes',
    gclid: 'TEST-GCLID-MiXeD-AaZz09_-',
    gbraid: null,
    wbraid: null,
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'slice1_test',
    utm_term: 'face painter',
    utm_content: 'ad_variant_a',
    ...overrides,
  };
}

function legacyLeadPayload(overrides = {}) {
  return {
    first_name: 'Synthetic',
    last_name: 'Lead',
    email: 'synthetic@example.test',
    event_type: 'Birthday party',
    event_city: 'Los Angeles',
    source_page: '/pricing/?gclid=SHOULD-NOT-SURVIVE-IN-PATH',
    landing_page: 'https://www.happyfacesla.com/pricing/?utm_source=google',
    consent_to_contact: true,
    ...overrides,
  };
}

async function callLead(payload, env = {}, execution = {}) {
  const response = await handleLead({
    request: jsonRequest('/api/lead', payload),
    env: {
      QUOTE_REQUEST_MAKE_WEBHOOK_URL: 'https://example.test/make',
      ...env,
    },
    ...execution,
  });
  return { response, body: await response.json() };
}

function planMyPartyPayload(overrides = {}) {
  return {
    eventType: 'birthday-party',
    services: ['face-painting'],
    kidsCountBucket: '11-18',
    kidsCountActual: 12,
    designStyle: 'not-sure',
    branch: 'custom-quote',
    eventDate: '2026-10-15',
    eventTime: '14:00',
    eventCity: 'Los Angeles',
    firstName: 'Synthetic',
    lastName: 'Customer',
    email: 'synthetic@example.test',
    quoteOutcome: 'custom-quote-required',
    quoteRequestIdempotencyKey: `qrq_slice1_${requestCounter}_deterministic`,
    consentAcknowledgement: true,
    lookbook_inspirations: [],
    wizardVersion: 'guided-wizard-v1',
    preferredContactMethod: 'email',
    source_page: '/plan-my-party/',
    landing_page: 'https://www.happyfacesla.com/plan-my-party/?utm_source=google',
    submit_landing_page: 'https://www.happyfacesla.com/plan-my-party/?gclid=TEST-GCLID-PLAN',
    submit_source_path: '/plan-my-party/',
    gclid: 'TEST-GCLID-PLAN',
    submit_gclid: 'TEST-GCLID-PLAN',
    utm_source: 'google',
    utm_medium: 'cpc',
    ...overrides,
  };
}

async function callQuote(payload, coreDb, measurementEnv = {}, execution) {
  const response = await handleQuoteRequest(jsonRequest('/api/quote-request', payload), {
    AVAILABILITY_D1: coreDb,
    QUOTE_REQUEST_MAKE_WEBHOOK_URL: 'https://example.test/make',
    ...measurementEnv,
  }, execution);
  return { response, body: await response.json() };
}

test('capture version and feature flag are fail-closed by default', () => {
  assert.equal(ATTRIBUTION_CAPTURE_VERSION, 'ATTRIBUTION_CAPTURE_V1');
  assert.equal(isOutcomeMeasurementCaptureEnabled({}), false);
  assert.equal(isOutcomeMeasurementCaptureEnabled({ OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'false' }), false);
  assert.equal(isOutcomeMeasurementCaptureEnabled({ OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true' }), true);
});

for (const [field, value] of [
  ['gclid', 'TEST-GCLID-AaZz09_-'],
  ['gbraid', 'TEST-GBRAID-AaZz09_-'],
  ['wbraid', 'TEST-WBRAID-AaZz09_-'],
]) {
  test(`${field.toUpperCase()} is preserved exactly and case-sensitively`, async () => {
    const record = await buildLeadAttributionRecord(attributionInput({
      gclid: null,
      gbraid: null,
      wbraid: null,
      [field]: value,
    }), '2026-08-28T17:16:00.000Z');
    assert.equal(record[field], value);
    assert.equal(record.capture_state, 'CAPTURED');
  });
}

test('no click identifier is admitted', async () => {
  const record = await buildLeadAttributionRecord(attributionInput({ gclid: null }));
  assert.equal(record.gclid, null);
  assert.equal(record.gbraid, null);
  assert.equal(record.wbraid, null);
  assert.equal(record.capture_state, 'CAPTURED');
});

test('GCLID plus GBRAID is admitted only when both are actually submitted', async () => {
  const record = await buildLeadAttributionRecord(attributionInput({
    gclid: 'TEST-GCLID-COMBO',
    gbraid: 'TEST-GBRAID-COMBO',
  }));
  assert.equal(record.capture_state, 'CAPTURED');
  assert.equal(record.gclid, 'TEST-GCLID-COMBO');
  assert.equal(record.gbraid, 'TEST-GBRAID-COMBO');
});

test('unsupported click identifier combinations are quarantined', async () => {
  for (const identifiers of [
    { gclid: null, gbraid: 'TEST-GBRAID-Q', wbraid: 'TEST-WBRAID-Q' },
    { gclid: 'TEST-GCLID-Q', gbraid: null, wbraid: 'TEST-WBRAID-Q' },
    { gclid: 'TEST-GCLID-Q', gbraid: 'TEST-GBRAID-Q', wbraid: 'TEST-WBRAID-Q' },
  ]) {
    const record = await buildLeadAttributionRecord(attributionInput(identifiers));
    assert.equal(record.capture_state, 'QUARANTINED');
  }
});

test('canonical digest is stable across input field order', async () => {
  const input = attributionInput();
  const reversed = Object.fromEntries(Object.entries(input).reverse());
  const first = await buildLeadAttributionRecord(input, '2026-08-28T17:16:00.000Z');
  const second = await buildLeadAttributionRecord(reversed, '2026-08-28T17:17:00.000Z');
  assert.equal(first.record_sha256, second.record_sha256);
  assert.equal(canonicalizeJson({ z: 'last', a: 'first' }), canonicalizeJson({ a: 'first', z: 'last' }));
});

test('meaningful field and click-ID case changes alter the canonical digest', async () => {
  const baseline = await buildLeadAttributionRecord(attributionInput());
  const changedCampaign = await buildLeadAttributionRecord(attributionInput({ utm_campaign: 'slice1_test_b' }));
  const changedCase = await buildLeadAttributionRecord(attributionInput({ gclid: 'test-gclid-mixed-aazz09_-' }));
  assert.notEqual(baseline.record_sha256, changedCampaign.record_sha256);
  assert.notEqual(baseline.record_sha256, changedCase.record_sha256);
});

test('landing and source paths discard arbitrary query strings and fragments', async () => {
  const record = await buildLeadAttributionRecord(attributionInput());
  assert.equal(record.landing_page, '/pricing/');
  assert.equal(record.source_page, '/pricing/');
  assert(!record.landing_page.includes('gclid'));
});

test('UTM length and safety rules reject oversized, control, and contact-like values', async () => {
  const allowed = await buildLeadAttributionRecord(attributionInput({ utm_campaign: 'x'.repeat(256) }));
  assert.equal(allowed.utm_campaign.length, 256);
  for (const value of ['x'.repeat(257), 'bad\u0000value', 'customer@example.test', '+1 (310) 555-0100']) {
    await assert.rejects(() => buildLeadAttributionRecord(attributionInput({ utm_campaign: value })), /invalid/i);
  }
});

test('encoded contact data is rejected from path fields', async () => {
  await assert.rejects(() => buildLeadAttributionRecord(attributionInput({
    landing_page: 'https://www.happyfacesla.com/customer%40example.test/',
  })), /invalid/i);
});

test('canonical attribution contains no customer-PII fields', async () => {
  const record = await buildLeadAttributionRecord(attributionInput());
  const forbidden = ['name', 'email', 'phone', 'address', 'message', 'ip_address', 'hashed_email', 'hashed_phone'];
  for (const field of forbidden) assert(!Object.hasOwn(record, field));
});

test('identical replay is idempotent and conflicting replay is rejected', async () => {
  const db = new AttributionMockD1();
  const first = await buildLeadAttributionRecord(attributionInput(), '2026-08-28T17:16:00.000Z');
  const identical = await buildLeadAttributionRecord(attributionInput(), '2026-08-28T17:20:00.000Z');
  assert.equal(await persistLeadAttributionRecord(db, first), 'INSERTED');
  assert.equal(await persistLeadAttributionRecord(db, identical), 'IDEMPOTENT');
  const conflict = await buildLeadAttributionRecord(attributionInput({ utm_content: 'changed' }));
  await assert.rejects(() => persistLeadAttributionRecord(db, conflict), AttributionIdentityConflictError);
  assert.equal(db.rows.size, 1);
});

test('diagnostics never expose raw click IDs or source lead IDs', async () => {
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  const rawId = 'TEST-WBRAID-DO-NOT-LOG';
  const sourceLeadId = 'lead_do_not_log';
  const result = await captureAttributionBestEffort({
    OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true',
  }, attributionInput({ source_lead_id: sourceLeadId, gclid: null, wbraid: rawId }));
  assert.equal(result.status, 'FAILED');
  const rendered = JSON.stringify(warnings);
  assert(!rendered.includes(rawId));
  assert(!rendered.includes(sourceLeadId));
  assert(rendered.includes('WBRAID'));
  console.warn = originalWarn;
});

test('feature flag OFF performs no sidecar write and existing lead delivery succeeds', async () => {
  installSuccessfulFetch();
  const measurementDb = new AttributionMockD1();
  const { response, body } = await callLead(legacyLeadPayload({ gclid: 'TEST-GCLID-OFF' }), {
    OUTCOME_MEASUREMENT_D1: measurementDb,
  });
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(measurementDb.operations, 0);
});

test('feature flag ON captures all three click-ID domains exactly after lead delivery', async () => {
  installSuccessfulFetch();
  const measurementDb = new AttributionMockD1();
  const { response, body } = await callLead(legacyLeadPayload({
    gclid: 'TEST-GCLID-API-MiXeD',
    gbraid: 'TEST-GBRAID-API-MiXeD',
    wbraid: null,
  }), {
    OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true',
    OUTCOME_MEASUREMENT_D1: measurementDb,
  });
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(measurementDb.rows.size, 1);
  const row = Array.from(measurementDb.rows.values())[0];
  assert.equal(row.source_lead_id, body.leadId);
  assert.equal(row.gclid, 'TEST-GCLID-API-MiXeD');
  assert.equal(row.gbraid, 'TEST-GBRAID-API-MiXeD');
  assert.equal(row.wbraid, null);
  assert.equal(row.capture_state, 'CAPTURED');
  const deliveryBody = String(fetchCalls[0].init.body || '');
  assert(!deliveryBody.includes('TEST-GBRAID-API-MiXeD'));
  assert(!deliveryBody.includes('utm_source=google'));
});

test('/api/lead preserves WBRAID exactly in the protected sidecar', async () => {
  installSuccessfulFetch();
  const measurementDb = new AttributionMockD1();
  const { response } = await callLead(legacyLeadPayload({
    gclid: null,
    gbraid: null,
    wbraid: 'TEST-WBRAID-API-MiXeD',
  }), {
    OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true',
    OUTCOME_MEASUREMENT_D1: measurementDb,
  });
  assert.equal(response.status, 200);
  const row = Array.from(measurementDb.rows.values())[0];
  assert.equal(row.gclid, null);
  assert.equal(row.gbraid, null);
  assert.equal(row.wbraid, 'TEST-WBRAID-API-MiXeD');
  assert.equal(row.capture_state, 'CAPTURED');
});

test('server controls source lead ID and submitted_at; paths are query-free', async () => {
  installSuccessfulFetch();
  const measurementDb = new AttributionMockD1();
  const clientTimestamp = '1970-01-01T00:00:00.000Z';
  const { body } = await callLead({
    ...legacyLeadPayload(),
    submitted_at: clientTimestamp,
    gclid: 'TEST-GCLID-SERVER-TIME',
  }, {
    OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true',
    OUTCOME_MEASUREMENT_D1: measurementDb,
  });
  const row = Array.from(measurementDb.rows.values())[0];
  assert.equal(row.source_lead_id, body.leadId);
  assert.notEqual(row.submitted_at, clientTimestamp);
  assert.equal(new Date(row.submitted_at).getUTCFullYear(), 2026);
  assert.equal(row.landing_page, '/pricing/');
  assert.equal(row.source_page, '/pricing/');
});

test('sidecar unavailable does not lose the customer lead', async () => {
  installSuccessfulFetch();
  const { response, body } = await callLead(legacyLeadPayload({ gclid: 'TEST-GCLID-UNAVAILABLE' }), {
    OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true',
  });
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(fetchCalls.length, 1);
});

test('production waitUntil keeps a hanging sidecar off the generic lead response path', async () => {
  installSuccessfulFetch();
  const hangingDb = {
    prepare() {
      return {
        bind() {
          return {
            first: () => new Promise(() => {}),
            run: () => new Promise(() => {}),
          };
        },
      };
    },
  };
  const deferred = [];
  const { response, body } = await callLead(legacyLeadPayload({ gclid: 'TEST-GCLID-HANGING' }), {
    OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true',
    OUTCOME_MEASUREMENT_D1: hangingDb,
  }, {
    waitUntil: (promise) => deferred.push(promise),
  });
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(deferred.length, 1);
});

test('measurement identity conflict does not lose the customer lead', async () => {
  installSuccessfulFetch();
  const measurementDb = new AttributionMockD1({ alwaysConflict: true });
  const { response, body } = await callLead(legacyLeadPayload({ gclid: 'TEST-GCLID-CONFLICT' }), {
    OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true',
    OUTCOME_MEASUREMENT_D1: measurementDb,
  });
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(measurementDb.rows.size, 0);
});

test('measurement quarantine does not lose the customer lead', async () => {
  installSuccessfulFetch();
  const measurementDb = new AttributionMockD1();
  const { response, body } = await callLead(legacyLeadPayload({
    gclid: null,
    gbraid: 'TEST-GBRAID-QUARANTINE',
    wbraid: 'TEST-WBRAID-QUARANTINE',
  }), {
    OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true',
    OUTCOME_MEASUREMENT_D1: measurementDb,
  });
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(Array.from(measurementDb.rows.values())[0].capture_state, 'QUARANTINED');
});

test('Plan My Party delivery remains durable and uses the dedicated sidecar binding', async () => {
  installSuccessfulFetch();
  const coreDb = new QuoteCoreMockD1();
  const measurementDb = new AttributionMockD1();
  const { response, body } = await callQuote(planMyPartyPayload(), coreDb, {
    OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true',
    OUTCOME_MEASUREMENT_D1: measurementDb,
  });
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.persisted, true);
  assert.equal(coreDb.byLeadId.size, 1);
  assert.equal(measurementDb.rows.size, 1);
  assert.notEqual(coreDb, measurementDb);
  const row = Array.from(measurementDb.rows.values())[0];
  assert.equal(row.source_system, 'HFLA_PLAN_MY_PARTY');
  assert.equal(row.source_lead_id, body.leadId);
  assert.equal(row.gclid, 'TEST-GCLID-PLAN');
  assert.equal(row.landing_page, '/plan-my-party/');
});

test('Plan My Party uses one coherent submit-touch attribution snapshot', async () => {
  installSuccessfulFetch();
  const coreDb = new QuoteCoreMockD1();
  const measurementDb = new AttributionMockD1();
  await callQuote(planMyPartyPayload({
    gclid: 'TEST-GCLID-SUBMIT',
    gbraid: 'TEST-GBRAID-FIRST-TOUCH',
    submit_gclid: 'TEST-GCLID-SUBMIT',
    submit_gbraid: null,
    first_gbraid: 'TEST-GBRAID-FIRST-TOUCH',
  }), coreDb, {
    OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true',
    OUTCOME_MEASUREMENT_D1: measurementDb,
  });
  const row = Array.from(measurementDb.rows.values())[0];
  assert.equal(row.gclid, 'TEST-GCLID-SUBMIT');
  assert.equal(row.gbraid, null);
  assert.equal(row.capture_state, 'CAPTURED');
});

test('Plan My Party delivery survives a sidecar failure', async () => {
  installSuccessfulFetch();
  const coreDb = new QuoteCoreMockD1();
  const { response, body } = await callQuote(planMyPartyPayload(), coreDb, {
    OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true',
  });
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(coreDb.byLeadId.size, 1);
  assert.equal(fetchCalls.length, 1);
});

test('production waitUntil keeps a hanging sidecar off the Plan My Party response path', async () => {
  installSuccessfulFetch();
  const coreDb = new QuoteCoreMockD1();
  const hangingDb = {
    prepare() {
      return {
        bind() {
          return {
            first: () => new Promise(() => {}),
            run: () => new Promise(() => {}),
          };
        },
      };
    },
  };
  const deferred = [];
  const { response, body } = await callQuote(planMyPartyPayload(), coreDb, {
    OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true',
    OUTCOME_MEASUREMENT_D1: hangingDb,
  }, {
    waitUntil: (promise) => deferred.push(promise),
  });
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(coreDb.byLeadId.size, 1);
  assert.equal(fetchCalls.length, 1);
  assert.equal(deferred.length, 1);
});

test('coverage verifier passes every approved production lead route', () => {
  const result = verifyOutcomeMeasurementCoverage();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.routes.length, 4);
  for (const row of result.routes) {
    assert.equal(row.supports_gclid, true);
    assert.equal(row.supports_gbraid, true);
    assert.equal(row.supports_wbraid, true);
    assert.equal(row.supports_source_lead_id, true);
    assert.equal(row.supports_submitted_at, true);
    assert.equal(row.capture_version, 'ATTRIBUTION_CAPTURE_V1');
    assert.deepEqual(row.problems, []);
  }
});

test('coverage verifier fails when a supported braid is dropped', () => {
  const file = 'src/pages/packages.astro';
  const original = readFileSync(resolve(file), 'utf8');
  const dropped = original.replace('<input type="hidden" name="gbraid" />', '');
  const result = verifyOutcomeMeasurementCoverage({ sourceOverrides: { [file]: dropped } });
  assert.equal(result.ok, false);
  const row = result.routes.find((item) => item.route === '/packages/');
  assert(row.problems.includes('gbraid_not_preserved'));
});

test('local D1-compatible migration applies cleanly with exact isolated schema', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE existing_application_table (id TEXT PRIMARY KEY); INSERT INTO existing_application_table VALUES (\'preserved\');');
  const migration = readFileSync(resolve('migrations/d1/0006_outcome_measurement_sidecar.sql'), 'utf8');
  db.exec(migration);

  const columns = db.prepare('PRAGMA table_info(lead_attribution_v1)').all().map((row) => row.name);
  assert.deepEqual(columns, [
    'source_system', 'source_lead_id', 'submitted_at', 'landing_page', 'source_page',
    'gclid', 'gbraid', 'wbraid',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'capture_version', 'created_at', 'record_sha256', 'capture_state',
  ]);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM lead_attribution_v1').get().count, 0);
  assert.equal(db.prepare('SELECT id FROM existing_application_table').get().id, 'preserved');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  db.close();
});

test('local migration enforces atomic insert, audit, immutability, and rollback', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(resolve('migrations/d1/0006_outcome_measurement_sidecar.sql'), 'utf8'));
  const record = await buildLeadAttributionRecord(attributionInput(), '2026-08-28T17:16:00.000Z');
  const insert = db.prepare(`INSERT INTO lead_attribution_v1 (
    source_system, source_lead_id, submitted_at, landing_page, source_page,
    gclid, gbraid, wbraid, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    capture_version, created_at, record_sha256, capture_state
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const values = [
    record.source_system, record.source_lead_id, record.submitted_at, record.landing_page, record.source_page,
    record.gclid, record.gbraid, record.wbraid, record.utm_source, record.utm_medium,
    record.utm_campaign, record.utm_term, record.utm_content, record.capture_version,
    record.created_at, record.record_sha256, record.capture_state,
  ];
  insert.run(...values);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM lead_attribution_insert_audit_v1').get().count, 1);
  const audit = db.prepare('SELECT has_gclid, has_gbraid, has_wbraid FROM lead_attribution_insert_audit_v1').get();
  assert.equal(audit.has_gclid, 1);
  assert.equal(audit.has_gbraid, 0);
  assert.equal(audit.has_wbraid, 0);
  assert.throws(() => db.exec("UPDATE lead_attribution_v1 SET utm_campaign = 'changed'"), /immutable/);
  assert.throws(() => db.exec('DELETE FROM lead_attribution_v1'), /immutable/);

  const invalidPathValues = [...values];
  invalidPathValues[1] = 'lead_invalid_path';
  invalidPathValues[3] = '/pricing/?gclid=TEST-NOT-ALLOWED';
  assert.throws(() => insert.run(...invalidPathValues), /constraint/i);

  const invalidTimestampValues = [...values];
  invalidTimestampValues[1] = 'lead_invalid_timestamp';
  invalidTimestampValues[2] = '2026-08-28 17:15:00';
  assert.throws(() => insert.run(...invalidTimestampValues), /constraint/i);

  const rollbackDb = new DatabaseSync(':memory:');
  rollbackDb.exec(readFileSync(resolve('migrations/d1/0006_outcome_measurement_sidecar.sql'), 'utf8'));
  const rollbackInsert = rollbackDb.prepare(insert.sourceSQL ?? `INSERT INTO lead_attribution_v1 (
    source_system, source_lead_id, submitted_at, landing_page, source_page,
    gclid, gbraid, wbraid, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    capture_version, created_at, record_sha256, capture_state
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  rollbackDb.exec('BEGIN');
  try {
    rollbackInsert.run(...values);
    rollbackInsert.run(
      'HFLA_WEB_LEAD', 'lead_invalid_combo', record.submitted_at, '/', '/',
      null, 'TEST-GBRAID-INVALID', 'TEST-WBRAID-INVALID', null, null, null, null, null,
      record.capture_version, record.created_at, 'a'.repeat(64), 'CAPTURED',
    );
    assert.fail('invalid capture unexpectedly inserted');
  } catch {
    rollbackDb.exec('ROLLBACK');
  }
  assert.equal(rollbackDb.prepare('SELECT COUNT(*) AS count FROM lead_attribution_v1').get().count, 0);
  assert.equal(rollbackDb.prepare('SELECT COUNT(*) AS count FROM lead_attribution_insert_audit_v1').get().count, 0);
  db.close();
  rollbackDb.close();
});

test('Slice 1 source has no BCC, Google Ads, or RECEIVER-01B dependency', () => {
  const files = [
    'src/lib/outcome-measurement/contracts.ts',
    'src/lib/outcome-measurement/attribution-store.ts',
    'migrations/d1/0006_outcome_measurement_sidecar.sql',
  ];
  const source = files.map((file) => readFileSync(resolve(file), 'utf8')).join('\n').toLowerCase();
  for (const forbidden of ['receiver-01b', '5917277', '5917444', 'booking control center', 'google ads api']) {
    assert(!source.includes(forbidden));
  }
});

try {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`PASS ${name}`);
  }
  console.log(`\n${tests.length} outcome measurement Slice 1 tests passed`);
} finally {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
}
