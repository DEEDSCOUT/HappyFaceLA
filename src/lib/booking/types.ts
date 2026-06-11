// Booking engine types — PUBLIC-BOOKING-R8

export type DesignStyle =
  | 'quick-cheek-arm'
  | 'standard-party'
  | 'full-face'
  | 'fast-event-menu'
  | 'not-sure';

export type ServiceType = 'one-service' | 'two-service';

export type EligibilityStatus = 'instant-book' | 'custom-review';

export type PaymentStatus = 'pending' | 'retainer_paid' | 'expired' | 'cancelled';

export interface CapacityInput {
  kidsCount: number;
  designStyle: string;
  bookedDurationMinutes: number;
}

export interface CapacityResult {
  requiredArtistMinutes: number;
  usableMinutesPerArtist: number;
  serviceWindowMinutes: number;
  requiredArtistCount: number;
  kidsCount: number;
  durationMinutes: number;
}

export interface PricingInput {
  serviceType: ServiceType;
  durationMinutes: number;
  artistCount: number;
  travelMiles: number;
}

export interface PricingResult {
  eventTotalCents: number;
  retainerCents: number;
  travelFeeCents: number;
  pricingModel: 'fixed-package' | 'hourly';
  requiresManualApproval: boolean;
}

export interface EligibilityInput {
  eventType: string;
  services: string[];
  kidsCount: number;
  designStyle: string;
  durationMinutes: number;
  travelMiles: number;
  capacityResult: CapacityResult;
}

export interface EligibilityResult {
  status: EligibilityStatus;
  reasons: string[];
  pricing: PricingResult | null;
  capacityResult: CapacityResult;
}

export interface BookingRecord {
  bookingId: string;
  eventDate: string | null;
  eventTime: string | null;
  serviceType: ServiceType;
  durationMinutes: number;
  kidsCount: number;
  designStyle: string;
  artistCount: number;
  eventTotalCents: number;
  retainerCents: number;
  travelMiles: number;
  travelFeeCents: number;
  paymentStatus: PaymentStatus;
  stripeSessionId: string | null;
  customReviewRequired: boolean;
  eligibilityStatus: EligibilityStatus;
  customerEmail: string;
  eventCity: string;
  availabilityConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
}
