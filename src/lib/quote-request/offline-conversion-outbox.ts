import type { D1Database, D1Value } from '../booking/availability-types.ts';
import { isIsoInstant } from '../booking/availability-validation.ts';
import type { CanonicalPlanMyPartyLead } from './canonical-lead.ts';

export type OfflineConversionEventName = 'qualified_lead' | 'quote_sent' | 'booked_event';

export type OfflineConversionEnv = {
  GOOGLE_ADS_OFFLINE_OUTBOX_ENABLED?: string;
};

export type OfflineConversionOutcomeInput = {
  qualifiedStatus?: string | null;
  qualifiedAtUtc?: string | null;
  quoteSentStatus?: string | null;
  quoteSentAtUtc?: string | null;
  bookedStatus?: string | null;
  bookedAtUtc?: string | null;
  bookedRevenueCents?: number | null;
  duplicateOfLeadId?: string | null;
  isInternalTest?: boolean;
  internalTestReason?: string | null;
};

export type OfflineConversionOutboxResult =
  | { queued: true; eventName: OfflineConversionEventName; orderId: string }
  | { queued: false; eventName: OfflineConversionEventName; reason: string };

export type OfflineConversionOutboxEligibility =
  | { eligible: true; eventName: OfflineConversionEventName }
  | { eligible: false; eventName: OfflineConversionEventName; reason: string };

export function isOfflineOutboxEnabled(env: OfflineConversionEnv): boolean {
  return String(env.GOOGLE_ADS_OFFLINE_OUTBOX_ENABLED ?? '').trim().toLowerCase() === 'true';
}

function nowIso(): string {
  return new Date().toISOString();
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

const PACIFIC_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'longOffset',
});

export function formatGoogleAdsUtcDateTime(isoInstant: string): string {
  if (!isIsoInstant(isoInstant)) {
    throw new Error('Offline conversion milestone must be an ISO UTC instant');
  }
  const date = new Date(isoInstant);
  const datePart = `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(date.getUTCDate())}`;
  const timePart = `${padDatePart(date.getUTCHours())}:${padDatePart(date.getUTCMinutes())}:${padDatePart(date.getUTCSeconds())}`;
  return `${datePart} ${timePart}+00:00`;
}

