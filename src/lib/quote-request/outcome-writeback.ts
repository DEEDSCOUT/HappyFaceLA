import type { D1Database, D1PreparedStatement, D1Value } from '../booking/availability-types.ts';
import { redactError } from '../booking/availability-store.ts';
import {
  generateSafeId,
  isRecord,
  isIsoInstant,
  sanitizeSafeString,
} from '../booking/availability-validation.ts';
import { redactAuditDetails } from '../booking/slot-audit.ts';
import type {
  BookedStatus,
  CanonicalPlanMyPartyLead,
  QualifiedStatus,
  QuoteSentStatus,
} from './canonical-lead.ts';
import {
  evaluateOfflineConversionOutboxEvents,
  formatGoogleAdsUtcDateTime,
  isOfflineConversionOutboxRowCorrectable,
  isOfflineOutboxEnabled,
  prepareOfflineConversionOutboxEvents,
  selectOfflineConversionOutboxRows,
  type OfflineConversionEnv,
  type OfflineConversionEventName,
  type OfflineConversionOutcomeInput,
  type OfflineConversionOutboxEligibility,
  type OfflineConversionOutboxResult,
  type OfflineConversionOutboxRowState,
  type PreparedOfflineConversionOutboxEvent,
} from './offline-conversion-outbox.ts';
import {
  prepareQuoteRequestMilestoneUpsert,
  selectQuoteRequestMilestoneTimes,
  type QuoteRequestMilestoneTimes,
  type QuoteRequestMilestoneType,
  type QuoteRequestMilestoneWrite,
} from './milestones.ts';

export type OutcomeWritebackEnv = OfflineConversionEnv & {
  CLOSED_LOOP_OUTCOME_WRITEBACK_ENABLED?: string;
};

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export type OutcomeWritebackInput = {
  leadId: string;
  readyForD1Sync: 'yes';
  dryRun: boolean;
  qualifiedStatus: QualifiedStatus;
  qualifiedAtUtc: string | null;
  quoteSentStatus: QuoteSentStatus;
  quoteSentAtUtc: string | null;
  bookedStatus: BookedStatus;
  bookedAtUtc: string | null;
  bookedRevenueCents: number | null;
  lostReason: string | null;
  duplicateOfLeadId: string | null;
  isInternalTest: boolean;
  internalTestReason: string | null;
  ownerReviewNotes: string | null;
  ownerReviewedBy: string | null;
};

type QuoteRequestOutcomeRow = {
  lead_id: string;
  updated_at: string | null;
  canonical_payload_json: string;
  source_confidence: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  first_gclid: string | null;
  first_gbraid: string | null;
  first_wbraid: string | null;
  submit_gclid: string | null;
  submit_gbraid: string | null;
  submit_wbraid: string | null;
  qualified_status: QualifiedStatus;
  quote_sent_status: QuoteSentStatus;
  quote_sent_at_utc: string | null;
  booked_status: BookedStatus;
  booked_revenue_cents: number | null;
  booked_revenue_currency: string | null;
  lost_reason: string | null;
  duplicate_of_lead_id: string | null;
  owner_review_notes: string | null;
  owner_reviewed_at_utc: string | null;
  owner_reviewed_by: string | null;
  is_internal_test: number;
  internal_test_reason: string | null;
};

type OutcomeSnapshot = {
  qualifiedStatus: QualifiedStatus;
  qualifiedAtUtc: string | null;
  quoteSentStatus: QuoteSentStatus;
  quoteSentAtUtc: string | null;
  bookedStatus: BookedStatus;
  bookedAtUtc: string | null;
  bookedRevenueCents: number | null;
  lostReason: string | null;
  duplicateOfLeadId: string | null;
  isInternalTest: boolean;
  internalTestReason: string | null;
};

export type OutcomeWritebackResult =
  | {
      ok: true;
      status: 200;
      leadId: string;
      dryRun: boolean;
      writeApplied: boolean;
      auditLogged: boolean;
      googleAdsOfflineOutboxEnabled: boolean;
      current: OutcomeSnapshot;
      proposed: OutcomeSnapshot;
      outboxEligibility: OfflineConversionOutboxEligibility[];
      outboxResults: OfflineConversionOutboxResult[];
    }
  | {
      ok: false;
      status: 400 | 403 | 404 | 409 | 503;
      error: string;
      validationErrors?: string[];
    };

