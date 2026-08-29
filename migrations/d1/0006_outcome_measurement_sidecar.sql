-- GOOGLE ADS OUTCOME MEASUREMENT MVP — Slice 1 only.
-- Additive, local-first attribution sidecar schema. No historical backfill.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lead_attribution_v1 (
  source_system TEXT NOT NULL
    CHECK (source_system IN ('HFLA_WEB_LEAD', 'HFLA_PLAN_MY_PARTY')),
  source_lead_id TEXT NOT NULL
    CHECK (
      length(source_lead_id) BETWEEN 1 AND 160
      AND source_lead_id NOT GLOB '*[^A-Za-z0-9_:-]*'
    ),
  submitted_at TEXT NOT NULL
    CHECK (submitted_at GLOB '????-??-??T??:??:??*Z'),
  landing_page TEXT CHECK (
    landing_page IS NULL
    OR (
      length(landing_page) BETWEEN 1 AND 512
      AND substr(landing_page, 1, 1) = '/'
      AND instr(landing_page, '?') = 0
      AND instr(landing_page, '#') = 0
    )
  ),
  source_page TEXT CHECK (
    source_page IS NULL
    OR (
      length(source_page) BETWEEN 1 AND 512
      AND substr(source_page, 1, 1) = '/'
      AND instr(source_page, '?') = 0
      AND instr(source_page, '#') = 0
    )
  ),
  gclid TEXT CHECK (
    gclid IS NULL
    OR (
      length(gclid) BETWEEN 1 AND 2048
      AND instr(gclid, ' ') = 0
      AND instr(gclid, char(9)) = 0
      AND instr(gclid, char(10)) = 0
      AND instr(gclid, char(13)) = 0
    )
  ),
  gbraid TEXT CHECK (
    gbraid IS NULL
    OR (
      length(gbraid) BETWEEN 1 AND 2048
      AND instr(gbraid, ' ') = 0
      AND instr(gbraid, char(9)) = 0
      AND instr(gbraid, char(10)) = 0
      AND instr(gbraid, char(13)) = 0
    )
  ),
  wbraid TEXT CHECK (
    wbraid IS NULL
    OR (
      length(wbraid) BETWEEN 1 AND 2048
      AND instr(wbraid, ' ') = 0
      AND instr(wbraid, char(9)) = 0
      AND instr(wbraid, char(10)) = 0
      AND instr(wbraid, char(13)) = 0
    )
  ),
  utm_source TEXT CHECK (utm_source IS NULL OR length(utm_source) BETWEEN 1 AND 256),
  utm_medium TEXT CHECK (utm_medium IS NULL OR length(utm_medium) BETWEEN 1 AND 256),
  utm_campaign TEXT CHECK (utm_campaign IS NULL OR length(utm_campaign) BETWEEN 1 AND 256),
  utm_term TEXT CHECK (utm_term IS NULL OR length(utm_term) BETWEEN 1 AND 256),
  utm_content TEXT CHECK (utm_content IS NULL OR length(utm_content) BETWEEN 1 AND 256),
  capture_version TEXT NOT NULL
    CHECK (capture_version = 'ATTRIBUTION_CAPTURE_V1'),
  created_at TEXT NOT NULL
    CHECK (created_at GLOB '????-??-??T??:??:??*Z'),
  record_sha256 TEXT NOT NULL
    CHECK (
      length(record_sha256) = 64
      AND record_sha256 = lower(record_sha256)
      AND record_sha256 NOT GLOB '*[^0-9a-f]*'
    ),
  capture_state TEXT NOT NULL
    CHECK (capture_state IN ('CAPTURED', 'QUARANTINED')),
  PRIMARY KEY (source_system, source_lead_id),
  CHECK (
    (
      capture_state = 'CAPTURED'
      AND NOT (gbraid IS NOT NULL AND wbraid IS NOT NULL)
      AND NOT (gclid IS NOT NULL AND wbraid IS NOT NULL)
    )
    OR
    (
      capture_state = 'QUARANTINED'
      AND (
        (gbraid IS NOT NULL AND wbraid IS NOT NULL)
        OR (gclid IS NOT NULL AND wbraid IS NOT NULL)
      )
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_attribution_v1_created
  ON lead_attribution_v1 (created_at, source_system);

CREATE INDEX IF NOT EXISTS idx_lead_attribution_v1_state
  ON lead_attribution_v1 (capture_state, created_at);

CREATE TABLE IF NOT EXISTS lead_attribution_insert_audit_v1 (
  source_system TEXT NOT NULL,
  source_lead_id TEXT NOT NULL,
  record_sha256 TEXT NOT NULL,
  capture_state TEXT NOT NULL CHECK (capture_state IN ('CAPTURED', 'QUARANTINED')),
  has_gclid INTEGER NOT NULL CHECK (has_gclid IN (0, 1)),
  has_gbraid INTEGER NOT NULL CHECK (has_gbraid IN (0, 1)),
  has_wbraid INTEGER NOT NULL CHECK (has_wbraid IN (0, 1)),
  created_at TEXT NOT NULL
    CHECK (created_at GLOB '????-??-??T??:??:??*Z'),
  PRIMARY KEY (source_system, source_lead_id),
  FOREIGN KEY (source_system, source_lead_id)
    REFERENCES lead_attribution_v1 (source_system, source_lead_id)
);

CREATE TRIGGER IF NOT EXISTS trg_lead_attribution_v1_audit_insert
AFTER INSERT ON lead_attribution_v1
BEGIN
  INSERT INTO lead_attribution_insert_audit_v1 (
    source_system,
    source_lead_id,
    record_sha256,
    capture_state,
    has_gclid,
    has_gbraid,
    has_wbraid,
    created_at
  ) VALUES (
    NEW.source_system,
    NEW.source_lead_id,
    NEW.record_sha256,
    NEW.capture_state,
    CASE WHEN NEW.gclid IS NULL THEN 0 ELSE 1 END,
    CASE WHEN NEW.gbraid IS NULL THEN 0 ELSE 1 END,
    CASE WHEN NEW.wbraid IS NULL THEN 0 ELSE 1 END,
    NEW.created_at
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_lead_attribution_v1_no_update
BEFORE UPDATE ON lead_attribution_v1
BEGIN
  SELECT RAISE(ABORT, 'lead_attribution_v1 is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_lead_attribution_v1_no_delete
BEFORE DELETE ON lead_attribution_v1
BEGIN
  SELECT RAISE(ABORT, 'lead_attribution_v1 is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_lead_attribution_insert_audit_v1_no_update
BEFORE UPDATE ON lead_attribution_insert_audit_v1
BEGIN
  SELECT RAISE(ABORT, 'lead_attribution_insert_audit_v1 is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_lead_attribution_insert_audit_v1_no_delete
BEFORE DELETE ON lead_attribution_insert_audit_v1
BEGIN
  SELECT RAISE(ABORT, 'lead_attribution_insert_audit_v1 is immutable');
END;
