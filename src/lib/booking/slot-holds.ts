import type {
  D1Database,
  D1SlotHoldRow,
  SlotHoldRequest,
  SlotHoldResult,
  StripeWebhookSlotUpdate,
} from './availability-types.ts';
import {
  generateSafeId,
  validateD1SlotHoldRow,
  validateSlotHoldRequest,
} from './availability-validation.ts';
import {
  AVAILABILITY_STORAGE_ERROR_MESSAGE,
  AVAILABILITY_UNAVAILABLE_MESSAGE,
  d1Changes,
  getAvailabilitySlotById,
  maskId,
  redactError,
  runStatement,
} from './availability-store.ts';

const HOLD_TTL_SECONDS = 60 * 30;

export async function createSlotHold(
  db: D1Database | undefined,
  request: SlotHoldRequest,
  now = new Date(),
): Promise<SlotHoldResult> {
  if (!db) {
    return {
      ok: false,
      reason: 'storage_unavailable',
      customerMessage: AVAILABILITY_STORAGE_ERROR_MESSAGE,
    };
  }

  const validRequest = validateSlotHoldRequest(request);
  if (!validRequest.ok) {
    return {
      ok: false,
      reason: 'invalid_request',
      customerMessage: AVAILABILITY_STORAGE_ERROR_MESSAGE,
    };
  }

  const existing = await findHoldByIdempotencyKey(db, validRequest.value.idempotencyKey);
  if (existing && existing.hold_status === 'held' && Date.parse(existing.hold_expires_at) > now.getTime()) {
    return {
      ok: true,
      slotId: existing.slot_id,
      holdId: existing.hold_id,
      bookingId: existing.booking_id,
      holdExpiresAt: existing.hold_expires_at,
      status: 'held',
    };
  }

  const slot = await getAvailabilitySlotById(db, validRequest.value.slotId);
  if (!slot || slot.status !== 'open') {
    return {
      ok: false,
      reason: 'slot_unavailable',
      customerMessage: AVAILABILITY_UNAVAILABLE_MESSAGE,
    };
  }

  const holdExpiresAt = new Date(now.getTime() + validRequest.value.holdDurationMinutes * 60 * 1000).toISOString();
  const nowIso = now.toISOString();
  const holdId = generateSafeId('hold');

  try {
    const update = await runStatement(
      db,
      `UPDATE availability_slots
       SET capacity_units_held = capacity_units_held + ?,
           status = CASE
             WHEN capacity_units_reserved + capacity_units_held + ? >= capacity_units_total THEN 'held'
             ELSE status
           END,
           hold_expires_at = ?,
           updated_by_actor = 'public_api',
           updated_at = ?
       WHERE slot_id = ?
         AND status = 'open'
         AND capacity_units_total - capacity_units_reserved - capacity_units_held >= ?`,
      [
        validRequest.value.requiredCapacityUnits,
        validRequest.value.requiredCapacityUnits,
        holdExpiresAt,
        nowIso,
        validRequest.value.slotId,
        validRequest.value.requiredCapacityUnits,
      ],
    );

    if (d1Changes(update) !== 1) {
      return {
        ok: false,
        reason: 'hold_conflict',
        customerMessage: AVAILABILITY_UNAVAILABLE_MESSAGE,
      };
    }

    try {
      await runStatement(
        db,
        `INSERT INTO slot_holds (
          hold_id, slot_id, booking_id, idempotency_key, stripe_session_id,
          capacity_units, hold_status, hold_expires_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, NULL, ?, 'held', ?, ?, ?)`,
        [
          holdId,
          validRequest.value.slotId,
          validRequest.value.bookingId,
          validRequest.value.idempotencyKey,
          validRequest.value.requiredCapacityUnits,
          holdExpiresAt,
          nowIso,
          nowIso,
        ],
      );
    } catch (insertError) {
      await releaseHeldCapacityAfterFailure(db, validRequest.value.slotId, validRequest.value.requiredCapacityUnits, nowIso);
      console.error(`[slot-holds] Hold insert failed after slot update: ${redactError(insertError)}`);
      return {
        ok: false,
        reason: 'write_failed',
        customerMessage: AVAILABILITY_STORAGE_ERROR_MESSAGE,
      };
    }

    return {
      ok: true,
      slotId: validRequest.value.slotId,
      holdId,
      bookingId: validRequest.value.bookingId,
      holdExpiresAt,
      status: 'held',
    };
  } catch (error) {
    console.error(`[slot-holds] Hold creation failed: ${redactError(error)}`);
    return {
      ok: false,
      reason: 'write_failed',
      customerMessage: AVAILABILITY_STORAGE_ERROR_MESSAGE,
    };
  }
}