const QUALIFIED_STATUSES: readonly QualifiedStatus[] = [
  'unreviewed',
  'qualified',
  'weak',
  'spam',
  'outside_area',
  'wrong_service',
  'duplicate',
  'cannot_determine',
];

const QUOTE_SENT_STATUSES: readonly QuoteSentStatus[] = [
  'not_sent',
  'sent',
  'not_needed',
  'cannot_determine',
];

const BOOKED_STATUSES: readonly BookedStatus[] = [
  'pending',
  'not_booked',
  'booked',
  'lost',
  'cannot_determine',
];

const LEAD_ID_RE = /^lead_[a-z0-9]{8,80}$/i;

function isWritebackEnabled(env: OutcomeWritebackEnv): boolean {
  return String(env.CLOSED_LOOP_OUTCOME_WRITEBACK_ENABLED ?? '').trim().toLowerCase() === 'true';
}

function pick(record: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
}

function normalizeString(value: unknown, maxLen = 500): string {
  return sanitizeSafeString(value, maxLen).replace(/\s+/g, ' ').trim();
}

function normalizeNullableString(value: unknown, maxLen = 1000): string | null {
  const normalized = normalizeString(value, maxLen);
  return normalized || null;
}

function normalizeBoolean(value: unknown): boolean {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes' || normalized === '1') return true;
    if (normalized === 'false' || normalized === 'no' || normalized === '0' || normalized === '') return false;
  }
  return false;
}

function normalizeDryRun(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return normalizeBoolean(value);
}

function normalizeReady(value: unknown): 'yes' | null {
  return typeof value === 'string' && value.trim().toLowerCase() === 'yes' ? 'yes' : null;
}

function normalizeQualifiedStatus(value: unknown): QualifiedStatus | null {
  const normalized = normalizeString(value, 40) as QualifiedStatus;
  return QUALIFIED_STATUSES.includes(normalized) ? normalized : null;
}

function normalizeQuoteSentStatus(value: unknown): QuoteSentStatus | null {
  const normalized = normalizeString(value, 40) as QuoteSentStatus;
  return QUOTE_SENT_STATUSES.includes(normalized) ? normalized : null;
}

function normalizeBookedStatus(value: unknown): BookedStatus | null {
  const normalized = normalizeString(value, 40) as BookedStatus;
  return BOOKED_STATUSES.includes(normalized) ? normalized : null;
}

function normalizeRevenueCents(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = trimmed.replace(/[$,\s]/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(numeric)) return null;
  return Math.round(Number(numeric) * 100);
}

function normalizeRevenueFromRecord(record: Record<string, unknown>): number | null {
  const cents = pick(record, [
    'booked_revenue_cents',
    'bookedRevenueCents',
    'owner_booked_revenue_cents',
    'ownerBookedRevenueCents',
  ]);
  if (cents !== undefined && cents !== null && cents !== '') {
    if (typeof cents === 'number') return Number.isInteger(cents) && cents >= 0 ? cents : null;
    if (typeof cents === 'string' && /^\d+$/.test(cents.trim())) return Number(cents.trim());
    return null;
  }
  return normalizeRevenueCents(pick(record, [
    'booked_revenue',
    'bookedRevenue',
    'owner_booked_revenue',
    'ownerBookedRevenue',
  ]));
}

function validateOutcomeRules(input: OutcomeWritebackInput): string[] {
  const errors: string[] = [];
  if (input.qualifiedStatus === 'qualified' && !input.qualifiedAtUtc) {
    errors.push('qualified requires qualified_at_utc');
  }
  if (input.quoteSentStatus === 'sent' && input.qualifiedStatus !== 'qualified') {
    errors.push('quote_sent requires qualified_status = qualified');
  }
  if (input.quoteSentStatus === 'sent' && !input.quoteSentAtUtc) {
    errors.push('quote_sent requires quote_sent_at_utc');
  }
  if (input.bookedStatus === 'booked') {
    if (input.qualifiedStatus !== 'qualified') errors.push('booked requires qualified_status = qualified');
    if (!input.bookedAtUtc) errors.push('booked requires booked_at_utc');
    if (input.bookedRevenueCents === null || input.bookedRevenueCents <= 0) {
      errors.push('booked requires booked_revenue_cents > 0');
    }
  }
  if (input.bookedStatus === 'lost' && !input.lostReason) {
    errors.push('lost requires lost_reason');
  }
  if (input.qualifiedStatus === 'duplicate') {
    if (!input.duplicateOfLeadId) errors.push('duplicate requires duplicate_of_lead_id');
    if (input.duplicateOfLeadId === input.leadId) errors.push('duplicate_of_lead_id cannot equal lead_id');
  }
  if (input.isInternalTest && !input.internalTestReason) {
    errors.push('internal_test requires internal_test_reason');
  }
  return errors;
}

