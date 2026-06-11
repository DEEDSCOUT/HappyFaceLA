// Eligibility engine — PUBLIC-BOOKING-R8
// Determines instant-book vs custom-review based on owner-approved gates (DEC-R7-038..050).

import type { EligibilityInput, EligibilityResult, EligibilityStatus } from './types.ts';
import { calculatePricing } from './pricing-engine.ts';

const MAX_INSTANT_DURATION_MINUTES = 240;  // 4h
const MAX_INSTANT_ARTISTS = 4;
const MAX_INSTANT_TRAVEL_MILES = 40;
const MAX_INSTANT_KIDS = 160;

const INSTANT_BOOK_EVENT_TYPES = new Set(['birthday-party']);
const CUSTOM_REVIEW_EVENT_TYPES = new Set([
  'school-event',
  'corporate-family-day',
  'festival-community',
]);

// First Stripe release: face painting (+ face-gems add-on) only
const INSTANT_BOOK_SERVICES = new Set(['face-painting', 'face-gems']);

export function assessEligibility(input: EligibilityInput): EligibilityResult {
  const { eventType, services, kidsCount, durationMinutes, travelMiles, capacityResult } = input;
  const reasons: string[] = [];

  // Event type gate
  if (CUSTOM_REVIEW_EVENT_TYPES.has(eventType)) {
    reasons.push('institutional-event');
  } else if (!INSTANT_BOOK_EVENT_TYPES.has(eventType)) {
    reasons.push('event-type-not-supported');
  }

  // Service gate
  if (services.includes('combo')) {
    reasons.push('combo-service');
  } else {
    const unsupported = services.filter(
      s => !INSTANT_BOOK_SERVICES.has(s) && s !== 'not-sure',
    );
    if (unsupported.length > 0) {
      reasons.push('service-not-supported-for-instant-book');
    }
  }

  // Artist count gate (from capacity formula)
  if (capacityResult.requiredArtistCount > MAX_INSTANT_ARTISTS) {
    reasons.push('exceeds-max-artists');
  }

  // Duration gate
  if (durationMinutes > MAX_INSTANT_DURATION_MINUTES) {
    reasons.push('exceeds-max-duration');
  }

  // Travel gate
  if (travelMiles > MAX_INSTANT_TRAVEL_MILES) {
    reasons.push('exceeds-max-travel');
  }

  // Kids count ceiling
  if (kidsCount > MAX_INSTANT_KIDS) {
    reasons.push('exceeds-max-kids');
  }

  const preStatus: EligibilityStatus = reasons.length === 0 ? 'instant-book' : 'custom-review';

  // Calculate pricing only for potentially eligible events
  let pricing = null;
  if (preStatus === 'instant-book') {
    const hasFaceGems = services.includes('face-gems');
    const serviceType = hasFaceGems ? 'two-service' : 'one-service';
    pricing = calculatePricing({
      serviceType,
      durationMinutes,
      artistCount: capacityResult.requiredArtistCount,
      travelMiles,
    });
    if (pricing.requiresManualApproval) {
      reasons.push('pricing-requires-manual-approval');
    }
  }

  const finalStatus: EligibilityStatus =
    reasons.length === 0 ? 'instant-book' : 'custom-review';

  return {
    status: finalStatus,
    reasons,
    pricing: finalStatus === 'instant-book' ? pricing : null,
    capacityResult,
  };
}
