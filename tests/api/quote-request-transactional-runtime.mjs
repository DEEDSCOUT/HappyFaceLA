#!/usr/bin/env node
import assert from 'node:assert/strict';

import { onRequest as handleRuntimeQuoteRequest } from '../../functions/api/quote-request.ts';

const originalFetch = globalThis.fetch;
const tests = [];
let responders = new Map();
let calls = [];

function test(name, fn) {
  tests.push({ name, fn });
}

class RuntimeMockD1 {
  constructor() {
    this.quoteRows = new Map();
    this.byIdempotency = new Map();
    this.deliveryRows = new Map();
  }

  deliveryKey(leadId, destination) {
    return `${leadId}|${destination}`;
  }

  deliveryRowsForLead(leadId) {
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
            if (sql.includes('WHERE idempotency_key')) {
              const row = db.byIdempotency.get(args[0]);
              if (!row) return null;
              return {
                lead_id: row.lead_id,
                owner_notification_queued: row.owner_notification_queued ?? 1,
                owner_notification_sent: row.owner_notification_sent ?? 0,
                sheet_written: row.sheet_written ?? 0,
                crm_posted: row.crm_posted ?? 0,
              };
            }
            if (sql.includes('canonical_payload_json') && sql.includes('FROM quote_requests')) {
              const row = db.quoteRows.get(args[0]);
              return row
                ? { lead_id: row.lead_id, canonical_payload_json: row.canonical_payload_json }
                : null;
            }
            return null;
          },

          async all() {
            if (sql.includes('FROM quote_request_delivery_outbox') && sql.includes('WHERE lead_id = ?')) {
              return { success: true, results: db.deliveryRowsForLead(args[0]) };
            }
            if (sql.includes('SELECT DISTINCT q.lead_id')) {
              const now = args[0];
              const excluded = args[2];
              const limit = Number(args[4]);
              const results = [];
              const seen = new Set();
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
            if (sql.trim().startsWith('INSERT INTO quote_requests')) {
              const columns = sql
                .slice(sql.indexOf('(') + 1, sql.indexOf(') VALUES'))
                .split(',')
                .map((column) => column.trim());
              const row = Object.fromEntries(columns.map((column, index) => [column, args[index]]));
              if (db.byIdempotency.has(row.idempotency_key)) throw new Error('UNIQUE constraint failed');
              row.owner_notification_queued = row.owner_notification_queued ?? 1;
              row.owner_notification_sent = row.owner_notification_sent ?? 0;
              row.sheet_written = row.sheet_written ?? 0;
              row.crm_posted = row.crm_posted ?? 0;
              db.quoteRows.set(row.lead_id, row);
              db.byIdempotency.set(row.idempotency_key, row);
              return { success: true, meta: { changes: 1 } };
            }

            if (sql.trim().startsWith('INSERT INTO quote_request_delivery_outbox')) {
              const [leadId, destination, createdAt, updatedAt] = args;
              const key = db.deliveryKey(leadId, destination);
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
              const row = db.deliveryRows.get(db.deliveryKey(leadId, destination));
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
              const row = db.deliveryRows.get(db.deliveryKey(args[9], args[10]));
              assert(row, 'delivery row must exist before attempt result is recorded');
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
              assert(row, 'quote row must exist for compatibility update');
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
  calls = [];
  responders = new Map();
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), init, body: typeof init.body === 'string' ? init.body : '' };
    calls.push(call);
    const responder = responders.get(String(url));
    if (!responder) return new Response('{}', { status: 404 });
    return responder(call);
  };
}

function respond(url, responder) {
  responders.set(url, responder);
}

