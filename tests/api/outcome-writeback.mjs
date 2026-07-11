#!/usr/bin/env node
import assert from 'node:assert/strict';

import { onRequest as handleOutcomeEndpoint } from '../../functions/api/admin/closed-loop-outcome-writeback.ts';
import {
  handleOutcomeWriteback,
  validateOutcomeWritebackRequest,
} from '../../src/lib/quote-request/outcome-writeback.ts';
import {
  formatGoogleAdsPacificDateTime,
  queueOfflineConversionOutboxEvent,
} from '../../src/lib/quote-request/offline-conversion-outbox.ts';

const tests = [];
const FIXED_NOW = '2026-07-07T22:30:37.000Z';
const QUALIFIED_AT = '2026-07-07T22:30:37.000Z';
const QUOTE_SENT_AT = '2026-07-07T15:19:52.000Z';
const BOOKED_AT = '2026-07-08T01:02:03.000Z';

class MockD1 {
  constructor() {
    this.byLeadId = new Map();
    this.outbox = [];
    this.adminEvents = [];
  }

  prepare(sql) {
    const db = this;
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    return {
      bind(...args) {
        return {
          async first() {
            if (normalized.includes('from quote_requests') && normalized.includes('where lead_id = ?')) {
              return db.byLeadId.get(args[0]) ?? null;
            }
            return null;
          },
          async run() {
            if (normalized.startsWith('update quote_requests')) {
              const row = db.byLeadId.get(args[17]);
              if (!row) return { success: true, meta: { changes: 0 } };
              row.updated_at = args[0];
              row.qualified_status = args[1];
              row.qualified_at_utc = args[2];
              row.quote_sent_status = args[3];
              row.quote_sent_at_utc = args[4];
              row.booked_status = args[5];
              row.booked_at_utc = args[6];
              row.booked_revenue_cents = args[7];
              row.booked_revenue_currency = args[8];
              row.lost_reason = args[9];
              row.duplicate_of_lead_id = args[10];
              row.owner_review_notes = args[11];
              row.owner_reviewed_at_utc = args[12];
              row.owner_reviewed_by = args[13];
              row.is_internal_test = args[14];
              row.internal_test_reason = args[15];
              row.canonical_payload_json = args[16];
              return { success: true, meta: { changes: 1 } };
            }

            if (normalized.startsWith('insert into google_ads_offline_conversion_outbox')) {
              const columns = sql
                .slice(sql.indexOf('(') + 1, sql.indexOf(') VALUES'))
                .split(',')
                .map((column) => column.trim());
              const incoming = Object.fromEntries(columns.map((column, index) => [column, args[index]]));
              const existing = db.outbox.find(
                (row) => row.lead_id === incoming.lead_id && row.event_name === incoming.event_name,
              );
              if (!existing) {
                db.outbox.push(incoming);
                return { success: true, meta: { changes: 1 } };
              }
              const correctable =
                existing.status === 'queued' &&
                existing.attempt_count === 0 &&
                existing.google_ads_upload_job_id == null &&
                existing.google_ads_result_resource_name == null;
              if (!correctable) return { success: true, meta: { changes: 0 } };
              const immutable = {
                outbox_id: existing.outbox_id,
                lead_id: existing.lead_id,
                event_name: existing.event_name,
                order_id: existing.order_id,
                created_at_utc: existing.created_at_utc,
              };
              Object.assign(existing, incoming, immutable);
              return { success: true, meta: { changes: 1 } };
            }

            if (normalized.startsWith('insert into slot_admin_events')) {
              db.adminEvents.push({
                admin_event_id: args[0],
                slot_id: args[1],
                action: args[2],
                actor_label: args[3],
                safe_details_json: args[4],
                created_at: args[5],
              });
              return { success: true, meta: { changes: 1 } };
            }

            return { success: true, meta: { changes: 0 } };
          },
        };
      },
    };
  }
}

function test(name, fn) {
  tests.push({ name, fn });
}

