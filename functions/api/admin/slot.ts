// /api/admin/slot — PUBLIC-BOOKING-R13-R4
// Single-slot admin view/update/block/unblock and hold expiration action.

import type { D1Database } from '../../../src/lib/booking/availability-types.ts';
import {
  getAvailabilitySlotById,
  updateAdminSlot,
} from '../../../src/lib/booking/availability-store.ts';
import {
  isHoldId,
  isRecord,
  isSlotId,
  readJsonObject,
  sanitizeSafeString,
  validateAdminSlotUpdateRequest,
} from '../../../src/lib/booking/availability-validation.ts';
import { releaseExpiredHold } from '../../../src/lib/booking/slot-holds.ts';
import { writeSlotAdminEvent } from '../../../src/lib/booking/slot-audit.ts';

type Env = {
  AVAILABILITY_D1?: D1Database;
  ADMIN_SLOT_TOKEN?: string;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const admin = authenticateAdmin(context.request, context.env);
  if (!admin.ok) return json({ ok: false, error: admin.error }, admin.status);

  if (context.request.method === 'GET') {
    const url = new URL(context.request.url);
    const slotId = url.searchParams.get('slotId');
    if (!isSlotId(slotId)) return json({ ok: false, error: 'slotId is malformed' }, 400);
    const slot = await getAvailabilitySlotById(context.env.AVAILABILITY_D1, slotId);
    if (!slot) return json({ ok: false, error: 'Slot not found or malformed' }, 404);
    return json({ ok: true, slot });
  }

  if (!['POST', 'PATCH', 'PUT'].includes(context.request.method)) {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  const body = await readJsonObject(context.request);
  if (!body.ok) return json({ ok: false, error: body.error }, 400);

  const action = isRecord(body.value) ? sanitizeSafeString(body.value.action, 80) : '';
  if (action === 'release_expired_hold') {
    const holdId = body.value.holdId;
    if (!isHoldId(holdId)) return json({ ok: false, error: 'holdId is malformed' }, 400);
    const released = await releaseExpiredHold(context.env.AVAILABILITY_D1, holdId);
    if (!released.ok) return json({ ok: false, error: released.error }, 503);
    await writeSlotAdminEvent(context.env.AVAILABILITY_D1, {
      slotId: null,
      action: 'release_expired_hold',
      actorLabel: admin.actorLabel,
      safeDetails: {
        action: 'release_expired_hold',
        status: released.expired ? 'expired' : 'unchanged',
      },
    });
    return json({ ok: true, expired: released.expired });
  }

  const updateBody = normalizeActionBody(body.value, action);
  const update = validateAdminSlotUpdateRequest(updateBody);
  if (!update.ok) return json({ ok: false, error: update.error }, 400);

  const updated = await updateAdminSlot(context.env.AVAILABILITY_D1, update.value, admin.actorLabel);
  if (!updated.ok) return json({ ok: false, error: updated.error }, 503);

  await writeSlotAdminEvent(context.env.AVAILABILITY_D1, {
    slotId: updated.slot.slotId,
    action: action || 'update_slot',
    actorLabel: admin.actorLabel,
    safeDetails: {
      action: action || 'update_slot',
      status: updated.slot.status,
      eventDate: updated.slot.eventDate,
      startTime: updated.slot.startTime,
      travelZone: updated.slot.travelZone,
      capacityUnits: updated.slot.capacityUnitsTotal,
    },
  });

  return json({ ok: true, slot: updated.slot });
};

function normalizeActionBody(body: Record<string, unknown>, action: string): Record<string, unknown> {
  if (action === 'block_slot') return { ...body, status: 'blocked' };
  if (action === 'unblock_slot') return { ...body, status: 'open', blockedReasonCode: null };
  return body;
}

function authenticateAdmin(
  request: Request,
  env: Env,
): { ok: true; actorLabel: string } | { ok: false; status: number; error: string } {
  const configured = env.ADMIN_SLOT_TOKEN?.trim();
  if (!configured) {
    console.error('[admin-slot] ADMIN_SLOT_TOKEN is not configured');
    return { ok: false, status: 503, error: 'Admin access is not configured' };
  }

  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const headerToken = request.headers.get('x-admin-token')?.trim();
  const presented = bearer || headerToken;
  if (!presented || presented !== configured) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const actorLabel = sanitizeSafeString(request.headers.get('x-admin-actor') ?? 'admin_api', 80) || 'admin_api';
  return { ok: true, actorLabel };
}
