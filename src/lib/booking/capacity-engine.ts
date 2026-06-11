// Capacity engine — PUBLIC-BOOKING-R8
// Formulas per owner-approved R8 rules (DEC-R7-001..010, DEC-R7-067):
//   service_window_minutes = booked_duration − setup_buffer − breakdown_buffer
//   usable_minutes_per_artist = service_window_minutes × utilization_factor
//   required_artist_minutes = kids_count × minutes_per_child
//   required_artist_count = ceil(required_artist_minutes / usable_minutes_per_artist)

import type { CapacityInput, CapacityResult } from './types.ts';

export const UTILIZATION_FACTOR = 0.90;
export const SETUP_MINUTES = 10;
export const BREAKDOWN_MINUTES = 10;

export const MINUTES_PER_CHILD: Record<string, number> = {
  'quick-cheek-arm': 3,
  'fast-event-menu': 3,
  'standard-party': 5,
  'not-sure': 5,
  'full-face': 6,
};

// Midpoints used when kidsCountBucket is used without an exact count
export const BUCKET_MIDPOINTS: Record<string, number> = {
  '1-10': 8,
  '11-18': 15,
  '19-25': 22,
  '26-40': 33,
  '40-plus': 50,
  'not-sure': 25,
};

export function getMinutesPerChild(designStyle: string): number {
  return MINUTES_PER_CHILD[designStyle] ?? 5;
}

export function calculateCapacity(input: CapacityInput): CapacityResult {
  const { kidsCount, designStyle, bookedDurationMinutes } = input;
  const mpc = getMinutesPerChild(designStyle);
  const serviceWindowMinutes = Math.max(0, bookedDurationMinutes - SETUP_MINUTES - BREAKDOWN_MINUTES);
  const usableMinutesPerArtist = serviceWindowMinutes * UTILIZATION_FACTOR;
  const requiredArtistMinutes = kidsCount * mpc;
  const requiredArtistCount =
    usableMinutesPerArtist > 0
      ? Math.ceil(requiredArtistMinutes / usableMinutesPerArtist)
      : 99;
  return {
    requiredArtistMinutes,
    usableMinutesPerArtist,
    serviceWindowMinutes,
    requiredArtistCount,
    kidsCount,
    durationMinutes: bookedDurationMinutes,
  };
}

// Resolve actual kids count from bucket + optional exact number
export function resolveKidsCount(
  bucket: string | null,
  actual: number | null | undefined,
): number {
  if (typeof actual === 'number' && actual > 0) return actual;
  if (!bucket) return 25;
  return BUCKET_MIDPOINTS[bucket] ?? 25;
}
