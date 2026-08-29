#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

import { onRequest as handleLead } from '../../functions/api/lead.ts';
import { onRequest as handleQuotePagesFunction } from '../../functions/api/quote-request.ts';
import {
  AttributionIdentityConflictError,
  buildLeadAttributionRecord,
  canonicalizeJson,
  captureAttributionBestEffort,
  isOutcomeMeasurementCaptureEnabled,
  persistLeadAttributionRecord,
} from '../../src/lib/outcome-measurement/attribution-store.ts';
import { ATTRIBUTION_CAPTURE_VERSION } from '../../src/lib/outcome-measurement/contracts.ts';
import {
  buildQuoteAttributionCaptureInput,
  handleQuoteRequest,
} from '../../src/lib/quote-request/delivery.ts';
import { scanOutcomeMeasurementSecurity } from '../../scripts/scan-outcome-measurement-slice1-security.mjs';
import {
  outcomeMeasurementCoverageMutationCases,
  verifyOutcomeMeasurementCoverage,
} from '../../scripts/verify-outcome-measurement-coverage.mjs';

const tests = [];
const originalFetch = globalThis.fetch;
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
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

function jsonRequest(path, payload, additionalHeaders = {}) {
  requestCounter += 1;
  return new Request(`https://www.happyfacesla.com${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': `192.0.2.${requestCounter}`,
      'cf-ray': `slice1-${requestCounter}`,
      'user-agent': 'outcome-measurement-slice1-test',
      ...additionalHeaders,
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
  constructor({ unavailable = false, alwaysConflict = false, failureStage = null } = {}) {
    this.rows = new Map();
    this.unavailable = unavailable;
    this.alwaysConflict = alwaysConflict;
    this.failureStage = failureStage;
    this.operations = 0;
  }

  key(sourceSystem, sourceLeadId) {
    return `${sourceSystem}\u0000${sourceLeadId}`;
  }

  prepare(sql) {
    this.operations += 1;
    if (this.unavailable || this.failureStage === 'prepare') throw new Error('synthetic storage unavailable');
    const db = this;
    return {
      bind(...args) {
        if (db.failureStage === 'bind') throw new Error('synthetic bind failure');
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
            if (db.failureStage === 'run') throw new Error('synthetic asynchronous write failure');
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

async function exercisePresentBindingFailure(stage) {
  installSuccessfulFetch();
  const rawClickId = `SYNTHETIC-GCLID-D1-${stage.toUpperCase()}-DO-NOT-LOG`;
  const measurementDb = new AttributionMockD1({ failureStage: stage });
  const deferred = [];
  const logEntries = [];
  const context = {
    request: jsonRequest('/api/lead', legacyLeadPayload({ gclid: rawClickId })),
    env: {
      QUOTE_REQUEST_MAKE_WEBHOOK_URL: 'https://example.test/make',
      OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true',
      OUTCOME_MEASUREMENT_D1: measurementDb,
    },
    waitUntil(promise) {
      if (this !== context) throw new TypeError('Illegal invocation');
      deferred.push(promise);
    },
  };
  console.log = (...args) => logEntries.push(args);
  console.warn = (...args) => logEntries.push(args);
  console.error = (...args) => logEntries.push(args);
  try {
    const response = await handleLead(context);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(typeof body.leadId, 'string');
    assert(body.leadId.length > 0);
    assert.equal(fetchCalls.length, 1);
    assert.equal(deferred.length, 1);
    const [measurementResult] = await Promise.all(deferred);
    assert.deepEqual(measurementResult, {
      status: 'FAILED',
      eligible: false,
      code: 'STORAGE_ERROR',
    });
    assert.equal(measurementDb.rows.size, 0);
    const renderedLogs = JSON.stringify(logEntries);
    assert(!renderedLogs.includes(rawClickId));
    assert(renderedLogs.includes('STORAGE_ERROR'));
    assert(renderedLogs.includes('GCLID'));
    return { body, measurementResult };
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

test('capture version and feature flag are fail-closed by default', () => {
  assert.equal(ATTRIBUTION_CAPTURE_VERSION, 'ATTRIBUTION_CAPTURE_V1');
  for (const value of [undefined, '', 'false', '1', 'TRUE', 'arbitrary']) {
    assert.equal(isOutcomeMeasurementCaptureEnabled({
      OUTCOME_MEASUREMENT_CAPTURE_ENABLED: value,
    }), false);
  }
  assert.equal(isOutcomeMeasurementCaptureEnabled({ OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true' }), true);
});

for (const [field, value] of [
  ['gclid', 'TEST-GCLID-AaZz09_-%2B~.:'],
  ['gbraid', 'TEST-GBRAID-AaZz09_-%2B~.:'],
  ['wbraid', 'TEST-WBRAID-AaZz09_-%2B~.:'],
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

test('click identifiers with surrounding whitespace are rejected rather than mutated', async () => {
  const db = new AttributionMockD1();
  const warnings = [];
  const whitespaceId = ` ${'TEST-GCLID-WHITESPACE'} `;
  console.warn = (...args) => warnings.push(args);
  const result = await captureAttributionBestEffort({
    OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true',
    OUTCOME_MEASUREMENT_D1: db,
  }, attributionInput({ gclid: whitespaceId }));
  console.warn = originalWarn;
  assert.equal(result.status, 'FAILED');
  assert.equal(result.code, 'INVALID_ATTRIBUTION');
  assert.equal(db.rows.size, 0);
  assert(!JSON.stringify(warnings).includes('TEST-GCLID-WHITESPACE'));
});

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

test('RFC 8785 input validation accepts valid Unicode and rejects unpaired surrogates', async () => {
  const validA = canonicalizeJson({ value: 'valid-\u{1F642}' });
  const validB = canonicalizeJson({ value: 'valid-\u{1F642}' });
  assert.equal(validA, validB);
  for (const invalidUnicode of ['\uD800', '\uDC00', `prefix-\uD800-suffix`]) {
    assert.throws(() => canonicalizeJson({ value: invalidUnicode }), /invalid/i);
    await assert.rejects(() => buildLeadAttributionRecord(attributionInput({
      utm_campaign: invalidUnicode,
    })), /invalid/i);
  }

  const db = new AttributionMockD1();
  const warnings = [];
  const invalidClickUnicode = '\uD800';
  console.warn = (...args) => warnings.push(args);
  const result = await captureAttributionBestEffort({
    OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true',
    OUTCOME_MEASUREMENT_D1: db,
  }, attributionInput({ gclid: invalidClickUnicode }));
  console.warn = originalWarn;
  assert.equal(result.status, 'FAILED');
  assert.equal(result.code, 'INVALID_ATTRIBUTION');
  assert.equal(db.rows.size, 0);
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

test('raw, encoded, and double-encoded PII-like attribution is rejected', async () => {
  const invalidInputs = [
    { utm_campaign: 'customer@example.test' },
    { utm_campaign: 'customer%40example.test' },
    { utm_campaign: 'customer%2540example.test' },
    { utm_campaign: '3105550100' },
    { utm_campaign: '310%252D555%252D0100' },
    { landing_page: 'https://www.happyfacesla.com/customer%40example.test/' },
    { landing_page: 'https://www.happyfacesla.com/customer%2540example.test/' },
    { landing_page: 'https://www.happyfacesla.com/310%252D555%252D0100/' },
    { landing_page: 'https://www.happyfacesla.com/pricing/%3Femail%3Dcustomer%40example.test' },
    { source_page: '/pricing/%253Fphone%253D3105550100' },
    { source_page: '/pricing/%ZZ' },
    { source_page: '/pricing/%2525ZZ' },
  ];
  for (const override of invalidInputs) {
    await assert.rejects(() => buildLeadAttributionRecord(attributionInput(override)), /invalid/i);
  }
});

test('privacy-invalid measurement is discarded without losing the customer lead', async () => {
  installSuccessfulFetch();
  const measurementDb = new AttributionMockD1();
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  const { response, body } = await callLead(legacyLeadPayload({
    source_page: '/pricing/customer%2540example.test/',
    gclid: 'TEST-GCLID-PRIVACY-FAIL',
  }), {
    OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true',
    OUTCOME_MEASUREMENT_D1: measurementDb,
  });
  console.warn = originalWarn;
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(measurementDb.rows.size, 0);
  assert(!JSON.stringify(warnings).includes('customer%2540example.test'));
  assert(!JSON.stringify(warnings).includes('TEST-GCLID-PRIVACY-FAIL'));
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

test('rejected source pages and validation errors never disclose click identifiers', async () => {
  const logEntries = [];
  console.warn = (...args) => logEntries.push(args);
  console.error = (...args) => logEntries.push(args);
  const sentinels = [
    'TEST-GCLID-LOG-SENTINEL',
    'TEST-GBRAID-LOG-SENTINEL',
    'TEST-WBRAID-LOG-SENTINEL',
  ];
  const sourcePage = `/pricing/?gclid=${sentinels[0]}&gbraid=${sentinels[1]}&wbraid=${sentinels[2]}`;

  const leadResponse = await handleLead({
    request: jsonRequest('/api/lead', legacyLeadPayload({ email: '', phone: '', source_page: sourcePage }), {
      'user-agent': sentinels[0],
      'cf-ray': sentinels[1],
    }),
    env: {},
  });
  const quoteResponse = await handleQuoteRequest(jsonRequest('/api/quote-request', planMyPartyPayload({
    email: '',
    phone: '',
    source_page: sourcePage,
  }), { 'x-request-id': sentinels[2] }), { AVAILABILITY_D1: new QuoteCoreMockD1() });
  const responseText = `${await leadResponse.text()}${await quoteResponse.text()}`;
  const renderedLogs = JSON.stringify(logEntries);
  console.warn = originalWarn;
  console.error = originalError;

  assert.equal(leadResponse.status, 400);
  assert.equal(quoteResponse.status, 400);
  for (const sentinel of sentinels) {
    assert(!renderedLogs.includes(sentinel));
    assert(!responseText.includes(sentinel));
  }
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

test('present measurement binding prepare failure does not lose the customer lead', async () => {
  await exercisePresentBindingFailure('prepare');
});

test('present measurement binding bind failure does not lose the customer lead', async () => {
  await exercisePresentBindingFailure('bind');
});

test('present measurement binding asynchronous run rejection does not lose the customer lead', async () => {
  await exercisePresentBindingFailure('run');
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

test('generic lead handler invokes Cloudflare waitUntil with its context receiver', async () => {
  installSuccessfulFetch();
  const deferred = [];
  const hangingDb = {
    prepare() {
      return { bind: () => ({ first: () => new Promise(() => {}), run: () => new Promise(() => {}) }) };
    },
  };
  const context = {
    request: jsonRequest('/api/lead', legacyLeadPayload({ gclid: 'TEST-GCLID-BOUND-CONTEXT' })),
    env: {
      QUOTE_REQUEST_MAKE_WEBHOOK_URL: 'https://example.test/make',
      OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true',
      OUTCOME_MEASUREMENT_D1: hangingDb,
    },
    waitUntil(promise) {
      if (this !== context) throw new TypeError('Illegal invocation');
      deferred.push(promise);
    },
  };
  const response = await handleLead(context);
  const body = await response.json();
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

test('Plan My Party preserves every click-ID domain as an opaque value', async () => {
  for (const [field, value] of [
    ['gclid', 'TEST-GCLID-PLAN-Aa_%2B~.:'],
    ['gbraid', 'TEST-GBRAID-PLAN-Aa_%2B~.:'],
    ['wbraid', 'TEST-WBRAID-PLAN-Aa_%2B~.:'],
  ]) {
    installSuccessfulFetch();
    const coreDb = new QuoteCoreMockD1();
    const measurementDb = new AttributionMockD1();
    const identifiers = {
      gclid: null,
      gbraid: null,
      wbraid: null,
      submit_gclid: null,
      submit_gbraid: null,
      submit_wbraid: null,
      [field]: value,
      [`submit_${field}`]: value,
    };
    const { response } = await callQuote(planMyPartyPayload(identifiers), coreDb, {
      OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true',
      OUTCOME_MEASUREMENT_D1: measurementDb,
    });
    assert.equal(response.status, 200);
    assert.equal(Array.from(measurementDb.rows.values())[0][field], value);
  }
});

test('the sidecar mapper selects one complete attribution touch without field mixing', () => {
  const mapped = buildQuoteAttributionCaptureInput({
    leadId: 'lead_atomic_touch_test',
    createdAt: '2026-08-28T18:00:00.000Z',
    sourcePage: '/plan-my-party/',
    landingPage: '/first/',
    sourcePath: '/first/',
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    gclid: null,
    gbraid: 'TEST-GBRAID-FIRST-ONLY',
    wbraid: null,
    submitLandingPage: '/plan-my-party/',
    submitSourcePath: '/plan-my-party/',
    submitUtmSource: 'google',
    submitUtmMedium: 'cpc',
    submitUtmCampaign: null,
    submitUtmTerm: null,
    submitUtmContent: null,
    submitGclid: 'TEST-GCLID-SUBMIT-ONLY',
    submitGbraid: null,
    submitWbraid: null,
  });
  assert.equal(mapped.gclid, 'TEST-GCLID-SUBMIT-ONLY');
  assert.equal(mapped.gbraid, null);
  assert.equal(mapped.wbraid, null);
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

test('Plan My Party wrapper delivers after a present sidecar binding rejects its write', async () => {
  installSuccessfulFetch();
  const coreDb = new QuoteCoreMockD1();
  const measurementDb = new AttributionMockD1({ failureStage: 'run' });
  const deferred = [];
  const logEntries = [];
  const rawClickId = 'SYNTHETIC-GBRAID-QUOTE-WRITE-DO-NOT-LOG';
  const context = {
    request: jsonRequest('/api/quote-request', planMyPartyPayload({
      gclid: null,
      submit_gclid: null,
      gbraid: rawClickId,
      submit_gbraid: rawClickId,
    })),
    env: {
      AVAILABILITY_D1: coreDb,
      QUOTE_REQUEST_MAKE_WEBHOOK_URL: 'https://example.test/make',
      OUTCOME_MEASUREMENT_CAPTURE_ENABLED: 'true',
      OUTCOME_MEASUREMENT_D1: measurementDb,
    },
    waitUntil(promise) {
      if (this !== context) throw new TypeError('Illegal invocation');
      deferred.push(promise);
    },
  };
  console.log = (...args) => logEntries.push(args);
  console.warn = (...args) => logEntries.push(args);
  console.error = (...args) => logEntries.push(args);
  try {
    const response = await handleQuotePagesFunction(context);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.persisted, true);
    assert.equal(coreDb.byLeadId.size, 1);
    assert.equal(fetchCalls.length, 1);
    assert.equal(deferred.length, 1);
    const [measurementResult] = await Promise.all(deferred);
    assert.equal(measurementResult.status, 'FAILED');
    assert.equal(measurementResult.eligible, false);
    assert.equal(measurementResult.code, 'STORAGE_ERROR');
    assert.equal(measurementDb.rows.size, 0);
    const renderedLogs = JSON.stringify(logEntries);
    assert(!renderedLogs.includes(rawClickId));
    assert(renderedLogs.includes('STORAGE_ERROR'));
    assert(renderedLogs.includes('GBRAID'));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
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

test('Cloudflare Pages wrapper preserves the waitUntil receiver for every sidecar outcome', async () => {
  const scenarios = [
    { name: 'feature-off', enabled: undefined, db: new AttributionMockD1(), payload: {} },
    { name: 'capture-success', enabled: 'true', db: new AttributionMockD1(), payload: {} },
    { name: 'storage-unavailable', enabled: 'true', db: undefined, payload: {} },
    { name: 'identity-conflict', enabled: 'true', db: new AttributionMockD1({ alwaysConflict: true }), payload: {} },
    {
      name: 'quarantine',
      enabled: 'true',
      db: new AttributionMockD1(),
      payload: {
        gclid: null,
        submit_gclid: null,
        submit_gbraid: 'TEST-GBRAID-WRAPPER-Q',
        submit_wbraid: 'TEST-WBRAID-WRAPPER-Q',
      },
    },
    {
      name: 'hanging',
      enabled: 'true',
      db: {
        prepare() {
          return { bind: () => ({ first: () => new Promise(() => {}), run: () => new Promise(() => {}) }) };
        },
      },
      payload: {},
    },
  ];

  for (const scenario of scenarios) {
    installSuccessfulFetch();
    const coreDb = new QuoteCoreMockD1();
    const deferred = [];
    const context = {
      request: jsonRequest('/api/quote-request', planMyPartyPayload(scenario.payload)),
      env: {
        AVAILABILITY_D1: coreDb,
        QUOTE_REQUEST_MAKE_WEBHOOK_URL: 'https://example.test/make',
        OUTCOME_MEASUREMENT_CAPTURE_ENABLED: scenario.enabled,
        OUTCOME_MEASUREMENT_D1: scenario.db,
      },
      waitUntil(promise) {
        if (this !== context) throw new TypeError('Illegal invocation');
        deferred.push(promise);
      },
    };
    const response = await handleQuotePagesFunction(context);
    const body = await response.json();
    assert.equal(response.status, 200, scenario.name);
    assert.equal(body.ok, true, scenario.name);
    assert.equal(coreDb.byLeadId.size, 1, scenario.name);
    assert.equal(fetchCalls.length, 1, scenario.name);
    assert.equal(deferred.length, scenario.enabled === 'true' ? 1 : 0, scenario.name);
  }
});

test('coverage verifier passes every approved production lead route end to end', async () => {
  const result = await verifyOutcomeMeasurementCoverage();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.verifier, 'OUTCOME_MEASUREMENT_COVERAGE_V3_EXECUTABLE_DATA_FLOW');
  assert(!JSON.stringify(result).includes('SENTINEL'));
  assert.equal(result.routes.length, 4);
  for (const row of result.routes) {
    assert.equal(row.gclid_end_to_end, 'PASS');
    assert.equal(row.gbraid_end_to_end, 'PASS');
    assert.equal(row.wbraid_end_to_end, 'PASS');
    assert.equal(row.source_lead_id, 'PASS');
    assert.equal(row.submitted_at, 'PASS');
    assert.equal(row.atomic_touch, 'PASS');
    assert.deepEqual(row.problems, []);
  }
});

test('executable coverage verifier rejects every bounded production-stage mutation', async () => {
  const cases = outcomeMeasurementCoverageMutationCases();
  assert.deepEqual(cases.map((item) => item.name), [
    'browser_serialization_gbraid_drop',
    'browser_late_overwrite_gbraid_drop',
    'lead_parser_gbraid_drop',
    'quote_parser_gbraid_drop',
    'storage_mapper_gbraid_drop',
    'browser_wbraid_drop',
    'browser_gclid_drop',
    'mixed_touch_assembly',
  ]);
  for (const mutationCase of cases) {
    const result = await verifyOutcomeMeasurementCoverage({ mutations: mutationCase.mutations });
    assert.equal(result.ok, false, mutationCase.name);
    assert(result.routes.some((row) => row.problems.length > 0), mutationCase.name);
    assert(!JSON.stringify(result).includes('SENTINEL'), mutationCase.name);
  }
});

test('local D1-compatible migration applies cleanly with exact isolated schema', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE existing_application_table (id TEXT PRIMARY KEY); INSERT INTO existing_application_table VALUES (\'preserved\');');
  const migration = readFileSync(resolve('migrations/outcome-measurement-slice1/0001_outcome_measurement_sidecar.sql'), 'utf8');
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

test('local Wrangler migration source admits only the isolated Slice 1 migration', () => {
  const directory = resolve('migrations/outcome-measurement-slice1');
  assert.deepEqual(readdirSync(directory).sort(), ['0001_outcome_measurement_sidecar.sql']);
  const isolated = readFileSync(resolve(directory, '0001_outcome_measurement_sidecar.sql'));
  const authoritative = readFileSync(resolve('migrations/d1/0006_outcome_measurement_sidecar.sql'));
  assert.deepEqual(isolated, authoritative);
  const config = readFileSync(resolve('wrangler.outcome-measurement.local.toml'), 'utf8');
  assert(config.includes('migrations_dir = "migrations/outcome-measurement-slice1"'));
  assert(!config.includes('migrations_dir = "migrations/d1"'));
  assert(!readdirSync(directory).some((name) => name.startsWith('0005')));
});

test('local migration enforces atomic insert, audit, immutability, and rollback', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(resolve('migrations/outcome-measurement-slice1/0001_outcome_measurement_sidecar.sql'), 'utf8'));
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
  rollbackDb.exec(readFileSync(resolve('migrations/outcome-measurement-slice1/0001_outcome_measurement_sidecar.sql'), 'utf8'));
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

test('security scanner executes against itself and fails on an injected secret', () => {
  const clean = scanOutcomeMeasurementSecurity();
  assert.equal(clean.ok, true, JSON.stringify(clean));
  assert.equal(clean.self_scanned, true);
  assert.match(clean.scanner_sha256, /^[0-9a-f]{64}$/);
  assert.match(clean.scan_input_sha256, /^[0-9a-f]{64}$/);

  const syntheticSecret = ['sk', 'live', 'ABCDEFGHIJKLMN'].join('_');
  const injected = scanOutcomeMeasurementSecurity({
    additionalSources: { 'synthetic-injected-secret.fixture': `const token = '${syntheticSecret}';` },
  });
  assert.equal(injected.ok, false);
  assert(injected.findings.some((finding) => finding.rule === 'stripe_live_secret'));
  assert(!JSON.stringify(injected).includes(syntheticSecret));
});

test('network evidence guard loads and blocks an external probe before network', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'hfla-slice1-network-'));
  try {
    const log = resolve(temporary, 'guard.jsonl');
    const guardUrl = pathToFileURL(resolve('scripts/outcome-measurement-network-guard.mjs')).href;
    const result = spawnSync(process.execPath, ['tests/security/outcome-measurement-network-guard.mjs'], {
      cwd: resolve('.'),
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import=${guardUrl}`.trim(),
        OUTCOME_MEASUREMENT_NETWORK_GUARD_LOG: log,
      },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const entries = readFileSync(log, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert(entries.some((entry) => entry.type === 'loaded'));
    assert(entries.some((entry) => entry.type === 'blocked' && entry.surface === 'fetch'));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('evidence generator binds executed exact-head results and has no declared zero-network PASS', () => {
  const source = readFileSync(resolve('scripts/generate-outcome-measurement-slice1-evidence.mjs'), 'utf8');
  assert(source.includes('command_sha256'));
  assert(source.includes('result_sha256'));
  assert(source.includes('network_guard_loaded'));
  assert(source.includes('instrumented_external_attempts'));
  assert(!source.includes('network_runtime_calls: 0'));
  assert(!source.includes('uninstrumented_zero_network_claim: true'));
  assert(!/local_d1:\s*'PASS'/.test(source));
  assert(!/release_build:\s*'PASS'/.test(source));
});

test('Slice 1 source has no BCC, Google Ads, or RECEIVER-01B dependency', () => {
  const files = [
    'functions/api/lead.ts',
    'src/lib/outcome-measurement/contracts.ts',
    'src/lib/outcome-measurement/attribution-store.ts',
    'src/lib/outcome-measurement/browser-route.ts',
    'src/lib/quote-request/delivery.ts',
    'src/components/conversion/QuoteForm.astro',
    'src/components/wizard/WizardShell.astro',
    'src/pages/packages.astro',
    'src/pages/hire-face-painter-los-angeles.astro',
    'migrations/d1/0006_outcome_measurement_sidecar.sql',
    'migrations/outcome-measurement-slice1/0001_outcome_measurement_sidecar.sql',
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
  console.error = originalError;
}
