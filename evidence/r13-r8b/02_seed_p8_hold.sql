-- P8/P9 approved TEST simulation seed (preview D1 only). Synthetic held slot + hold.
INSERT INTO availability_slots (slot_id, event_date, start_time, end_time, timezone, service_ids_json, service_combo_key, travel_zone, capacity_units_total, capacity_units_held, capacity_units_reserved, status, hold_expires_at, blocked_reason_code, created_by_actor, updated_by_actor, created_at, updated_at)
VALUES ('slot_testproof_p8slot_009','2026-09-19','09:00','11:00','America/Los_Angeles','["face-painting"]','face-painting','local',1,1,0,'held','2026-09-19T20:00:00Z',NULL,'test_proof','test_proof','2026-06-10T20:00:00Z','2026-06-10T20:00:00Z');

INSERT INTO slot_holds (hold_id, slot_id, booking_id, idempotency_key, stripe_session_id, capacity_units, hold_status, hold_expires_at, created_at, updated_at)
VALUES ('hold_testproof_p8_001','slot_testproof_p8slot_009','book_testproof_p8_0001','book_testproof_p8_0001:slot_testproof_p8slot_009',NULL,1,'held','2026-09-19T20:00:00Z','2026-06-10T20:00:00Z','2026-06-10T20:00:00Z');
