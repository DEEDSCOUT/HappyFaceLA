-- PUBLIC-BOOKING-R13-R8B synthetic preview-only seed.
-- Preview D1 (hfla-availability-preview) ONLY. Non-PII, neutral slot_testproof_ IDs.
-- No customer data, no contractor/cost/margin/artist fields. Cleaned to 0 rows after proof.

-- P1/P3: open slot that matches an instant-book face-painting lookup (12:00-14:00, local).
INSERT INTO availability_slots (slot_id, event_date, start_time, end_time, timezone, service_ids_json, service_combo_key, travel_zone, capacity_units_total, capacity_units_held, capacity_units_reserved, status, hold_expires_at, blocked_reason_code, created_by_actor, updated_by_actor, created_at, updated_at)
VALUES ('slot_testproof_open_001','2026-09-19','12:00','14:00','America/Los_Angeles','["face-painting"]','face-painting','local',2,0,0,'open',NULL,NULL,'test_proof','test_proof','2026-06-10T20:00:00Z','2026-06-10T20:00:00Z');

-- P6: dedicated open slot for checkout hold proof (10:00-12:00, capacity 1 so hold flips it to held).
INSERT INTO availability_slots (slot_id, event_date, start_time, end_time, timezone, service_ids_json, service_combo_key, travel_zone, capacity_units_total, capacity_units_held, capacity_units_reserved, status, hold_expires_at, blocked_reason_code, created_by_actor, updated_by_actor, created_at, updated_at)
VALUES ('slot_testproof_checkout_007','2026-09-19','10:00','12:00','America/Los_Angeles','["face-painting"]','face-painting','local',1,0,0,'open',NULL,NULL,'test_proof','test_proof','2026-06-10T20:00:00Z','2026-06-10T20:00:00Z');

-- P4/P5: blocked slot (15:00-17:00).
INSERT INTO availability_slots (slot_id, event_date, start_time, end_time, timezone, service_ids_json, service_combo_key, travel_zone, capacity_units_total, capacity_units_held, capacity_units_reserved, status, hold_expires_at, blocked_reason_code, created_by_actor, updated_by_actor, created_at, updated_at)
VALUES ('slot_testproof_blocked_002','2026-09-19','15:00','17:00','America/Los_Angeles','["face-painting"]','face-painting','local',2,0,0,'blocked',NULL,'test_block','test_proof','test_proof','2026-06-10T20:00:00Z','2026-06-10T20:00:00Z');

-- P4: held slot (16:00-18:00), full capacity held.
INSERT INTO availability_slots (slot_id, event_date, start_time, end_time, timezone, service_ids_json, service_combo_key, travel_zone, capacity_units_total, capacity_units_held, capacity_units_reserved, status, hold_expires_at, blocked_reason_code, created_by_actor, updated_by_actor, created_at, updated_at)
VALUES ('slot_testproof_held_003','2026-09-19','16:00','18:00','America/Los_Angeles','["face-painting"]','face-painting','local',2,2,0,'held','2026-09-19T20:00:00Z',NULL,'test_proof','test_proof','2026-06-10T20:00:00Z','2026-06-10T20:00:00Z');

-- P4: reserved slot (17:00-19:00), full capacity reserved.
INSERT INTO availability_slots (slot_id, event_date, start_time, end_time, timezone, service_ids_json, service_combo_key, travel_zone, capacity_units_total, capacity_units_held, capacity_units_reserved, status, hold_expires_at, blocked_reason_code, created_by_actor, updated_by_actor, created_at, updated_at)
VALUES ('slot_testproof_reserved_004','2026-09-19','17:00','19:00','America/Los_Angeles','["face-painting"]','face-painting','local',2,0,2,'reserved',NULL,NULL,'test_proof','test_proof','2026-06-10T20:00:00Z','2026-06-10T20:00:00Z');

-- P4: expired slot (18:00-20:00).
INSERT INTO availability_slots (slot_id, event_date, start_time, end_time, timezone, service_ids_json, service_combo_key, travel_zone, capacity_units_total, capacity_units_held, capacity_units_reserved, status, hold_expires_at, blocked_reason_code, created_by_actor, updated_by_actor, created_at, updated_at)
VALUES ('slot_testproof_expired_005','2026-09-19','18:00','20:00','America/Los_Angeles','["face-painting"]','face-painting','local',1,0,0,'expired',NULL,NULL,'test_proof','test_proof','2026-06-10T20:00:00Z','2026-06-10T20:00:00Z');

-- P4: unavailable slot (19:00-21:00).
INSERT INTO availability_slots (slot_id, event_date, start_time, end_time, timezone, service_ids_json, service_combo_key, travel_zone, capacity_units_total, capacity_units_held, capacity_units_reserved, status, hold_expires_at, blocked_reason_code, created_by_actor, updated_by_actor, created_at, updated_at)
VALUES ('slot_testproof_unavail_006','2026-09-19','19:00','21:00','America/Los_Angeles','["face-painting"]','face-painting','local',1,0,0,'unavailable',NULL,NULL,'test_proof','test_proof','2026-06-10T20:00:00Z','2026-06-10T20:00:00Z');

-- P4: malformed slot (13:00-15:00) — status open but service_ids_json holds an unallowlisted service,
-- so the row passes SQL CHECKs but fails server-side validateD1AvailabilitySlotRow and must fail closed.
INSERT INTO availability_slots (slot_id, event_date, start_time, end_time, timezone, service_ids_json, service_combo_key, travel_zone, capacity_units_total, capacity_units_held, capacity_units_reserved, status, hold_expires_at, blocked_reason_code, created_by_actor, updated_by_actor, created_at, updated_at)
VALUES ('slot_testproof_malformed_008','2026-09-19','13:00','15:00','America/Los_Angeles','["private-service"]','face-painting','local',1,0,0,'open',NULL,NULL,'test_proof','test_proof','2026-06-10T20:00:00Z','2026-06-10T20:00:00Z');
