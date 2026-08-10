#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { onRequest as handleLegacyLead } from '../../functions/api/lead.ts';
import { handleQuoteRequest } from '../../src/lib/quote-request/delivery.ts';
import { shouldEmitTechnicalEvent } from '../../src/lib/forms/acceptance-contract.ts';
import {
  buildContactBrowserPayload,
  buildPackagesBrowserPayload,
  buildPlanMyPartyBrowserPayload,
} from '../../src/lib/forms/browser-payloads.ts';
import { flattenJourney } from '../../src/lib/attribution/atomic-attribution.ts';

const admittedMakeBlueprint = await readFile(
  new URL(
    '../../evidence/lead_capture_20260610/integration_webhooks_final_verified_blueprint_after_leadid_guard.json',
    import.meta.url,
  ),
  'utf8',
);
for (const admittedMapping of ['{{1.lead.first_name}}', '{{1.leadId}}', '{{1.submittedAt}}']) {
  assert.equal(
    admittedMakeBlueprint.includes(admittedMapping),
    true,
    `admitted Make mapping preserved in fixture: ${admittedMapping}`,
  );
}

class CanonicalMockD1 {
  constructor() {
    this.identities = new Map();
    this.quotesBySubmission = new Map();
    this.quotesByLead = new Map();
    this.canonicalOutbox = [];
    this.notificationOutbox = [];
  }

  prepare(sql) {
    const db = this;
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    return {
      bind(...args) {
        return {
          async first() {
            if (sql.includes('FROM lead_submission_identity')) return db.identities.get(args[0]) ?? null;
            if (sql.includes('WHERE idempotency_key')) return db.quotesBySubmission.get(args[0]) ?? null;
            return null;
          },
          async run() {
            if (sql.trim().startsWith('INSERT INTO lead_submission_identity')) {
              const row = {
                submission_id: args[0],
                lead_id: args[1],
                form_route: args[2],
                payload_hash: args[3],
                conversion_eligible: args[5],
                suppression_reason: args[6],
              };
              if (db.identities.has(row.submission_id)) throw new Error('UNIQUE submission identity');
              db.identities.set(row.submission_id, row);
            } else if (sql.trim().startsWith('INSERT INTO quote_requests')) {
              const columns = sql
                .slice(sql.indexOf('(') + 1, sql.indexOf(') VALUES'))
                .split(',')
                .map((column) => column.trim());
              const row = Object.fromEntries(columns.map((column, index) => [column, args[index]]));
              if (db.quotesBySubmission.has(row.idempotency_key)) throw new Error('UNIQUE quote identity');
              db.quotesBySubmission.set(row.idempotency_key, {
                lead_id: row.lead_id,
                owner_notification_queued: row.owner_notification_queued,
                owner_notification_sent: row.owner_notification_sent,
               sheet_written: row.sheet_written,
               crm_posted: row.crm_posted,
                canonical_payload_json: row.canonical_payload_json,
                idempotency_key: row.idempotency_key,
              });
              db.quotesByLead.set(row.lead_id, row);
            } else if (sql.trim().startsWith('INSERT INTO canonical_lead_outbox')) {
              const row = {
                outbox_id: args[0],
                submission_id: args[1],
                lead_id: args[2],
                conversion_eligible: args[3],
                status: args[4],
                suppression_reason: args[5],
                payload_hash: args[6],
              };
              if (db.canonicalOutbox.some((candidate) => candidate.lead_id === row.lead_id)) {
                throw new Error('UNIQUE canonical outbox');
              }
              db.canonicalOutbox.push(row);
            } else if (normalized.startsWith('insert into lead_notification_outbox')) {
              if (db.notificationOutbox.some((candidate) => candidate.lead_id === args[2])) {
                throw new Error('UNIQUE notification outbox');
              }
              db.notificationOutbox.push({
                notification_id: args[0],
                submission_id: args[1],
                lead_id: args[2],
                destination: 'owner_notification',
                status: 'pending',
                attempt_count: 0,
                claim_token: null,
                lease_expires_at_utc: null,
                last_attempt_at_utc: null,
                last_error_code: null,
              });
            } else if (sql.trim().startsWith('UPDATE quote_requests')) {
              const row = db.quotesByLead.get(args[5]);
              const notification = db.notificationOutbox.find((candidate) => candidate.lead_id === args[6]);
              if (!notification || notification.status !== 'delivering' || notification.claim_token !== args[7]) {
                return { success: true, meta: { changes: 0 } };
              }
              if (row) {
                row.owner_notification_sent = args[2];
                row.sheet_written = args[3];
                row.crm_posted = args[4];
                const summary = db.quotesBySubmission.get(row.idempotency_key);
                if (summary) Object.assign(summary, {
                  owner_notification_sent: args[2],
                  sheet_written: args[3],
                  crm_posted: args[4],
                });
              }
            } else if (normalized.startsWith('update lead_notification_outbox') && normalized.includes("set status = 'delivering'")) {
              const row = db.notificationOutbox.find((candidate) => candidate.lead_id === args[3]);
              if (row && ['pending', 'failed_retryable'].includes(row.status)) {
                row.status = 'delivering';
                row.claim_token = args[0];
                row.lease_expires_at_utc = args[1];
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 0 } };
            } else if (normalized.startsWith('update lead_notification_outbox')) {
              const row = db.notificationOutbox.find((candidate) => candidate.lead_id === args[4]);
              if (row && row.status === 'delivering' && row.claim_token === args[5]) {
                row.status = args[0];
                row.attempt_count += 1;
                row.claim_token = null;
                row.lease_expires_at_utc = null;
                row.last_attempt_at_utc = args[1];
                row.last_error_code = args[2];
              }
            }
            return { success: true, meta: { changes: 1 } };
          },
        };
      },
    };
  }

  async batch(statements) {
    const snapshot = {
      identities: new Map(this.identities),
      quotesBySubmission: new Map(this.quotesBySubmission),
      quotesByLead: new Map(this.quotesByLead),
      canonicalOutbox: [...this.canonicalOutbox],
      notificationOutbox: this.notificationOutbox.map((row) => ({ ...row })),
    };
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    } catch (error) {
      this.identities = snapshot.identities;
      this.quotesBySubmission = snapshot.quotesBySubmission;
      this.quotesByLead = snapshot.quotesByLead;
      this.canonicalOutbox = snapshot.canonicalOutbox;
      this.notificationOutbox = snapshot.notificationOutbox;
      throw error;
    }
  }
}

