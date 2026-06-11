-- PUBLIC-BOOKING-R13-R8D continuation cleanup.
-- Preview D1 only. Deletes only synthetic r13r8d_cont rows.

DELETE FROM slot_audit_log
WHERE slot_id LIKE 'slot_r13r8d_cont_%'
   OR hold_id LIKE 'hold_r13r8d_cont_%'
   OR booking_id LIKE 'book_r13r8d_cont_%';

DELETE FROM booking_slot_links
WHERE slot_id LIKE 'slot_r13r8d_cont_%'
   OR hold_id LIKE 'hold_r13r8d_cont_%'
   OR booking_id LIKE 'book_r13r8d_cont_%';

DELETE FROM slot_holds
WHERE slot_id LIKE 'slot_r13r8d_cont_%'
   OR hold_id LIKE 'hold_r13r8d_cont_%'
   OR booking_id LIKE 'book_r13r8d_cont_%';

DELETE FROM availability_slots
WHERE slot_id LIKE 'slot_r13r8d_cont_%';
