-- Phase C closed-loop Google Ads attribution and offline conversion outbox.
-- Draft migration only. Do not apply to production without separate owner approval.

ALTER TABLE quote_requests ADD COLUMN landing_page TEXT;
ALTER TABLE quote_requests ADD COLUMN source_path TEXT;
ALTER TABLE quote_requests ADD COLUMN referrer TEXT;

ALTER TABLE quote_requests ADD COLUMN gbraid TEXT;
ALTER TABLE quote_requests ADD COLUMN wbraid TEXT;

ALTER TABLE quote_requests ADD COLUMN first_landing_page TEXT;
ALTER TABLE quote_requests ADD COLUMN first_source_path TEXT;
ALTER TABLE quote_requests ADD COLUMN first_referrer TEXT;
ALTER TABLE quote_requests ADD COLUMN first_utm_source TEXT;
ALTER TABLE quote_requests ADD COLUMN first_utm_medium TEXT;
ALTER TABLE quote_requests ADD COLUMN first_utm_campaign TEXT;
ALTER TABLE quote_requests ADD COLUMN first_utm_term TEXT;
ALTER TABLE quote_requests ADD COLUMN first_utm_content TEXT;
ALTER TABLE quote_requests ADD COLUMN first_gclid TEXT;
ALTER TABLE quote_requests ADD COLUMN first_gbraid TEXT;
ALTER TABLE quote_requests ADD COLUMN first_wbraid TEXT;

ALTER TABLE quote_requests ADD COLUMN submit_landing_page TEXT;
ALTER TABLE quote_requests ADD COLUMN submit_source_path TEXT;
ALTER TABLE quote_requests ADD COLUMN submit_referrer TEXT;
ALTER TABLE quote_requests ADD COLUMN submit_utm_source TEXT;
ALTER TABLE quote_requests ADD COLUMN submit_utm_medium TEXT;
ALTER TABLE quote_requests ADD COLUMN submit_utm_campaign TEXT;
ALTER TABLE quote_requests ADD COLUMN submit_utm_term TEXT;
ALTER TABLE quote_requests ADD COLUMN submit_utm_content TEXT;
ALTER TABLE quote_requests ADD COLUMN submit_gclid TEXT;
ALTER TABLE quote_requests ADD COLUMN submit_gbraid TEXT;
ALTER TABLE quote_requests ADD COLUMN submit_wbraid TEXT;

ALTER TABLE quote_requests ADD COLUMN source_confidence TEXT NOT NULL DEFAULT 'unknown'
  CHECK (source_confidence IN ('gclid', 'gbraid', 'wbraid', 'utm_paid', 'utm_other', 'referrer', 'direct', 'unknown', 'manual_review'));

ALTER TABLE quote_requests ADD COLUMN qualified_status TEXT NOT NULL DEFAULT 'unreviewed'
  CHECK (qualified_status IN ('unreviewed', 'qualified', 'weak', 'spam', 'outside_area', 'wrong_service', 'duplicate', 'cannot_determine'));
ALTER TABLE quote_requests ADD COLUMN quote_sent_status TEXT NOT NULL DEFAULT 'not_sent'
  CHECK (quote_sent_status IN ('not_sent', 'sent', 'not_needed', 'cannot_determine'));
ALTER TABLE quote_requests ADD COLUMN quote_sent_at_utc TEXT;
ALTER TABLE quote_requests ADD COLUMN booked_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (booked_status IN ('pending', 'not_booked', 'booked', 'lost', 'cannot_determine'));
ALTER TABLE quote_requests ADD COLUMN booked_revenue_cents INTEGER CHECK (booked_revenue_cents IS NULL OR booked_revenue_cents >= 0);
ALTER TABLE quote_requests ADD COLUMN booked_revenue_currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE quote_requests ADD COLUMN lost_reason TEXT;
ALTER TABLE quote_requests ADD COLUMN duplicate_of_lead_id TEXT;
ALTER TABLE quote_requests ADD COLUMN owner_review_notes TEXT;
ALTER TABLE quote_requests ADD COLUMN owner_reviewed_at_utc TEXT;
ALTER TABLE quote_requests ADD COLUMN owner_reviewed_by TEXT;

ALTER TABLE quote_requests ADD COLUMN is_internal_test INTEGER NOT NULL DEFAULT 0 CHECK (is_internal_test IN (0, 1));
ALTER TABLE quote_requests ADD COLUMN internal_test_reason TEXT;

CREATE INDEX idx_quote_requests_gclid
  ON quote_requests (gclid);
CREATE INDEX idx_quote_requests_gbraid
  ON quote_requests (gbraid);
CREATE INDEX idx_quote_requests_wbraid
  ON quote_requests (wbraid);
CREATE INDEX idx_quote_requests_source_confidence
  ON quote_requests (source_confidence, received_at);
CREATE INDEX idx_quote_requests_outcomes
  ON quote_requests (qualified_status, quote_sent_status, booked_status, received_at);
CREATE INDEX idx_quote_requests_duplicate_of_lead
  ON quote_requests (duplicate_of_lead_id);

CREATE TABLE google_ads_offline_conversion_outbox (
  outbox_id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  event_name TEXT NOT NULL CHECK (event_name IN ('qualified_lead', 'quote_sent', 'booked_event')),
  conversion_action_name TEXT NOT NULL,
  conversion_time_utc TEXT NOT NULL,
  conversion_time_pacific TEXT NOT NULL,
  conversion_value REAL,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  order_id TEXT NOT NULL UNIQUE,
  gclid TEXT,
  gbraid TEXT,
  wbraid TEXT,
  hashed_email_sha256 TEXT,
  hashed_phone_sha256 TEXT,
  ad_user_data_consent TEXT,
  source_confidence_at_export TEXT,
  qualified_status_snapshot TEXT,
  quote_sent_status_snapshot TEXT,
  booked_status_snapshot TEXT,
  booked_revenue_cents_snapshot INTEGER,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'imported', 'failed', 'suppressed', 'needs_review')),
  suppression_reason TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at_utc TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  google_ads_upload_job_id TEXT,
  google_ads_result_resource_name TEXT,
  payload_hash TEXT NOT NULL,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES quote_requests(lead_id),
  UNIQUE (lead_id, event_name),
  CHECK (
    status = 'suppressed' OR
    (gclid IS NOT NULL AND gbraid IS NULL AND wbraid IS NULL) OR
    (gclid IS NULL AND gbraid IS NOT NULL AND wbraid IS NULL) OR
    (gclid IS NULL AND gbraid IS NULL AND wbraid IS NOT NULL)
  )
);

CREATE INDEX idx_google_ads_outbox_status
  ON google_ads_offline_conversion_outbox (status, created_at_utc);
CREATE INDEX idx_google_ads_outbox_lead
  ON google_ads_offline_conversion_outbox (lead_id, event_name);
CREATE INDEX idx_google_ads_outbox_order
  ON google_ads_offline_conversion_outbox (order_id);