export function formatGoogleAdsPacificDateTime(isoInstant: string): string {
  if (!isIsoInstant(isoInstant)) {
    throw new Error('Offline conversion milestone must be an ISO UTC instant');
  }
  const parts = Object.fromEntries(
    PACIFIC_DATE_TIME_FORMATTER.formatToParts(new Date(isoInstant)).map(({ type, value }) => [type, value]),
  );
  const offset = String(parts.timeZoneName ?? '').replace(/^GMT/, '');
  if (!/^[+-]\d{2}:\d{2}$/.test(offset)) {
    throw new Error('Unable to determine America/Los_Angeles offset');
  }
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

function makeOutboxId(leadId: string, eventName: OfflineConversionEventName): string {
  return `gads_${leadId}_${eventName}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 140);
}

export function makeOfflineOrderId(leadId: string, eventName: OfflineConversionEventName): string {
  return `hfla:${leadId}:${eventName}`.slice(0, 140);
}

function selectedClickId(lead: CanonicalPlanMyPartyLead): { gclid: string | null; gbraid: string | null; wbraid: string | null } {
  if (lead.gclid) return { gclid: lead.gclid, gbraid: null, wbraid: null };
  if (lead.submitGclid) return { gclid: lead.submitGclid, gbraid: null, wbraid: null };
  if (lead.firstGclid) return { gclid: lead.firstGclid, gbraid: null, wbraid: null };
  if (lead.gbraid) return { gclid: null, gbraid: lead.gbraid, wbraid: null };
  if (lead.submitGbraid) return { gclid: null, gbraid: lead.submitGbraid, wbraid: null };
  if (lead.firstGbraid) return { gclid: null, gbraid: lead.firstGbraid, wbraid: null };
  if (lead.wbraid) return { gclid: null, gbraid: null, wbraid: lead.wbraid };
  if (lead.submitWbraid) return { gclid: null, gbraid: null, wbraid: lead.submitWbraid };
  if (lead.firstWbraid) return { gclid: null, gbraid: null, wbraid: lead.firstWbraid };
  return { gclid: null, gbraid: null, wbraid: null };
}

function eventValueCents(lead: CanonicalPlanMyPartyLead, eventName: OfflineConversionEventName, outcome: OfflineConversionOutcomeInput): number | null {
  if (eventName === 'booked_event') {
    return outcome.bookedRevenueCents ?? lead.bookedRevenueCents ?? null;
  }
  return null;
}

function effectiveQualifiedStatus(lead: CanonicalPlanMyPartyLead, outcome: OfflineConversionOutcomeInput): string | null | undefined {
  return outcome.qualifiedStatus ?? lead.qualifiedStatus;
}

function effectiveBookedRevenueCents(lead: CanonicalPlanMyPartyLead, outcome: OfflineConversionOutcomeInput): number | null | undefined {
  return outcome.bookedRevenueCents ?? lead.bookedRevenueCents;
}

function eventMilestoneUtc(
  lead: CanonicalPlanMyPartyLead,
  eventName: OfflineConversionEventName,
  outcome: OfflineConversionOutcomeInput,
): string | null {
  switch (eventName) {
    case 'qualified_lead':
      return outcome.qualifiedAtUtc ?? lead.qualifiedAtUtc ?? null;
    case 'quote_sent':
      return outcome.quoteSentAtUtc ?? lead.quoteSentAtUtc ?? null;
    case 'booked_event':
      return outcome.bookedAtUtc ?? lead.bookedAtUtc ?? null;
  }
}

function missingMilestoneReason(eventName: OfflineConversionEventName): string {
  switch (eventName) {
    case 'qualified_lead':
      return 'missing_qualified_at_utc';
    case 'quote_sent':
      return 'missing_quote_sent_at_utc';
    case 'booked_event':
      return 'missing_booked_at_utc';
  }
}

function isPositiveRevenueCents(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function conversionActionName(eventName: OfflineConversionEventName): string {
  switch (eventName) {
    case 'qualified_lead':
      return 'HFLA | Offline | Qualified Lead';
    case 'quote_sent':
      return 'HFLA | Offline | Quote Sent';
    case 'booked_event':
      return 'HFLA | Offline | Booked Event';
  }
}

function suppressionReason(
  lead: CanonicalPlanMyPartyLead,
  eventName: OfflineConversionEventName,
  outcome: OfflineConversionOutcomeInput,
): string | null {
  if (outcome.isInternalTest || lead.isInternalTest) return outcome.internalTestReason || lead.internalTestReason || 'internal_test';
  if (outcome.duplicateOfLeadId || lead.duplicateOfLeadId) return 'duplicate_lead';
  const qualifiedStatus = effectiveQualifiedStatus(lead, outcome);
  if (qualifiedStatus !== 'qualified') return `qualified_status_${qualifiedStatus || 'missing'}`;
  const clickId = selectedClickId(lead);
  if (!clickId.gclid && !clickId.gbraid && !clickId.wbraid) return 'missing_google_click_id';
  if (eventName === 'quote_sent' && (outcome.quoteSentStatus ?? lead.quoteSentStatus) !== 'sent') return 'quote_not_sent';
  if (eventName === 'booked_event') {
    if ((outcome.bookedStatus ?? lead.bookedStatus) !== 'booked') return 'not_booked';
    if (!isPositiveRevenueCents(effectiveBookedRevenueCents(lead, outcome))) return 'booked_revenue_missing';
  }
  if (!isIsoInstant(eventMilestoneUtc(lead, eventName, outcome))) return missingMilestoneReason(eventName);
  return null;
}

export function evaluateOfflineConversionOutboxEvent(
  lead: CanonicalPlanMyPartyLead,
  eventName: OfflineConversionEventName,
  outcome: OfflineConversionOutcomeInput,
): OfflineConversionOutboxEligibility {
  const suppressed = suppressionReason(lead, eventName, outcome);
  if (suppressed) return { eligible: false, eventName, reason: suppressed };
  return { eligible: true, eventName };
}

export function evaluateOfflineConversionOutboxEvents(
  lead: CanonicalPlanMyPartyLead,
  outcome: OfflineConversionOutcomeInput,
): OfflineConversionOutboxEligibility[] {
  return [
    evaluateOfflineConversionOutboxEvent(lead, 'qualified_lead', outcome),
    evaluateOfflineConversionOutboxEvent(lead, 'quote_sent', outcome),
    evaluateOfflineConversionOutboxEvent(lead, 'booked_event', outcome),
  ];
}

export async function queueOfflineConversionOutboxEvent(
  db: D1Database,
  lead: CanonicalPlanMyPartyLead,
  eventName: OfflineConversionEventName,
  outcome: OfflineConversionOutcomeInput,
  env: OfflineConversionEnv,
): Promise<OfflineConversionOutboxResult> {
  if (!isOfflineOutboxEnabled(env)) return { queued: false, eventName, reason: 'feature_flag_disabled' };

  const eligibility = evaluateOfflineConversionOutboxEvent(lead, eventName, outcome);
  if (!eligibility.eligible) return { queued: false, eventName, reason: eligibility.reason };

  const clickId = selectedClickId(lead);
  const orderId = makeOfflineOrderId(lead.leadId, eventName);
  const milestoneUtc = eventMilestoneUtc(lead, eventName, outcome);
  if (!milestoneUtc) return { queued: false, eventName, reason: missingMilestoneReason(eventName) };
  const conversionTimeUtc = formatGoogleAdsUtcDateTime(milestoneUtc);
  const conversionTimePacific = formatGoogleAdsPacificDateTime(milestoneUtc);
  const generatedAt = nowIso();
  const valueCents = eventValueCents(lead, eventName, outcome);
  const values: D1Value[] = [
    makeOutboxId(lead.leadId, eventName),
    lead.leadId,
    eventName,
    conversionActionName(eventName),
    conversionTimeUtc,
    conversionTimePacific,
    valueCents === null ? null : valueCents / 100,
    'USD',
    orderId,
    clickId.gclid,
    clickId.gbraid,
    clickId.wbraid,
    null,
    null,
    null,
    lead.sourceConfidence,
    outcome.qualifiedStatus ?? lead.qualifiedStatus,
    outcome.quoteSentStatus ?? lead.quoteSentStatus,
    outcome.bookedStatus ?? lead.bookedStatus,
    valueCents,
    'queued',
    null,
    0,
    null,
    null,
    null,
    null,
    null,
    `${lead.leadId}:${eventName}:${conversionTimeUtc}:${valueCents ?? ''}:${generatedAt}`,
    generatedAt,
    generatedAt,
  ];

  const result = await db.prepare(
    `INSERT INTO google_ads_offline_conversion_outbox (
      outbox_id, lead_id, event_name, conversion_action_name,
      conversion_time_utc, conversion_time_pacific, conversion_value, currency_code,
      order_id, gclid, gbraid, wbraid, hashed_email_sha256, hashed_phone_sha256,
      ad_user_data_consent, source_confidence_at_export, qualified_status_snapshot,
      quote_sent_status_snapshot, booked_status_snapshot, booked_revenue_cents_snapshot,
      status, suppression_reason, attempt_count, last_attempt_at_utc, last_error_code,
      last_error_message, google_ads_upload_job_id, google_ads_result_resource_name,
      payload_hash, created_at_utc, updated_at_utc
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(lead_id, event_name) DO UPDATE SET
      conversion_action_name = excluded.conversion_action_name,
      conversion_time_utc = excluded.conversion_time_utc,
      conversion_time_pacific = excluded.conversion_time_pacific,
      conversion_value = excluded.conversion_value,
      currency_code = excluded.currency_code,
      gclid = excluded.gclid,
      gbraid = excluded.gbraid,
      wbraid = excluded.wbraid,
      source_confidence_at_export = excluded.source_confidence_at_export,
      qualified_status_snapshot = excluded.qualified_status_snapshot,
      quote_sent_status_snapshot = excluded.quote_sent_status_snapshot,
      booked_status_snapshot = excluded.booked_status_snapshot,
      booked_revenue_cents_snapshot = excluded.booked_revenue_cents_snapshot,
      suppression_reason = NULL,
      payload_hash = excluded.payload_hash,
      updated_at_utc = excluded.updated_at_utc
    WHERE google_ads_offline_conversion_outbox.status = 'queued'
      AND google_ads_offline_conversion_outbox.attempt_count = 0
      AND google_ads_offline_conversion_outbox.google_ads_upload_job_id IS NULL
      AND google_ads_offline_conversion_outbox.google_ads_result_resource_name IS NULL`,
  ).bind(...values).run();

  if (result.meta?.changes === 0) {
    return { queued: false, eventName, reason: 'existing_outbox_not_correctable' };
  }

  return { queued: true, eventName, orderId };
}

export async function queueOfflineConversionOutboxEvents(
  db: D1Database,
  lead: CanonicalPlanMyPartyLead,
  outcome: OfflineConversionOutcomeInput,
  env: OfflineConversionEnv,
): Promise<OfflineConversionOutboxResult[]> {
  return Promise.all([
    queueOfflineConversionOutboxEvent(db, lead, 'qualified_lead', outcome, env),
    queueOfflineConversionOutboxEvent(db, lead, 'quote_sent', outcome, env),
    queueOfflineConversionOutboxEvent(db, lead, 'booked_event', outcome, env),
  ]);
}