function verifiedCrmAck(call) {
  const envelope = JSON.parse(call.body);
  const payload = JSON.parse(envelope.payload_json);
  return new Response(JSON.stringify({
    ok: true,
    verified: true,
    system: 'booking-control-center',
    sheet: '01_LEADS',
    externalLeadId: payload.external_lead_id,
    internalLeadId: 'LEAD-REAL-20260820-777',
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function requestFor(payload) {
  return new Request('https://www.happyfacesla.com/api/quote-request', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'transactional-runtime-test',
      'cf-ray': 'runtime-test-ray',
      'referer': 'https://www.happyfacesla.com/plan-my-party/',
    },
    body: JSON.stringify(payload),
  });
}

const payload = {
  eventType: 'birthday-party',
  services: ['face-painting'],
  kidsCountBucket: '11-18',
  kidsCountActual: 12,
  designStyle: 'standard-party',
  selectedDurationMinutes: 120,
  recommendedDurationMinutes: 120,
  branch: 'standard-party',
  quoteOutcome: 'custom-quote-required',
  eventDate: '2026-08-29',
  eventTime: '14:00',
  eventCity: 'Los Angeles',
  venueName: 'Park',
  travelMiles: 8,
  firstName: 'Runtime',
  lastName: 'Retry',
  email: 'runtime@example.com',
  phone: '310-555-0100',
  specialRequests: 'Transactional retry test.',
  quoteRequestIdempotencyKey: 'qrq_runtime-retry-1234567890',
  consentAcknowledgement: true,
  lookbook_inspirations: [],
  wizardVersion: 'guided-wizard-v1',
  submittedAt: '2026-08-20T19:00:00.000Z',
  preferredContactMethod: 'email',
  source_page: '/plan-my-party/',
  utm_source: 'google',
  utm_medium: 'cpc',
  gclid: 'runtime-private-gclid',
};

async function submit(db, envOverrides = {}) {
  const response = await handleRuntimeQuoteRequest({
    request: requestFor(payload),
    env: {
      QUOTE_REQUESTS_D1: db,
      ...envOverrides,
    },
  });
  return { response, body: await response.json() };
}

test('duplicate browser submit retries failed CRM immediately without creating a second persisted lead', async () => {
  resetFetch();
  let crmAttempts = 0;
  respond('https://crm.test/hook', (call) => {
    crmAttempts += 1;
    return crmAttempts === 1
      ? new Response(JSON.stringify({ ok: true }), { status: 200 })
      : verifiedCrmAck(call);
  });

  const db = new RuntimeMockD1();
  const env = {
    QUOTE_REQUEST_CRM_WEBHOOK_URL: 'https://crm.test/hook',
    QUOTE_REQUEST_CRM_WEBHOOK_SECRET: 'test-secret',
  };

  const first = await submit(db, env);
  assert.equal(first.response.status, 200);
  assert.equal(first.body.persisted, true);
  assert.equal(first.body.duplicate, false);
  assert.equal(first.body.crmPosted, false);
  assert.equal(db.quoteRows.size, 1);

  const leadId = first.body.leadId;
  const retryRow = db.deliveryRows.get(db.deliveryKey(leadId, 'crm'));
  assert.equal(retryRow.status, 'retry');
  assert.equal(retryRow.attempt_count, 1);

  const second = await submit(db, env);
  assert.equal(second.response.status, 200);
  assert.equal(second.body.duplicate, true);
  assert.equal(second.body.leadId, leadId);
  assert.equal(second.body.crmPosted, true);
  assert.equal(db.quoteRows.size, 1);
  assert.equal(crmAttempts, 2);
  assert.equal(db.deliveryRows.get(db.deliveryKey(leadId, 'crm')).attempt_count, 2);
  assert.equal(db.deliveryRows.get(db.deliveryKey(leadId, 'crm')).status, 'delivered');
});

test('forced retry never resends an already delivered Make notification', async () => {
  resetFetch();
  let crmAttempts = 0;
  let makeAttempts = 0;
  respond('https://crm.test/hook', (call) => {
    crmAttempts += 1;
    return crmAttempts === 1
      ? new Response(JSON.stringify({ ok: true }), { status: 200 })
      : verifiedCrmAck(call);
  });
  respond('https://make.test/hook', () => {
    makeAttempts += 1;
    return new Response(JSON.stringify({ accepted: true }), { status: 200 });
  });

  const db = new RuntimeMockD1();
  const env = {
    QUOTE_REQUEST_CRM_WEBHOOK_URL: 'https://crm.test/hook',
    QUOTE_REQUEST_CRM_WEBHOOK_SECRET: 'test-secret',
    QUOTE_REQUEST_MAKE_WEBHOOK_URL: 'https://make.test/hook',
  };

  const first = await submit(db, env);
  assert.equal(first.body.crmPosted, false);
  assert.equal(first.body.ownerNotificationSent, true);
  assert.equal(makeAttempts, 1);

  const second = await submit(db, env);
  assert.equal(second.body.duplicate, true);
  assert.equal(second.body.crmPosted, true);
  assert.equal(second.body.ownerNotificationSent, true);
  assert.equal(crmAttempts, 2);
  assert.equal(makeAttempts, 1, 'already delivered Make notification must not be resent');
  assert.equal(db.quoteRows.size, 1);
});

try {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`PASS ${name}`);
  }
  console.log(`\n${tests.length} transactional runtime tests passed`);
} finally {
  globalThis.fetch = originalFetch;
}
