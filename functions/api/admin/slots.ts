// /api/admin/slots — PUBLIC-BOOKING-R13-R4
// Admin-managed availability slots. Requires server-side token validation.

import type { D1Database } from '../../../src/lib/booking/availability-types.ts';
import {
  createAdminSlot,
  listAdminSlots,
} from '../../../src/lib/booking/availability-store.ts';
import {
  isIsoDate,
  readJsonObject,
  sanitizeSafeString,
  validateAdminSlotCreateRequest,
} from '../../../src/lib/booking/availability-validation.ts';
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
    const dateParam = url.searchParams.get('eventDate');
    if (dateParam !== null && !isIsoDate(dateParam)) {
      return json({ ok: false, error: 'eventDate must be YYYY-MM-DD' }, 400);
    }
    const slots = await listAdminSlots(context.env.AVAILABILITY_D1, dateParam);
    if (!slots.ok) return json({ ok: false, error: slots.error }, 503);
    return json({ ok: true, slots: slots.slots });
  }

  if (context.request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  const body = await readJsonObject(context.request);
  if (!body.ok) return json({ ok: false, error: body.error }, 400);
  const request = validateAdminSlotCreateRequest(body.value);
  if (!request.ok) return json({ ok: false, error: request.error }, 400);

  const created = await createAdminSlot(context.env.AVAILABILITY_D1, request.value, admin.actorLabel);
  if (!created.ok) return json({ ok: false, error: created.error }, 503);

  await writeSlotAdminEvent(context.env.AVAILABILITY_D1, {
    slotId: created.slot.slotId,
    action: 'create_slot',
    actorLabel: admin.actorLabel,
    safeDetails: {
      action: 'create_slot',
      status: created.slot.status,
      eventDate: created.slot.eventDate,
      startTime: created.slot.startTime,
      travelZone: created.slot.travelZone,
      capacityUnits: created.slot.capacityUnitsTotal,
    },
  });

  return json({ ok: true, slot: created.slot }, 201);
};

function authenticateAdmin(
  request: Request,
  env: Env,
): { ok: true; actorLabel: string } | { ok: false; status: number; error: string } {
  const configured = env.ADMIN_SLOT_TOKEN?.trim();
  if (!configured) {
    console.error('[admin-slots] ADMIN_SLOT_TOKEN is not configured');
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