function canonicalLead(overrides = {}) {
  return {
    leadId: 'lead_a810f5a4a912428aa748b24d25ba',
    createdAt: '2026-07-07T15:05:11.677Z',
    sourceConfidence: 'gclid',
    gclid: 'CjwK-test-gclid',
    gbraid: null,
    wbraid: null,
    firstGclid: 'CjwK-test-gclid',
    firstGbraid: null,
    firstWbraid: null,
    submitGclid: 'CjwK-test-gclid',
    submitGbraid: null,
    submitWbraid: null,
    qualifiedStatus: 'unreviewed',
    qualifiedAtUtc: null,
    quoteSentStatus: 'not_sent',
    quoteSentAtUtc: null,
    bookedStatus: 'pending',
    bookedAtUtc: null,
    bookedRevenueCents: null,
    bookedRevenueCurrency: 'USD',
    lostReason: null,
    duplicateOfLeadId: null,
    ownerReviewNotes: null,
    isInternalTest: false,
    internalTestReason: null,
    ...overrides,
  };
}

function seedLead(db, overrides = {}) {
  const canonical = canonicalLead(overrides);
  const row = {
    lead_id: canonical.leadId,
    updated_at: canonical.createdAt,
    canonical_payload_json: JSON.stringify(canonical),
    source_confidence: canonical.sourceConfidence,
    gclid: canonical.gclid,
    gbraid: canonical.gbraid,
    wbraid: canonical.wbraid,
    first_gclid: canonical.firstGclid,
    first_gbraid: canonical.firstGbraid,
    first_wbraid: canonical.firstWbraid,
    submit_gclid: canonical.submitGclid,
    submit_gbraid: canonical.submitGbraid,
    submit_wbraid: canonical.submitWbraid,
    qualified_status: canonical.qualifiedStatus,
    qualified_at_utc: canonical.qualifiedAtUtc,
    quote_sent_status: canonical.quoteSentStatus,
    quote_sent_at_utc: canonical.quoteSentAtUtc,
    booked_status: canonical.bookedStatus,
    booked_at_utc: canonical.bookedAtUtc,
    booked_revenue_cents: canonical.bookedRevenueCents,
    booked_revenue_currency: canonical.bookedRevenueCurrency,
    lost_reason: canonical.lostReason,
    duplicate_of_lead_id: canonical.duplicateOfLeadId,
    owner_review_notes: canonical.ownerReviewNotes,
    owner_reviewed_at_utc: null,
    owner_reviewed_by: null,
    is_internal_test: canonical.isInternalTest ? 1 : 0,
    internal_test_reason: canonical.internalTestReason,
  };
  db.byLeadId.set(row.lead_id, row);
  return row;
}

function baseInput(overrides = {}) {
  return {
    lead_id: 'lead_a810f5a4a912428aa748b24d25ba',
    ready_for_d1_sync: 'yes',
    dry_run: true,
    qualified_status: 'qualified',
    qualified_at_utc: QUALIFIED_AT,
    quote_sent_status: 'sent',
    quote_sent_at_utc: QUOTE_SENT_AT,
    booked_status: 'pending',
    booked_at_utc: null,
    owner_review_notes: 'Owner reviewed from standalone sheet; PII omitted.',
    ...overrides,
  };
}

async function runWriteback(db, body, env = {}) {
  return handleOutcomeWriteback(
    db,
    body,
    env,
    'phase_l_test_admin',
    FIXED_NOW,
  );
}

