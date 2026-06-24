#!/usr/bin/env node
import assert from 'node:assert/strict';

import { onRequest as handleLead } from '../../functions/api/lead.ts';
import { assertLeadNotificationPayloadCanSend } from '../../src/lib/quote-request/canonical-lead.ts';
import { handleQuoteRequest } from '../../src/lib/quote-request/delivery.ts';

const originalFetch = globalThis.fetch;
const tests = [];
let fetchCalls = [];

class MockD1 {
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
              const row = {
                lead_id: args[0],
                idempotency_key: args[1],
                received_at: args[3],
                source_page: args[37],
                utm_source: args[38],
                utm_medium: args[39],
                utm_campaign: args[40],
                gclid: args[43],
                owner_notification_queued: args[33],
                owner_notification_sent: args[34],
                sheet_written: args[35],
                crm_posted: args[36],
                canonical_payload_json: args[58],
              };
              db.byIdempotency.set(row.idempotency_key, {
                lead_id: row.lead_id,
                owner_notification_queued: 1,
                owner_notification_sent: 0,
                sheet_written: 0,
                crm_posted: 0,
              });
              db.byLeadId.set(row.lead_id, row);
            }
            if (sql.trim().startsWith('UPDATE quote_requests')) {
              const row = db.byLeadId.get(args[5]);
              if (row) {
                row.owner_notification_sent = args[2];
                row.sheet_written = args[3];
                row.crm_posted = args[4];
              }
            }
            return { success: true };
          },
        };
      },
    };
  }
}

function test(name, fn) {
  tests.push({ name, fn });
}

