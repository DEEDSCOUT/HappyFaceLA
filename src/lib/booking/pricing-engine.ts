// Pricing engine — PUBLIC-BOOKING-R8 (server-authoritative)
// Option C Hybrid: fixed packages for single-artist ≤ 2h; hourly for multi-artist or > 2h.
// Client-side price display only — server recalculates before any Stripe session is created.

import type { PricingInput, PricingResult, ServiceType } from './types.ts';

// Owner-approved fixed package prices in cents (DEC-R7-058..061)
export const FIXED_PACKAGES_CENTS: Record<ServiceType, Record<number, number>> = {
  'one-service': {
    60: 15000,   // $150
    90: 21500,   // $215
    120: 27500,  // $275
  },
  'two-service': {
    60: 18000,   // $180
    90: 25500,   // $255
    120: 32500,  // $325
  },
};

export const HOURLY_RATE_CENTS = 15000; // $150 per artist-hour

export function getTravelFee(
  travelMiles: number,
): { feeCents: number; requiresManualApproval: boolean } {
  if (travelMiles <= 20) return { feeCents: 0, requiresManualApproval: false };
  if (travelMiles <= 40) return { feeCents: 2500, requiresManualApproval: false };
  if (travelMiles <= 60) return { feeCents: 5000, requiresManualApproval: true };
  // > 60 miles: custom quote; should not reach here for instant-book
  return { feeCents: 0, requiresManualApproval: true };
}

export function calculatePricing(input: PricingInput): PricingResult {
  const { serviceType, durationMinutes, artistCount, travelMiles } = input;
  const { feeCents: travelFeeCents, requiresManualApproval } = getTravelFee(travelMiles);

  let pricingModel: 'fixed-package' | 'hourly';
  let basePriceCents: number;

  const fixedPrice = FIXED_PACKAGES_CENTS[serviceType]?.[durationMinutes];
  if (artistCount === 1 && fixedPrice !== undefined) {
    // Single-artist event with an approved package duration → fixed package
    pricingModel = 'fixed-package';
    basePriceCents = fixedPrice;
  } else {
    // Multi-artist or duration > 2h → hourly per artist
    pricingModel = 'hourly';
    basePriceCents = artistCount * (durationMinutes / 60) * HOURLY_RATE_CENTS;
  }

  const eventTotalCents = basePriceCents + travelFeeCents;
  const retainerCents = Math.round(eventTotalCents * 0.20);

  return {
    eventTotalCents,
    retainerCents,
    travelFeeCents,
    pricingModel,
    requiresManualApproval,
  };
}
