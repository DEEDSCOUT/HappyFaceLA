// POST /api/booking-eligibility — PUBLIC-BOOKING-R13-R4
// Server-side eligibility, pricing, and D1 availability assessment.
// Price displayed is an estimate only; checkout recalculates authoritatively.

import { calculateCapacity, resolveKidsCount } from '../../src/lib/booking/capacity-engine.ts';
import { assessEligibility } from '../../src/lib/booking/eligibility.ts';
import type { D1Database } from '../../src/lib/booking/availability-types.ts';
import { findEligibleAvailabilitySlot } from '../../src/lib/booking/availability-store.ts';
import {
  readJsonObject,
  validateAvailabilityLookupRequest,
} from '../../src/lib/booking/availability-validation.ts';
import { paymentDeniedUnknown } from '../../src/lib/booking/payment-gate.ts';

type Env = {
  AVAILABILITY_D1?: D1Database;
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

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const body = await readJsonObject(context.request);
  if (!body.ok) return json({ ok: false, error: body.error }, 400);

  const parsed = validateAvailabilityLookupRequest(body.value);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);

  const {
    eventType,
    services,
    kidsCountBucket,
    kidsCountActual,
    designStyle,
    durationMinutes,
    travelMiles,
  } = parsed.value;

  const kidsCount = resolveKidsCount(kidsCountBucket, kidsCountActual);
  const capacity = calculateCapacity({
    kidsCount,
    designStyle,
    bookedDurationMinutes: durationMinutes,
  });

  const result = assessEligibility({
    eventType,
    services,
    kidsCount,
    designStyle,
    durationMinutes,
    travelMiles,
    capacityResult: capacity,
  });

  const availability = result.status === 'instant-book'
    ? (await findEligibleAvailabilitySlot(context.env.AVAILABILITY_D1, {
        ...parsed.value,
        requiredCapacityUnits: capacity.requiredArtistCount,
      })).response
    : paymentDeniedUnknown();

  return json({
    ok: true,
    status: result.status,
    reasons: result.reasons,
    capacityResult: {
      requiredArtistCount: capacity.requiredArtistCount,
      serviceWindowMinutes: capacity.serviceWindowMinutes,
    },
    pricing: result.pricing
      ? {
          eventTotalCents: result.pricing.eventTotalCents,
          retainerCents: result.pricing.retainerCents,
          travelFeeCents: result.pricing.travelFeeCents,
          pricingModel: result.pricing.pricingModel,
        }
      : null,
    availability: {
      status: availability.status,
      paymentAllowed: result.status === 'instant-book' && availability.paymentAllowed,
      message: availability.customerMessage,
      ...(availability.safeSlotId ? { safeSlotId: availability.safeSlotId } : {}),
    },
  });
};
