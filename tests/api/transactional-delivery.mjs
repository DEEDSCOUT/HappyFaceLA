#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildCanonicalLead } from '../../src/lib/quote-request/canonical-lead.ts';
import {
  deliverPersistedQuoteRequest,
  parseVerifiedCrmAcknowledgement,
  reconcileDueQuoteRequestDeliveries,
} from '../../src/lib/quote-request/transactional-delivery.ts';

const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;
const tests = [];
let fetchCalls = [];
let responders = new Map();

function test(name, fn) {
  tests.push({ name, fn });
}

function canonicalLead(leadId = 'lead_testabc123') {
  return buildCanonicalLead({
    endpoint: 'quote-request',
    leadId,
    createdAt: '2026-08-20T19:00:00.000Z',
    sourcePage: '/plan-my-party/',
    landingPage: 'https://www.happyfacesla.com/plan-my-party/',
    sourcePath: '/plan-my-party/',
    referrer: 'https://www.google.com/',
    firstLandingPage: 'https://www.happyfacesla.com/?gclid=test',
    firstSourcePath: '/',
    firstReferrer: 'https://www.google.com/',
    submitLandingPage: 'https://www.happyfacesla.com/plan-my-party/',
    submitSourcePath: '/plan-my-party/',
    submitReferrer: 'https://www.happyfacesla.com/',
    firstName: 'Alex',
    lastName: 'Rivera',
    email: 'alex@example.com',
    phone: '310-555-0100',
    preferredContactMethod: 'text',
    eventType: 'birthday-party',
    eventDate: '2026-09-12',
    startTime: '14:00',
    eventCity: 'Los Angeles',
    venueOrAddress: 'Park',
    services: ['face-painting'],
    childCountBucket: '11-18',
    childCountActual: 12,
    designStyle: 'quick-cheek-arm',
    selectedDurationMinutes: 90,
    recommendedDurationMinutes: 90,
    serviceWindowMinutes: 90,
    requiredArtistCount: 1,
    travelMiles: 8,
    hasExactAddress: false,
    quoteClassification: 'custom-quote-required',
    recommendationSummary: null,
    systemEstimatedTotalCents: null,
    systemRetainerCents: null,
    pricingModel: null,
    customerBudgetRaw: null,
    notes: 'Please send options.',
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: 'safe-test',
    utmTerm: 'face painter',
    utmContent: 'test-ad',
    gclid: 'test-gclid-private',
    gbraid: null,
    wbraid: null,
    fbclid: null,
    msclkid: null,
    firstUtmSource: 'google',
    firstUtmMedium: 'cpc',
    firstUtmCampaign: 'safe-test',
    firstUtmTerm: 'face painter',
    firstUtmContent: 'test-ad',
    firstGclid: 'test-gclid-private',
    firstGbraid: null,
    firstWbraid: null,
    submitUtmSource: 'google',
    submitUtmMedium: 'cpc',
    submitUtmCampaign: 'safe-test',
    submitUtmTerm: 'face painter',
    submitUtmContent: 'test-ad',
    submitGclid: 'test-gclid-private',
    submitGbraid: null,
    submitWbraid: null,
    consentAcknowledgement: true,
  });
}

class MockDeliveryD1 {
  constructor(canonical = canonicalLead()) {
    this.quoteRows = new Map();
    this.deliveryRows = new Map();
    this.addCanonical(canonical);
  }

  addCanonical(canonical) {
    this.quoteRows.set(canonical.leadId, {
      lead_id: canonical.leadId,
      canonical_payload_json: JSON.stringify(canonical),
      owner_notification_sent: 0,
      sheet_written: 0,
      crm_posted: 0,
      delivery_status: 'persisted_internal_queue',
    });
  }

  key(leadId, destination) {
    return `${leadId}|${destination}`;
  }

  rowsForLead(leadId) {
    return Array.from(this.deliveryRows.values())
      .filter((row) => row.lead_id === leadId)
      .map((row) => ({ ...row }));
  }

