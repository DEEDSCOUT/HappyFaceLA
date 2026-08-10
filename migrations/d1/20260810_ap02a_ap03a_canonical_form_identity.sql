-- AP-02A/AP-03A engineering draft only.
-- Do not apply without a separately approved production-shadow packet and an
-- admitted export of the authoritative quote_requests base schema.

CREATE TABLE lead_submission_identity (
  submission_id TEXT PRIMARY KEY CHECK (
    length(submission_id) = 36
    AND substr(submission_id, 1, 4) = 'sub_'
    AND substr(submission_id, 5) NOT GLOB '*[^0-9a-f]*'
  ),
  lead_id TEXT NOT NULL UNIQUE CHECK (
    length(lead_id) = 37
    AND substr(lead_id, 1, 5) = 'lead_'
    AND substr(lead_id, 6) NOT GLOB '*[^0-9a-f]*'
  ),
  form_route TEXT NOT NULL CHECK (form_route IN ('plan-my-party', 'packages', 'contact')),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  accepted_at_utc TEXT NOT NULL,
  conversion_eligible INTEGER NOT NULL CHECK (conversion_eligible IN (0, 1)),
  suppression_reason TEXT,
  business_duplicate_of_lead_id TEXT,
  first_touch_json TEXT NOT NULL CHECK (json_valid(first_touch_json)),
  latest_qualifying_touch_json TEXT CHECK (latest_qualifying_touch_json IS NULL OR json_valid(latest_qualifying_touch_json)),
  submit_touch_json TEXT NOT NULL CHECK (json_valid(submit_touch_json)),
  client_contract_version TEXT NOT NULL DEFAULT 'atomic-v1'
    CHECK (client_contract_version IN ('atomic-v1', 'legacy-bounded-v1')),
  attribution_policy_version TEXT NOT NULL DEFAULT 'AP03A-1',
  canonical_version TEXT NOT NULL DEFAULT 'AP02A-1',
  CHECK (
    (conversion_eligible = 1 AND suppression_reason IS NULL) OR
    (conversion_eligible = 0 AND suppression_reason IS NOT NULL)
  ),
  FOREIGN KEY (business_duplicate_of_lead_id) REFERENCES lead_submission_identity(lead_id)
);

CREATE INDEX idx_lead_submission_identity_route_time
  ON lead_submission_identity (form_route, accepted_at_utc);
CREATE INDEX idx_lead_submission_identity_business_duplicate
  ON lead_submission_identity (business_duplicate_of_lead_id);

CREATE TABLE canonical_lead_outbox (
  outbox_id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  lead_id TEXT NOT NULL,
  event_name TEXT NOT NULL DEFAULT 'genuine_form_lead' CHECK (event_name = 'genuine_form_lead'),
  conversion_eligible INTEGER NOT NULL CHECK (conversion_eligible IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('shadow_pending', 'shadow_eligible', 'suppressed')),
  suppression_reason TEXT,
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  canonical_version TEXT NOT NULL DEFAULT 'AP02A-1',
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES lead_submission_identity(submission_id),
  FOREIGN KEY (lead_id) REFERENCES lead_submission_identity(lead_id),
  UNIQUE (lead_id, event_name),
  CHECK (
    (conversion_eligible = 1 AND status = 'shadow_eligible' AND suppression_reason IS NULL) OR
    (conversion_eligible = 0 AND status = 'shadow_pending' AND suppression_reason = 'pending_business_classification') OR
    (conversion_eligible = 0 AND status = 'suppressed' AND suppression_reason IS NOT NULL)
  )
);

CREATE INDEX idx_canonical_lead_outbox_status
  ON canonical_lead_outbox (status, created_at_utc);

CREATE TABLE lead_notification_outbox (
  notification_id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  destination TEXT NOT NULL DEFAULT 'owner_notification',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivering', 'sent', 'failed_retryable', 'needs_review')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  claim_token TEXT CHECK (
    claim_token IS NULL OR (
      length(claim_token) = 38
      AND substr(claim_token, 1, 6) = 'claim_'
      AND substr(claim_token, 7) NOT GLOB '*[^0-9a-f]*'
    )
  ),
  lease_expires_at_utc TEXT,
  last_attempt_at_utc TEXT,
  last_error_code TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES lead_submission_identity(submission_id),
  FOREIGN KEY (lead_id) REFERENCES lead_submission_identity(lead_id),
  UNIQUE (lead_id, destination),
  CHECK (
    (status = 'delivering' AND claim_token IS NOT NULL AND lease_expires_at_utc IS NOT NULL)
    OR
    (status != 'delivering' AND claim_token IS NULL AND lease_expires_at_utc IS NULL)
  )
);

CREATE INDEX idx_lead_notification_outbox_status
  ON lead_notification_outbox (status, created_at_utc);