export function validateOutcomeWritebackRequest(value: unknown): ValidationResult<OutcomeWritebackInput> {
  if (!isRecord(value)) return { ok: false, errors: ['request body must be an object'] };

  const errors: string[] = [];
  const leadId = normalizeString(pick(value, ['lead_id', 'leadId']), 120);
  if (!LEAD_ID_RE.test(leadId)) errors.push('lead_id is required and must be a canonical D1 lead_id');

  const readyForD1Sync = normalizeReady(pick(value, ['ready_for_d1_sync', 'readyForD1Sync', 'ready_for_sync']));
  if (readyForD1Sync !== 'yes') errors.push('Ready For D1 Sync must be yes');

  const qualifiedStatus = normalizeQualifiedStatus(pick(value, [
    'qualified_status',
    'qualifiedStatus',
    'owner_qualified_status',
    'ownerQualifiedStatus',
  ]));
  if (!qualifiedStatus) errors.push('qualified_status is required and must be controlled');

  const quoteSentStatus = normalizeQuoteSentStatus(pick(value, [
    'quote_sent_status',
    'quoteSentStatus',
    'owner_quote_sent_status',
    'ownerQuoteSentStatus',
  ])) ?? 'not_sent';

  const bookedStatus = normalizeBookedStatus(pick(value, [
    'booked_status',
    'bookedStatus',
    'owner_booked_status',
    'ownerBookedStatus',
  ])) ?? 'pending';

  const qualifiedAtUtc = normalizeNullableString(pick(value, ['qualified_at_utc', 'qualifiedAtUtc']), 40);
  if (qualifiedAtUtc !== null && !isIsoInstant(qualifiedAtUtc)) {
    errors.push('qualified_at_utc must be an ISO UTC instant');
  }

  const quoteSentAtUtc = normalizeNullableString(pick(value, ['quote_sent_at_utc', 'quoteSentAtUtc']), 40);
  if (quoteSentAtUtc !== null && !isIsoInstant(quoteSentAtUtc)) {
    errors.push('quote_sent_at_utc must be an ISO UTC instant');
  }

  const bookedAtUtc = normalizeNullableString(pick(value, ['booked_at_utc', 'bookedAtUtc']), 40);
  if (bookedAtUtc !== null && !isIsoInstant(bookedAtUtc)) {
    errors.push('booked_at_utc must be an ISO UTC instant');
  }

  const duplicateOfLeadId = normalizeNullableString(pick(value, [
    'duplicate_of_lead_id',
    'duplicateOfLeadId',
    'owner_duplicate_of_lead_id',
    'ownerDuplicateOfLeadId',
  ]), 120);
  if (duplicateOfLeadId !== null && !LEAD_ID_RE.test(duplicateOfLeadId)) {
    errors.push('duplicate_of_lead_id must be a canonical D1 lead_id');
  }

  const input: OutcomeWritebackInput = {
    leadId,
    readyForD1Sync: readyForD1Sync ?? 'yes',
    dryRun: normalizeDryRun(pick(value, ['dry_run', 'dryRun'])),
    qualifiedStatus: qualifiedStatus ?? 'unreviewed',
    qualifiedAtUtc,
    quoteSentStatus,
    quoteSentAtUtc,
    bookedStatus,
    bookedAtUtc,
    bookedRevenueCents: normalizeRevenueFromRecord(value),
    lostReason: normalizeNullableString(pick(value, ['lost_reason', 'lostReason', 'owner_lost_reason', 'ownerLostReason']), 120),
    duplicateOfLeadId,
    isInternalTest: normalizeBoolean(pick(value, [
      'is_internal_test',
      'isInternalTest',
      'owner_internal_test',
      'ownerInternalTest',
    ])),
    internalTestReason: normalizeNullableString(pick(value, [
      'internal_test_reason',
      'internalTestReason',
      'owner_internal_test_reason',
      'ownerInternalTestReason',
    ]), 200),
    ownerReviewNotes: normalizeNullableString(pick(value, ['owner_review_notes', 'ownerReviewNotes']), 1000),
    ownerReviewedBy: normalizeNullableString(pick(value, ['owner_reviewed_by', 'ownerReviewedBy', 'reviewed_by', 'reviewedBy']), 120),
  };

  errors.push(...validateOutcomeRules(input));
  return errors.length ? { ok: false, errors } : { ok: true, value: input };
}

