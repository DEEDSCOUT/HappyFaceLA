-- PUBLIC-BOOKING-R13-R8D continuation seed.
-- Preview D1 (hfla-availability-preview) only. Synthetic non-PII rows.
-- Unique r13r8d_cont IDs are used so pre-existing records are not touched.

INSERT INTO availability_slots (
  slot_id, event_date, start_time, end_time, timezone, service_ids_json,
  service_combo_key, travel_zone, capacity_units_total, capacity_units_held,
  capacity_units_reserved, status, hold_expires_at, blocked_reason_code,
  created_by_actor, updated_by_actor, created_at, updated_at
)
VALUES (
  'slot_r13r8d_cont_open_001', '2026-11-28', '12:00', '14:00',
  'America/Los_Angeles', '["face-painting"]', 'face-painting', 'local',
  2, 0, 0, 'open', NULL, NULL, 'r13r8d_continuation',
  'r13r8d_continuation', '2026-06-11T04:30:00Z', '2026-06-11T04:30:00Z'
);

INSERT INTO availability_slots (
  slot_id, event_date, start_time, end_time, timezone, service_ids_json,
  service_combo_key, travel_zone, capacity_units_total, capacity_units_held,
  capacity_units_reserved, status, hold_expires_at, blocked_reason_code,
  created_by_actor, updated_by_actor, created_at, updated_at
)
VALUES (
  'slot_r13r8d_cont_checkout_007', '2026-11-28', '10:00', '12:00',
  'America/Los_Angeles', '["face-painting"]', 'face-painting', 'local',
  1, 0, 0, 'open', NULL, NULL, 'r13r8d_continuation',
  'r13r8d_continuation', '2026-06-11T04:30:00Z', '2026-06-11T04:30:00Z'
);

INSERT INTO availability_slots (
  slot_id, event_date, start_time, end_time, timezone, service_ids_json,
  service_combo_key, travel_zone, capacity_units_total, capacity_units_held,
  capacity_units_reserved, status, hold_expires_at, blocked_reason_code,
  created_by_actor, updated_by_actor, created_at, updated_at
)
VALUES (
  'slot_r13r8d_cont_blocked_002', '2026-11-28', '15:00', '17:00',
  'America/Los_Angeles', '["face-painting"]', 'face-painting', 'local',
  2, 0, 0, 'blocked', NULL, 'r13r8d_cont_test_block',
  'r13r8d_continuation', 'r13r8d_continuation',
  '2026-06-11T04:30:00Z', '2026-06-11T04:30:00Z'
);

INSERT INTO availability_slots (
  slot_id, event_date, start_time, end_time, timezone, service_ids_json,
  service_combo_key, travel_zone, capacity_units_total, capacity_units_held,
  capacity_units_reserved, status, hold_expires_at, blocked_reason_code,
  created_by_actor, updated_by_actor, created_at, updated_at
)
VALUES (
  'slot_r13r8d_cont_p8_009', '2026-11-28', '09:00', '11:00',
  'America/Los_Angeles', '["face-painting"]', 'face-painting', 'local',
  1, 1, 0, 'held', '2026-11-28T20:00:00Z', NULL,
  'r13r8d_continuation', 'r13r8d_continuation',
  '2026-06-11T04:30:00Z', '2026-06-11T04:30:00Z'
);

INSERT INTO slot_holds (
  hold_id, slot_id, booking_id, idempotency_key, stripe_session_id,
  capacity_units, hold_status, hold_expires_at, created_at, updated_at
)
VALUES (
  'hold_r13r8d_cont_p8_001', 'slot_r13r8d_cont_p8_009',
  'book_r13r8d_cont_p8_0001',
  'book_r13r8d_cont_p8_0001:slot_r13r8d_cont_p8_009',
  NULL, 1, 'held', '2026-11-28T20:00:00Z',
  '2026-06-11T04:30:00Z', '2026-06-11T04:30:00Z'
);