export async function reserveHeldSlot(
  db: D1Database | undefined,
  update: StripeWebhookSlotUpdate,
  now = new Date(),
): Promise<{ ok: true; duplicate: boolean } | { ok: false; error: string }> {
  if (!db) return { ok: false, error: 'Storage not configured' };

  const hold = await findHoldById(db, update.holdId);
  if (!hold) return { ok: false, error: 'Hold not found or malformed' };

  if (
    hold.hold_status === 'reserved' &&
    hold.slot_id === update.slotId &&
    hold.booking_id === update.bookingId &&
    hold.stripe_session_id === update.stripeSessionId
  ) {
    return { ok: true, duplicate: true };
  }

  if (hold.hold_status !== 'held') return { ok: false, error: 'Hold is not active' };
  if (hold.slot_id !== update.slotId || hold.booking_id !== update.bookingId) {
    return { ok: false, error: 'Hold does not match checkout metadata' };
  }
  if (Date.parse(hold.hold_expires_at) <= now.getTime()) {
    await markHoldExpired(db, hold, now);
    return { ok: false, error: 'Hold expired before webhook completion' };
  }

  const nowIso = now.toISOString();
  try {
    const holdUpdate = await runStatement(
      db,
      `UPDATE slot_holds
       SET hold_status = 'reserved',
           stripe_session_id = ?,
           updated_at = ?
       WHERE hold_id = ?
         AND slot_id = ?
         AND booking_id = ?
         AND hold_status = 'held'
         AND hold_expires_at > ?`,
      [update.stripeSessionId, nowIso, update.holdId, update.slotId, update.bookingId, nowIso],
    );

    if (d1Changes(holdUpdate) !== 1) {
      return { ok: false, error: 'Hold reservation lost race' };
    }

    const slotUpdate = await runStatement(
      db,
      `UPDATE availability_slots
       SET capacity_units_held = CASE
             WHEN capacity_units_held >= ? THEN capacity_units_held - ?
             ELSE 0
           END,
           capacity_units_reserved = capacity_units_reserved + ?,
           status = 'reserved',
           updated_by_actor = 'stripe_webhook',
           updated_at = ?
       WHERE slot_id = ?`,
      [hold.capacity_units, hold.capacity_units, hold.capacity_units, nowIso, update.slotId],
    );

    if (d1Changes(slotUpdate) !== 1) {
      return { ok: false, error: 'Slot reservation write failed' };
    }

    await runStatement(
      db,
      `INSERT INTO booking_slot_links (
        link_id, booking_id, slot_id, hold_id, stripe_session_id, link_status, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?)
       ON CONFLICT(booking_id) DO UPDATE SET
         stripe_session_id = excluded.stripe_session_id,
         link_status = 'reserved',
         updated_at = excluded.updated_at`,
      [
        generateSafeId('link'),
        update.bookingId,
        update.slotId,
        update.holdId,
        update.stripeSessionId,
        nowIso,
        nowIso,
      ],
    );

    return { ok: true, duplicate: false };
  } catch (error) {
    console.error(`[slot-holds] Reserve failed for ${maskId(update.holdId)}: ${redactError(error)}`);
    return { ok: false, error: 'Reservation write failed' };
  }
}

export async function releaseHeldSlot(
  db: D1Database | undefined,
  holdId: string,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!db) return { ok: false, error: 'Storage not configured' };
  const hold = await findHoldById(db, holdId);
  if (!hold) return { ok: false, error: 'Hold not found or malformed' };
  if (hold.hold_status !== 'held') return { ok: true };

  const nowIso = now.toISOString();
  try {
    await runStatement(
      db,
      `UPDATE slot_holds
       SET hold_status = 'released',
           updated_at = ?
       WHERE hold_id = ?
         AND hold_status = 'held'`,
      [nowIso, holdId],
    );

    await runStatement(
      db,
      `UPDATE availability_slots
       SET capacity_units_held = CASE
             WHEN capacity_units_held >= ? THEN capacity_units_held - ?
             ELSE 0
           END,
           status = CASE WHEN status = 'held' THEN 'open' ELSE status END,
           updated_by_actor = 'system',
           updated_at = ?
       WHERE slot_id = ?`,
      [hold.capacity_units, hold.capacity_units, nowIso, hold.slot_id],
    );
    return { ok: true };
  } catch (error) {
    console.error(`[slot-holds] Release failed for ${maskId(holdId)}: ${redactError(error)}`);
    return { ok: false, error: 'Hold release failed' };
  }
}

