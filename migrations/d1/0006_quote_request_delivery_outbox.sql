-- P0 lead-delivery reliability state.
-- Draft migration only. Do not apply to production D1 without separate owner authorization.
--
-- IMPORTANT: quote_requests is already at the production column limit. This migration
-- intentionally adds NO columns to quote_requests and creates only a normalized child table.

CREATE TABLE IF NOT EXISTS quote_request_delivery_outbox (
  lead_id TEXT NOT NULL,
  destination TEXT NOT NULL
    CHECK (destination IN ('crm', 'sheet', 'make')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'retry', 'delivered', 'dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0),
  last_attempt_at_utc TEXT,
  next_attempt_at_utc TEXT,
  delivered_at_utc TEXT,
  last_http_status INTEGER
    CHECK (last_http_status IS NULL OR (last_http_status >= 100 AND last_http_status <= 599)),
  last_error_code TEXT,
  last_error_message TEXT,
  acknowledged_external_lead_id TEXT,
  acknowledged_internal_lead_id TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  PRIMARY KEY (lead_id, destination)
);

CREATE INDEX IF NOT EXISTS idx_quote_request_delivery_due
  ON quote_request_delivery_outbox (status, next_attempt_at_utc, updated_at_utc);

CREATE INDEX IF NOT EXISTS idx_quote_request_delivery_lead
  ON quote_request_delivery_outbox (lead_id, status);
