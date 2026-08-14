-- Read-only production schema export admitted on 2026-08-10.
-- This fixture intentionally mirrors sqlite_schema for quote_requests and its
-- explicit indexes. It contains no production rows or customer information.

CREATE TABLE quote_requests (
  lead_id TEXT PRIMARY KEY CHECK (lead_id GLOB 'lead_*'),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (idempotency_key GLOB 'qrq_*'),
  source TEXT NOT NULL CHECK (source = 'plan-my-party'),
  received_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  event_type TEXT NOT NULL,
  event_date TEXT CHECK (event_date IS NULL OR event_date GLOB '????-??-??'),
  start_time TEXT CHECK (start_time IS NULL OR start_time GLOB '??:??'),
  event_city TEXT NOT NULL,
  venue_name TEXT,
  travel_miles REAL,
  travel_band TEXT NOT NULL,
  travel_fee_estimate_cents INTEGER NOT NULL DEFAULT 0 CHECK (travel_fee_estimate_cents >= 0),

  services_json TEXT NOT NULL,
  kids_count_bucket TEXT NOT NULL,
  kids_count_actual INTEGER CHECK (kids_count_actual IS NULL OR (kids_count_actual >= 1 AND kids_count_actual <= 200)),
  design_style TEXT NOT NULL,
  service_window_minutes INTEGER CHECK (service_window_minutes IS NULL OR service_window_minutes >= 0),
  required_artist_count INTEGER CHECK (required_artist_count IS NULL OR required_artist_count >= 0),
  quote_outcome TEXT NOT NULL,
  pricing_event_total_cents INTEGER CHECK (pricing_event_total_cents IS NULL OR pricing_event_total_cents >= 0),
  pricing_retainer_cents INTEGER CHECK (pricing_retainer_cents IS NULL OR pricing_retainer_cents >= 0),
  pricing_model TEXT,

  customer_first_name TEXT NOT NULL,
  customer_last_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  consent_acknowledgement TEXT NOT NULL,
  sanitized_notes TEXT,
  lookbook_inspirations_json TEXT NOT NULL DEFAULT '[]',
  wizard_version TEXT NOT NULL,
  client_submitted_at TEXT,

  delivery_status TEXT NOT NULL CHECK (
    delivery_status IN (
      'persisted_internal_queue',
      'persisted_optional_notification_succeeded'
    )
  ),
  owner_notification_queued INTEGER NOT NULL DEFAULT 1 CHECK (owner_notification_queued IN (0, 1)),
  owner_notification_sent INTEGER NOT NULL DEFAULT 0 CHECK (owner_notification_sent IN (0, 1)),
  sheet_written INTEGER NOT NULL DEFAULT 0 CHECK (sheet_written IN (0, 1)),
  crm_posted INTEGER NOT NULL DEFAULT 0 CHECK (crm_posted IN (0, 1)),

  source_page TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  gclid TEXT,
  fbclid TEXT,
  msclkid TEXT,
  preferred_contact_method TEXT,
  child_count_confidence TEXT,
  duration_minutes INTEGER,
  duration_source TEXT,
  computed_end_time TEXT,
  travel_source TEXT,
  travel_note TEXT,
  customer_budget_provided INTEGER,
  customer_budget_amount_cents INTEGER,
  customer_budget_label TEXT,
  pricing_source TEXT,
  manual_review_reasons_json TEXT,
  canonical_payload_json TEXT,
  landing_page TEXT,
  source_path TEXT,
  referrer TEXT,
  gbraid TEXT,
  wbraid TEXT,
  first_landing_page TEXT,
  first_source_path TEXT,
  first_referrer TEXT,
  first_utm_source TEXT,
  first_utm_medium TEXT,
  first_utm_campaign TEXT,
  first_utm_term TEXT,
  first_utm_content TEXT,
  first_gclid TEXT,
  first_gbraid TEXT,
  first_wbraid TEXT,
  submit_landing_page TEXT,
  submit_source_path TEXT,
  submit_referrer TEXT,
  submit_utm_source TEXT,
  submit_utm_medium TEXT,
  submit_utm_campaign TEXT,
  submit_utm_term TEXT,
  submit_utm_content TEXT,
  submit_gclid TEXT,
  submit_gbraid TEXT,
  submit_wbraid TEXT,
  source_confidence TEXT NOT NULL DEFAULT 'unknown'
    CHECK (source_confidence IN ('gclid', 'gbraid', 'wbraid', 'utm_paid', 'utm_other', 'referrer', 'direct', 'unknown', 'manual_review')),
  qualified_status TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (qualified_status IN ('unreviewed', 'qualified', 'weak', 'spam', 'outside_area', 'wrong_service', 'duplicate', 'cannot_determine')),
  quote_sent_status TEXT NOT NULL DEFAULT 'not_sent'
    CHECK (quote_sent_status IN ('not_sent', 'sent', 'not_needed', 'cannot_determine')),
  quote_sent_at_utc TEXT,
  booked_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (booked_status IN ('pending', 'not_booked', 'booked', 'lost', 'cannot_determine')),
  booked_revenue_cents INTEGER CHECK (booked_revenue_cents IS NULL OR booked_revenue_cents >= 0),
  booked_revenue_currency TEXT NOT NULL DEFAULT 'USD',
  lost_reason TEXT,
  duplicate_of_lead_id TEXT,
  owner_review_notes TEXT,
  owner_reviewed_at_utc TEXT,
  owner_reviewed_by TEXT,
  is_internal_test INTEGER NOT NULL DEFAULT 0 CHECK (is_internal_test IN (0, 1)),
  internal_test_reason TEXT
);

CREATE INDEX idx_quote_requests_delivery_status
  ON quote_requests (delivery_status, received_at);
CREATE INDEX idx_quote_requests_duplicate_of_lead
  ON quote_requests (duplicate_of_lead_id);
CREATE INDEX idx_quote_requests_event_date
  ON quote_requests (event_date, start_time);
CREATE INDEX idx_quote_requests_gbraid
  ON quote_requests (gbraid);
CREATE INDEX idx_quote_requests_gclid
  ON quote_requests (gclid);
CREATE INDEX idx_quote_requests_outcomes
  ON quote_requests (qualified_status, quote_sent_status, booked_status, received_at);
CREATE INDEX idx_quote_requests_received_at
  ON quote_requests (received_at);
CREATE INDEX idx_quote_requests_source_confidence
  ON quote_requests (source_confidence, received_at);
CREATE INDEX idx_quote_requests_wbraid
  ON quote_requests (wbraid);