export async function releaseExpiredHold(
  db: D1Database | undefined,
  holdId: string,
  now = new Date(),
): Promise<{ ok: true; expired: boolean } | { ok: false; error: string }> {
  if (!db) return { ok: false, error: 'Storage not configured' };
  const hold = await findHoldById(db, holdId);
  if (!hold) return { ok: false, error: 'Hold not found or malformed' };
  if (hold.hold_status !== 'held' || Date.parse(hold.hold_expires_at) > now.getTime()) {
    return { ok: true, expired: false };
  }
  const outcome = await markHoldExpired(db, hold, now);
  if (!outcome.ok) return outcome;
  return { ok: true, expired: true };
}

async function findHoldById(db: D1Database, holdId: string): Promise<D1SlotHoldRow | null> {
  try {
    const raw = await db
      .prepare(
        `SELECT *
         FROM slot_holds
         WHERE hold_id = ?
         LIMIT 1`,
      )
      .bind(holdId)
      .first<unknown>();
    if (!raw) return null;
    const row = validateD1SlotHoldRow(raw);
    if (!row.ok) {
      console.error(`[slot-holds] D1 hold row failed validation: ${row.error}`);
      return null;
    }
    return row.value;
  } catch (error) {
    console.error(`[slot-holds] Hold lookup failed: ${redactError(error)}`);
    return null;
  }
}

async function findHoldByIdempotencyKey(
  db: D1Database,
  idempotencyKey: string,
): Promise<D1SlotHoldRow | null> {
  try {
    const raw = await db
      .prepare(
        `SELECT *
         FROM slot_holds
         WHERE idempotency_key = ?
         LIMIT 1`,
      )
      .bind(idempotencyKey)
      .first<unknown>();
    if (!raw) return null;
    const row = validateD1SlotHoldRow(raw);
    if (!row.ok) {
      console.error(`[slot-holds] D1 idempotency hold row failed validation: ${row.error}`);
      return null;
    }
    return row.value;
  } catch (error) {
    console.error(`[slot-holds] Idempotency lookup failed: ${redactError(error)}`);
    return null;
  }
}

async function markHoldExpired(
  db: D1Database,
  hold: D1SlotHoldRow,
  now: Date,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const nowIso = now.toISOString();
  try {
    await runStatement(
      db,
      `UPDATE slot_holds
       SET hold_status = 'expired',
           updated_at = ?
       WHERE hold_id = ?
         AND hold_status = 'held'`,
      [nowIso, hold.hold_id],
    );

    await runStatement(
      db,
      `UPDATE availability_slots
       SET capacity_units_held = CASE
             WHEN capacity_units_held >= ? THEN capacity_units_held - ?
             ELSE 0
           END,
           status = CASE WHEN status = 'held' THEN 'open' ELSE status END,
           updated_by_actor = 'system',
           updated_at = ?
       WHERE slot_id = ?`,
      [hold.capacity_units, hold.capacity_units, nowIso, hold.slot_id],
    );
    return { ok: true };
  } catch (error) {
    console.error(`[slot-holds] Expire failed for ${maskId(hold.hold_id)}: ${redactError(error)}`);
    return { ok: false, error: 'Hold expiration failed' };
  }
}

async function releaseHeldCapacityAfterFailure(
  db: D1Database,
  slotId: string,
  capacityUnits: number,
  nowIso: string,
): Promise<void> {
  try {
    await runStatement(
      db,
      `UPDATE availability_slots
       SET capacity_units_held = CASE
             WHEN capacity_units_held >= ? THEN capacity_units_held - ?
             ELSE 0
           END,
           status = CASE WHEN status = 'held' THEN 'open' ELSE status END,
           updated_by_actor = 'system',
           updated_at = ?
       WHERE slot_id = ?`,
      [capacityUnits, capacityUnits, nowIso, slotId],
    );
  } catch (error) {
    console.error(`[slot-holds] Hold rollback failed: ${redactError(error)}`);
  }
}

export { HOLD_TTL_SECONDS };