  prepare(sql) {
    const db = this;
    return {
      bind(...args) {
        return {
          async first() {
            if (sql.includes('canonical_payload_json') && sql.includes('FROM quote_requests')) {
              const row = db.quoteRows.get(args[0]);
              return row ? { lead_id: row.lead_id, canonical_payload_json: row.canonical_payload_json } : null;
            }
            return null;
          },
          async all() {
            if (sql.includes('FROM quote_request_delivery_outbox') && sql.includes('WHERE lead_id = ?')) {
              return { success: true, results: db.rowsForLead(args[0]) };
            }
            if (sql.includes('SELECT DISTINCT q.lead_id')) {
              const now = args[0];
              const excluded = args[2];
              const limit = Number(args[4]);
              const seen = new Set();
              const results = [];
              for (const row of db.deliveryRows.values()) {
                const due =
                  ((row.status === 'pending' || row.status === 'retry') && (!row.next_attempt_at_utc || row.next_attempt_at_utc <= now)) ||
                  (row.status === 'processing' && row.next_attempt_at_utc && row.next_attempt_at_utc <= now);
                if (!due || row.lead_id === excluded || seen.has(row.lead_id)) continue;
                seen.add(row.lead_id);
                results.push({ lead_id: row.lead_id });
                if (results.length >= limit) break;
              }
              return { success: true, results };
            }
            if (sql.includes('GROUP BY status')) {
              const counts = new Map();
              for (const row of db.deliveryRows.values()) {
                counts.set(row.status, (counts.get(row.status) || 0) + 1);
              }
              return {
                success: true,
                results: Array.from(counts.entries()).map(([status, count]) => ({ status, count })),
              };
            }
            return { success: true, results: [] };
          },
          async run() {
            if (sql.trim().startsWith('INSERT INTO quote_request_delivery_outbox')) {
              const [leadId, destination, createdAt, updatedAt] = args;
              const key = db.key(leadId, destination);
              if (!db.deliveryRows.has(key)) {
                db.deliveryRows.set(key, {
                  lead_id: leadId,
                  destination,
                  status: 'pending',
                  attempt_count: 0,
                  last_attempt_at_utc: null,
                  next_attempt_at_utc: null,
                  delivered_at_utc: null,
                  last_http_status: null,
                  last_error_code: null,
                  last_error_message: null,
                  acknowledged_external_lead_id: null,
                  acknowledged_internal_lead_id: null,
                  created_at_utc: createdAt,
                  updated_at_utc: updatedAt,
                });
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 0 } };
            }

            if (sql.includes("SET status = 'processing'")) {
              const leadId = args[3];
              const destination = args[4];
              const row = db.deliveryRows.get(db.key(leadId, destination));
              if (!row || row.status === 'delivered') return { success: true, meta: { changes: 0 } };
              const now = args[0];
              const forceQuery = sql.includes("'dead_letter'");
              const due =
                forceQuery ||
                row.status === 'pending' ||
                (row.status === 'retry' && (!row.next_attempt_at_utc || row.next_attempt_at_utc <= now)) ||
                (row.status === 'processing' && row.next_attempt_at_utc && row.next_attempt_at_utc <= now);
              if (!due) return { success: true, meta: { changes: 0 } };
              row.status = 'processing';
              row.attempt_count += 1;
              row.last_attempt_at_utc = args[0];
              row.next_attempt_at_utc = args[1];
              row.updated_at_utc = args[2];
              return { success: true, meta: { changes: 1 } };
            }

            if (sql.includes('acknowledged_external_lead_id = ?')) {
              const row = db.deliveryRows.get(db.key(args[9], args[10]));
              assert(row, 'delivery row must exist before recording attempt');
              row.status = args[0];
              row.next_attempt_at_utc = args[1];
              row.delivered_at_utc = args[2];
              row.last_http_status = args[3];
              row.last_error_code = args[4];
              row.last_error_message = args[5];
              row.acknowledged_external_lead_id = args[6];
              row.acknowledged_internal_lead_id = args[7];
              row.updated_at_utc = args[8];
              return { success: true, meta: { changes: 1 } };
            }

            if (sql.includes('UPDATE quote_requests') && sql.includes('owner_notification_sent')) {
              const row = db.quoteRows.get(args[5]);
              assert(row, 'quote row must exist for compatibility flag update');
              row.delivery_status = args[1];
              row.owner_notification_sent = args[2];
              row.sheet_written = args[3];
              row.crm_posted = args[4];
              return { success: true, meta: { changes: 1 } };
            }

            if (sql.includes("SET status = 'retry'") && sql.includes("status = 'dead_letter'")) {
              const leadId = args[2];
              const destination = args.length === 4 ? args[3] : null;
              let changes = 0;
              for (const row of db.deliveryRows.values()) {
                if (row.lead_id !== leadId || row.status !== 'dead_letter') continue;
                if (destination && row.destination !== destination) continue;
                row.status = 'retry';
                row.next_attempt_at_utc = args[0];
                row.last_error_code = null;
                row.last_error_message = null;
                row.updated_at_utc = args[1];
                changes += 1;
              }
              return { success: true, meta: { changes } };
            }

            return { success: true, meta: { changes: 0 } };
          },
        };
      },
    };
  }
}

function resetFetch() {
  fetchCalls = [];
  responders = new Map();
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), init, body: typeof init.body === 'string' ? init.body : '' };
    fetchCalls.push(call);
    const responder = responders.get(String(url));
    if (!responder) return new Response('{}', { status: 404 });
    return responder(call);
  };
}

function respond(url, fn) {
  responders.set(url, fn);
}

