-- PUBLIC-BOOKING-R13-R8D P8/P9 approved TEST simulation.
-- Preview D1 only. This mirrors the signed webhook reservation state changes
-- without reading or using STRIPE_WEBHOOK_SECRET.

UPDATE slot_holds
SET hold_status = 'reserved',
    stripe_session_id = 'cs_test_r13r8d_cont_p8_0001',
    updated_at = '2026-06-11T04:40:00Z'
WHERE hold_id = 'hold_r13r8d_cont_p8_001'
  AND slot_id = 'slot_r13r8d_cont_p8_009'
  AND booking_id = 'book_r13r8d_cont_p8_0001'
  AND hold_status = 'held'
  AND hold_expires_at > '2026-06-11T04:40:00Z';

UPDATE availability_slots
SET capacity_units_held = CASE
      WHEN capacity_units_held >= 1 THEN capacity_units_held - 1
      ELSE 0
    END,
    capacity_units_reserved = capacity_units_reserved + 1,
    status = 'reserved',
    updated_by_actor = 'stripe_webhook',
    updated_at = '2026-06-11T04:40:00Z'
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
  '2026-06-11T04:40:00Z', '2026-06-11T04:40:00Z'
)
ON CONFLICT(booking_id) DO UPDATE SET
  stripe_session_id = excluded.stripe_session_id,
  link_status = 'reserved',
  updated_at = excluded.updated_at;

INSERT INTO slot_audit_log (
  audit_id, slot_id, hold_id, booking_id, event_type,
  actor_type, safe_details_json, created_at
)
VALUES (
  'audit_r13r8d_cont_p8_001', 'slot_r13r8d_cont_p8_009',
  'hold_r13r8d_cont_p8_001', 'book_r13r8d_cont_p8_0001',
  'checkout_session_completed_reserved', 'stripe_webhook',
  '{"paymentAllowed":true,"action":"slot_reserved","simulation":"r13-r8d-continuation"}',
  '2026-06-11T04:40:00Z'
);
