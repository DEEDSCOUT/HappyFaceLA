// PUBLIC-BOOKING-R8-R2 strict availability gate.
// Default is fail-closed: no online retainer checkout unless the server runtime
// has an explicit non-production/local availability proof.

export type AvailabilityStatus = 'confirmed' | 'unknown';

export interface AvailabilityEnv {
  CF_PAGES_BRANCH?: string;
  PUBLIC_BOOKING_LOCAL_AVAILABILITY_CONFIRMED?: string;
}

export interface AvailabilityGateResult {
  status: AvailabilityStatus;
  paymentAllowed: boolean;
}

export function resolveAvailabilityGate(env: AvailabilityEnv): AvailabilityGateResult {
  const branch = env.CF_PAGES_BRANCH?.trim().toLowerCase() ?? '';
  const localProof = env.PUBLIC_BOOKING_LOCAL_AVAILABILITY_CONFIRMED?.trim().toLowerCase() === 'true';
  const confirmed = branch === 'local' && localProof;

  return {
    status: confirmed ? 'confirmed' : 'unknown',
    paymentAllowed: confirmed,
  };
}