function snapshotFromRow(
  row: QuoteRequestOutcomeRow,
  milestones: QuoteRequestMilestoneTimes,
): OutcomeSnapshot {
  return {
    qualifiedStatus: row.qualified_status,
    qualifiedAtUtc: milestones.qualifiedLead,
    quoteSentStatus: row.quote_sent_status,
    quoteSentAtUtc: milestones.quoteSent,
    bookedStatus: row.booked_status,
    bookedAtUtc: milestones.bookedEvent,
    bookedRevenueCents: row.booked_revenue_cents,
    lostReason: row.lost_reason,
    duplicateOfLeadId: row.duplicate_of_lead_id,
    isInternalTest: row.is_internal_test === 1,
    internalTestReason: row.internal_test_reason,
  };
}

function snapshotFromInput(input: OutcomeWritebackInput): OutcomeSnapshot {
  return {
    qualifiedStatus: input.qualifiedStatus,
    qualifiedAtUtc: input.qualifiedStatus === 'qualified' ? input.qualifiedAtUtc : null,
    quoteSentStatus: input.quoteSentStatus,
    quoteSentAtUtc: input.quoteSentStatus === 'sent' ? input.quoteSentAtUtc : null,
    bookedStatus: input.bookedStatus,
    bookedAtUtc: input.bookedStatus === 'booked' ? input.bookedAtUtc : null,
    bookedRevenueCents: input.bookedRevenueCents,
    lostReason: input.lostReason,
    duplicateOfLeadId: input.duplicateOfLeadId,
    isInternalTest: input.isInternalTest,
    internalTestReason: input.internalTestReason,
  };
}

function applyOutcomeToCanonical(
  lead: CanonicalPlanMyPartyLead,
  input: OutcomeWritebackInput,
): CanonicalPlanMyPartyLead {
  return {
    ...lead,
    qualifiedStatus: input.qualifiedStatus,
    quoteSentStatus: input.quoteSentStatus,
    bookedStatus: input.bookedStatus,
    bookedRevenueCents: input.bookedRevenueCents,
    bookedRevenueCurrency: 'USD',
    lostReason: input.lostReason,
    duplicateOfLeadId: input.duplicateOfLeadId,
    ownerReviewNotes: input.ownerReviewNotes,
    isInternalTest: input.isInternalTest,
    internalTestReason: input.internalTestReason,
  };
}

function canonicalFromRow(row: QuoteRequestOutcomeRow): CanonicalPlanMyPartyLead | null {
  try {
    const parsed: unknown = JSON.parse(row.canonical_payload_json);
    if (!isRecord(parsed)) return null;
    if (parsed.leadId !== row.lead_id) return null;
    const canonical = parsed as Partial<CanonicalPlanMyPartyLead>;
    if (typeof canonical.createdAt !== 'string' || typeof canonical.sourceConfidence !== 'string') return null;
    return {
      ...canonical,
      leadId: row.lead_id,
      gclid: row.gclid ?? canonical.gclid ?? null,
      gbraid: row.gbraid ?? canonical.gbraid ?? null,
      wbraid: row.wbraid ?? canonical.wbraid ?? null,
      firstGclid: row.first_gclid ?? canonical.firstGclid ?? null,
      firstGbraid: row.first_gbraid ?? canonical.firstGbraid ?? null,
      firstWbraid: row.first_wbraid ?? canonical.firstWbraid ?? null,
      submitGclid: row.submit_gclid ?? canonical.submitGclid ?? null,
      submitGbraid: row.submit_gbraid ?? canonical.submitGbraid ?? null,
      submitWbraid: row.submit_wbraid ?? canonical.submitWbraid ?? null,
      sourceConfidence: (row.source_confidence ?? canonical.sourceConfidence) as CanonicalPlanMyPartyLead['sourceConfidence'],
      qualifiedStatus: row.qualified_status,
      quoteSentStatus: row.quote_sent_status,
      bookedStatus: row.booked_status,
      bookedRevenueCents: row.booked_revenue_cents,
      bookedRevenueCurrency: row.booked_revenue_currency ?? 'USD',
      lostReason: row.lost_reason,
      duplicateOfLeadId: row.duplicate_of_lead_id,
      ownerReviewNotes: row.owner_review_notes,
      isInternalTest: row.is_internal_test === 1,
      internalTestReason: row.internal_test_reason,
    } as CanonicalPlanMyPartyLead;
  } catch {
    return null;
  }
}

