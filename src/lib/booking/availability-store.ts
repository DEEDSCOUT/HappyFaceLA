import type {
  AdminSlotCreateRequest,
  AdminSlotUpdateRequest,
  AvailabilityLookupRequest,
  AvailabilityLookupResponse,
  AvailabilitySlot,
  D1Database,
  D1Result,
  D1Value,
} from './availability-types.ts';
import {
  generateSafeId,
  mapD1AvailabilitySlotRow,
  validateD1AvailabilitySlotRow,
} from './availability-validation.ts';

export const AVAILABILITY_UNKNOWN_MESSAGE =
  'We need to confirm availability for your requested time before taking a retainer.';

export const AVAILABILITY_UNAVAILABLE_MESSAGE =
  'That time is no longer available. Please choose another time or request a manual quote.';

export const AVAILABILITY_STORAGE_ERROR_MESSAGE =
  "We could not confirm availability right now. Please request a manual quote and we'll follow up.";

export function availabilityUnknownResponse(customerMessage = AVAILABILITY_UNKNOWN_MESSAGE): AvailabilityLookupResponse {
  return {
    status: 'unknown',
    paymentAllowed: false,
    customerMessage,
  };
}

export function availabilityUnavailableResponse(customerMessage = AVAILABILITY_UNAVAILABLE_MESSAGE): AvailabilityLookupResponse {
  return {
    status: 'unavailable',
    paymentAllowed: false,
    customerMessage,
  };
}

export function availabilityConfirmedResponse(slot: AvailabilitySlot): AvailabilityLookupResponse {
  return {
    status: 'confirmed',
    paymentAllowed: true,
    customerMessage: 'Availability is confirmed for this requested time.',
    safeSlotId: slot.slotId,
  };
}

export interface AvailabilityStoreLookupResult {
  response: AvailabilityLookupResponse;
  slot: AvailabilitySlot | null;
  malformedStorageRow: boolean;
}

export async function findEligibleAvailabilitySlot(
  db: D1Database | undefined,
  request: AvailabilityLookupRequest,
): Promise<AvailabilityStoreLookupResult> {
  if (!db) {
    return {
      response: availabilityUnknownResponse(AVAILABILITY_STORAGE_ERROR_MESSAGE),
      slot: null,
      malformedStorageRow: false,
    };
  }

  if (!request.eventDate || !request.startTime || !request.endTime) {
    return {
      response: availabilityUnknownResponse(),
      slot: null,
      malformedStorageRow: false,
    };
  }

  let result: D1Result<unknown>;
  try {
    result = await db
      .prepare(
        `SELECT *
         FROM availability_slots
         WHERE event_date = ?
           AND start_time = ?
           AND service_combo_key = ?
           AND travel_zone = ?
         ORDER BY start_time ASC
         LIMIT 10`,
      )
      .bind(request.eventDate, request.startTime, request.serviceComboKey, request.travelZone)
      .all<unknown>();
  } catch (error) {
    console.error(`[availability-store] D1 lookup failed: ${redactError(error)}`);
    return {
      response: availabilityUnknownResponse(AVAILABILITY_STORAGE_ERROR_MESSAGE),
      slot: null,
      malformedStorageRow: false,
    };
  }

  const rows = Array.isArray(result.results) ? result.results : [];
  for (const rawRow of rows) {
    const row = validateD1AvailabilitySlotRow(rawRow);
    if (!row.ok) {
      console.error(`[availability-store] D1 availability row failed validation: ${row.error}`);
      return {
        response: availabilityUnknownResponse(AVAILABILITY_STORAGE_ERROR_MESSAGE),
        slot: null,
        malformedStorageRow: true,
      };
    }

    const mapped = mapD1AvailabilitySlotRow(row.value);
    if (!mapped.ok) {
      console.error(`[availability-store] D1 availability row failed safe mapping: ${mapped.error}`);
      return {
        response: availabilityUnknownResponse(AVAILABILITY_STORAGE_ERROR_MESSAGE),
        slot: null,
        malformedStorageRow: true,
      };
    }

    if (!slotMatchesRequest(mapped.value, request)) {
      continue;
    }

    if (mapped.value.status !== 'open') {
      return {
        response: availabilityUnavailableResponse(),
        slot: null,
        malformedStorageRow: false,
      };
    }

    if (availableCapacityUnits(mapped.value) < request.requiredCapacityUnits) {
      return {
        response: availabilityUnavailableResponse(),
        slot: null,
        malformedStorageRow: false,
      };
    }

    return {
      response: availabilityConfirmedResponse(mapped.value),
      slot: mapped.value,
      malformedStorageRow: false,
    };
  }

  return {
    response: availabilityUnavailableResponse(),
    slot: null,
    malformedStorageRow: false,
  };
}

