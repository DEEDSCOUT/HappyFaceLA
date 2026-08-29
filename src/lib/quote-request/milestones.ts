import type { D1Database, D1PreparedStatement } from '../booking/availability-types.ts';

export const QUOTE_REQUEST_MILESTONE_TYPES = [
  'qualified_lead',
  'quote_sent',
  'booked_event',
] as const;

export type QuoteRequestMilestoneType = typeof QUOTE_REQUEST_MILESTONE_TYPES[number];

export type QuoteRequestMilestoneTimes = {
  qualifiedLead: string | null;
  quoteSent: string | null;
  bookedEvent: string | null;
};

type QuoteRequestMilestoneRow = {
  milestone_type: QuoteRequestMilestoneType;
  occurred_at_utc: string;
};

export type QuoteRequestMilestoneWrite = {
  leadId: string;
  milestoneType: QuoteRequestMilestoneType;
  occurredAtUtc: string;
  recordedAtUtc: string;
  recordedBy: string;
};

export function emptyQuoteRequestMilestoneTimes(): QuoteRequestMilestoneTimes {
  return {
    qualifiedLead: null,
    quoteSent: null,
    bookedEvent: null,
  };
}

export async function selectQuoteRequestMilestoneTimes(
  db: D1Database,
  leadId: string,
): Promise<QuoteRequestMilestoneTimes> {
  const result = await db.prepare(
    `SELECT milestone_type, occurred_at_utc
     FROM quote_request_milestones
     WHERE lead_id = ?`,
  ).bind(leadId).all<QuoteRequestMilestoneRow>();
  const times = emptyQuoteRequestMilestoneTimes();

  for (const row of result.results ?? []) {
    if (row.milestone_type === 'qualified_lead') times.qualifiedLead = row.occurred_at_utc;
    if (row.milestone_type === 'quote_sent') times.quoteSent = row.occurred_at_utc;
    if (row.milestone_type === 'booked_event') times.bookedEvent = row.occurred_at_utc;
  }

  return times;
}

export function prepareQuoteRequestMilestoneUpsert(
  db: D1Database,
  input: QuoteRequestMilestoneWrite,
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO quote_request_milestones (
       lead_id, milestone_type, occurred_at_utc, recorded_at_utc,
       recorded_by, created_at_utc, updated_at_utc
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(lead_id, milestone_type) DO UPDATE SET
       occurred_at_utc = excluded.occurred_at_utc,
       recorded_at_utc = excluded.recorded_at_utc,
       recorded_by = excluded.recorded_by,
       updated_at_utc = excluded.updated_at_utc`,
  ).bind(
    input.leadId,
    input.milestoneType,
    input.occurredAtUtc,
    input.recordedAtUtc,
    input.recordedBy,
    input.recordedAtUtc,
    input.recordedAtUtc,
  );
}
