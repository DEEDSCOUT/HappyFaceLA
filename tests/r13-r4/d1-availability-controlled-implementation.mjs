import assert from 'node:assert/strict';

import { findEligibleAvailabilitySlot } from '../../src/lib/booking/availability-store.ts';
import { createSlotHold, reserveHeldSlot, releaseExpiredHold } from '../../src/lib/booking/slot-holds.ts';
import {
  validateAvailabilityLookupRequest,
  validateD1AvailabilitySlotRow,
} from '../../src/lib/booking/availability-validation.ts';
import { onRequest as adminSlotsRequest } from '../../functions/api/admin/slots.ts';
import { onRequestPost as eligibilityRequest } from '../../functions/api/booking-eligibility.ts';
import { onRequestPost as checkoutRequest } from '../../functions/api/create-checkout-session.ts';

async function main() {
const now = new Date('2026-06-09T20:00:00.000Z');

function slotRow(overrides = {}) {
  return {
    slot_id: 'slot_20260620_1200_face_local',
    event_date: '2026-06-20',
    start_time: '12:00',
    end_time: '14:00',
    timezone: 'America/Los_Angeles',
    service_ids_json: JSON.stringify(['face-painting']),
    service_combo_key: 'face-painting',
    travel_zone: 'local',
    capacity_units_total: 2,
    capacity_units_held: 0,
    capacity_units_reserved: 0,
    status: 'open',
    hold_expires_at: null,
    blocked_reason_code: null,
    created_by_actor: 'test_admin',
    updated_by_actor: 'test_admin',
    created_at: '2026-06-09T20:00:00.000Z',
    updated_at: '2026-06-09T20:00:00.000Z',
    ...overrides,
  };
}

const lookup = validateAvailabilityLookupRequest({
  eventType: 'birthday-party',
  services: ['face-painting'],
  kidsCountBucket: '11-18',
  designStyle: 'standard-party',
  durationMinutes: 120,
  travelMiles: 0,
  eventDate: '2026-06-20',
  startTime: '12:00',
  requiredCapacityUnits: 1,
});
assert.equal(lookup.ok, true);

const malformed = validateD1AvailabilitySlotRow(slotRow({ service_ids_json: JSON.stringify(['private-service']) }));
assert.equal(malformed.ok, false, 'malformed D1 row rejects unallowlisted service');

const missingDb = await findEligibleAvailabilitySlot(undefined, lookup.value);
assert.equal(missingDb.response.paymentAllowed, false, 'missing D1 fails closed');
assert.equal(missingDb.response.status, 'unknown');

const db = new FakeD1();
db.slots.set('slot_20260620_1200_face_local', slotRow());

const openLookup = await findEligibleAvailabilitySlot(db, lookup.value);
assert.equal(openLookup.response.paymentAllowed, true, 'open D1 slot confirms availability');
assert.equal(openLookup.response.status, 'confirmed');

const hold = await createSlotHold(db, {
  slotId: 'slot_20260620_1200_face_local',
  bookingId: 'book_testbooking_r13r4',
  requiredCapacityUnits: 1,
  idempotencyKey: 'book_testbooking_r13r4:slot_20260620_1200_face_local',
  holdDurationMinutes: 30,
}, now);
assert.equal(hold.ok, true, 'open slot can be held');
assert.equal(db.slots.get('slot_20260620_1200_face_local').capacity_units_held, 1);

const duplicateHold = await createSlotHold(db, {
  slotId: 'slot_20260620_1200_face_local',
  bookingId: 'book_testbooking_r13r4',
  requiredCapacityUnits: 1,
  idempotencyKey: 'book_testbooking_r13r4:slot_20260620_1200_face_local',
  holdDurationMinutes: 30,
}, now);
assert.equal(duplicateHold.ok, true, 'duplicate checkout hold is idempotent');
assert.equal(duplicateHold.holdId, hold.holdId);

const reservation = await reserveHeldSlot(db, {
  bookingId: 'book_testbooking_r13r4',
  slotId: 'slot_20260620_1200_face_local',
  holdId: hold.holdId,
  stripeSessionId: 'cs_test_R13R4ReservationProof123',
  stripeEventId: 'evt_R13R4ReservationProof123',
}, new Date('2026-06-09T20:10:00.000Z'));
assert.equal(reservation.ok, true, 'webhook reserves held slot');
assert.equal(db.slots.get('slot_20260620_1200_face_local').capacity_units_reserved, 1);

const duplicateReservation = await reserveHeldSlot(db, {
  bookingId: 'book_testbooking_r13r4',
  slotId: 'slot_20260620_1200_face_local',
  holdId: hold.holdId,
  stripeSessionId: 'cs_test_R13R4ReservationProof123',
  stripeEventId: 'evt_R13R4ReservationProof123',
}, new Date('2026-06-09T20:11:00.000Z'));
assert.equal(duplicateReservation.ok, true, 'duplicate webhook is idempotent');

db.slots.set('slot_20260620_1500_face_local', slotRow({
  slot_id: 'slot_20260620_1500_face_local',
  start_time: '15:00',
  end_time: '17:00',
}));
const expiringHold = await createSlotHold(db, {
  slotId: 'slot_20260620_1500_face_local',
  bookingId: 'book_expiringhold_r13r4',
  requiredCapacityUnits: 1,
  idempotencyKey: 'book_expiringhold_r13r4:slot_20260620_1500_face_local',
  holdDurationMinutes: 30,
}, now);
assert.equal(expiringHold.ok, true);
const expired = await releaseExpiredHold(db, expiringHold.holdId, new Date('2026-06-09T21:00:00.000Z'));
assert.equal(expired.ok, true);
assert.equal(expired.expired, true, 'expired hold releases capacity');

const adminReject = await adminSlotsRequest({
  request: new Request('https://local.test/api/admin/slots', { method: 'GET' }),
  env: { AVAILABILITY_D1: db, ADMIN_SLOT_TOKEN: 'test-token' },
});
assert.equal(adminReject.status, 401, 'admin endpoint rejects missing token');

const noD1Eligibility = await eligibilityRequest({
  request: jsonRequest('/api/booking-eligibility', {
    eventType: 'birthday-party',
    services: ['face-painting'],
    kidsCountBucket: '11-18',
    designStyle: 'standard-party',
    durationMinutes: 120,
    travelMiles: 0,
    eventDate: '2026-06-20',
    startTime: '12:00',
  }),
  env: {},
});
const noD1EligibilityJson = await noD1Eligibility.json();
assert.equal(noD1Eligibility.status, 200, 'eligibility still returns customer-safe recommendation response');
assert.equal(noD1EligibilityJson.availability.paymentAllowed, false, 'eligibility paymentAllowed=false when D1 is missing');

const unknownCheckout = await checkoutRequest({
  request: jsonRequest('/api/create-checkout-session', {
    eventType: 'birthday-party',
    services: ['face-painting'],
    kidsCountBucket: '11-18',
    designStyle: 'standard-party',
    durationMinutes: 120,
    travelMiles: 0,
    eventDate: '2026-06-20',
    startTime: '12:00',
  }),
  env: {
    BOOKINGS_KV: new FakeKV(),
    STRIPE_SECRET_KEY: 'sk_' + 'test_placeholder',
  },
});
const unknownCheckoutJson = await unknownCheckout.json();
assert.equal(unknownCheckout.status, 409, 'checkout refuses unknown availability');
assert.equal(unknownCheckoutJson.checkoutUrl, undefined, 'checkout returns no checkout URL when availability is unknown');

console.log('R13-R4 D1 availability controlled implementation tests passed');
}