const originalFetch = globalThis.fetch;
let notifications = [];
let notificationOutcomes = [];
globalThis.fetch = async (url, init = {}) => {
  notifications.push({
    url: String(url),
    headers: Object.fromEntries(new Headers(init.headers).entries()),
    body: JSON.parse(String(init.body || '{}')),
  });
  const ok = notificationOutcomes.length ? notificationOutcomes.shift() : true;
  const negativeAck = ok === 'negative-ack';
  return new Response(JSON.stringify({ ok: !negativeAck }), {
    status: ok === false ? 503 : 200,
    headers: { 'content-type': 'application/json' },
  });
};

function submissionId(seed) {
  return `sub_${createHash('sha256').update(seed).digest('hex').slice(0, 32)}`;
}

function touch(path, values = {}, referrer = null, at = '2026-08-10T18:00:00.000Z') {
  return {
    gclid: null,
    gbraid: null,
    wbraid: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_term: null,
    utm_content: null,
    landing_path: path,
    source_path: path,
    sanitized_referrer: referrer,
    captured_at: at,
    source_confidence: 'direct',
    ...values,
  };
}

function journey(path, values = {}) {
  const first = touch(path, values, values.gclid || values.gbraid || values.wbraid ? 'https://www.google.com/' : null);
  return {
    version: 1,
    first_touch: first,
    latest_qualifying_touch: first,
    submit_touch: touch(path),
    expires_at: null,
  };
}