function crmAck(call, overrides = {}) {
  const envelope = JSON.parse(call.body);
  const payload = JSON.parse(envelope.payload_json);
  return new Response(JSON.stringify({
    ok: true,
    verified: true,
    system: 'booking-control-center',
    sheet: '01_LEADS',
    externalLeadId: payload.external_lead_id,
    internalLeadId: 'LEAD-REAL-20260820-999',
    ...overrides,
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function makeOk() {
  return new Response(JSON.stringify({ accepted: true }), { status: 200 });
}

function makeDue(db, leadId, destination) {
  const row = db.deliveryRows.get(db.key(leadId, destination));
  assert(row);
  row.next_attempt_at_utc = '2000-01-01T00:00:00.000Z';
}

test('CRM acknowledgement parser rejects generic 2xx-style ok:true response', () => {
  const result = parseVerifiedCrmAcknowledgement(JSON.stringify({ ok: true }), 'lead_testabc123');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'crm_ack_unverified');
});

test('CRM acknowledgement parser requires the exact external lead identity', () => {
  const result = parseVerifiedCrmAcknowledgement(JSON.stringify({
    ok: true,
    verified: true,
    system: 'booking-control-center',
    sheet: '01_LEADS',
    externalLeadId: 'lead_other',
    internalLeadId: 'LEAD-REAL-20260820-999',
  }), 'lead_testabc123');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'crm_ack_lead_mismatch');
});

test('Make webhook success never implies CRM or Sheet success', async () => {
  resetFetch();
  respond('https://make.test/hook', () => makeOk());
  const db = new MockDeliveryD1();
  const result = await deliverPersistedQuoteRequest(db, 'lead_testabc123', {
    QUOTE_REQUEST_MAKE_WEBHOOK_URL: 'https://make.test/hook',
  });
  assert.equal(result.ownerNotificationSent, true);
  assert.equal(result.crmPosted, false);
  assert.equal(result.sheetWritten, false);
  assert.deepEqual(result.deliveredDestinations, ['make']);
  assert.equal(db.quoteRows.get('lead_testabc123').crm_posted, 0);
  assert.equal(db.quoteRows.get('lead_testabc123').sheet_written, 0);
});

test('generic CRM HTTP 200 is retryable while Make can succeed independently', async () => {
  resetFetch();
  respond('https://crm.test/hook', () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  respond('https://make.test/hook', () => makeOk());
  const db = new MockDeliveryD1();
  const result = await deliverPersistedQuoteRequest(db, 'lead_testabc123', {
    QUOTE_REQUEST_CRM_WEBHOOK_URL: 'https://crm.test/hook',
    QUOTE_REQUEST_CRM_WEBHOOK_SECRET: 'test-secret',
    QUOTE_REQUEST_MAKE_WEBHOOK_URL: 'https://make.test/hook',
  });
  assert.equal(result.crmPosted, false);
  assert.equal(result.sheetWritten, false);
  assert.equal(result.ownerNotificationSent, true);
  assert.deepEqual(result.retryDestinations, ['crm']);
  const crmRow = db.deliveryRows.get(db.key('lead_testabc123', 'crm'));
  assert.equal(crmRow.status, 'retry');
  assert.equal(crmRow.last_error_code, 'crm_ack_unverified');
});

test('verified Booking Control Center acknowledgement marks CRM and sheet compatibility flags', async () => {
  resetFetch();
  respond('https://crm.test/hook', (call) => crmAck(call));
  const db = new MockDeliveryD1();
  const result = await deliverPersistedQuoteRequest(db, 'lead_testabc123', {
    QUOTE_REQUEST_CRM_WEBHOOK_URL: 'https://crm.test/hook',
    QUOTE_REQUEST_CRM_WEBHOOK_SECRET: 'test-secret',
  });
  assert.equal(result.crmPosted, true);
  assert.equal(result.sheetWritten, true);
  assert.equal(result.ownerNotificationSent, false);
  const crmRow = db.deliveryRows.get(db.key('lead_testabc123', 'crm'));
  assert.equal(crmRow.status, 'delivered');
  assert.equal(crmRow.acknowledged_external_lead_id, 'lead_testabc123');
  assert.equal(crmRow.acknowledged_internal_lead_id, 'LEAD-REAL-20260820-999');
  assert.equal(db.quoteRows.get('lead_testabc123').crm_posted, 1);
  assert.equal(db.quoteRows.get('lead_testabc123').sheet_written, 1);
  const envelope = JSON.parse(fetchCalls[0].body);
  assert.equal(envelope.contract_version, 'hfla-booking-control-center-v1');
  assert.match(envelope.signature_sha256, /^[a-f0-9]{64}$/);
  const sentPayload = JSON.parse(envelope.payload_json);
  assert.equal(sentPayload.external_lead_id, 'lead_testabc123');
  assert.equal(sentPayload.event, 'lead_intake');
});

test('wrong CRM external lead acknowledgement is not accepted', async () => {
  resetFetch();
  respond('https://crm.test/hook', (call) => crmAck(call, { externalLeadId: 'lead_wrong' }));
  const db = new MockDeliveryD1();
  const result = await deliverPersistedQuoteRequest(db, 'lead_testabc123', {
    QUOTE_REQUEST_CRM_WEBHOOK_URL: 'https://crm.test/hook',
    QUOTE_REQUEST_CRM_WEBHOOK_SECRET: 'test-secret',
  });
  assert.equal(result.crmPosted, false);
  assert.deepEqual(result.retryDestinations, ['crm']);
  assert.equal(db.deliveryRows.get(db.key('lead_testabc123', 'crm')).last_error_code, 'crm_ack_lead_mismatch');
});

test('missing CRM delivery retries later without creating a second persisted lead', async () => {
  resetFetch();
  let crmAttempt = 0;
  respond('https://crm.test/hook', (call) => {
    crmAttempt += 1;
    return crmAttempt === 1
      ? new Response(JSON.stringify({ ok: true }), { status: 200 })
      : crmAck(call);
  });
  const db = new MockDeliveryD1();
  const env = {
    QUOTE_REQUEST_CRM_WEBHOOK_URL: 'https://crm.test/hook',
    QUOTE_REQUEST_CRM_WEBHOOK_SECRET: 'test-secret',
  };
  const first = await deliverPersistedQuoteRequest(db, 'lead_testabc123', env);
  assert.equal(first.crmPosted, false);
  assert.equal(db.quoteRows.size, 1);
  makeDue(db, 'lead_testabc123', 'crm');
  const second = await deliverPersistedQuoteRequest(db, 'lead_testabc123', env);
  assert.equal(second.crmPosted, true);
  assert.equal(crmAttempt, 2);
  assert.equal(db.quoteRows.size, 1);
  assert.equal(db.deliveryRows.get(db.key('lead_testabc123', 'crm')).attempt_count, 2);
});

test('reconciliation processes due delivery rows and verifies CRM write', async () => {
  resetFetch();
  respond('https://crm.test/hook', (call) => crmAck(call));
  const db = new MockDeliveryD1();
  const env = {
    QUOTE_REQUEST_CRM_WEBHOOK_URL: 'https://crm.test/hook',
    QUOTE_REQUEST_CRM_WEBHOOK_SECRET: 'test-secret',
  };
  await db.prepare(`INSERT INTO quote_request_delivery_outbox (
    lead_id, destination, status, attempt_count, created_at_utc, updated_at_utc
  ) VALUES (?, ?, 'pending', 0, ?, ?) ON CONFLICT(lead_id, destination) DO NOTHING`)
    .bind('lead_testabc123', 'crm', '2000-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z').run();
  const result = await reconcileDueQuoteRequestDeliveries(db, env, { limit: 3 });
  assert.deepEqual(result.processedLeadIds, ['lead_testabc123']);
  assert.equal(db.deliveryRows.get(db.key('lead_testabc123', 'crm')).status, 'delivered');
});

test('repeated CRM failures transition to dead letter on sixth attempt', async () => {
  resetFetch();
  respond('https://crm.test/hook', () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const db = new MockDeliveryD1();
  const env = {
    QUOTE_REQUEST_CRM_WEBHOOK_URL: 'https://crm.test/hook',
    QUOTE_REQUEST_CRM_WEBHOOK_SECRET: 'test-secret',
  };
  console.error = () => {};
  try {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await deliverPersistedQuoteRequest(db, 'lead_testabc123', env);
      const row = db.deliveryRows.get(db.key('lead_testabc123', 'crm'));
      if (attempt < 6) makeDue(db, 'lead_testabc123', 'crm');
      else assert.equal(row.status, 'dead_letter');
    }
  } finally {
    console.error = originalConsoleError;
  }
  const row = db.deliveryRows.get(db.key('lead_testabc123', 'crm'));
  assert.equal(row.attempt_count, 6);
  assert.equal(row.status, 'dead_letter');
});

test('delivery migration creates child state only and never alters quote_requests', () => {
  const sql = fs.readFileSync('migrations/d1/0006_quote_request_delivery_outbox.sql', 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS quote_request_delivery_outbox/);
  assert.match(sql, /PRIMARY KEY \(lead_id, destination\)/);
  assert.match(sql, /'processing'/);
  assert.doesNotMatch(sql, /ALTER\s+TABLE\s+quote_requests/i);
  assert.doesNotMatch(sql, /UPDATE\s+quote_requests/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+quote_requests/i);
});

try {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`PASS ${name}`);
  }
  console.log(`\n${tests.length} transactional delivery tests passed`);
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
}