class FakeD1 {
  constructor() {
    this.slots = new Map();
    this.holds = new Map();
    this.links = new Map();
    this.audit = [];
    this.adminEvents = [];
  }

  prepare(query) {
    return new FakeStatement(this, query);
  }
}

class FakeKV {
  constructor() {
    this.records = new Map();
  }

  async get(key) {
    return this.records.get(key) ?? null;
  }

  async put(key, value) {
    this.records.set(key, value);
  }
}

class FakeStatement {
  constructor(db, query) {
    this.db = db;
    this.query = query;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    const results = await this.all();
    return results.results?.[0] ?? null;
  }

  async all() {
    const normalized = normalizeSql(this.query);
    if (normalized.includes('from availability_slots') && normalized.includes('where slot_id = ?')) {
      const slot = this.db.slots.get(this.values[0]);
      return { success: true, results: slot ? [structuredClone(slot)] : [] };
    }
    if (normalized.includes('from availability_slots') && normalized.includes('where event_date = ?')) {
      const [eventDate, startTime, serviceComboKey, travelZone] = this.values;
      const results = [...this.db.slots.values()]
        .filter((slot) =>
          slot.event_date === eventDate &&
          slot.start_time === startTime &&
          slot.service_combo_key === serviceComboKey &&
          slot.travel_zone === travelZone)
        .map((slot) => structuredClone(slot));
      return { success: true, results };
    }
    if (normalized.includes('from availability_slots')) {
      return { success: true, results: [...this.db.slots.values()].map((slot) => structuredClone(slot)) };
    }
    if (normalized.includes('from slot_holds') && normalized.includes('where hold_id = ?')) {
      const hold = this.db.holds.get(this.values[0]);
      return { success: true, results: hold ? [structuredClone(hold)] : [] };
    }
    if (normalized.includes('from slot_holds') && normalized.includes('where idempotency_key = ?')) {
      const hold = [...this.db.holds.values()].find((candidate) => candidate.idempotency_key === this.values[0]);
      return { success: true, results: hold ? [structuredClone(hold)] : [] };
    }
    return { success: true, results: [] };
  }