test('Ready For D1 Sync must be yes before dry-run or writeback', async () => {
  const db = new MockD1();
  seedLead(db);
  const result = await runWriteback(db, baseInput({ ready_for_d1_sync: 'no' }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert(result.validationErrors.includes('Ready For D1 Sync must be yes'));
  assert.equal(db.outbox.length, 0);
  assert.equal(db.adminEvents.length, 0);
  assert.equal(db.byLeadId.get('lead_a810f5a4a912428aa748b24d25ba').qualified_status, 'unreviewed');
});

test('current reviewed lead with Ready For D1 Sync no does not validate for sync', () => {
  const result = validateOutcomeWritebackRequest(baseInput({
    ready_for_d1_sync: 'no',
    qualified_status: 'qualified',
    quote_sent_status: 'sent',
    booked_status: 'pending',
  }));
  assert.equal(result.ok, false);
  assert(result.errors.includes('Ready For D1 Sync must be yes'));
});

test('valid dry-run returns proposed outcome and makes no D1 mutations', async () => {
  const db = new MockD1();
  const row = seedLead(db);
  const result = await runWriteback(db, baseInput());
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.writeApplied, false);
  assert.equal(row.qualified_status, 'unreviewed');
  assert.equal(db.outbox.length, 0);
  assert.equal(db.adminEvents.length, 0);
  assert.equal(result.outboxEligibility.find((item) => item.eventName === 'quote_sent').eligible, true);
});

test('quote_sent cannot be sent unless qualified_status is qualified', async () => {
  const db = new MockD1();
  seedLead(db);
  const result = await runWriteback(db, baseInput({
    qualified_status: 'unreviewed',
    quote_sent_status: 'sent',
  }));
  assert.equal(result.ok, false);
  assert(result.validationErrors.includes('quote_sent requires qualified_status = qualified'));
});

test('milestone statuses require their event-specific UTC timestamps', () => {
  const qualified = validateOutcomeWritebackRequest(baseInput({ qualified_at_utc: null }));
  assert.equal(qualified.ok, false);
  assert(qualified.errors.includes('qualified requires qualified_at_utc'));

  const quoted = validateOutcomeWritebackRequest(baseInput({ quote_sent_at_utc: null }));
  assert.equal(quoted.ok, false);
  assert(quoted.errors.includes('quote_sent requires quote_sent_at_utc'));

  const booked = validateOutcomeWritebackRequest(baseInput({
    booked_status: 'booked',
    booked_at_utc: null,
    booked_revenue_cents: 57500,
  }));
  assert.equal(booked.ok, false);
  assert(booked.errors.includes('booked requires booked_at_utc'));
});

test('booked cannot write back without positive booked revenue', async () => {
  const db = new MockD1();
  seedLead(db);
  const result = await runWriteback(db, baseInput({
    booked_status: 'booked',
    booked_revenue_cents: null,
  }));
  assert.equal(result.ok, false);
  assert(result.validationErrors.includes('booked requires booked_revenue_cents > 0'));
});

test('lost requires lost_reason', async () => {
  const db = new MockD1();
  seedLead(db);
  const result = await runWriteback(db, baseInput({
    quote_sent_status: 'not_sent',
    booked_status: 'lost',
  }));
  assert.equal(result.ok, false);
  assert(result.validationErrors.includes('lost requires lost_reason'));
});

test('duplicate requires duplicate_of_lead_id', async () => {
  const db = new MockD1();
  seedLead(db);
  const result = await runWriteback(db, baseInput({
    qualified_status: 'duplicate',
    quote_sent_status: 'not_sent',
  }));
  assert.equal(result.ok, false);
  assert(result.validationErrors.includes('duplicate requires duplicate_of_lead_id'));
});

test('internal_test requires internal_test_reason', async () => {
  const db = new MockD1();
  seedLead(db);
  const result = await runWriteback(db, baseInput({
    is_internal_test: true,
  }));
  assert.equal(result.ok, false);
  assert(result.validationErrors.includes('internal_test requires internal_test_reason'));
});

test('non-dry-run writeback is blocked unless closed-loop writeback flag is enabled', async () => {
  const db = new MockD1();
  const row = seedLead(db);
  const result = await runWriteback(db, baseInput({ dry_run: false }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(row.qualified_status, 'unreviewed');
  assert.equal(db.adminEvents.length, 0);
});

test('enabled writeback updates outcomes and logs audit without Google Ads outbox flag', async () => {
  const db = new MockD1();
  const row = seedLead(db);
  const result = await runWriteback(db, baseInput({ dry_run: false }), {
    CLOSED_LOOP_OUTCOME_WRITEBACK_ENABLED: 'true',
    GOOGLE_ADS_OFFLINE_OUTBOX_ENABLED: 'false',
  });
  assert.equal(result.ok, true);
  assert.equal(row.qualified_status, 'qualified');
  assert.equal(row.qualified_at_utc, QUALIFIED_AT);
  assert.equal(row.quote_sent_status, 'sent');
  assert.equal(row.quote_sent_at_utc, QUOTE_SENT_AT);
  assert.equal(row.booked_status, 'pending');
  assert.equal(row.owner_reviewed_by, 'phase_l_test_admin');
  assert.equal(db.outbox.length, 0);
  assert.equal(db.adminEvents.length, 1);
  assert.equal(JSON.parse(db.adminEvents[0].safe_details_json).leadId, row.lead_id);
  assert(result.outboxResults.every((item) => item.reason === 'feature_flag_disabled'));
});

test('enabled writeback queues qualified and quote-sent outbox rows only when outbox flag is enabled', async () => {
  const db = new MockD1();
  seedLead(db);
  const result = await runWriteback(db, baseInput({ dry_run: false }), {
    CLOSED_LOOP_OUTCOME_WRITEBACK_ENABLED: 'true',
    GOOGLE_ADS_OFFLINE_OUTBOX_ENABLED: 'true',
  });
  assert.equal(result.ok, true);
  assert.equal(db.outbox.length, 2);
  assert(db.outbox.some((row) => row.event_name === 'qualified_lead'));
  assert(db.outbox.some((row) => row.event_name === 'quote_sent'));
  assert(!db.outbox.some((row) => row.event_name === 'booked_event'));
  const qualified = db.outbox.find((row) => row.event_name === 'qualified_lead');
  const quoted = db.outbox.find((row) => row.event_name === 'quote_sent');
  assert.equal(qualified.conversion_time_utc, '2026-07-07 22:30:37+00:00');
  assert.equal(qualified.conversion_time_pacific, '2026-07-07 15:30:37-07:00');
  assert.equal(quoted.conversion_time_utc, '2026-07-07 15:19:52+00:00');
  assert.equal(quoted.conversion_time_pacific, '2026-07-07 08:19:52-07:00');
});

test('booked writeback queues booked_event with value only when qualified booked and revenue present', async () => {
  const db = new MockD1();
  seedLead(db);
  const result = await runWriteback(db, baseInput({
    dry_run: false,
    booked_status: 'booked',
    booked_at_utc: BOOKED_AT,
    booked_revenue_cents: 57500,
  }), {
    CLOSED_LOOP_OUTCOME_WRITEBACK_ENABLED: 'true',
    GOOGLE_ADS_OFFLINE_OUTBOX_ENABLED: 'true',
  });
  assert.equal(result.ok, true);
  assert.equal(db.outbox.length, 3);
  const booked = db.outbox.find((row) => row.event_name === 'booked_event');
  assert(booked);
  assert.equal(booked.conversion_value, 575);
  assert.equal(booked.booked_revenue_cents_snapshot, 57500);
  assert.equal(booked.conversion_time_utc, '2026-07-08 01:02:03+00:00');
  assert.equal(booked.conversion_time_pacific, '2026-07-07 18:02:03-07:00');
});

test('Pacific conversion timestamps use the correct daylight and standard offsets', () => {
  assert.equal(formatGoogleAdsPacificDateTime('2026-07-07T22:30:37.000Z'), '2026-07-07 15:30:37-07:00');
  assert.equal(formatGoogleAdsPacificDateTime('2026-01-07T22:30:37.000Z'), '2026-01-07 14:30:37-08:00');
});

function seedExistingQualifiedOutbox(db, overrides = {}) {
  const row = {
    outbox_id: 'gads_lead_a810f5a4a912428aa748b24d25ba_qualified_lead',
    lead_id: 'lead_a810f5a4a912428aa748b24d25ba',
    event_name: 'qualified_lead',
    conversion_action_name: 'HFLA | Offline | Qualified Lead',
    conversion_time_utc: '2026-07-09 21:21:04+00:00',
    conversion_time_pacific: '2026-07-09 14:21:04-07:00',
    order_id: 'hfla:lead_a810f5a4a912428aa748b24d25ba:qualified_lead',
    status: 'queued',
    attempt_count: 0,
    google_ads_upload_job_id: null,
    google_ads_result_resource_name: null,
    created_at_utc: '2026-07-09T21:21:04.532Z',
    ...overrides,
  };
  db.outbox.push(row);
  return row;
}

async function correctQualifiedOutbox(db) {
  return queueOfflineConversionOutboxEvent(
    db,
    canonicalLead({ qualifiedStatus: 'qualified', qualifiedAtUtc: QUALIFIED_AT }),
    'qualified_lead',
    { qualifiedStatus: 'qualified', qualifiedAtUtc: QUALIFIED_AT },
    { GOOGLE_ADS_OFFLINE_OUTBOX_ENABLED: 'true' },
  );
}

test('queued never-attempted outbox row is corrected without changing transaction_id', async () => {
  const db = new MockD1();
  const row = seedExistingQualifiedOutbox(db);
  const transactionId = row.order_id;
  const result = await correctQualifiedOutbox(db);
  assert.equal(result.queued, true);
  assert.equal(row.conversion_time_utc, '2026-07-07 22:30:37+00:00');
  assert.equal(row.conversion_time_pacific, '2026-07-07 15:30:37-07:00');
  assert.equal(row.order_id, transactionId);
});

test('attempted outbox row cannot be corrected', async () => {
  const db = new MockD1();
  const row = seedExistingQualifiedOutbox(db, { attempt_count: 1 });
  const originalTimestamp = row.conversion_time_utc;
  const result = await correctQualifiedOutbox(db);
  assert.equal(result.queued, false);
  assert.equal(result.reason, 'existing_outbox_not_correctable');
  assert.equal(row.conversion_time_utc, originalTimestamp);
});

test('imported outbox row cannot be corrected', async () => {
  const db = new MockD1();
  const row = seedExistingQualifiedOutbox(db, { status: 'imported' });
  const originalTimestamp = row.conversion_time_utc;
  const result = await correctQualifiedOutbox(db);
  assert.equal(result.queued, false);
  assert.equal(result.reason, 'existing_outbox_not_correctable');
  assert.equal(row.conversion_time_utc, originalTimestamp);
});

test('failed outbox row cannot be corrected', async () => {
  const db = new MockD1();
  const row = seedExistingQualifiedOutbox(db, { status: 'failed' });
  const originalTimestamp = row.conversion_time_utc;
  const result = await correctQualifiedOutbox(db);
  assert.equal(result.queued, false);
  assert.equal(result.reason, 'existing_outbox_not_correctable');
  assert.equal(row.conversion_time_utc, originalTimestamp);
});

test('outbox row with either upload identifier cannot be corrected', async () => {
  for (const identifiers of [
    { google_ads_upload_job_id: 'job_123' },
    { google_ads_result_resource_name: 'customers/123/conversionUploads/456' },
  ]) {
    const db = new MockD1();
    const row = seedExistingQualifiedOutbox(db, identifiers);
    const originalTimestamp = row.conversion_time_utc;
    const result = await correctQualifiedOutbox(db);
    assert.equal(result.queued, false);
    assert.equal(result.reason, 'existing_outbox_not_correctable');
    assert.equal(row.conversion_time_utc, originalTimestamp);
  }
});

test('missing event milestone timestamp blocks outbox eligibility', async () => {
  const db = new MockD1();
  const result = await queueOfflineConversionOutboxEvent(
    db,
    canonicalLead({ qualifiedStatus: 'qualified', qualifiedAtUtc: null }),
    'qualified_lead',
    { qualifiedStatus: 'qualified', qualifiedAtUtc: null },
    { GOOGLE_ADS_OFFLINE_OUTBOX_ENABLED: 'true' },
  );
  assert.equal(result.queued, false);
  assert.equal(result.reason, 'missing_qualified_at_utc');
  assert.equal(db.outbox.length, 0);
});

test('cannot_determine is valid but suppresses every outbox eligibility preview', async () => {
  const db = new MockD1();
  seedLead(db);
  const result = await runWriteback(db, baseInput({
    qualified_status: 'cannot_determine',
    quote_sent_status: 'not_sent',
  }));
  assert.equal(result.ok, true);
  assert(result.outboxEligibility.every((item) => !item.eligible && item.reason === 'qualified_status_cannot_determine'));
});

test('missing Google click ID suppresses outbox eligibility', async () => {
  const db = new MockD1();
  seedLead(db, {
    sourceConfidence: 'direct',
    gclid: null,
    firstGclid: null,
    submitGclid: null,
  });
  const result = await runWriteback(db, baseInput());
  assert.equal(result.ok, true);
  assert(result.outboxEligibility.every((item) => !item.eligible && item.reason === 'missing_google_click_id'));
});

test('admin endpoint rejects missing token before reading body or D1', async () => {
  const response = await handleOutcomeEndpoint({
    request: new Request('https://local.test/api/admin/closed-loop-outcome-writeback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(baseInput()),
    }),
    env: {
      CLOSED_LOOP_OUTCOME_WRITEBACK_TOKEN: 'test-token',
      AVAILABILITY_D1: new MockD1(),
    },
  });
  assert.equal(response.status, 401);
});

try {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`PASS ${name}`);
  }
  console.log(`\n${tests.length} outcome writeback tests passed`);
} finally {
  // No global state to restore.
}