export async function getAvailabilitySlotById(
  db: D1Database | undefined,
  slotId: string,
): Promise<AvailabilitySlot | null> {
  if (!db) return null;
  try {
    const raw = await db
      .prepare(
        `SELECT *
         FROM availability_slots
         WHERE slot_id = ?
         LIMIT 1`,
      )
      .bind(slotId)
      .first<unknown>();
    if (!raw) return null;
    const row = validateD1AvailabilitySlotRow(raw);
    if (!row.ok) {
      console.error(`[availability-store] Slot ${maskId(slotId)} failed D1 row validation: ${row.error}`);
      return null;
    }
    const mapped = mapD1AvailabilitySlotRow(row.value);
    if (!mapped.ok) {
      console.error(`[availability-store] Slot ${maskId(slotId)} failed safe mapping: ${mapped.error}`);
      return null;
    }
    return mapped.value;
  } catch (error) {
    console.error(`[availability-store] D1 slot lookup failed: ${redactError(error)}`);
    return null;
  }
}

export async function createAdminSlot(
  db: D1Database | undefined,
  request: AdminSlotCreateRequest,
  actorLabel: string,
  nowIso = new Date().toISOString(),
): Promise<{ ok: true; slot: AvailabilitySlot } | { ok: false; error: string }> {
  if (!db) return { ok: false, error: 'Storage not configured' };
  const slotId = request.slotId ?? generateSafeId('slot');
  const status = request.status ?? 'open';

  try {
    await db
      .prepare(
        `INSERT INTO availability_slots (
          slot_id, event_date, start_time, end_time, timezone, service_ids_json,
          service_combo_key, travel_zone, capacity_units_total, capacity_units_held,
          capacity_units_reserved, status, hold_expires_at, blocked_reason_code,
          created_by_actor, updated_by_actor, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, NULL, ?, ?, ?, ?, ?)`,
      )
      .bind(
        slotId,
        request.eventDate,
        request.startTime,
        request.endTime,
        request.timezone,
        JSON.stringify(request.serviceIds),
        request.serviceComboKey,
        request.travelZone,
        request.capacityUnitsTotal,
        status,
        request.blockedReasonCode ?? null,
        actorLabel,
        actorLabel,
        nowIso,
        nowIso,
      )
      .run();

    const slot = await getAvailabilitySlotById(db, slotId);
    if (!slot) return { ok: false, error: 'Created slot could not be read back safely' };
    return { ok: true, slot };
  } catch (error) {
    console.error(`[availability-store] Admin slot create failed: ${redactError(error)}`);
    return { ok: false, error: 'Slot could not be created' };
  }
}

