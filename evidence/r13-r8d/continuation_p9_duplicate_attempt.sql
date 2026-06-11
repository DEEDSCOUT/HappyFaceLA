-- PUBLIC-BOOKING-R13-R8D P9 duplicate approved TEST simulation.
-- The guarded updates should make zero additional reservation changes after P8.

UPDATE slot_holds
SET hold_status = 'reserved',
    stripe_session_id = 'cs_test_r13r8d_cont_p8_0001',
    updated_at = '2026-06-11T04:41:00Z'
WHERE hold_id = 'hold_r13r8d_cont_p8_001'
  AND slot_id = 'slot_r13r8d_cont_p8_009'
  AND booking_id = 'book_r13r8d_cont_p8_0001'
  AND hold_status = 'held'
  AND hold_expires_at > '2026-06-11T04:41:00Z';

UPDATE availability_slots
SET capacity_units_held = CASE
      WHEN capacity_units_held >= 1 THEN capacity_units_held - 1
      ELSE 0
    END,
    capacity_units_reserved = capacity_units_reserved + 1,
    status = 'reserved',
    updated_by_actor = 'stripe_webhook',
    updated_at = '2026-06-11T04:41:00Z'
WHERE slot_id = 'slot_r13r8d_cont_p8_009'
  AND status = 'held'
  AND capacity_units_held >= 1
  AND capacity_units_reserved = 0;

INSERT INTO booking_slot_links (
  link_id, booking_id, slot_id, hold_id, stripe_session_id,
  link_status, created_at, updated_at
)
VALUES (
  'link_r13r8d_cont_p8_001', 'book_r13r8d_cont_p8_0001',
  'slot_r13r8d_cont_p8_009', 'hold_r13r8d_cont_p8_001',
  'cs_test_r13r8d_cont_p8_0001', 'reserved',
  '2026-06-11T04:41:00Z', '2026-06-11T04:41:00Z'
)
ON CONFLICT(booking_id) DO UPDATE SET
  stripe_session_id = excluded.stripe_session_id,
  link_status = 'reserved',
  updated_at = excluded.updated_at;
