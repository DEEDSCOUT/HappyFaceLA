-- Happy Faces LA artist payout domain, schema v1.
-- Requires exactly one previously applied environment identity migration.
-- This is a fresh-database migration. It intentionally refuses replay, upgrade,
-- a partial prior schema, or a database whose identity is missing/ambiguous.

PRAGMA foreign_keys = ON;

UPDATE payout_migration_guard
SET valid = CASE WHEN
  (SELECT COUNT(*) FROM payout_database_identity
    WHERE singleton_key = 'artist_payouts'
      AND environment IN ('sandbox', 'live')) = 1
  AND (SELECT COUNT(*) FROM payout_database_identity) = 1
  AND (SELECT COUNT(*) FROM payout_schema_migrations
    WHERE migration_id = '0000_environment_identity_v1'
      AND environment = (
        SELECT environment FROM payout_database_identity
        WHERE singleton_key = 'artist_payouts'
      )) = 1
  AND (SELECT COUNT(*) FROM payout_schema_migrations) = 1
  AND (SELECT COUNT(*) FROM sqlite_master
    WHERE type = 'table'
      AND name IN (
        'artist_stripe_accounts', 'artist_onboarding_claims',
        'artist_onboarding_sessions', 'artist_payee_identity_verifications',
        'artist_payment_ledger',
        'payout_batches', 'payout_batch_items', 'payout_transfer_attempts',
        'payout_destination_variance_approvals', 'stripe_webhook_events',
        'payout_exceptions', 'financial_audit_log'
      )) = 0
  THEN 1 ELSE 0 END
WHERE singleton_key = 'artist_payouts';

