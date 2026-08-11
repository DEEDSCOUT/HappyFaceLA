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
  UNIQUE (submission_id, lead_id),
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

CREATE TABLE lead_privacy_state (
  lead_id TEXT PRIMARY KEY,
  submission_id TEXT UNIQUE,
  source_record_kind TEXT NOT NULL CHECK (
    source_record_kind IN ('ap02_canonical', 'historical_quote_request')
  ),
  data_classification TEXT NOT NULL CHECK (
    data_classification IN (
      'pending_business_classification',
      'genuine_lead',
      'spam_bot_invalid',
      'internal_test',
      'legacy_compatibility'
    )
  ),
  accepted_at_utc TEXT NOT NULL,
  last_meaningful_interaction_at_utc TEXT,
  completed_event_at_utc TEXT,
  pii_retention_anchor_at_utc TEXT,
  pii_retention_anchor_finalized_at_utc TEXT,
  legal_hold INTEGER NOT NULL DEFAULT 0 CHECK (legal_hold IN (0, 1)),
  deletion_request_id TEXT,
  deletion_requested_at_utc TEXT,
  deletion_approved_at_utc TEXT,
  click_ids_redacted_at_utc TEXT,
  pii_redacted_at_utc TEXT,
  diagnostic_data_redacted_at_utc TEXT,
  shadow_outcome_purged_at_utc TEXT,
  notification_audit_purged_at_utc TEXT,
  deletion_completed_at_utc TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  CHECK (
    (source_record_kind = 'ap02_canonical' AND submission_id IS NOT NULL)
    OR (source_record_kind = 'historical_quote_request' AND submission_id IS NULL)
  ),
  CHECK (
    (pii_retention_anchor_finalized_at_utc IS NULL)
    OR (pii_retention_anchor_at_utc IS NOT NULL)
  ),
  CHECK (
    (deletion_approved_at_utc IS NULL)
    OR (deletion_requested_at_utc IS NOT NULL AND deletion_request_id IS NOT NULL)
  ),
  CHECK (
    (deletion_completed_at_utc IS NULL)
    OR (deletion_approved_at_utc IS NOT NULL AND pii_redacted_at_utc IS NOT NULL)
  )
);

CREATE INDEX idx_lead_privacy_state_retention
  ON lead_privacy_state (
    data_classification, accepted_at_utc, pii_retention_anchor_at_utc
  );
CREATE INDEX idx_lead_privacy_state_click_ids
  ON lead_privacy_state (click_ids_redacted_at_utc, accepted_at_utc);

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
  FOREIGN KEY (submission_id, lead_id)
    REFERENCES lead_submission_identity(submission_id, lead_id),
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
  destination TEXT NOT NULL CHECK (destination IN ('crm', 'sheet', 'make')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivering', 'sent', 'failed_retryable', 'needs_review', 'abandoned')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 6 CHECK (max_attempts BETWEEN 1 AND 10),
  next_attempt_at_utc TEXT,
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
  last_http_status INTEGER,
  last_acknowledgement TEXT CHECK (
    last_acknowledgement IS NULL
    OR last_acknowledgement IN ('strict', 'legacy_http_2xx', 'legacy_json_ok', 'none')
  ),
  dead_lettered_at_utc TEXT,
  operator_retry_count INTEGER NOT NULL DEFAULT 0 CHECK (operator_retry_count BETWEEN 0 AND 10),
  last_operator_action_id TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  FOREIGN KEY (submission_id, lead_id)
    REFERENCES lead_submission_identity(submission_id, lead_id),
  UNIQUE (lead_id, destination),
  UNIQUE (notification_id, lead_id, destination),
  CHECK (attempt_count <= max_attempts),
  CHECK (
    (status = 'delivering' AND claim_token IS NOT NULL AND lease_expires_at_utc IS NOT NULL)
    OR
    (status != 'delivering' AND claim_token IS NULL AND lease_expires_at_utc IS NULL)
  ),
  CHECK (
    (status IN ('pending', 'failed_retryable') AND next_attempt_at_utc IS NOT NULL)
    OR
    (status NOT IN ('pending', 'failed_retryable') AND next_attempt_at_utc IS NULL)
  ),
  CHECK (
    (status IN ('needs_review', 'abandoned') AND dead_lettered_at_utc IS NOT NULL)
    OR
    (status NOT IN ('needs_review', 'abandoned') AND dead_lettered_at_utc IS NULL)
  )
);