export async function updateAdminSlot(
  db: D1Database | undefined,
  request: AdminSlotUpdateRequest,
  actorLabel: string,
  nowIso = new Date().toISOString(),
): Promise<{ ok: true; slot: AvailabilitySlot } | { ok: false; error: string }> {
  if (!db) return { ok: false, error: 'Storage not configured' };

  const existing = await getAvailabilitySlotById(db, request.slotId);
  if (!existing) return { ok: false, error: 'Slot not found or malformed' };

  const updated = {
    eventDate: request.eventDate ?? existing.eventDate,
    startTime: request.startTime ?? existing.startTime,
    endTime: request.endTime ?? existing.endTime,
    timezone: request.timezone ?? existing.timezone,
    serviceIds: request.serviceIds ?? existing.serviceIds,
    serviceComboKey: request.serviceComboKey ?? existing.serviceComboKey,
    travelZone: request.travelZone ?? existing.travelZone,
    capacityUnitsTotal: request.capacityUnitsTotal ?? existing.capacityUnitsTotal,
    status: request.status ?? existing.status,
    blockedReasonCode: request.blockedReasonCode ?? null,
  };

  if (updated.capacityUnitsTotal < existing.capacityUnitsHeld + existing.capacityUnitsReserved) {
    return { ok: false, error: 'Capacity cannot be below held plus reserved units' };
  }

  try {
    await db
      .prepare(
        `UPDATE availability_slots
         SET event_date = ?,
             start_time = ?,
             end_time = ?,
             timezone = ?,
             service_ids_json = ?,
             service_combo_key = ?,
             travel_zone = ?,
             capacity_units_total = ?,
             status = ?,
             blocked_reason_code = ?,
             updated_by_actor = ?,
             updated_at = ?
         WHERE slot_id = ?`,
      )
      .bind(
        updated.eventDate,
        updated.startTime,
        updated.endTime,
        updated.timezone,
        JSON.stringify(updated.serviceIds),
        updated.serviceComboKey,
        updated.travelZone,
        updated.capacityUnitsTotal,
        updated.status,
        updated.blockedReasonCode,
        actorLabel,
        nowIso,
        request.slotId,
      )
      .run();

    const slot = await getAvailabilitySlotById(db, request.slotId);
    if (!slot) return { ok: false, error: 'Updated slot could not be read back safely' };
    return { ok: true, slot };
  } catch (error) {
    console.error(`[availability-store] Admin slot update failed: ${redactError(error)}`);
    return { ok: false, error: 'Slot could not be updated' };
  }
}

export async function listAdminSlots(
  db: D1Database | undefined,
  eventDate: string | null,
): Promise<{ ok: true; slots: AvailabilitySlot[] } | { ok: false; error: string }> {
  if (!db) return { ok: false, error: 'Storage not configured' };
  try {
    const statement = eventDate
      ? db
          .prepare(
            `SELECT *
             FROM availability_slots
             WHERE event_date = ?
             ORDER BY event_date ASC, start_time ASC
             LIMIT 100`,
          )
          .bind(eventDate)
      : db
          .prepare(
            `SELECT *
             FROM availability_slots
             ORDER BY event_date ASC, start_time ASC
             LIMIT 100`,
          )
          .bind();
    const result = await statement.all<unknown>();
    const slots: AvailabilitySlot[] = [];
    for (const rawRow of result.results ?? []) {
      const row = validateD1AvailabilitySlotRow(rawRow);
      if (!row.ok) return { ok: false, error: 'Stored slot row is malformed' };
      const mapped = mapD1AvailabilitySlotRow(row.value);
      if (!mapped.ok) return { ok: false, error: 'Stored slot row could not be mapped' };
      slots.push(mapped.value);
    }
    return { ok: true, slots };
  } catch (error) {
    console.error(`[availability-store] Admin slot list failed: ${redactError(error)}`);
    return { ok: false, error: 'Slots could not be listed' };
  }
}

export function availableCapacityUnits(slot: AvailabilitySlot): number {
  return Math.max(0, slot.capacityUnitsTotal - slot.capacityUnitsHeld - slot.capacityUnitsReserved);
}

export function slotMatchesRequest(slot: AvailabilitySlot, request: AvailabilityLookupRequest): boolean {
  return (
    slot.eventDate === request.eventDate &&
    slot.startTime === request.startTime &&
    slot.serviceComboKey === request.serviceComboKey &&
    slot.travelZone === request.travelZone &&
    request.services.every((service) => slot.serviceIds.includes(service))
  );
}

export function d1Changes(result: D1Result<unknown>): number {
  return typeof result.meta?.changes === 'number' ? result.meta.changes : 0;
}

export function maskId(id?: string | null): string {
  if (!id || id.length <= 12) return '***';
  return `${id.slice(0, 4)}***${id.slice(-4)}`;
}

export function redactError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 240);
  if (typeof error === 'string') return error.slice(0, 240);
  return 'unknown error';
}

export async function runStatement(
  db: D1Database,
  query: string,
  values: readonly D1Value[],
): Promise<D1Result<unknown>> {
  return db.prepare(query).bind(...values).run<unknown>();
}
