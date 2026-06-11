// PUBLIC-BOOKING-R13-R4 D1 availability source contracts.
// These types define the server-authoritative slot, hold, and payment gate
// shapes. Raw request bodies and raw D1 rows must be validated before use.

export type D1Value = string | number | null;

export interface D1ResultMeta {
  changes?: number;
  duration?: number;
  [key: string]: unknown;
}

export interface D1Result<T = unknown> {
  results?: T[];
  success?: boolean;
  error?: string;
  meta?: D1ResultMeta;
}

export interface D1PreparedStatement {
  bind(...values: D1Value[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch?<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export type SlotStatus =
  | 'open'
  | 'held'
  | 'reserved'
  | 'expired'
  | 'released'
  | 'blocked'
  | 'unavailable';

export type HoldStatus = 'held' | 'reserved' | 'expired' | 'released';

export type BookingSlotLinkStatus = 'pending' | 'reserved' | 'released' | 'manual_review';

export type AvailabilityPublicStatus = 'confirmed' | 'held' | 'unavailable' | 'unknown';

export interface PublicLookbookInspiration {
  slug: string;
  title: string;
}

export interface AvailabilitySlot {
  slotId: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  serviceIds: string[];
  serviceComboKey: string;
  travelZone: string;
  capacityUnitsTotal: number;
  capacityUnitsHeld: number;
  capacityUnitsReserved: number;
  status: SlotStatus;
  holdExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilityLookupRequest {
  eventType: string;
  services: string[];
  serviceComboKey: string;
  kidsCountBucket: string;
  kidsCountActual: number | null;
  designStyle: string;
  durationMinutes: number;
  travelMiles: number;
  travelZone: string;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  requiredCapacityUnits: number;
  inspiration?: PublicLookbookInspiration[];
}

export interface AvailabilityLookupResponse {
  status: AvailabilityPublicStatus;
  paymentAllowed: boolean;
  customerMessage: string;
  safeSlotId?: string;
  safeHoldId?: string;
  holdExpiresAt?: string;
}

export interface AdminSlotCreateRequest {
  slotId?: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  serviceIds: string[];
  serviceComboKey: string;
  travelZone: string;
  capacityUnitsTotal: number;
  status?: SlotStatus;
  blockedReasonCode?: string | null;
}

export interface AdminSlotUpdateRequest {
  slotId: string;
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  serviceIds?: string[];
  serviceComboKey?: string;
  travelZone?: string;
  capacityUnitsTotal?: number;
  status?: SlotStatus;
  blockedReasonCode?: string | null;
}

export interface SlotHoldRequest {
  slotId: string;
  bookingId: string;
  requiredCapacityUnits: number;
  idempotencyKey: string;
  holdDurationMinutes: number;
}

export type SlotHoldResult =
  | {
      ok: true;
      slotId: string;
      holdId: string;
      bookingId: string;
      holdExpiresAt: string;
      status: 'held';
    }
  | {
      ok: false;
      reason:
        | 'storage_unavailable'
        | 'slot_unavailable'
        | 'slot_malformed'
        | 'hold_conflict'
        | 'invalid_request'
        | 'write_failed'
        | 'expired'
        | 'already_reserved';
      customerMessage: string;
    };

export interface BookingRecordWithSlot {
  bookingId: string;
  slotId: string;
  holdId: string;
  eventDate: string | null;
  eventTime: string | null;
  serviceType: 'one-service' | 'two-service';
  durationMinutes: number;
  kidsCount: number;
  designStyle: string;
  artistCount: number;
  eventTotalCents: number;
  retainerCents: number;
  travelMiles: number;
  travelFeeCents: number;
  paymentStatus: 'pending' | 'retainer_paid' | 'expired' | 'cancelled';
  stripeSessionId: string | null;
  customReviewRequired: boolean;
  eligibilityStatus: 'instant-book' | 'custom-review';
  customerEmail: string;
  eventCity: string;
  availabilityConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CheckoutSessionRequest extends AvailabilityLookupRequest {
  customerEmail: string;
  eventCity: string;
}

export interface CheckoutSessionResponse {
  ok: boolean;
  checkoutUrl?: string;
  availability?: AvailabilityLookupResponse;
  error?: string;
}

export interface StripeWebhookSlotUpdate {
  bookingId: string;
  slotId: string;
  holdId: string;
  stripeSessionId: string;
  stripeEventId: string;
}

export interface SlotAuditEvent {
  eventId: string;
  slotId: string | null;
  holdId: string | null;
  bookingId: string | null;
  eventType: string;
  actorType: 'public_api' | 'admin_api' | 'stripe_webhook' | 'system';
  safeDetailsJson: string;
  createdAt: string;
}

export interface D1AvailabilitySlotRow {
  slot_id: string;
  event_date: string;
  start_time: string;
  end_time: string;
  timezone: string;
  service_ids_json: string;
  service_combo_key: string;
  travel_zone: string;
  capacity_units_total: number;
  capacity_units_held: number;
  capacity_units_reserved: number;
  status: SlotStatus;
  hold_expires_at: string | null;
  blocked_reason_code: string | null;
  created_by_actor: string;
  updated_by_actor: string;
  created_at: string;
  updated_at: string;
}

export interface D1SlotHoldRow {
  hold_id: string;
  slot_id: string;
  booking_id: string;
  idempotency_key: string;
  stripe_session_id: string | null;
  capacity_units: number;
  hold_status: HoldStatus;
  hold_expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface D1BookingSlotLinkRow {
  link_id: string;
  booking_id: string;
  slot_id: string;
  hold_id: string;
  stripe_session_id: string | null;
  link_status: BookingSlotLinkStatus;
  created_at: string;
  updated_at: string;
}

export interface D1SlotAuditLogRow {
  audit_id: string;
  slot_id: string | null;
  hold_id: string | null;
  booking_id: string | null;
  event_type: string;
  actor_type: 'public_api' | 'admin_api' | 'stripe_webhook' | 'system';
  safe_details_json: string;
  created_at: string;
}

export interface D1SlotAdminEventRow {
  admin_event_id: string;
  slot_id: string | null;
  action: string;
  actor_label: string;
  safe_details_json: string;
  created_at: string;
}
