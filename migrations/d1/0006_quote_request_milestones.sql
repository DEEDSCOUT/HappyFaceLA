-- Phase R.3 normalized milestone timestamps for closed-loop Google Ads outcomes.
-- Draft migration only. Do not apply without separate production approval.
-- quote_requests.lead_id is the production PRIMARY KEY and already parents the 0005 outbox FK.

CREATE TABLE quote_request_milestones (
  lead_id TEXT NOT NULL,
  milestone_type TEXT NOT NULL
    CHECK (milestone_type IN ('qualified_lead', 'quote_sent', 'booked_event')),
  occurred_at_utc TEXT NOT NULL,
  recorded_at_utc TEXT NOT NULL,
  recorded_by TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,

  PRIMARY KEY (lead_id, milestone_type),
  FOREIGN KEY (lead_id)
    REFERENCES quote_requests(lead_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_quote_request_milestones_occurred_at
  ON quote_request_milestones (occurred_at_utc);
