-- Owner-approval-gated identity bootstrap for a fresh, dedicated live payout D1.
-- Applying this file is a production mutation and is forbidden during development.
PRAGMA foreign_keys = ON;

CREATE TABLE payout_database_identity (
  singleton_key TEXT PRIMARY KEY CHECK (singleton_key = 'artist_payouts'),
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  established_at TEXT NOT NULL,
  UNIQUE (singleton_key, environment)
);

CREATE TABLE payout_schema_migrations (
  migration_id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  applied_at TEXT NOT NULL
);

CREATE TABLE payout_migration_guard (
  singleton_key TEXT PRIMARY KEY CHECK (singleton_key = 'artist_payouts'),
  valid INTEGER NOT NULL CHECK (valid = 1)
);

INSERT INTO payout_database_identity (singleton_key, environment, established_at)
VALUES ('artist_payouts', 'live', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT INTO payout_schema_migrations (migration_id, environment, applied_at)
VALUES (
  '0000_environment_identity_v1',
  'live',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

INSERT INTO payout_migration_guard (singleton_key, valid)
VALUES ('artist_payouts', 1);