CREATE TABLE IF NOT EXISTS artist_stripe_accounts (
  artist_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  stripe_account_id TEXT NOT NULL,
  artist_display_name TEXT NOT NULL,
  onboarding_status TEXT NOT NULL CHECK (onboarding_status IN (
    'NOT_INVITED', 'INVITE_READY', 'LINK_CREATED', 'INVITATION_DRAFTED',
    'ONBOARDING_STARTED', 'REQUIREMENTS_PENDING', 'RESTRICTED',
    'ONBOARDING_COMPLETE', 'TRANSFERS_ENABLED', 'PAYOUT_READY', 'DISABLED'
  )),
  requirements_status TEXT NOT NULL,
  transfers_status TEXT NOT NULL,
  payouts_status TEXT NOT NULL,
  dashboard_type TEXT NOT NULL CHECK (dashboard_type = 'express'),
  preferred_payout_type TEXT NOT NULL DEFAULT 'unverified' CHECK (preferred_payout_type IN ('automatic_standard', 'unverified')),
  payout_destination_id TEXT,
  payout_ready_approved_at TEXT,
  last_requirements_check_at TEXT,
  onboarded_at TEXT,
  disabled_reason TEXT,
  payout_exception_flag INTEGER NOT NULL DEFAULT 0 CHECK (payout_exception_flag IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (artist_id, environment),
  UNIQUE (stripe_account_id, environment),
  UNIQUE (artist_id, environment, stripe_account_id)
);

CREATE TABLE IF NOT EXISTS artist_onboarding_claims (
  nonce TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  artist_id TEXT NOT NULL,
  stripe_account_id TEXT NOT NULL,
  roster_revision TEXT NOT NULL,
  challenge_digest TEXT NOT NULL CHECK (
    length(challenge_digest) = 76
    AND substr(challenge_digest, 1, 12) = 'hmac-sha256:'
    AND substr(challenge_digest, 13) NOT GLOB '*[^0-9a-f]*'
  ),
  challenge_failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (
    challenge_failed_attempts BETWEEN 0 AND 5
  ),
  challenge_verified_at TEXT,
  challenge_locked_at TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (challenge_locked_at IS NULL OR challenge_failed_attempts = 5),
  CHECK (challenge_verified_at IS NULL OR consumed_at = challenge_verified_at),
  UNIQUE (nonce, environment),
  FOREIGN KEY (artist_id, environment, stripe_account_id)
    REFERENCES artist_stripe_accounts (artist_id, environment, stripe_account_id)
);

CREATE INDEX IF NOT EXISTS idx_artist_onboarding_claims_expiry
  ON artist_onboarding_claims (environment, expires_at, consumed_at);

CREATE TABLE IF NOT EXISTS artist_onboarding_sessions (
  nonce TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  claim_nonce TEXT NOT NULL,
  artist_id TEXT NOT NULL,
  stripe_account_id TEXT NOT NULL,
  roster_revision TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  link_created_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (nonce, environment),
  UNIQUE (claim_nonce, environment),
  FOREIGN KEY (claim_nonce) REFERENCES artist_onboarding_claims (nonce),
  FOREIGN KEY (artist_id, environment, stripe_account_id)
    REFERENCES artist_stripe_accounts (artist_id, environment, stripe_account_id)
);

CREATE INDEX IF NOT EXISTS idx_artist_onboarding_sessions_active
  ON artist_onboarding_sessions (environment, artist_id, expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS artist_payee_identity_verifications (
  verification_id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  artist_id TEXT NOT NULL,
  stripe_account_id TEXT NOT NULL,
  roster_revision TEXT NOT NULL,
  payout_destination_id TEXT NOT NULL,
  verified_by TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  UNIQUE (verification_id, environment),
  FOREIGN KEY (artist_id, environment, stripe_account_id)
    REFERENCES artist_stripe_accounts (artist_id, environment, stripe_account_id)
);

CREATE INDEX IF NOT EXISTS idx_artist_payee_identity_verification
  ON artist_payee_identity_verifications (
    environment, artist_id, verified_at DESC, verification_id DESC
  );

CREATE TABLE IF NOT EXISTS artist_payment_ledger (
  ledger_id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  booking_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  crm_record_id TEXT NOT NULL,
  crm_revision TEXT NOT NULL,
  crm_reconciled_revision TEXT,
  crm_correction_required INTEGER NOT NULL DEFAULT 0 CHECK (crm_correction_required IN (0, 1)),
  reconciliation_claim_token TEXT,
  reconciliation_claim_expires_at TEXT,
  reconciliation_projection_at TEXT,
  crm_correction_projection_at TEXT,
  manual_payment_claim_token TEXT,
  manual_payment_claim_expires_at TEXT,
  artist_id TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  closeout_verified_at TEXT NOT NULL,
  service TEXT NOT NULL,
  service_pay_cents INTEGER NOT NULL CHECK (service_pay_cents >= 0),
  travel_pay_cents INTEGER NOT NULL CHECK (travel_pay_cents >= 0),
  bonus_cents INTEGER NOT NULL CHECK (bonus_cents >= 0),
  adjustment_cents INTEGER NOT NULL,
  deduction_cents INTEGER NOT NULL CHECK (deduction_cents >= 0),
  total_approved_pay_cents INTEGER NOT NULL CHECK (total_approved_pay_cents > 0),
  material_digest TEXT NOT NULL,
  closeout_controls_json TEXT NOT NULL,
  closeout_status TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN (
    'NOT_ELIGIBLE', 'CLOSEOUT_PENDING', 'ISSUE_REVIEW', 'READY_FOR_OWNER_APPROVAL',
    'OWNER_APPROVED', 'TRANSFER_QUEUED', 'TRANSFER_CREATED', 'TRANSFER_PENDING',
    'TRANSFER_COMPLETED', 'PAYOUT_PENDING', 'PAID', 'TRANSFER_FAILED',
    'PAYOUT_FAILED', 'REVERSED', 'MANUAL_REVIEW', 'MANUAL_PAYMENT_EXCEPTION'
  )),
  source_revision INTEGER NOT NULL CHECK (source_revision >= 1),
  owner_approval_status TEXT NOT NULL DEFAULT 'NOT_REVIEWED' CHECK (owner_approval_status IN (
    'NOT_REVIEWED', 'APPROVED', 'INVALIDATED'
  )),
  owner_approval_revision INTEGER NOT NULL DEFAULT 0 CHECK (owner_approval_revision >= 0),
  approval_digest TEXT,
  approved_by TEXT,
  approval_timestamp TEXT,
  batch_eligibility_date TEXT,
  batch_id TEXT,
  stripe_connected_account_id TEXT NOT NULL,
  approved_payout_destination_id TEXT,
  approved_payout_destination_at TEXT,
  stripe_transfer_id TEXT,
  stripe_destination_payment_id TEXT,
  stripe_transfer_status TEXT,
  stripe_payout_id TEXT,
  stripe_payout_status TEXT,
  expected_arrival TEXT,
  failure_code TEXT,
  failure_reason TEXT,
  payment_memo TEXT NOT NULL,
  manual_payment_method TEXT,
  manual_payment_amount_cents INTEGER,
  manual_payment_reason TEXT,
  manual_payment_evidence_reference TEXT,
  manual_payment_memo TEXT,
  manual_payment_recorded_by TEXT,
  manual_payment_recorded_at TEXT,
  manual_payment_crm_revision TEXT,
  reconciled INTEGER NOT NULL DEFAULT 0 CHECK (reconciled IN (0, 1)),
  reconciled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    total_approved_pay_cents =
      service_pay_cents + travel_pay_cents + bonus_cents + adjustment_cents - deduction_cents
  ),
  CHECK (
    (reconciliation_claim_token IS NULL AND reconciliation_claim_expires_at IS NULL)
    OR (reconciliation_claim_token IS NOT NULL AND reconciliation_claim_expires_at IS NOT NULL)
  ),
  CHECK (
    (manual_payment_claim_token IS NULL AND manual_payment_claim_expires_at IS NULL)
    OR (manual_payment_claim_token IS NOT NULL AND manual_payment_claim_expires_at IS NOT NULL)
  ),
  CHECK (
    (approved_payout_destination_id IS NULL AND approved_payout_destination_at IS NULL)
    OR (approved_payout_destination_id IS NOT NULL AND approved_payout_destination_at IS NOT NULL)
  ),
  CHECK (
    reconciled = 0 OR (
      (state = 'PAID' AND stripe_payout_id IS NOT NULL AND stripe_payout_status = 'paid'
        AND crm_reconciled_revision IS NOT NULL AND reconciled_at IS NOT NULL)
      OR (state = 'MANUAL_PAYMENT_EXCEPTION' AND stripe_transfer_id IS NULL
        AND stripe_payout_id IS NULL AND manual_payment_method IS NOT NULL
        AND manual_payment_amount_cents = total_approved_pay_cents
        AND manual_payment_reason IS NOT NULL AND manual_payment_evidence_reference IS NOT NULL
        AND manual_payment_memo IS NOT NULL AND manual_payment_recorded_by IS NOT NULL
        AND manual_payment_recorded_at IS NOT NULL AND manual_payment_crm_revision IS NOT NULL
        AND reconciled_at IS NOT NULL)
    )
  ),
  CHECK (
    state <> 'PAID'
    OR (stripe_payout_id IS NOT NULL AND stripe_payout_status = 'paid'
      AND stripe_destination_payment_id IS NOT NULL)
  ),
  CHECK (
    state <> 'MANUAL_PAYMENT_EXCEPTION'
    OR (reconciled = 1 AND batch_id IS NULL AND stripe_transfer_id IS NULL
      AND stripe_destination_payment_id IS NULL AND stripe_payout_id IS NULL
      AND manual_payment_claim_token IS NULL AND manual_payment_claim_expires_at IS NULL)
  ),
  CHECK (
    crm_correction_required = 0
    OR (reconciled = 0 AND state IN ('REVERSED', 'PAYOUT_FAILED'))
  ),
  CHECK (
    owner_approval_status <> 'APPROVED'
    OR (approval_digest IS NOT NULL AND approved_by IS NOT NULL
      AND approval_timestamp IS NOT NULL AND batch_id IS NOT NULL)
  ),
  CHECK (
    owner_approval_status <> 'INVALIDATED'
    OR (approval_digest IS NULL AND approved_by IS NULL AND approval_timestamp IS NULL)
  ),
  UNIQUE (assignment_id, environment),
  UNIQUE (stripe_transfer_id, environment),
  UNIQUE (ledger_id, environment),
  FOREIGN KEY (artist_id, environment, stripe_connected_account_id)
    REFERENCES artist_stripe_accounts (artist_id, environment, stripe_account_id)
);