function planPayload(id = submissionId('plan'), overrides = {}) {
  const attribution = journey('/plan-my-party/', {
      gclid: 'GCLID-FIXTURE',
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'fixture',
  });
  return {
    ...buildPlanMyPartyBrowserPayload({
      answers: {
        eventType: 'birthday-party',
        services: ['face-painting'],
        kidsCountBucket: '11-18',
        kidsCountActual: 12,
        designStyle: 'quick-cheek-arm',
        selectedDurationOption: 90,
        eventDate: '2026-09-15',
        eventTime: '14:00',
        eventCity: 'Los Angeles',
        firstName: 'Fixture',
        lastName: 'Customer',
        email: 'fixture@example.invalid',
        phone: '310-555-0101',
        specialRequests: 'Synthetic fixture only.',
        lookbookInspirations: [],
      },
      recommendation: { recommendedDuration: 90, branch: 'custom-quote' },
      currentClassification: null,
      submissionId: id,
      sourcePage: '/plan-my-party/',
      submittedAt: '2026-08-10T18:00:00.000Z',
      preferredContactMethod: 'text',
      submission: { attribution, compatibility: flattenJourney(attribution) },
    }),
    ...overrides,
  };
}

function legacyPayload(route, id, overrides = {}) {
  const path = route === 'packages' ? '/packages/' : '/contact/';
  const attribution = journey(path, {
      gbraid: route === 'packages' ? 'GBRAID-FIXTURE' : null,
      wbraid: route === 'contact' ? 'WBRAID-FIXTURE' : null,
      utm_source: 'google',
      utm_medium: 'cpc',
  });
  const submission = { attribution, compatibility: flattenJourney(attribution) };
  const fd = new FormData();
  const common = {
    email: 'fixture@example.invalid',
    phone: '310-555-0101',
    event_date: '2026-09-15',
    event_start_time: '14:00',
    event_city: 'Los Angeles',
    event_type: 'Birthday party',
    consent_to_contact: 'true',
    source_page: path,
  };
  for (const [key, item] of Object.entries(common)) fd.set(key, item);
  let payload;
  if (route === 'packages') {
    fd.set('parent_name', 'Fixture Customer');
    fd.set('estimated_kids', '12');
    fd.set('services_primary', 'Face Painting');
    fd.set('message', 'Synthetic fixture only.');
    payload = buildPackagesBrowserPayload({ formData: fd, submissionId: id, submission });
  } else {
    fd.set('first_name', 'Fixture');
    fd.set('last_name', 'Customer');
    fd.set('estimated_guest_count', '12');
    fd.append('services_requested[]', 'Face Painting');
    fd.set('message', 'Synthetic fixture only.');
    payload = buildContactBrowserPayload({ formData: fd, submissionId: id, submission });
  }
  return { ...payload, ...overrides };
}