CREATE INDEX idx_lead_notification_outbox_status
  ON lead_notification_outbox (
    status, next_attempt_at_utc, lease_expires_at_utc, created_at_utc
  );

CREATE TABLE notification_worker_runs (
  run_id TEXT PRIMARY KEY CHECK (
    length(run_id) BETWEEN 8 AND 80
    AND run_id NOT GLOB '*[^A-Za-z0-9_-]*'
  ),
  scheduled_at_utc TEXT NOT NULL,
  started_at_utc TEXT NOT NULL,
  completed_at_utc TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  examined_count INTEGER NOT NULL DEFAULT 0 CHECK (examined_count >= 0),
  claimed_count INTEGER NOT NULL DEFAULT 0 CHECK (claimed_count >= 0),
  sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  retry_scheduled_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_scheduled_count >= 0),
  needs_review_count INTEGER NOT NULL DEFAULT 0 CHECK (needs_review_count >= 0),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  alert_codes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(alert_codes_json)),
  last_error_code TEXT,
  alerted_at_utc TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  CHECK (
    (status = 'running' AND completed_at_utc IS NULL)
    OR
    (status != 'running' AND completed_at_utc IS NOT NULL)
  )
);

CREATE INDEX idx_notification_worker_runs_status
  ON notification_worker_runs (status, started_at_utc);

CREATE TABLE notification_alert_state (
  alert_key TEXT PRIMARY KEY CHECK (alert_key = 'queue_health'),
  fingerprint_sha256 TEXT NOT NULL CHECK (length(fingerprint_sha256) = 64),
  alert_codes_json TEXT NOT NULL CHECK (json_valid(alert_codes_json)),
  failed_run_ids_json TEXT NOT NULL CHECK (json_valid(failed_run_ids_json)),
  failed_run_cutoff_utc TEXT NOT NULL,
  last_attempt_at_utc TEXT NOT NULL,
  last_delivered_at_utc TEXT,
  next_eligible_at_utc TEXT NOT NULL,
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('delivered', 'failed')),
  updated_at_utc TEXT NOT NULL
);

CREATE TABLE notification_operator_audit (
  action_id TEXT PRIMARY KEY CHECK (
    length(action_id) BETWEEN 8 AND 80
    AND action_id NOT GLOB '*[^A-Za-z0-9_-]*'
  ),
  notification_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  destination TEXT NOT NULL CHECK (destination IN ('crm', 'sheet', 'make')),
  action TEXT NOT NULL CHECK (action IN ('retry', 'mark_delivered', 'abandon')),
  reason_code TEXT NOT NULL CHECK (length(reason_code) BETWEEN 1 AND 80),
  operator_actor_id TEXT NOT NULL CHECK (
    length(operator_actor_id) BETWEEN 3 AND 80
    AND operator_actor_id NOT GLOB '*[^A-Za-z0-9_-]*'
  ),
  created_at_utc TEXT NOT NULL,
  FOREIGN KEY (notification_id, lead_id, destination)
    REFERENCES lead_notification_outbox(notification_id, lead_id, destination)
);

CREATE INDEX idx_notification_operator_audit_lead
  ON notification_operator_audit (lead_id, created_at_utc);

CREATE TABLE privacy_purge_runs (
  run_id TEXT PRIMARY KEY CHECK (
    length(run_id) BETWEEN 8 AND 80
    AND run_id NOT GLOB '*[^A-Za-z0-9_-]*'
  ),
  policy_version TEXT NOT NULL CHECK (policy_version = 'HFLA-PRIVACY-ATTRIBUTION-V1'),
  mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'apply')),
  started_at_utc TEXT NOT NULL,
  completed_at_utc TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  initiated_by_actor_id TEXT NOT NULL CHECK (
    length(initiated_by_actor_id) BETWEEN 3 AND 80
    AND initiated_by_actor_id NOT GLOB '*[^A-Za-z0-9_-]*'
  ),
  cutoffs_json TEXT NOT NULL CHECK (json_valid(cutoffs_json)),
  aggregate_counts_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(aggregate_counts_json)),
  last_error_code TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  CHECK (
    (status = 'running' AND completed_at_utc IS NULL)
    OR (status != 'running' AND completed_at_utc IS NOT NULL)
  )
);

CREATE INDEX idx_privacy_purge_runs_status
  ON privacy_purge_runs (status, started_at_utc);