  async run() {
    const normalized = normalizeSql(this.query);
    if (normalized.startsWith('update availability_slots') && normalized.includes('capacity_units_held = capacity_units_held + ?')) {
      const [capacityUnits, statusThresholdUnits, holdExpiresAt, updatedAt, slotId, requiredCapacity] = this.values;
      const slot = this.db.slots.get(slotId);
      if (!slot || slot.status !== 'open') return result(0);
      if (slot.capacity_units_total - slot.capacity_units_reserved - slot.capacity_units_held < requiredCapacity) {
        return result(0);
      }
      slot.capacity_units_held += capacityUnits;
      if (slot.capacity_units_reserved + slot.capacity_units_held >= slot.capacity_units_total && statusThresholdUnits > 0) {
        slot.status = 'held';
      }
      slot.hold_expires_at = holdExpiresAt;
      slot.updated_by_actor = 'public_api';
      slot.updated_at = updatedAt;
      return result(1);
    }
    if (normalized.startsWith('insert into slot_holds')) {
      const [
        holdId,
        slotId,
        bookingId,
        idempotencyKey,
        capacityUnits,
        holdExpiresAt,
        createdAt,
        updatedAt,
      ] = this.values;
      this.db.holds.set(holdId, {
        hold_id: holdId,
        slot_id: slotId,
        booking_id: bookingId,
        idempotency_key: idempotencyKey,
        stripe_session_id: null,
        capacity_units: capacityUnits,
        hold_status: 'held',
        hold_expires_at: holdExpiresAt,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return result(1);
    }
    if (normalized.startsWith('update slot_holds') && normalized.includes("hold_status = 'reserved'")) {
      const [stripeSessionId, updatedAt, holdId, slotId, bookingId, nowIso] = this.values;
      const hold = this.db.holds.get(holdId);
      if (!hold || hold.slot_id !== slotId || hold.booking_id !== bookingId || hold.hold_status !== 'held') return result(0);
      if (hold.hold_expires_at <= nowIso) return result(0);
      hold.hold_status = 'reserved';
      hold.stripe_session_id = stripeSessionId;
      hold.updated_at = updatedAt;
      return result(1);
    }
    if (normalized.startsWith('update availability_slots') && normalized.includes('capacity_units_reserved = capacity_units_reserved + ?')) {
      const [capacityA, capacityB, capacityC, updatedAt, slotId] = this.values;
      const slot = this.db.slots.get(slotId);
      if (!slot) return result(0);
      slot.capacity_units_held = slot.capacity_units_held >= capacityA ? slot.capacity_units_held - capacityB : 0;
      slot.capacity_units_reserved += capacityC;
      slot.status = 'reserved';
      slot.updated_by_actor = 'stripe_webhook';
      slot.updated_at = updatedAt;
      return result(1);
    }
    if (normalized.startsWith('insert into booking_slot_links')) {
      const [linkId, bookingId, slotId, holdId, stripeSessionId, createdAt, updatedAt] = this.values;
      this.db.links.set(bookingId, {
        link_id: linkId,
        booking_id: bookingId,
        slot_id: slotId,
        hold_id: holdId,
        stripe_session_id: stripeSessionId,
        link_status: 'reserved',
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return result(1);
    }
    if (normalized.startsWith('update slot_holds') && normalized.includes("hold_status = 'expired'")) {
      const [updatedAt, holdId] = this.values;
      const hold = this.db.holds.get(holdId);
      if (!hold || hold.hold_status !== 'held') return result(0);
      hold.hold_status = 'expired';
      hold.updated_at = updatedAt;
      return result(1);
    }
    if (normalized.startsWith('update availability_slots') && normalized.includes("updated_by_actor = 'system'")) {
      const [capacityA, capacityB, updatedAt, slotId] = this.values;
      const slot = this.db.slots.get(slotId);
      if (!slot) return result(0);
      slot.capacity_units_held = slot.capacity_units_held >= capacityA ? slot.capacity_units_held - capacityB : 0;
      if (slot.status === 'held') slot.status = 'open';
      slot.updated_by_actor = 'system';
      slot.updated_at = updatedAt;
      return result(1);
    }
    if (normalized.startsWith('insert into availability_slots')) {
      const [
        slotId,
        eventDate,
        startTime,
        endTime,
        timezone,
        serviceIdsJson,
        serviceComboKey,
        travelZone,
        capacityUnitsTotal,
        status,
        blockedReasonCode,
        createdByActor,
        updatedByActor,
        createdAt,
        updatedAt,
      ] = this.values;
      this.db.slots.set(slotId, {
        slot_id: slotId,
        event_date: eventDate,
        start_time: startTime,
        end_time: endTime,
        timezone,
        service_ids_json: serviceIdsJson,
        service_combo_key: serviceComboKey,
        travel_zone: travelZone,
        capacity_units_total: capacityUnitsTotal,
        capacity_units_held: 0,
        capacity_units_reserved: 0,
        status,
        hold_expires_at: null,
        blocked_reason_code: blockedReasonCode,
        created_by_actor: createdByActor,
        updated_by_actor: updatedByActor,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return result(1);
    }
    if (normalized.startsWith('insert into slot_audit_log')) {
      this.db.audit.push([...this.values]);
      return result(1);
    }
    if (normalized.startsWith('insert into slot_admin_events')) {
      this.db.adminEvents.push([...this.values]);
      return result(1);
    }
    return result(1);
  }
}

function normalizeSql(query) {
  return query.replace(/\s+/g, ' ').trim().toLowerCase();
}

function result(changes) {
  return { success: true, meta: { changes } };
}

function jsonRequest(path, body) {
  return new Request(`https://local.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

await main();