async function selectQuoteRequestOutcomeRow(
  db: D1Database,
  leadId: string,
): Promise<QuoteRequestOutcomeRow | null> {
  return db.prepare(
    `SELECT
       lead_id, updated_at, canonical_payload_json, source_confidence,
       gclid, gbraid, wbraid, first_gclid, first_gbraid, first_wbraid,
       submit_gclid, submit_gbraid, submit_wbraid,
       qualified_status, quote_sent_status, quote_sent_at_utc,
       booked_status, booked_revenue_cents, booked_revenue_currency,
       lost_reason, duplicate_of_lead_id, owner_review_notes,
       owner_reviewed_at_utc, owner_reviewed_by,
       is_internal_test, internal_test_reason
     FROM quote_requests
     WHERE lead_id = ?
     LIMIT 1`,
  ).bind(leadId).first<QuoteRequestOutcomeRow>();
}

function prepareQuoteRequestOutcomeUpdate(
  db: D1Database,
  input: OutcomeWritebackInput,
  canonical: CanonicalPlanMyPartyLead,
  actorLabel: string,
  nowIso: string,
): D1PreparedStatement {
  const quoteSentAtUtc = input.quoteSentStatus === 'sent' ? input.quoteSentAtUtc : null;
  const canonicalPayload = JSON.stringify(applyOutcomeToCanonical(canonical, input));
  const values: D1Value[] = [
    nowIso,
    input.qualifiedStatus,
    input.quoteSentStatus,
    quoteSentAtUtc,
    input.bookedStatus,
    input.bookedRevenueCents,
    'USD',
    input.lostReason,
    input.duplicateOfLeadId,
    input.ownerReviewNotes,
    nowIso,
    input.ownerReviewedBy ?? actorLabel,
    input.isInternalTest ? 1 : 0,
    input.internalTestReason,
    canonicalPayload,
    input.leadId,
  ];
  return db.prepare(
    `UPDATE quote_requests
     SET updated_at = ?,
         qualified_status = ?,
         quote_sent_status = ?,
         quote_sent_at_utc = ?,
         booked_status = ?,
         booked_revenue_cents = ?,
         booked_revenue_currency = ?,
         lost_reason = ?,
         duplicate_of_lead_id = ?,
         owner_review_notes = ?,
         owner_reviewed_at_utc = ?,
         owner_reviewed_by = ?,
         is_internal_test = ?,
         internal_test_reason = ?,
         canonical_payload_json = ?
     WHERE lead_id = ?`,
  ).bind(...values);
}

function milestoneTimesFromInput(input: OutcomeWritebackInput): QuoteRequestMilestoneTimes {
  return {
    qualifiedLead: input.qualifiedStatus === 'qualified' ? input.qualifiedAtUtc : null,
    quoteSent: input.quoteSentStatus === 'sent' ? input.quoteSentAtUtc : null,
    bookedEvent: input.bookedStatus === 'booked' ? input.bookedAtUtc : null,
  };
}

function milestoneWritesFromInput(
  input: OutcomeWritebackInput,
  recordedBy: string,
  nowIso: string,
): QuoteRequestMilestoneWrite[] {
  const writes: QuoteRequestMilestoneWrite[] = [];
  const add = (milestoneType: QuoteRequestMilestoneType, occurredAtUtc: string | null): void => {
    if (!occurredAtUtc) return;
    writes.push({
      leadId: input.leadId,
      milestoneType,
      occurredAtUtc,
      recordedAtUtc: nowIso,
      recordedBy,
    });
  };

  if (input.qualifiedStatus === 'qualified') add('qualified_lead', input.qualifiedAtUtc);
  if (input.quoteSentStatus === 'sent') add('quote_sent', input.quoteSentAtUtc);
  if (input.bookedStatus === 'booked') add('booked_event', input.bookedAtUtc);
  return writes;
}

