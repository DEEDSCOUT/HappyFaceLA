import type {
  AvailabilityLookupResponse,
  SlotHoldResult,
} from './availability-types.ts';
import {
  AVAILABILITY_STORAGE_ERROR_MESSAGE,
  AVAILABILITY_UNKNOWN_MESSAGE,
  AVAILABILITY_UNAVAILABLE_MESSAGE,
} from './availability-store.ts';

export function paymentDeniedUnknown(): AvailabilityLookupResponse {
  return {
    status: 'unknown',
    paymentAllowed: false,
    customerMessage: AVAILABILITY_UNKNOWN_MESSAGE,
  };
}

export function paymentDeniedStorageError(): AvailabilityLookupResponse {
  return {
    status: 'unknown',
    paymentAllowed: false,
    customerMessage: AVAILABILITY_STORAGE_ERROR_MESSAGE,
  };
}

export function paymentDeniedUnavailable(): AvailabilityLookupResponse {
  return {
    status: 'unavailable',
    paymentAllowed: false,
    customerMessage: AVAILABILITY_UNAVAILABLE_MESSAGE,
  };
}

export function paymentAllowedWithHold(hold: Extract<SlotHoldResult, { ok: true }>): AvailabilityLookupResponse {
  return {
    status: 'held',
    paymentAllowed: true,
    customerMessage: 'Availability is safely held while you complete checkout.',
    safeSlotId: hold.slotId,
    safeHoldId: hold.holdId,
    holdExpiresAt: hold.holdExpiresAt,
  };
}

export function checkoutCanProceed(availability: AvailabilityLookupResponse): boolean {
  return (
    availability.paymentAllowed === true &&
    (availability.status === 'confirmed' || availability.status === 'held') &&
    typeof availability.safeSlotId === 'string'
  );
}
