#!/usr/bin/env node
import assert from 'node:assert/strict';

import { onRequest as handleLead } from '../../functions/api/lead.ts';
import { assertLeadNotificationPayloadCanSend } from '../../src/lib/quote-request/canonical-lead.ts';
import { handleQuoteRequest } from '../../src/lib/quote-request/delivery.ts';
import {
  queueOfflineConversionOutboxEvent,
  queueOfflineConversionOutboxEvents,
} from '../../src/lib/quote-request/offline-conversion-outbox.ts';

const originalFetch = globalThis.fetch;
const tests = [];
let fetchCalls = [];

class MockD1 {
  constructor() {
    this.byIdempotency = new Map();
    this.byLeadId = new Map();
    this.outbox = [];
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
              const columns = sql
                .slice(sql.indexOf('(') + 1, sql.indexOf(') VALUES'))
                .split(',')
                .map((column) => column.trim());
              const row = Object.fromEntries(columns.map((column, index) => [column, args[index]]));
              row.owner_notification_queued = row.owner_notification_queued ?? 1;
              row.owner_notification_sent = row.owner_notification_sent ?? 0;
              row.sheet_written = row.sheet_written ?? 0;
              row.crm_posted = row.crm_posted ?? 0;
              db.byIdempotency.set(row.idempotency_key, {
                lead_id: row.lead_id,
                owner_notification_queued: row.owner_notification_queued,
                owner_notification_sent: row.owner_notification_sent,
                sheet_written: row.sheet_written,
                crm_posted: row.crm_posted,
              });
              db.byLeadId.set(row.lead_id, row);
            }
            if (sql.trim().startsWith('INSERT INTO google_ads_offline_conversion_outbox')) {
              const columns = sql
                .slice(sql.indexOf('(') + 1, sql.indexOf(') VALUES'))
                .split(',')
                .map((column) => column.trim());
              const row = {
                ...Object.fromEntries(columns.map((column, index) => [column, args[index]])),
              };
              if (!db.outbox.some((existing) => existing.lead_id === row.lead_id && existing.event_name === row.event_name)) {
                db.outbox.push(row);
              }
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

function firstCanonical(db) {
  const row = Array.from(db.byLeadId.values())[0];
  assert(row?.canonical_payload_json);
  return JSON.parse(row.canonical_payload_json);
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
  first_landing_page: 'https://www.happyfacesla.com/?gclid=CjwK-test-gclid',
  first_source_path: '/',
  first_referrer: 'https://www.google.com/',
  first_gclid: 'CjwK-test-gclid',
  submit_landing_page: 'https://www.happyfacesla.com/plan-my-party/',
  submit_source_path: '/plan-my-party/',
  submit_gclid: 'CjwK-test-gclid',
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
  const { db } = await callQuote(fullPlanMyPartyPayload);
  const inserted = Array.from(db.byLeadId.values())[0];
  assert.equal(inserted.gclid, 'CjwK-test-gclid');
  assert.equal(fetchCalls[0].body.utm_source, 'google');
  assert.equal(fetchCalls[0].body.utm_medium, 'cpc');
  assert.equal(fetchCalls[0].body.utm_campaign, 'hfla_test_campaign');
  assert.equal(fetchCalls[0].body.gclid_present, 'yes');
  assert.equal(fetchCalls[0].body.gclid, '[present]');
  assert.notEqual(fetchCalls[0].body.gclid, 'CjwK-test-gclid');
  assert.equal(inserted.source_confidence, 'gclid');
});

test('GCLID without UTM fields still produces gclid source confidence', async () => {
  resetFetch();
  const { db } = await callQuote({
    ...fullPlanMyPartyPayload,
    quoteRequestIdempotencyKey: 'qrq_gclidonly1234567890',
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_term: null,
    utm_content: null,
    gclid: 'CjwK-gclid-no-utm',
  });
  const inserted = Array.from(db.byLeadId.values())[0];
  assert.equal(inserted.gclid, 'CjwK-gclid-no-utm');
  assert.equal(inserted.utm_source, null);
  assert.equal(inserted.source_confidence, 'gclid');
  assert.equal(fetchCalls[0].body.gclid_present, 'yes');
});

test('GBRAID and WBRAID fields are preserved privately and redacted in notifications', async () => {
  resetFetch();
  const { db } = await callQuote({
    ...fullPlanMyPartyPayload,
    quoteRequestIdempotencyKey: 'qrq_braids1234567890',
    gclid: null,
    first_gclid: null,
    submit_gclid: null,
    gbraid: 'GBRAID-raw-value',
    wbraid: 'WBRAID-raw-value',
    first_gbraid: 'GBRAID-raw-value',
    submit_wbraid: 'WBRAID-raw-value',
  });
  const inserted = Array.from(db.byLeadId.values())[0];
  assert.equal(inserted.gbraid, 'GBRAID-raw-value');
  assert.equal(inserted.wbraid, 'WBRAID-raw-value');
  assert.equal(inserted.source_confidence, 'gbraid');
  assert.equal(fetchCalls[0].body.gbraid_present, 'yes');
  assert.equal(fetchCalls[0].body.wbraid_present, 'yes');
  assert.equal(fetchCalls[0].body.gbraid, '[present]');
  assert.equal(fetchCalls[0].body.wbraid, '[present]');
});

test('first-touch attribution is retained separately from submit-touch snapshot', async () => {
  resetFetch();
  const { db } = await callQuote({
    ...fullPlanMyPartyPayload,
    quoteRequestIdempotencyKey: 'qrq_firsttouch1234567890',
    first_landing_page: 'https://www.happyfacesla.com/?utm_source=google&utm_medium=cpc&gclid=FIRST-GCLID',
    first_source_path: '/',
    first_referrer: 'https://www.google.com/',
    first_utm_source: 'google',
    first_utm_medium: 'cpc',
    first_utm_campaign: 'first_campaign',
    first_gclid: 'FIRST-GCLID',
    submit_landing_page: 'https://www.happyfacesla.com/plan-my-party/?utm_source=google&utm_medium=cpc&gclid=SUBMIT-GCLID',
    submit_source_path: '/plan-my-party/',
    submit_referrer: 'https://www.happyfacesla.com/',
    submit_utm_campaign: 'submit_campaign',
    submit_gclid: 'SUBMIT-GCLID',
    gclid: 'SUBMIT-GCLID',
  });
  const inserted = Array.from(db.byLeadId.values())[0];
  assert.equal(inserted.first_gclid, 'FIRST-GCLID');
  assert.equal(inserted.first_utm_campaign, 'first_campaign');
  assert.equal(inserted.submit_gclid, 'SUBMIT-GCLID');
  assert.equal(inserted.submit_utm_campaign, 'submit_campaign');
  assert.equal(inserted.first_source_path, '/');
  assert.equal(inserted.submit_source_path, '/plan-my-party/');
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

test('internal-test lead is marked and suppressed from offline outbox', async () => {
  resetFetch();
  const db = new MockD1();
  await callQuote({
    ...fullPlanMyPartyPayload,
    quoteRequestIdempotencyKey: 'qrq_internaltest1234567890',
    firstName: 'HFL Tracking Test',
    specialRequests: 'INTERNAL TRACKING TEST - DO NOT QUOTE - DO NOT BOOK',
  }, db);
  const canonical = firstCanonical(db);
  assert.equal(canonical.isInternalTest, true);
  const result = await queueOfflineConversionOutboxEvent(
    db,
    canonical,
    'qualified_lead',
    { qualifiedStatus: 'qualified' },
    { GOOGLE_ADS_OFFLINE_OUTBOX_ENABLED: 'true' },
  );
  assert.equal(result.queued, false);
  assert.equal(result.reason, 'hfl tracking test');
  assert.equal(db.outbox.length, 0);
});

test('duplicate lead submission is idempotent and does not insert a second lead', async () => {
  resetFetch();
  const db = new MockD1();
  const first = await callQuote({
    ...fullPlanMyPartyPayload,
    quoteRequestIdempotencyKey: 'qrq_duplicate1234567890',
  }, db);
  const second = await callQuote({
    ...fullPlanMyPartyPayload,
    quoteRequestIdempotencyKey: 'qrq_duplicate1234567890',
  }, db);
  assert.equal(first.body.duplicate, false);
  assert.equal(second.body.duplicate, true);
  assert.equal(db.byLeadId.size, 1);
});

test('qualified lead outbox event queues only when feature flag is enabled', async () => {
  resetFetch();
  const db = new MockD1();
  await callQuote(fullPlanMyPartyPayload, db);
  const canonical = firstCanonical(db);
  const disabled = await queueOfflineConversionOutboxEvent(
    db,
    canonical,
    'qualified_lead',
    { qualifiedStatus: 'qualified' },
    { GOOGLE_ADS_OFFLINE_OUTBOX_ENABLED: 'false' },
  );
  assert.equal(disabled.queued, false);
  assert.equal(disabled.reason, 'feature_flag_disabled');
  const queued = await queueOfflineConversionOutboxEvent(
    db,
    canonical,
    'qualified_lead',
    { qualifiedStatus: 'qualified' },
    { GOOGLE_ADS_OFFLINE_OUTBOX_ENABLED: 'true' },
  );
  assert.equal(queued.queued, true);
  assert.equal(db.outbox[0].event_name, 'qualified_lead');
  assert.equal(db.outbox[0].gclid, 'CjwK-test-gclid');
});

test('quote sent outbox event does not queue for sent status without qualified review', async () => {
  resetFetch();
  const db = new MockD1();
  await callQuote(fullPlanMyPartyPayload, db);
  const canonical = firstCanonical(db);
  const result = await queueOfflineConversionOutboxEvent(
    db,
    canonical,
    'quote_sent',
    { quoteSentStatus: 'sent' },
    { GOOGLE_ADS_OFFLINE_OUTBOX_ENABLED: 'true' },
  );
  assert.equal(result.queued, false);
  assert.equal(result.reason, 'qualified_status_unreviewed');
  assert.equal(db.outbox.length, 0);
});

test('quote sent outbox event queues only when sent and qualified', async () => {
  resetFetch();
  const db = new MockD1();
  await callQuote(fullPlanMyPartyPayload, db);
  const canonical = firstCanonical(db);
  const result = await queueOfflineConversionOutboxEvent(
    db,
    canonical,
    'quote_sent',
    { qualifiedStatus: 'qualified', quoteSentStatus: 'sent' },
    { GOOGLE_ADS_OFFLINE_OUTBOX_ENABLED: 'true' },
  );
  assert.equal(result.queued, true);
  assert.equal(db.outbox[0].event_name, 'quote_sent');
});

test('booked event outbox does not queue without booked revenue', async () => {
  resetFetch();
  const db = new MockD1();
  await callQuote(fullPlanMyPartyPayload, db);
  const canonical = firstCanonical(db);
  const result = await queueOfflineConversionOutboxEvent(
    db,
    canonical,
    'booked_event',
    { qualifiedStatus: 'qualified', bookedStatus: 'booked' },
    { GOOGLE_ADS_OFFLINE_OUTBOX_ENABLED: 'true' },
  );
  assert.equal(result.queued, false);
  assert.equal(result.reason, 'booked_revenue_missing');
  assert.equal(db.outbox.length, 0);
});

test('weak spam outside-area and wrong-service leads do not queue any offline events', async () => {
  for (const qualifiedStatus of ['weak', 'spam', 'outside_area', 'wrong_service']) {
    resetFetch();
    const db = new MockD1();
    await callQuote({
      ...fullPlanMyPartyPayload,
      quoteRequestIdempotencyKey: `qrq_${qualifiedStatus.replaceAll('_', '-')}-blocked12345`,
    }, db);
    const canonical = firstCanonical(db);
    const results = await queueOfflineConversionOutboxEvents(
      db,
      canonical,
      {
        qualifiedStatus,
        quoteSentStatus: 'sent',
        bookedStatus: 'booked',
        bookedRevenueCents: 57500,
      },
      { GOOGLE_ADS_OFFLINE_OUTBOX_ENABLED: 'true' },
    );
    assert.equal(results.filter((result) => result.queued).length, 0);
    assert(results.every((result) => result.reason === `qualified_status_${qualifiedStatus}`));
    assert.equal(db.outbox.length, 0);
  }
});

test('booked event outbox carries revenue value and no separate booked_revenue event exists', async () => {
  resetFetch();
  const db = new MockD1();
  await callQuote(fullPlanMyPartyPayload, db);
  const canonical = firstCanonical(db);
  const results = await queueOfflineConversionOutboxEvents(
    db,
    canonical,
    {
      qualifiedStatus: 'qualified',
      quoteSentStatus: 'sent',
      bookedStatus: 'booked',
      bookedRevenueCents: 57500,
    },
    { GOOGLE_ADS_OFFLINE_OUTBOX_ENABLED: 'true' },
  );
  assert.equal(results.filter((result) => result.queued).length, 3);
  const booked = db.outbox.find((row) => row.event_name === 'booked_event');
  assert(booked);
  assert.equal(booked.conversion_value, 575);
  assert.equal(booked.booked_revenue_cents_snapshot, 57500);
  assert(!db.outbox.some((row) => row.event_name === 'booked_revenue'));
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
