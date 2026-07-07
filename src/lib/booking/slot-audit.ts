import type { D1Database, SlotAuditEvent } from './availability-types.ts';
import { generateSafeId, isBookingId, isHoldId, isSlotId } from './availability-validation.ts';
import { redactError, runStatement } from './availability-store.ts';

const SAFE_DETAIL_ALLOWLIST = new Set([
  'action',
  'leadId',
  'status',
  'reason',
  'slotStatus',
  'holdStatus',
  'paymentAllowed',
  'capacityUnits',
  'eventDate',
  'startTime',
  'travelZone',
  'readyForD1Sync',
  'dryRun',
  'qualifiedStatus',
  'quoteSentStatus',
  'bookedStatus',
  'bookedRevenueCents',
  'outboxQueuedCount',
  'outboxSuppressedCount',
]);

export function buildSlotAuditEvent(
  input: Omit<SlotAuditEvent, 'eventId' | 'safeDetailsJson' | 'createdAt'> & {
    safeDetails: Record<string, unknown>;
  },
  nowIso = new Date().toISOString(),
): SlotAuditEvent {
  return {
    eventId: generateSafeId('audit'),
    slotId: input.slotId && isSlotId(input.slotId) ? input.slotId : null,
    holdId: input.holdId && isHoldId(input.holdId) ? input.holdId : null,
    bookingId: input.bookingId && isBookingId(input.bookingId) ? input.bookingId : null,
    eventType: input.eventType.slice(0, 80),
    actorType: input.actorType,
    safeDetailsJson: JSON.stringify(redactAuditDetails(input.safeDetails)),
    createdAt: nowIso,
  };
}

export async function writeSlotAuditEvent(
  db: D1Database | undefined,
  event: SlotAuditEvent,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!db) return { ok: false, error: 'Storage not configured' };
  try {
    await runStatement(
      db,
      `INSERT INTO slot_audit_log (
        audit_id, slot_id, hold_id, booking_id, event_type, actor_type, safe_details_json, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.eventId,
        event.slotId,
        event.holdId,
        event.bookingId,
        event.eventType,
        event.actorType,
        event.safeDetailsJson,
        event.createdAt,
      ],
    );
    return { ok: true };
  } catch (error) {
    console.error(`[slot-audit] Audit write failed: ${redactError(error)}`);
    return { ok: false, error: 'Audit write failed' };
  }
}

export async function writeSlotAdminEvent(
  db: D1Database | undefined,
  input: {
    slotId: string | null;
    action: string;
    actorLabel: string;
    safeDetails: Record<string, unknown>;
  },
  nowIso = new Date().toISOString(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!db) return { ok: false, error: 'Storage not configured' };
  try {
    await runStatement(
      db,
      `INSERT INTO slot_admin_events (
        admin_event_id, slot_id, action, actor_label, safe_details_json, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        generateSafeId('admin'),
        input.slotId && isSlotId(input.slotId) ? input.slotId : null,
        input.action.slice(0, 80),
        input.actorLabel.slice(0, 80),
        JSON.stringify(redactAuditDetails(input.safeDetails)),
        nowIso,
      ],
    );
    return { ok: true };
  } catch (error) {
    console.error(`[slot-audit] Admin event write failed: ${redactError(error)}`);
    return { ok: false, error: 'Admin event write failed' };
  }
}

export function redactAuditDetails(details: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(details)) {
    if (!SAFE_DETAIL_ALLOWLIST.has(key)) continue;
    if (typeof value === 'string') safe[key] = value.slice(0, 120);
    if (typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
    if (typeof value === 'boolean') safe[key] = value;
    if (value === null) safe[key] = null;
  }
  return safe;
}