let requestCount = 0;
function request(path, payload, extraHeaders = {}) {
  requestCount += 1;
  const sourcePage = typeof payload.source_page === 'string' ? payload.source_page : '/';
  return new Request(`https://happyfacesla.com${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': `192.0.2.${(requestCount % 200) + 1}`,
      referer: new URL(sourcePage, 'https://happyfacesla.com').toString(),
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  });
}

function env(db, overrides = {}) {
  return { AVAILABILITY_D1: db, QUOTE_REQUEST_MAKE_WEBHOOK_URL: 'https://example.invalid/make', ...overrides };
}

async function callPlan(db, payload, envOverrides = {}) {
  const response = await handleQuoteRequest(request('/api/quote-request', payload), env(db, envOverrides));
  return { response, body: await response.json() };
}

async function callLegacy(db, payload, envOverrides = {}) {
  const response = await handleLegacyLead({ request: request('/api/lead', payload), env: env(db, envOverrides) });
  return { response, body: await response.json() };
}

for (const route of ['plan-my-party', 'packages', 'contact']) {
  notifications = [];
  const db = new CanonicalMockD1();
  const id = submissionId(`route:${route}`);
  const result = route === 'plan-my-party'
    ? await callPlan(db, planPayload(id))
    : await callLegacy(db, legacyPayload(route, id));
  assert.equal(result.response.status, 200, `${route} status`);
  assert.equal(result.body.accepted, true, `${route} accepted`);
  assert.equal(result.body.created, true, `${route} created`);
  assert.equal(result.body.conversionEligible, true, `${route} eligible`);
  assert.equal(db.identities.size, 1, `${route} identity count`);
  assert.equal(db.quotesByLead.size, 1, `${route} canonical row count`);
  assert.equal(db.canonicalOutbox.length, 1, `${route} outbox count`);
  assert.equal(db.canonicalOutbox[0].lead_id, result.body.leadId, `${route} outbox lead`);
  assert.equal(db.canonicalOutbox[0].status, 'shadow_pending', `${route} outbox held for classification`);
  assert.equal(db.canonicalOutbox[0].conversion_eligible, 0, `${route} outbox is not upload eligible`);
  assert.equal(db.notificationOutbox.length, 1, `${route} notification outbox count`);
  assert.equal(db.notificationOutbox[0].status, 'sent', `${route} notification delivery status`);
  assert.equal(db.notificationOutbox[0].attempt_count, 1, `${route} notification attempt count`);
  assert.equal(notifications[0].body.lead_id, result.body.leadId, `${route} notification lead`);
  assert.equal(notifications[0].body.submission_id, id, `${route} notification submission`);
  assert.equal(notifications[0].body.form_route, route, `${route} notification route`);
  assert.equal(
    notifications[0].body.source_endpoint,
    route === 'plan-my-party' ? 'quote-request' : 'lead-adapter',
    `${route} truthful source endpoint`,
  );
  assert.equal(notifications[0].headers['x-idempotency-key'], result.body.leadId, `${route} destination idempotency header`);
  assert.equal(
    notifications[0].headers['x-lead-source'],
    route === 'plan-my-party' ? 'happyfacesla-plan-my-party' : 'happyfacesla-cloudflare-pages',
    `${route} admitted source header`,
  );
  if (route !== 'plan-my-party') {
    assert.equal(notifications[0].body.leadId, result.body.leadId, `${route} legacy Make leadId`);
    assert.equal(typeof notifications[0].body.submittedAt, 'string', `${route} legacy Make timestamp`);
    assert.equal(notifications[0].body.lead.first_name, 'Fixture', `${route} legacy Make nested lead`);
    assert.equal(notifications[0].body.canonical.lead_id, result.body.leadId, `${route} nested canonical payload`);
  }
  assert.equal(/GCLID-FIXTURE|GBRAID-FIXTURE|WBRAID-FIXTURE/.test(JSON.stringify(notifications[0].body)), false, `${route} raw click IDs stay private`);
  assert.equal(shouldEmitTechnicalEvent(result.body), true, `${route} browser event decision`);
}

notifications = [];
const duplicateDb = new CanonicalMockD1();
const duplicatePayload = planPayload(submissionId('duplicate'));
const first = await callPlan(duplicateDb, duplicatePayload);
const retryPayload = structuredClone(duplicatePayload);
retryPayload.attribution.submit_touch.captured_at = '2026-08-10T18:05:00.000Z';
retryPayload.attribution.submit_touch.sanitized_referrer = 'https://happyfacesla.com/services/';
const retryAfterLostResponse = await callPlan(duplicateDb, retryPayload);
assert.equal(first.body.leadId, retryAfterLostResponse.body.leadId);
assert.equal(retryAfterLostResponse.body.duplicate, true);
assert.equal(retryAfterLostResponse.body.created, false);
assert.equal(duplicateDb.identities.size, 1);
assert.equal(duplicateDb.quotesByLead.size, 1);
assert.equal(duplicateDb.canonicalOutbox.length, 1);
assert.equal(notifications.length, 1);
assert.equal(shouldEmitTechnicalEvent(retryAfterLostResponse.body), false);

notifications = [];
notificationOutcomes = [false, true];
const retryNotificationDb = new CanonicalMockD1();
const retryNotificationPayload = planPayload(submissionId('notification-retry'));
const failedNotification = await callPlan(retryNotificationDb, retryNotificationPayload);
assert.equal(failedNotification.body.accepted, true, 'lead acceptance survives optional webhook failure');
assert.equal(failedNotification.body.ownerNotificationSent, false);
assert.equal(retryNotificationDb.notificationOutbox[0].status, 'failed_retryable');
assert.equal(retryNotificationDb.notificationOutbox[0].attempt_count, 1);
const retriedNotification = await callPlan(retryNotificationDb, retryNotificationPayload);
assert.equal(retriedNotification.body.leadId, failedNotification.body.leadId);
assert.equal(retriedNotification.body.duplicate, true);
assert.equal(retriedNotification.body.ownerNotificationSent, true);
assert.equal(retryNotificationDb.notificationOutbox.length, 1);
assert.equal(retryNotificationDb.notificationOutbox[0].status, 'sent');
assert.equal(retryNotificationDb.notificationOutbox[0].attempt_count, 2);
assert.equal(notifications.length, 2);
assert.equal(notifications[0].headers['x-idempotency-key'], notifications[1].headers['x-idempotency-key']);
assert.equal(shouldEmitTechnicalEvent(retriedNotification.body), false);
notificationOutcomes = [];

for (const route of ['packages', 'contact']) {
  notifications = [];
  notificationOutcomes = [false, true];
  const stablePayloadDb = new CanonicalMockD1();
  const id = submissionId(`${route}-stable-notification`);
  const originalPayload = legacyPayload(route, id);
  const firstAttempt = await callLegacy(stablePayloadDb, originalPayload);
  assert.equal(firstAttempt.body.ownerNotificationSent, false);
  const changedRetry = structuredClone(originalPayload);
  changedRetry.utm_source = 'yelp';
  changedRetry.utm_medium = 'referral';
  changedRetry.gclid = 'CHANGED-CURRENT-REQUEST-ID';
  changedRetry.attribution.submit_touch.captured_at = '2026-08-10T18:30:00.000Z';
  const retryAttempt = await callLegacy(stablePayloadDb, changedRetry);
  assert.equal(retryAttempt.body.duplicate, true);
  assert.equal(retryAttempt.body.ownerNotificationSent, true);
  assert.deepEqual(
    notifications[1].body,
    notifications[0].body,
    `${route} retry reuses the persisted coherent notification payload`,
  );
  assert.equal(
    notifications[1].headers['x-idempotency-key'],
    notifications[0].headers['x-idempotency-key'],
    `${route} retry preserves downstream idempotency key`,
  );
}
notificationOutcomes = [];

notifications = [];
notificationOutcomes = ['negative-ack', true];
const crmAckDb = new CanonicalMockD1();
const crmAckPayload = planPayload(submissionId('crm-negative-ack'));
const crmAckEnv = {
  QUOTE_REQUEST_MAKE_WEBHOOK_URL: '',
  QUOTE_REQUEST_CRM_WEBHOOK_URL: 'https://example.invalid/crm',
};
const rejectedCrmAck = await callPlan(crmAckDb, crmAckPayload, crmAckEnv);
assert.equal(rejectedCrmAck.body.ownerNotificationSent, false, 'CRM 2xx ok:false is not delivery success');
assert.equal(crmAckDb.notificationOutbox[0].status, 'failed_retryable');
const acceptedCrmAck = await callPlan(crmAckDb, crmAckPayload, crmAckEnv);
assert.equal(acceptedCrmAck.body.ownerNotificationSent, true);
assert.equal(crmAckDb.notificationOutbox[0].status, 'sent');
assert.equal(notifications.length, 2);
notificationOutcomes = [];

notifications = [];
const concurrentDb = new CanonicalMockD1();
const concurrentPayload = planPayload(submissionId('double-click'));
const concurrent = await Promise.all([
  callPlan(concurrentDb, concurrentPayload),
  callPlan(concurrentDb, concurrentPayload),
]);
assert.equal(concurrent[0].body.leadId, concurrent[1].body.leadId);
assert.equal(concurrentDb.identities.size, 1);
assert.equal(concurrentDb.canonicalOutbox.length, 1);
assert.equal(concurrent.filter((item) => item.body.created === true).length, 1);

const conflictDb = new CanonicalMockD1();
const conflictId = submissionId('conflict');
await callPlan(conflictDb, planPayload(conflictId));
const conflict = await callPlan(conflictDb, planPayload(conflictId, { eventCity: 'Pasadena' }));
assert.equal(conflict.response.status, 409);
assert.equal(conflictDb.identities.size, 1);

const spoofDb = new CanonicalMockD1();
const spoof = await callPlan(spoofDb, planPayload(submissionId('spoof'), {
  source_page: 'https://evil.example/plan-my-party/',
}));
assert.equal(spoof.response.status, 400);
assert.equal(spoofDb.identities.size, 0);

notifications = [];
const honeypotDb = new CanonicalMockD1();
const honeypot = await callPlan(honeypotDb, planPayload(submissionId('honeypot'), { honeypot: 'filled' }));
assert.equal(honeypot.body.accepted, false);
assert.equal(honeypot.body.conversionEligible, false);
assert.equal(honeypotDb.identities.size, 0);
assert.equal(honeypotDb.canonicalOutbox.length, 0);
assert.equal(notifications.length, 0);

notifications = [];
const internalDb = new CanonicalMockD1();
const ordinaryDoNotBook = await callPlan(internalDb, planPayload(submissionId('ordinary-do-not-book'), {
  specialRequests: 'Please do not book yet; wait until I approve the quote.',
}));
assert.equal(ordinaryDoNotBook.body.conversionEligible, true);
assert.equal(notifications.length, 1, 'ordinary do-not-book language still notifies the owner');

notifications = [];
const authorizedInternalDb = new CanonicalMockD1();
const internalToken = 'owner-authorized-test-token-000000000001';
const internalPayload = planPayload(submissionId('internal'), {
  specialRequests: 'HFL tracking test. Do not quote.',
  internal_test: true,
  internal_test_reason: 'owner_approved_fixture',
});
const internalResponse = await handleQuoteRequest(
  request('/api/quote-request', internalPayload, {
    'x-hfla-internal-test-token': internalToken,
  }),
  env(authorizedInternalDb, { INTERNAL_TEST_TOKEN: internalToken }),
);
const internal = { response: internalResponse, body: await internalResponse.json() };
assert.equal(internal.body.accepted, true);
assert.equal(internal.body.conversionEligible, false);
assert.equal(authorizedInternalDb.canonicalOutbox[0].status, 'suppressed');
assert.match(authorizedInternalDb.canonicalOutbox[0].suppression_reason, /^internal_test:/);
assert.equal(notifications.length, 0);
assert.equal(shouldEmitTechnicalEvent(internal.body), false);

notifications = [];
const spamDb = new CanonicalMockD1();
const spam = await callLegacy(spamDb, legacyPayload('contact', submissionId('spam'), {
  message: 'Guest post placement https://a.example https://b.example https://c.example',
}));
assert.equal(spam.body.conversionEligible, false);
assert.equal(spamDb.canonicalOutbox[0].status, 'suppressed');
assert.equal(notifications.length, 1, 'heuristic spam remains owner-reviewable');

notifications = [];
const inspirationLinksDb = new CanonicalMockD1();
const inspirationLinks = await callLegacy(
  inspirationLinksDb,
  legacyPayload('contact', submissionId('inspiration-links'), {
    message: 'Three inspiration links: https://a.example/look https://b.example/look https://c.example/look',
  }),
);
assert.equal(inspirationLinks.body.conversionEligible, false, 'multi-link heuristic stays out of conversion training');
assert.equal(notifications.length, 1, 'legitimate multi-link request still reaches owner review');

notifications = [];
const separateDb = new CanonicalMockD1();
const customerOne = await callLegacy(separateDb, legacyPayload('contact', submissionId('customer-one')));
const customerTwo = await callLegacy(separateDb, legacyPayload('contact', submissionId('customer-two')));
assert.notEqual(customerOne.body.leadId, customerTwo.body.leadId);
assert.equal(separateDb.identities.size, 2);
assert.equal(separateDb.canonicalOutbox.length, 2);

notifications = [];
const legacyFanoutDb = new CanonicalMockD1();
await callLegacy(
  legacyFanoutDb,
  legacyPayload('packages', submissionId('legacy-fanout')),
  {
    QUOTE_REQUEST_CRM_WEBHOOK_URL: 'https://example.invalid/crm',
    QUOTE_REQUEST_SHEET_WEBHOOK_URL: 'https://example.invalid/sheet',
    QUOTE_REQUEST_MAKE_WEBHOOK_URL: 'https://example.invalid/make',
  },
);
assert.equal(notifications.length, 1, 'legacy adapter preserves single-destination precedence');
assert.equal(notifications[0].url, 'https://example.invalid/crm');

notifications = [];
const packageFieldsDb = new CanonicalMockD1();
await callLegacy(packageFieldsDb, legacyPayload('packages', submissionId('package-fields'), {
  services_requested: [
    'Face Painting + Balloon Twisting',
    'Premium Party Package',
    'Large Event / School / Corporate',
  ],
}));
assert.deepEqual(
  notifications[0].body.services_requested,
  ['face-painting', 'balloon-twisting', 'combo', 'not-sure'],
  'all valid package service aliases survive the adapter',
);
assert.deepEqual(
  notifications[0].body.lead.services_requested,
  [
    'Face Painting + Balloon Twisting',
    'Premium Party Package',
    'Large Event / School / Corporate',
  ],
  'admitted Make nested payload retains customer-facing package labels',
);

notifications = [];
const contactFieldsDb = new CanonicalMockD1();
await callLegacy(contactFieldsDb, legacyPayload('contact', submissionId('contact-fields'), {
  event_type: 'Neighborhood soccer fan activation',
  services_requested: ['Soccer Fan Paint Bar'],
  children_count_optional: '',
  estimated_guest_count: '25',
  painting_window: '2:00–4:00 PM',
  venue_permission_confirmed: 'Yes',
  need_invoice_coi: 'Invoice and COI needed',
  campaign: 'soccer-landing',
}));
assert.equal(notifications[0].body.child_range, '19-25');
assert.equal(notifications[0].body.exact_child_count, 25);
assert.match(notifications[0].body.notes, /Customer service selection: Soccer Fan Paint Bar/);
assert.match(notifications[0].body.notes, /Neighborhood soccer fan activation/);
assert.match(notifications[0].body.notes, /2:00–4:00 PM/);
assert.match(notifications[0].body.notes, /Invoice and COI needed/);
assert.match(notifications[0].body.notes, /soccer-landing/);
assert.equal(notifications[0].body.lead.event_type, 'Neighborhood soccer fan activation');
assert.deepEqual(notifications[0].body.lead.services_requested, ['Soccer Fan Paint Bar']);
assert.equal(notifications[0].body.lead.estimated_guest_count, '25');

async function assertAttributionProjection(seed, attribution, expected) {
  notifications = [];
  const db = new CanonicalMockD1();
  const payload = planPayload(submissionId(seed), { attribution });
  const result = await callPlan(db, payload);
  assert.equal(result.response.status, 200, `${seed} accepted`);
  const row = db.quotesByLead.get(result.body.leadId);
  assert.equal(row.source_confidence, expected.sourceConfidence, `${seed} confidence`);
  assert.equal(row.gclid, expected.gclid ?? null, `${seed} gclid`);
  assert.equal(row.gbraid, expected.gbraid ?? null, `${seed} gbraid`);
  assert.equal(row.utm_source, expected.utmSource ?? null, `${seed} utm source`);
}

const googleFirst = touch('/plan-my-party/', { gclid: 'G-FIRST' }, 'https://www.google.com/');
const yelpLatest = touch('/services/', { utm_source: 'yelp', utm_medium: 'referral' }, 'https://www.yelp.com/');
await assertAttributionProjection('google-yelp', {
  version: 1,
  first_touch: googleFirst,
  latest_qualifying_touch: yelpLatest,
  submit_touch: touch('/plan-my-party/', {}, 'https://happyfacesla.com/services/'),
  expires_at: null,
}, { sourceConfidence: 'utm_other', utmSource: 'yelp' });

const yelpFirst = touch('/services/', { utm_source: 'yelp', utm_medium: 'referral' }, 'https://www.yelp.com/');
const googleLatest = touch('/plan-my-party/', { gbraid: 'GB-LATEST' }, 'https://www.google.com/');
await assertAttributionProjection('yelp-google', {
  version: 1,
  first_touch: yelpFirst,
  latest_qualifying_touch: googleLatest,
  submit_touch: touch('/plan-my-party/', {}, 'https://happyfacesla.com/services/'),
  expires_at: null,
}, { sourceConfidence: 'gbraid', gbraid: 'GB-LATEST' });

await assertAttributionProjection('direct-internal', {
  version: 1,
  first_touch: touch('/services/'),
  latest_qualifying_touch: null,
  submit_touch: touch('/plan-my-party/', {}, 'https://happyfacesla.com/services/'),
  expires_at: null,
}, { sourceConfidence: 'direct' });

await assertAttributionProjection('nonqualifying-latest', {
  version: 1,
  first_touch: googleFirst,
  latest_qualifying_touch: touch('/services/'),
  submit_touch: touch('/plan-my-party/', {}, 'https://happyfacesla.com/services/'),
  expires_at: null,
}, { sourceConfidence: 'gclid', gclid: 'G-FIRST' });

const mismatchDb = new CanonicalMockD1();
const mismatchPayload = planPayload(submissionId('submit-path-mismatch'));
mismatchPayload.attribution.submit_touch.source_path = '/contact/';
const mismatch = await callPlan(mismatchDb, mismatchPayload);
assert.equal(mismatch.response.status, 400);
assert.match(mismatch.body.message, /Submit attribution/);
assert.equal(mismatchDb.identities.size, 0);

notifications = [];
const hirePath = '/hire-face-painter-los-angeles/';
const hireAttribution = journey(hirePath, { gclid: 'GCLID-HIRE' });
const hirePayload = buildPlanMyPartyBrowserPayload({
  answers: {
    eventType: 'birthday-party',
    services: ['face-painting'],
    kidsCountBucket: '11-18',
    kidsCountActual: 15,
    designStyle: 'not-sure',
    selectedDurationOption: null,
    eventDate: '2026-09-20',
    eventCity: 'Los Angeles',
    firstName: 'Hire',
    lastName: 'Fixture',
    email: 'hire@example.invalid',
    phone: '310-555-0102',
    lookbookInspirations: [],
  },
  recommendation: { recommendedDuration: null, branch: 'custom-quote' },
  currentClassification: 'hire-face-painter-availability-request',
  submissionId: submissionId('hire-browser'),
  sourcePage: hirePath,
  submittedAt: '2026-08-10T18:00:00.000Z',
  preferredContactMethod: 'any',
  wizardVersion: 'hire-face-painter-landing-v1',
  submission: { attribution: hireAttribution, compatibility: flattenJourney(hireAttribution) },
});
const hire = await callPlan(new CanonicalMockD1(), hirePayload);
assert.equal(hire.response.status, 200, 'existing custom hire form uses the shared atomic contract');

globalThis.fetch = originalFetch;
console.log('PASS AP-02A route parity, browser payload, retry, notification, and atomic attribution fixtures');