CREATE INDEX IF NOT EXISTS idx_artist_payment_ledger_state_date
  ON artist_payment_ledger (environment, state, batch_eligibility_date, event_date);
CREATE INDEX IF NOT EXISTS idx_artist_payment_ledger_artist
  ON artist_payment_ledger (artist_id, environment, event_date);
CREATE INDEX IF NOT EXISTS idx_artist_payment_ledger_payout
  ON artist_payment_ledger (stripe_connected_account_id, stripe_payout_id, environment);
CREATE INDEX IF NOT EXISTS idx_artist_payment_ledger_reconciliation_claim
  ON artist_payment_ledger (environment, reconciliation_claim_expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_artist_payment_manual_evidence_unique
  ON artist_payment_ledger (
    environment, manual_payment_method, manual_payment_evidence_reference
  )
  WHERE manual_payment_method IS NOT NULL
    AND manual_payment_evidence_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS payout_batches (
  batch_id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  scheduled_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'PREPARED', 'OWNER_APPROVED', 'EXECUTING', 'PARTIALLY_COMPLETED',
    'COMPLETED', 'BLOCKED', 'CANCELED'
  )),
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  item_count INTEGER NOT NULL CHECK (item_count > 0),
  blocked_item_count INTEGER NOT NULL DEFAULT 0 CHECK (blocked_item_count >= 0),
  remaining_candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (remaining_candidate_count >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents > 0),
  available_balance_cents INTEGER,
  minimum_reserve_cents INTEGER,
  projected_balance_cents INTEGER,
  approval_digest TEXT,
  approval_revision INTEGER NOT NULL DEFAULT 0 CHECK (approval_revision >= 0),
  created_by TEXT NOT NULL,
  approved_by TEXT,
  approval_timestamp TEXT,
  execution_claim_token TEXT,
  execution_started_at TEXT,
  execution_completed_at TEXT,
  recovery_processing_date TEXT,
  recovery_authorized_by TEXT,
  recovery_authorized_at TEXT,
  recovery_reason TEXT,
  last_execution_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    status NOT IN ('OWNER_APPROVED', 'EXECUTING', 'PARTIALLY_COMPLETED', 'COMPLETED')
    OR (approval_digest IS NOT NULL AND approval_revision > 0
      AND approved_by IS NOT NULL AND approval_timestamp IS NOT NULL)
  ),
  CHECK (
    status <> 'EXECUTING'
    OR (execution_claim_token IS NOT NULL AND execution_started_at IS NOT NULL)
  ),
  CHECK (
    (recovery_processing_date IS NULL AND recovery_authorized_by IS NULL
      AND recovery_authorized_at IS NULL AND recovery_reason IS NULL)
    OR (recovery_processing_date IS NOT NULL AND recovery_authorized_by IS NOT NULL
      AND recovery_authorized_at IS NOT NULL AND recovery_reason IS NOT NULL)
  ),
  UNIQUE (batch_id, environment)
);