function outcomeInput(
  input: OutcomeWritebackInput,
  milestones: QuoteRequestMilestoneTimes,
): OfflineConversionOutcomeInput {
  return {
    qualifiedStatus: input.qualifiedStatus,
    quoteSentStatus: input.quoteSentStatus,
    bookedStatus: input.bookedStatus,
    bookedRevenueCents: input.bookedRevenueCents,
    duplicateOfLeadId: input.duplicateOfLeadId,
    isInternalTest: input.isInternalTest,
    internalTestReason: input.internalTestReason,
    milestoneTimes: milestones,
  };
}

function prepareOutcomeAuditStatement(
  db: D1Database,
  input: OutcomeWritebackInput,
  actorLabel: string,
  outboxResults: OfflineConversionOutboxResult[],
  nowIso: string,
): D1PreparedStatement {
  const safeDetails = redactAuditDetails({
    action: 'closed_loop_outcome_writeback',
    leadId: input.leadId,
    readyForD1Sync: true,
    dryRun: false,
    qualifiedStatus: input.qualifiedStatus,
    quoteSentStatus: input.quoteSentStatus,
    bookedStatus: input.bookedStatus,
    bookedRevenueCents: input.bookedRevenueCents,
    outboxQueuedCount: outboxResults.filter((result) => result.queued).length,
    outboxSuppressedCount: outboxResults.filter((result) => !result.queued).length,
  });
  return db.prepare(
    `INSERT INTO slot_admin_events (
       admin_event_id, slot_id, action, actor_label, safe_details_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    generateSafeId('admin'),
    null,
    'closed_loop_outcome_writeback',
    actorLabel.slice(0, 80),
    JSON.stringify(safeDetails),
    nowIso,
  );
}

function milestoneTimeForType(
  milestones: QuoteRequestMilestoneTimes,
  milestoneType: QuoteRequestMilestoneType,
): string | null {
  if (milestoneType === 'qualified_lead') return milestones.qualifiedLead;
  if (milestoneType === 'quote_sent') return milestones.quoteSent;
  return milestones.bookedEvent;
}

function blockedMilestoneCorrection(
  writes: QuoteRequestMilestoneWrite[],
  currentMilestones: QuoteRequestMilestoneTimes,
  outboxRows: Map<OfflineConversionEventName, OfflineConversionOutboxRowState>,
): QuoteRequestMilestoneType | null {
  for (const write of writes) {
    const existing = outboxRows.get(write.milestoneType);
    if (!existing) continue;
    const currentMilestone = milestoneTimeForType(currentMilestones, write.milestoneType);
    const desiredConversionTime = formatGoogleAdsUtcDateTime(write.occurredAtUtc);
    if (
      (
        (currentMilestone !== null && currentMilestone !== write.occurredAtUtc)
        || existing.conversion_time_utc !== desiredConversionTime
      )
      && !isOfflineConversionOutboxRowCorrectable(existing)
    ) {
      return write.milestoneType;
    }
  }
  return null;
}

function omitImmutableOutboxMutations(
  prepared: PreparedOfflineConversionOutboxEvent[],
  outboxRows: Map<OfflineConversionEventName, OfflineConversionOutboxRowState>,
): PreparedOfflineConversionOutboxEvent[] {
  return prepared.map((mutation) => {
    const existing = outboxRows.get(mutation.eventName);
    if (!mutation.statement || !existing || isOfflineConversionOutboxRowCorrectable(existing)) {
      return mutation;
    }
    return {
      ...mutation,
      statement: null,
      result: {
        queued: false,
        eventName: mutation.eventName,
        reason: 'existing_outbox_not_correctable',
      },
    };
  });
}

export async function handleOutcomeWriteback(
  db: D1Database | undefined,
  rawInput: unknown,
  env: OutcomeWritebackEnv,
  actorLabel: string,
  nowIso = new Date().toISOString(),
): Promise<OutcomeWritebackResult> {
  const parsed = validateOutcomeWritebackRequest(rawInput);
  if (!parsed.ok) {
    return {
      ok: false,
      status: 400,
      error: 'Outcome writeback request is invalid',
      validationErrors: parsed.errors,
    };
  }

  if (!db) return { ok: false, status: 503, error: 'Quote request storage is not configured' };

  let row: QuoteRequestOutcomeRow | null;
  let currentMilestones: QuoteRequestMilestoneTimes;
  try {
    [row, currentMilestones] = await Promise.all([
      selectQuoteRequestOutcomeRow(db, parsed.value.leadId),
      selectQuoteRequestMilestoneTimes(db, parsed.value.leadId),
    ]);
  } catch (error) {
    console.error(`[closed-loop-outcome-writeback] Read failed: ${redactError(error)}`);
    return { ok: false, status: 503, error: 'Closed-loop outcome storage is unavailable' };
  }
  if (!row) return { ok: false, status: 404, error: 'Lead not found' };

  const canonical = canonicalFromRow(row);
  if (!canonical) return { ok: false, status: 503, error: 'Lead canonical payload is missing or malformed' };

  const proposedCanonical = applyOutcomeToCanonical(canonical, parsed.value);
  const proposedMilestones = milestoneTimesFromInput(parsed.value);
  const outboxInput = outcomeInput(parsed.value, proposedMilestones);
  const outboxEligibility = evaluateOfflineConversionOutboxEvents(proposedCanonical, outboxInput);

  if (parsed.value.dryRun) {
    return {
      ok: true,
      status: 200,
      leadId: parsed.value.leadId,
      dryRun: true,
      writeApplied: false,
      auditLogged: false,
      googleAdsOfflineOutboxEnabled: isOfflineOutboxEnabled(env),
      current: snapshotFromRow(row, currentMilestones),
      proposed: snapshotFromInput(parsed.value),
      outboxEligibility,
      outboxResults: [],
    };
  }

  if (!isWritebackEnabled(env)) {
    return { ok: false, status: 403, error: 'Closed-loop outcome writeback is disabled' };
  }

  if (!db.batch) {
    return { ok: false, status: 503, error: 'Atomic D1 batch writeback is unavailable' };
  }

  const recordedBy = parsed.value.ownerReviewedBy ?? actorLabel;
  const milestoneWrites = milestoneWritesFromInput(parsed.value, recordedBy, nowIso);
  let outboxRows: Map<OfflineConversionEventName, OfflineConversionOutboxRowState>;
  try {
    outboxRows = await selectOfflineConversionOutboxRows(db, parsed.value.leadId);
  } catch (error) {
    console.error(`[closed-loop-outcome-writeback] Outbox guard read failed: ${redactError(error)}`);
    return { ok: false, status: 503, error: 'Closed-loop outbox guard is unavailable' };
  }

  const blockedMilestone = blockedMilestoneCorrection(milestoneWrites, currentMilestones, outboxRows);
  if (blockedMilestone) {
    return {
      ok: false,
      status: 409,
      error: `${blockedMilestone} timestamp cannot change after its outbox row is attempted or externally identified`,
    };
  }

  const preparedOutbox = omitImmutableOutboxMutations(
    prepareOfflineConversionOutboxEvents(db, proposedCanonical, outboxInput, env, nowIso),
    outboxRows,
  );
  const outboxResults = preparedOutbox.map((mutation) => mutation.result);
  const statements: D1PreparedStatement[] = [
    prepareQuoteRequestOutcomeUpdate(db, parsed.value, canonical, actorLabel, nowIso),
    ...milestoneWrites.map((write) => prepareQuoteRequestMilestoneUpsert(db, write)),
    prepareOutcomeAuditStatement(db, parsed.value, actorLabel, outboxResults, nowIso),
    ...preparedOutbox.flatMap((mutation) => mutation.statement ? [mutation.statement] : []),
  ];

  try {
    const results = await db.batch(statements);
    if (results.some((result) => result.success === false)) {
      throw new Error('D1 batch reported an unsuccessful statement');
    }
  } catch (error) {
    console.error(`[closed-loop-outcome-writeback] Atomic batch failed: ${redactError(error)}`);
    return { ok: false, status: 503, error: 'Closed-loop outcome writeback failed atomically' };
  }

  return {
    ok: true,
    status: 200,
    leadId: parsed.value.leadId,
    dryRun: false,
    writeApplied: true,
    auditLogged: true,
    googleAdsOfflineOutboxEnabled: isOfflineOutboxEnabled(env),
    current: snapshotFromRow(row, currentMilestones),
    proposed: snapshotFromInput(parsed.value),
    outboxEligibility,
    outboxResults,
  };
}

