-- PUBLIC-BOOKING-R13-R4 local/test D1 availability source schema.
-- Do not apply to production D1 without separate owner authorization.
-- Tables intentionally exclude customer PII, contractor data, internal cost,
-- margin, artist names, admin tokens, Drive paths, raw filenames, and
-- governance IDs.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS availability_slots (
  slot_id TEXT PRIMARY KEY,
  event_date TEXT NOT NULL CHECK (event_date GLOB '????-??-??'),
  start_time TEXT NOT NULL CHECK (start_time GLOB '??:??'),
  end_time TEXT NOT NULL CHECK (end_time GLOB '??:??'),
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  service_ids_json TEXT NOT NULL,
  service_combo_key TEXT NOT NULL,
  travel_zone TEXT NOT NULL CHECK (travel_zone IN ('local', 'zone-25', 'zone-40', 'manual-review')),
  capacity_units_total INTEGER NOT NULL CHECK (capacity_units_total > 0),
  capacity_units_held INTEGER NOT NULL DEFAULT 0 CHECK (capacity_units_held >= 0),
  capacity_units_reserved INTEGER NOT NULL DEFAULT 0 CHECK (capacity_units_reserved >= 0),
  status TEXT NOT NULL CHECK (status IN ('open', 'held', 'reserved', 'expired', 'released', 'blocked', 'unavailable')),
  hold_expires_at TEXT,
  blocked_reason_code TEXT,
  created_by_actor TEXT NOT NULL,
  updated_by_actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (capacity_units_held + capacity_units_reserved <= capacity_units_total)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_availability_slots_unique_window
  ON availability_slots (event_date, start_time, end_time, service_combo_key, travel_zone);

CREATE INDEX IF NOT EXISTS idx_availability_slots_lookup
  ON availability_slots (event_date, start_time, service_combo_key, travel_zone, status);

CREATE INDEX IF NOT EXISTS idx_availability_slots_status_date
  ON availability_slots (status, event_date, start_time);

CREATE TABLE IF NOT EXISTS slot_holds (
  hold_id TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL,
  booking_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  stripe_session_id TEXT UNIQUE,
  capacity_units INTEGER NOT NULL CHECK (capacity_units > 0),
  hold_status TEXT NOT NULL CHECK (hold_status IN ('held', 'reserved', 'expired', 'released')),
  hold_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (slot_id) REFERENCES availability_slots(slot_id)
);

CREATE INDEX IF NOT EXISTS idx_slot_holds_slot_status
  ON slot_holds (slot_id, hold_status, hold_expires_at);

CREATE INDEX IF NOT EXISTS idx_slot_holds_booking
  ON slot_holds (booking_id);

CREATE TABLE IF NOT EXISTS booking_slot_links (
  link_id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL UNIQUE,
  slot_id TEXT NOT NULL,
  hold_id TEXT NOT NULL,
  stripe_session_id TEXT UNIQUE,
  link_status TEXT NOT NULL CHECK (link_status IN ('pending', 'reserved', 'released', 'manual_review')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (slot_id) REFERENCES availability_slots(slot_id),
  FOREIGN KEY (hold_id) REFERENCES slot_holds(hold_id)
);

CREATE INDEX IF NOT EXISTS idx_booking_slot_links_slot
  ON booking_slot_links (slot_id, link_status);

CREATE TABLE IF NOT EXISTS slot_audit_log (
  audit_id TEXT PRIMARY KEY,
  slot_id TEXT,
  hold_id TEXT,
  booking_id TEXT,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('public_api', 'admin_api', 'stripe_webhook', 'system')),
  safe_details_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (slot_id) REFERENCES availability_slots(slot_id),
  FOREIGN KEY (hold_id) REFERENCES slot_holds(hold_id)
);

CREATE INDEX IF NOT EXISTS idx_slot_audit_slot_created
  ON slot_audit_log (slot_id, created_at);

CREATE INDEX IF NOT EXISTS idx_slot_audit_booking_created
  ON slot_audit_log (booking_id, created_at);

CREATE TABLE IF NOT EXISTS slot_admin_events (
  admin_event_id TEXT PRIMARY KEY,
  slot_id TEXT,
  action TEXT NOT NULL,
  actor_label TEXT NOT NULL,
  safe_details_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (slot_id) REFERENCES availability_slots(slot_id)
);

CREATE INDEX IF NOT EXISTS idx_slot_admin_events_slot_created
  ON slot_admin_events (slot_id, created_at);