function resetFetch() {
  fetchCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    fetchCalls.push({ url: String(url), init, body });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

function jsonRequest(path, payload) {
  return new Request(`https://www.happyfacesla.com${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'lead-validation-test',
      'cf-ray': 'test-ray',
    },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

function quoteEnv(db = new MockD1()) {
  return {
    AVAILABILITY_D1: db,
    QUOTE_REQUEST_MAKE_WEBHOOK_URL: 'https://example.test/make',
  };
}

async function callQuote(payload, db = new MockD1()) {
  const response = await handleQuoteRequest(jsonRequest('/api/quote-request', payload), quoteEnv(db));
  const body = await response.json().catch(() => ({}));
  return { response, body, db };
}

async function callLead(payload) {
  const response = await handleLead({
    request: jsonRequest('/api/lead', payload),
    env: {
      QUOTE_REQUEST_MAKE_WEBHOOK_URL: 'https://example.test/make',
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

const fullPlanMyPartyPayload = {
  eventType: 'birthday-party',
  services: ['face-painting', 'balloon-twisting'],
  kidsCountBucket: '11-18',
  kidsCountActual: 12,
  designStyle: 'quick-cheek-arm',
  selectedDurationMinutes: 90,
  recommendedDurationMinutes: 90,
  branch: 'custom-quote',
  quoteOutcome: 'custom-quote-required',
  eventDate: '2026-08-15',
  eventTime: '14:00',
  eventCity: 'Los Angeles',
  venueName: 'Park',
  travelMiles: 8,
  firstName: 'Alex',
  lastName: 'Rivera',
  email: 'alex@example.com',
  phone: '310-555-0100',
  specialRequests: 'Please send options.',
  quoteRequestIdempotencyKey: 'qrq_fullplan1234567890',
  consentAcknowledgement: true,
  lookbook_inspirations: [],
  wizardVersion: 'guided-wizard-v1',
  submittedAt: '2026-06-24T21:30:00.000Z',
  preferredContactMethod: 'text',
  source_page: '/plan-my-party/',
  utm_source: 'google',
  utm_medium: 'cpc',
  utm_campaign: 'hfla_test_campaign',
  utm_term: 'face painter',
  utm_content: 'test_ad',
  gclid: 'CjwK-test-gclid',
};

test('valid Plan My Party full payload accepted', async () => {
  resetFetch();
  const { response, body } = await callQuote(fullPlanMyPartyPayload);
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.received, true);
  assert.equal(body.persisted, true);
  assert.equal(fetchCalls.length, 1);
});

test('GCLID and UTM fields preserved on valid Plan My Party payload', async () => {
  resetFetch();
  await callQuote(fullPlanMyPartyPayload);
  assert.equal(fetchCalls[0].body.gclid, 'CjwK-test-gclid');
  assert.equal(fetchCalls[0].body.utm_source, 'google');
  assert.equal(fetchCalls[0].body.utm_medium, 'cpc');
  assert.equal(fetchCalls[0].body.utm_campaign, 'hfla_test_campaign');
});

test('valid Plan My Party partial payload with contact accepted as manual review', async () => {
  resetFetch();
  const { response, body } = await callQuote({
    firstName: 'Sam',
    email: 'sam@example.com',
    source_page: '/plan-my-party/',
    quoteRequestIdempotencyKey: 'qrq_partialplan1234567890',
    consentAcknowledgement: true,
  });
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].body.manual_review_required, true);
  assert(fetchCalls[0].body.manual_review_reasons.includes('event_type_missing'));
  assert(fetchCalls[0].body.manual_review_reasons.includes('services_missing'));
  assert(fetchCalls[0].body.manual_review_reasons.includes('event_date_missing'));
});

test('valid hire-face-painter payload accepted', async () => {
  resetFetch();
  const { response, body } = await callQuote({
    ...fullPlanMyPartyPayload,
    services: ['face-painting'],
    designStyle: 'not-sure',
    quoteOutcome: 'hire-face-painter-availability-request',
    firstName: 'Taylor',
    lastName: 'Casey',
    email: 'taylor@example.com',
    phone: '323-555-0100',
    source_page: '/hire-face-painter-los-angeles/',
    quoteRequestIdempotencyKey: 'qrq_hireface1234567890',
    wizardVersion: 'hire-face-painter-landing-v1',
  });
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(fetchCalls[0].body.source_page, '/hire-face-painter-los-angeles/');
});

test('valid legacy pricing partial lead accepted and delivered canonically', async () => {
  resetFetch();
  const { response, body } = await callLead({
    first_name: 'Jamie',
    phone: '424-555-0100',
    source_page: '/pricing/',
    message: 'Please call me.',
  });
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(fetchCalls.length, 1);
  assert(fetchCalls[0].body.lead_id);
  assert(fetchCalls[0].body.created_at);
  assert.equal(fetchCalls[0].body.source_page, '/pricing/');
  assert.equal(fetchCalls[0].body.first_name, 'Jamie');
  assert.equal(fetchCalls[0].body.phone, '424-555-0100');
});

test('empty object rejected with 400 and no webhook', async () => {
  resetFetch();
  const { response } = await callQuote({});
  assert.equal(response.status, 400);
  assert.equal(fetchCalls.length, 0);
});

test('malformed JSON rejected with 400 and no webhook', async () => {
  resetFetch();
  const response = await handleQuoteRequest(jsonRequest('/api/quote-request', '{bad-json'), quoteEnv());
  assert.equal(response.status, 400);
  assert.equal(fetchCalls.length, 0);
});

test('missing phone/email rejected with 400 and no webhook', async () => {
  resetFetch();
  const { response } = await callQuote({
    firstName: 'No Contact',
    source_page: '/plan-my-party/',
    consentAcknowledgement: true,
  });
  assert.equal(response.status, 400);
  assert.equal(fetchCalls.length, 0);
});

test('all-default payload rejected with 400 and no webhook', async () => {
  resetFetch();
  const { response } = await callLead({
    first_name: 'Not provided',
    phone: 'Not provided',
    email: 'Not provided',
    source_page: '/pricing/',
  });
  assert.equal(response.status, 400);
  assert.equal(fetchCalls.length, 0);
});

test('email renderer safeguard blocks all-default blank lead email', () => {
  assert.throws(() => {
    assertLeadNotificationPayloadCanSend({
      lead_id: '',
      created_at: '',
      source_page: '/pricing/',
      first_name: 'Not provided',
      last_name: 'Not provided',
      phone: 'Not provided',
      email: 'Not provided',
      event_type: 'Not available',
      event_date: 'Not provided',
      event_city: 'Not provided',
      services_requested: [],
    });
  }, /BLANK_LEAD_EMAIL_BLOCKED/);
});

test('manual review lead accepted when event details incomplete', async () => {
  resetFetch();
  const { response } = await callLead({
    first_name: 'Morgan',
    email: 'morgan@example.com',
    source_page: '/pricing/',
  });
  assert.equal(response.status, 200);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].body.manual_review_required, true);
  assert(fetchCalls[0].body.manual_review_reasons.includes('event_type_missing'));
  assert(fetchCalls[0].body.manual_review_reasons.includes('event_city_missing'));
});

test('bot/honeypot payload does not send customer lead email', async () => {
  resetFetch();
  const { response, body } = await callLead({
    first_name: 'Bot',
    phone: '310-555-0100',
    source_page: '/pricing/',
    honeypot: 'filled',
  });
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(fetchCalls.length, 0);
});

try {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`PASS ${name}`);
  }
  console.log(`\n${tests.length} lead validation tests passed`);
} finally {
  globalThis.fetch = originalFetch;
}