CREATE TABLE IF NOT EXISTS payout_batch_items (
  batch_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  ledger_id TEXT NOT NULL,
  assignment_id_snapshot TEXT NOT NULL,
  artist_id_snapshot TEXT NOT NULL,
  connected_account_id_snapshot TEXT NOT NULL,
  amount_cents_snapshot INTEGER NOT NULL CHECK (amount_cents_snapshot > 0),
  source_revision_snapshot INTEGER NOT NULL CHECK (source_revision_snapshot >= 1),
  material_digest_snapshot TEXT NOT NULL,
  payment_memo_snapshot TEXT NOT NULL,
  item_status TEXT NOT NULL CHECK (item_status IN (
    'PREPARED', 'APPROVED', 'TRANSFER_QUEUED', 'TRANSFER_CREATED',
    'COMPLETED', 'BLOCKED', 'FAILED', 'REVERSED'
  )),
  failure_code TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (batch_id, ledger_id, environment),
  UNIQUE (batch_id, assignment_id_snapshot, environment),
  FOREIGN KEY (batch_id, environment) REFERENCES payout_batches (batch_id, environment),
  FOREIGN KEY (ledger_id, environment) REFERENCES artist_payment_ledger (ledger_id, environment)
);

CREATE TABLE IF NOT EXISTS payout_transfer_attempts (
  attempt_id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  idempotency_fingerprint TEXT NOT NULL,
  source_revision INTEGER NOT NULL CHECK (source_revision >= 1),
  request_amount_cents INTEGER NOT NULL CHECK (request_amount_cents > 0),
  destination_account_id TEXT NOT NULL,
  attempt_status TEXT NOT NULL CHECK (attempt_status IN (
    'CLAIMED', 'STRIPE_SUCCEEDED', 'STRIPE_FAILED', 'RECONCILED'
  )),
  stripe_transfer_id TEXT,
  safe_error_code TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  destination_resnapshot_authorized INTEGER NOT NULL DEFAULT 0
    CHECK (destination_resnapshot_authorized IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (environment, idempotency_fingerprint),
  UNIQUE (ledger_id, batch_id, environment),
  UNIQUE (ledger_id, environment, source_revision),
  FOREIGN KEY (ledger_id, environment) REFERENCES artist_payment_ledger (ledger_id, environment),
  FOREIGN KEY (batch_id, environment) REFERENCES payout_batches (batch_id, environment)
);

CREATE TABLE IF NOT EXISTS payout_destination_variance_approvals (
  approval_id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  ledger_id TEXT NOT NULL,
  payout_id TEXT NOT NULL,
  original_destination_id TEXT NOT NULL,
  approved_destination_id TEXT NOT NULL,
  recipient_approval_at TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (ledger_id, payout_id, environment),
  CHECK (original_destination_id <> approved_destination_id),
  FOREIGN KEY (ledger_id, environment)
    REFERENCES artist_payment_ledger (ledger_id, environment)
);

CREATE INDEX IF NOT EXISTS idx_payout_destination_variance_payout
  ON payout_destination_variance_approvals (environment, payout_id, ledger_id);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  stripe_event_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  event_type TEXT NOT NULL,
  connected_account_id TEXT,
  received_at TEXT NOT NULL,
  processing_status TEXT NOT NULL CHECK (processing_status IN (
    'RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED'
  )),
  processing_claim_token TEXT,
  processing_started_at TEXT,
  processing_lease_expires_at TEXT,
  processed_at TEXT,
  safe_error_code TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  PRIMARY KEY (stripe_event_id, environment),
  CHECK (
    (
      processing_status = 'RECEIVED'
      AND processing_claim_token IS NULL
      AND processing_started_at IS NULL
      AND processing_lease_expires_at IS NULL
      AND processed_at IS NULL
      AND safe_error_code IS NULL
    ) OR (
      processing_status = 'PROCESSING'
      AND processing_claim_token IS NOT NULL
      AND processing_started_at IS NOT NULL
      AND processing_lease_expires_at IS NOT NULL
      AND processing_started_at < processing_lease_expires_at
      AND processed_at IS NULL
      AND safe_error_code IS NULL
    ) OR (
      processing_status IN ('PROCESSED', 'IGNORED')
      AND processing_claim_token IS NULL
      AND processing_started_at IS NULL
      AND processing_lease_expires_at IS NULL
      AND processed_at IS NOT NULL
      AND safe_error_code IS NULL
    ) OR (
      processing_status = 'FAILED'
      AND processing_claim_token IS NULL
      AND processing_started_at IS NULL
      AND processing_lease_expires_at IS NULL
      AND processed_at IS NULL
      AND safe_error_code IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status
  ON stripe_webhook_events (environment, processing_status, received_at);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_lease
  ON stripe_webhook_events (environment, processing_status, processing_lease_expires_at);

CREATE TABLE IF NOT EXISTS payout_exceptions (
  exception_id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  ledger_id TEXT,
  batch_id TEXT,
  artist_id TEXT,
  booking_id TEXT,
  assignment_id TEXT,
  exception_type TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  safe_reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  owner_action_required TEXT NOT NULL,
  last_attempt_at TEXT,
  next_allowed_attempt_at TEXT,
  stripe_reference TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT,
  resolution_evidence TEXT,
  FOREIGN KEY (ledger_id, environment) REFERENCES artist_payment_ledger (ledger_id, environment),
  FOREIGN KEY (batch_id, environment) REFERENCES payout_batches (batch_id, environment)
);

CREATE INDEX IF NOT EXISTS idx_payout_exceptions_open
  ON payout_exceptions (environment, status, created_at);

CREATE TABLE IF NOT EXISTS financial_audit_log (
  audit_id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  booking_id TEXT,
  assignment_id TEXT,
  artist_id TEXT,
  amount_cents INTEGER,
  currency TEXT,
  connected_account_id TEXT,
  transfer_id TEXT,
  payout_id TEXT,
  previous_state TEXT,
  new_state TEXT,
  approval_revision INTEGER,
  idempotency_fingerprint TEXT,
  result TEXT NOT NULL,
  failure_reason TEXT,
  request_id TEXT,
  batch_id TEXT,
  safe_details_json TEXT NOT NULL,
  CHECK (
    action NOT IN (
      'PAYOUT_BATCH_ITEM_PREPARED', 'PAYOUT_BATCH_ITEM_OWNER_APPROVED',
      'STRIPE_TRANSFER_CREATED', 'STRIPE_TRANSFER_FAILED',
      'STRIPE_TRANSFER_PENDING', 'STRIPE_TRANSFER_COMPLETED', 'STRIPE_TRANSFER_REVERSED',
      'STRIPE_PAYOUT_PENDING', 'STRIPE_PAYOUT_PAID_EVIDENCE_RECORDED',
      'STRIPE_PAYOUT_FAILED', 'PAYOUT_CLOSED_LOOP_RECONCILED',
      'CRM_CORRECTIVE_STATE_RECONCILED', 'MANUAL_PAYMENT_EXCEPTION_RECORDED',
      'PAYOUT_BATCH_PREPARED', 'PAYOUT_BATCH_OWNER_APPROVED',
      'AMBIGUOUS_TRANSFER_OUTCOME_OWNER_RECONCILED',
      'MANUAL_PAYMENT_INTENT_RECORDED', 'MANUAL_PAYMENT_INTENT_CANCELED'
    )
    OR (booking_id IS NOT NULL AND assignment_id IS NOT NULL AND artist_id IS NOT NULL
      AND amount_cents IS NOT NULL AND currency = 'usd')
  )
);

CREATE INDEX IF NOT EXISTS idx_financial_audit_assignment
  ON financial_audit_log (environment, assignment_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_financial_audit_batch
  ON financial_audit_log (environment, batch_id, timestamp);

CREATE TRIGGER IF NOT EXISTS financial_audit_log_no_update
BEFORE UPDATE ON financial_audit_log
BEGIN
  SELECT RAISE(ABORT, 'financial_audit_log is append-only');
END;

CREATE TRIGGER IF NOT EXISTS payout_database_identity_no_update
BEFORE UPDATE ON payout_database_identity
BEGIN
  SELECT RAISE(ABORT, 'payout database identity is immutable');
END;

CREATE TRIGGER IF NOT EXISTS payout_database_identity_no_delete
BEFORE DELETE ON payout_database_identity
BEGIN
  SELECT RAISE(ABORT, 'payout database identity is immutable');
END;

CREATE TRIGGER IF NOT EXISTS payout_schema_migrations_no_update
BEFORE UPDATE ON payout_schema_migrations
BEGIN
  SELECT RAISE(ABORT, 'payout migration history is append-only');
END;

CREATE TRIGGER IF NOT EXISTS payout_schema_migrations_no_delete
BEFORE DELETE ON payout_schema_migrations
BEGIN
  SELECT RAISE(ABORT, 'payout migration history is append-only');
END;

CREATE TRIGGER IF NOT EXISTS payout_schema_migrations_environment_guard
BEFORE INSERT ON payout_schema_migrations
WHEN NEW.environment <> COALESCE((SELECT environment FROM payout_database_identity WHERE singleton_key = 'artist_payouts'), '')
BEGIN SELECT RAISE(ABORT, 'migration environment does not match database identity'); END;

CREATE TRIGGER IF NOT EXISTS payout_migration_guard_no_update
BEFORE UPDATE ON payout_migration_guard
BEGIN SELECT RAISE(ABORT, 'payout migration guard is sealed'); END;

CREATE TRIGGER IF NOT EXISTS payout_migration_guard_no_delete
BEFORE DELETE ON payout_migration_guard
BEGIN SELECT RAISE(ABORT, 'payout migration guard is sealed'); END;

CREATE TRIGGER IF NOT EXISTS financial_audit_log_no_delete
BEFORE DELETE ON financial_audit_log
BEGIN
  SELECT RAISE(ABORT, 'financial_audit_log is append-only');
END;

CREATE TRIGGER IF NOT EXISTS approved_ledger_material_change_requires_invalidation
BEFORE UPDATE OF
  booking_id, assignment_id, crm_record_id, crm_revision, artist_id, artist_name, event_name, event_date, closeout_verified_at, service,
  service_pay_cents, travel_pay_cents, bonus_cents, adjustment_cents,
  deduction_cents, total_approved_pay_cents, closeout_controls_json,
  source_revision, stripe_connected_account_id, payment_memo, material_digest
ON artist_payment_ledger
WHEN OLD.owner_approval_status = 'APPROVED'
  AND NOT (
    NEW.owner_approval_status = 'INVALIDATED'
    AND NEW.source_revision = OLD.source_revision + 1
    AND NEW.approval_digest IS NULL
    AND NEW.approved_by IS NULL
    AND NEW.approval_timestamp IS NULL
    AND NEW.batch_id IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'approved ledger mutation requires atomic approval invalidation');
END;

CREATE TRIGGER IF NOT EXISTS transferred_ledger_material_is_immutable
BEFORE UPDATE OF
  booking_id, assignment_id, crm_record_id, crm_revision, artist_id, artist_name, event_name, event_date, closeout_verified_at, service,
  service_pay_cents, travel_pay_cents, bonus_cents, adjustment_cents,
  deduction_cents, total_approved_pay_cents, closeout_controls_json,
  source_revision, stripe_connected_account_id, payment_memo, material_digest
ON artist_payment_ledger
WHEN OLD.stripe_transfer_id IS NOT NULL
  OR OLD.state IN (
    'TRANSFER_QUEUED', 'TRANSFER_CREATED', 'TRANSFER_PENDING', 'TRANSFER_COMPLETED',
    'PAYOUT_PENDING', 'PAID', 'TRANSFER_FAILED', 'PAYOUT_FAILED', 'REVERSED'
  )
BEGIN
  SELECT RAISE(ABORT, 'financial ledger material is immutable after transfer claim');
END;

CREATE TRIGGER IF NOT EXISTS approved_payout_destination_snapshot_guard
BEFORE UPDATE OF approved_payout_destination_id, approved_payout_destination_at
ON artist_payment_ledger
WHEN (
    NEW.approved_payout_destination_id IS NOT OLD.approved_payout_destination_id
    OR NEW.approved_payout_destination_at IS NOT OLD.approved_payout_destination_at
  )
  AND NOT (
    OLD.state = 'TRANSFER_QUEUED' AND NEW.state = 'TRANSFER_QUEUED'
    AND OLD.stripe_transfer_id IS NULL AND NEW.stripe_transfer_id IS NULL
    AND OLD.stripe_destination_payment_id IS NULL
    AND NEW.stripe_destination_payment_id IS NULL
    AND OLD.stripe_payout_id IS NULL AND NEW.stripe_payout_id IS NULL
    AND NEW.approved_payout_destination_id IS NOT NULL
    AND NEW.approved_payout_destination_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM payout_transfer_attempts a
      WHERE a.ledger_id = OLD.ledger_id AND a.batch_id = OLD.batch_id
        AND a.environment = OLD.environment AND a.attempt_status = 'CLAIMED'
        AND a.stripe_transfer_id IS NULL
        AND (
          (OLD.approved_payout_destination_id IS NULL
            AND OLD.approved_payout_destination_at IS NULL)
          OR a.destination_resnapshot_authorized = 1
        )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'approved payout destination snapshot is immutable');
END;

CREATE TRIGGER IF NOT EXISTS reconciled_manual_payment_evidence_is_immutable
BEFORE UPDATE OF
  manual_payment_method, manual_payment_amount_cents, manual_payment_reason,
  manual_payment_evidence_reference, manual_payment_memo,
  manual_payment_recorded_by, manual_payment_recorded_at,
  manual_payment_crm_revision
ON artist_payment_ledger
WHEN OLD.state = 'MANUAL_PAYMENT_EXCEPTION'
  OR OLD.manual_payment_crm_revision IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'reconciled manual payment evidence is immutable');
END;

CREATE TRIGGER IF NOT EXISTS payout_batch_item_snapshot_is_immutable
BEFORE UPDATE OF
  assignment_id_snapshot, artist_id_snapshot, connected_account_id_snapshot,
  amount_cents_snapshot, source_revision_snapshot, material_digest_snapshot,
  payment_memo_snapshot
ON payout_batch_items
BEGIN
  SELECT RAISE(ABORT, 'payout batch item snapshot is immutable');
END;

CREATE TRIGGER IF NOT EXISTS payout_batch_item_no_delete
BEFORE DELETE ON payout_batch_items
BEGIN
  SELECT RAISE(ABORT, 'payout batch items are retained for financial evidence');
END;

CREATE TRIGGER IF NOT EXISTS payout_batch_approved_material_is_immutable
BEFORE UPDATE OF scheduled_date, currency, item_count, total_cents, approval_digest, approval_revision
ON payout_batches
WHEN OLD.status <> 'PREPARED'
BEGIN
  SELECT RAISE(ABORT, 'approved payout batch material is immutable');
END;

CREATE TRIGGER IF NOT EXISTS artist_stripe_accounts_environment_guard
BEFORE INSERT ON artist_stripe_accounts
WHEN NEW.environment <> COALESCE((SELECT environment FROM payout_database_identity WHERE singleton_key = 'artist_payouts'), '')
BEGIN SELECT RAISE(ABORT, 'artist account environment does not match database identity'); END;
CREATE TRIGGER IF NOT EXISTS artist_stripe_accounts_environment_immutable
BEFORE UPDATE OF environment ON artist_stripe_accounts
BEGIN SELECT RAISE(ABORT, 'artist account environment is immutable'); END;

CREATE TRIGGER IF NOT EXISTS artist_onboarding_claims_environment_guard
BEFORE INSERT ON artist_onboarding_claims
WHEN NEW.environment <> COALESCE((SELECT environment FROM payout_database_identity WHERE singleton_key = 'artist_payouts'), '')
BEGIN SELECT RAISE(ABORT, 'onboarding claim environment does not match database identity'); END;
CREATE TRIGGER IF NOT EXISTS artist_onboarding_claims_environment_immutable
BEFORE UPDATE OF environment ON artist_onboarding_claims
BEGIN SELECT RAISE(ABORT, 'onboarding claim environment is immutable'); END;

CREATE TRIGGER IF NOT EXISTS artist_onboarding_sessions_environment_guard
BEFORE INSERT ON artist_onboarding_sessions
WHEN NEW.environment <> COALESCE((SELECT environment FROM payout_database_identity WHERE singleton_key = 'artist_payouts'), '')
BEGIN SELECT RAISE(ABORT, 'onboarding session environment does not match database identity'); END;
CREATE TRIGGER IF NOT EXISTS artist_onboarding_sessions_environment_immutable
BEFORE UPDATE OF environment ON artist_onboarding_sessions
BEGIN SELECT RAISE(ABORT, 'onboarding session environment is immutable'); END;
CREATE TRIGGER IF NOT EXISTS artist_onboarding_sessions_no_delete
BEFORE DELETE ON artist_onboarding_sessions
BEGIN SELECT RAISE(ABORT, 'onboarding sessions are retained for security evidence'); END;

CREATE TRIGGER IF NOT EXISTS artist_payee_identity_verifications_environment_guard
BEFORE INSERT ON artist_payee_identity_verifications
WHEN NEW.environment <> COALESCE((SELECT environment FROM payout_database_identity WHERE singleton_key = 'artist_payouts'), '')
BEGIN SELECT RAISE(ABORT, 'payee identity verification environment does not match database identity'); END;
CREATE TRIGGER IF NOT EXISTS artist_payee_identity_verifications_immutable
BEFORE UPDATE ON artist_payee_identity_verifications
BEGIN SELECT RAISE(ABORT, 'payee identity verifications are immutable'); END;
CREATE TRIGGER IF NOT EXISTS artist_payee_identity_verifications_no_delete
BEFORE DELETE ON artist_payee_identity_verifications
BEGIN SELECT RAISE(ABORT, 'payee identity verifications are retained for security evidence'); END;

CREATE TRIGGER IF NOT EXISTS artist_payment_ledger_environment_guard
BEFORE INSERT ON artist_payment_ledger
WHEN NEW.environment <> COALESCE((SELECT environment FROM payout_database_identity WHERE singleton_key = 'artist_payouts'), '')
BEGIN SELECT RAISE(ABORT, 'ledger environment does not match database identity'); END;
CREATE TRIGGER IF NOT EXISTS artist_payment_ledger_environment_immutable
BEFORE UPDATE OF environment ON artist_payment_ledger
BEGIN SELECT RAISE(ABORT, 'ledger environment is immutable'); END;

CREATE TRIGGER IF NOT EXISTS payout_batches_environment_guard
BEFORE INSERT ON payout_batches
WHEN NEW.environment <> COALESCE((SELECT environment FROM payout_database_identity WHERE singleton_key = 'artist_payouts'), '')
BEGIN SELECT RAISE(ABORT, 'batch environment does not match database identity'); END;
CREATE TRIGGER IF NOT EXISTS payout_batches_environment_immutable
BEFORE UPDATE OF environment ON payout_batches
BEGIN SELECT RAISE(ABORT, 'batch environment is immutable'); END;

CREATE TRIGGER IF NOT EXISTS payout_batch_items_environment_guard
BEFORE INSERT ON payout_batch_items
WHEN NEW.environment <> COALESCE((SELECT environment FROM payout_database_identity WHERE singleton_key = 'artist_payouts'), '')
BEGIN SELECT RAISE(ABORT, 'batch item environment does not match database identity'); END;
CREATE TRIGGER IF NOT EXISTS payout_batch_items_environment_immutable
BEFORE UPDATE OF environment ON payout_batch_items
BEGIN SELECT RAISE(ABORT, 'batch item environment is immutable'); END;

CREATE TRIGGER IF NOT EXISTS payout_transfer_attempts_environment_guard
BEFORE INSERT ON payout_transfer_attempts
WHEN NEW.environment <> COALESCE((SELECT environment FROM payout_database_identity WHERE singleton_key = 'artist_payouts'), '')
BEGIN SELECT RAISE(ABORT, 'transfer attempt environment does not match database identity'); END;
CREATE TRIGGER IF NOT EXISTS payout_transfer_attempts_environment_immutable
BEFORE UPDATE OF environment ON payout_transfer_attempts
BEGIN SELECT RAISE(ABORT, 'transfer attempt environment is immutable'); END;

CREATE TRIGGER IF NOT EXISTS payout_destination_variance_environment_guard
BEFORE INSERT ON payout_destination_variance_approvals
WHEN NEW.environment <> COALESCE((SELECT environment FROM payout_database_identity WHERE singleton_key = 'artist_payouts'), '')
BEGIN SELECT RAISE(ABORT, 'payout destination variance environment does not match database identity'); END;
CREATE TRIGGER IF NOT EXISTS payout_destination_variance_environment_immutable
BEFORE UPDATE OF environment ON payout_destination_variance_approvals
BEGIN SELECT RAISE(ABORT, 'payout destination variance environment is immutable'); END;
CREATE TRIGGER IF NOT EXISTS payout_destination_variance_no_update
BEFORE UPDATE ON payout_destination_variance_approvals
BEGIN SELECT RAISE(ABORT, 'payout destination variance approval is immutable'); END;

CREATE TRIGGER IF NOT EXISTS stripe_webhook_events_environment_guard
BEFORE INSERT ON stripe_webhook_events
WHEN NEW.environment <> COALESCE((SELECT environment FROM payout_database_identity WHERE singleton_key = 'artist_payouts'), '')
BEGIN SELECT RAISE(ABORT, 'webhook environment does not match database identity'); END;
CREATE TRIGGER IF NOT EXISTS stripe_webhook_events_environment_immutable
BEFORE UPDATE OF environment ON stripe_webhook_events
BEGIN SELECT RAISE(ABORT, 'webhook environment is immutable'); END;

CREATE TRIGGER IF NOT EXISTS payout_exceptions_environment_guard
BEFORE INSERT ON payout_exceptions
WHEN NEW.environment <> COALESCE((SELECT environment FROM payout_database_identity WHERE singleton_key = 'artist_payouts'), '')
BEGIN SELECT RAISE(ABORT, 'exception environment does not match database identity'); END;
CREATE TRIGGER IF NOT EXISTS payout_exceptions_environment_immutable
BEFORE UPDATE OF environment ON payout_exceptions
BEGIN SELECT RAISE(ABORT, 'exception environment is immutable'); END;

CREATE TRIGGER IF NOT EXISTS financial_audit_log_environment_guard
BEFORE INSERT ON financial_audit_log
WHEN NEW.environment <> COALESCE((SELECT environment FROM payout_database_identity WHERE singleton_key = 'artist_payouts'), '')
BEGIN SELECT RAISE(ABORT, 'audit environment does not match database identity'); END;

CREATE TRIGGER IF NOT EXISTS artist_stripe_accounts_no_delete
BEFORE DELETE ON artist_stripe_accounts
BEGIN SELECT RAISE(ABORT, 'artist payout accounts are retained for financial evidence'); END;
CREATE TRIGGER IF NOT EXISTS artist_onboarding_claims_no_delete
BEFORE DELETE ON artist_onboarding_claims
BEGIN SELECT RAISE(ABORT, 'onboarding claims are retained for security evidence'); END;
CREATE TRIGGER IF NOT EXISTS artist_payment_ledger_no_delete
BEFORE DELETE ON artist_payment_ledger
BEGIN SELECT RAISE(ABORT, 'artist payout ledgers are retained for financial evidence'); END;
CREATE TRIGGER IF NOT EXISTS payout_batches_no_delete
BEFORE DELETE ON payout_batches
BEGIN SELECT RAISE(ABORT, 'payout batches are retained for financial evidence'); END;
CREATE TRIGGER IF NOT EXISTS payout_transfer_attempts_no_delete
BEFORE DELETE ON payout_transfer_attempts
BEGIN SELECT RAISE(ABORT, 'transfer attempts are retained for financial evidence'); END;
CREATE TRIGGER IF NOT EXISTS payout_destination_variance_no_delete
BEFORE DELETE ON payout_destination_variance_approvals
BEGIN SELECT RAISE(ABORT, 'payout destination variance approvals are retained for financial evidence'); END;
CREATE TRIGGER IF NOT EXISTS stripe_webhook_events_no_delete
BEFORE DELETE ON stripe_webhook_events
BEGIN SELECT RAISE(ABORT, 'webhook events are retained for financial evidence'); END;
CREATE TRIGGER IF NOT EXISTS payout_exceptions_no_delete
BEFORE DELETE ON payout_exceptions
BEGIN SELECT RAISE(ABORT, 'payout exceptions are retained for financial evidence'); END;

INSERT INTO payout_schema_migrations (migration_id, environment, applied_at)
SELECT
  '0001_artist_payout_system_v1',
  environment,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM payout_database_identity
WHERE singleton_key = 'artist_payouts';
