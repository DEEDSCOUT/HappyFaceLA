import type {
  AdminSlotCreateRequest,
  AdminSlotUpdateRequest,
  AvailabilityLookupRequest,
  AvailabilitySlot,
  BookingSlotLinkStatus,
  CheckoutSessionRequest,
  D1AvailabilitySlotRow,
  D1BookingSlotLinkRow,
  D1SlotAdminEventRow,
  D1SlotAuditLogRow,
  D1SlotHoldRow,
  HoldStatus,
  PublicLookbookInspiration,
  SlotHoldRequest,
  SlotStatus,
  StripeWebhookSlotUpdate,
} from './availability-types.ts';

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const SLOT_STATUSES: readonly SlotStatus[] = [
  'open',
  'held',
  'reserved',
  'expired',
  'released',
  'blocked',
  'unavailable',
];

const HOLD_STATUSES: readonly HoldStatus[] = ['held', 'reserved', 'expired', 'released'];

const LINK_STATUSES: readonly BookingSlotLinkStatus[] = [
  'pending',
  'reserved',
  'released',
  'manual_review',
];

const ALLOWED_SERVICES = new Set([
  'face-painting',
  'face-gems',
  'balloon-twisting',
  'glitter-tattoos',
  'combo',
  'not-sure',
]);

const ALLOWED_DESIGN_STYLES = new Set([
  'quick-cheek-arm',
  'standard-party',
  'full-face',
  'fast-event-menu',
  'not-sure',
]);

const ALLOWED_EVENT_TYPES = new Set([
  'birthday-party',
  'school-event',
  'corporate-family-day',
  'festival-community',
  'other',
]);

const ALLOWED_KIDS_BUCKETS = new Set(['1-10', '11-18', '19-25', '26-40', '40-plus', 'not-sure']);

const ALLOWED_TRAVEL_ZONES = new Set(['local', 'zone-25', 'zone-40', 'manual-review']);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SAFE_ID_RE = /^[a-z0-9][a-z0-9_-]{2,80}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readJsonObject(request: Request): Promise<ValidationResult<Record<string, unknown>>> {
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) {
      return { ok: false, error: 'Invalid JSON object' };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
}

export function parseJsonRecord(raw: string): ValidationResult<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return { ok: false, error: 'Stored record is not an object' };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, error: 'Stored record is not valid JSON' };
  }
}

export function isSlotStatus(value: unknown): value is SlotStatus {
  return typeof value === 'string' && SLOT_STATUSES.includes(value as SlotStatus);
}

export function isHoldStatus(value: unknown): value is HoldStatus {
  return typeof value === 'string' && HOLD_STATUSES.includes(value as HoldStatus);
}

export function isBookingSlotLinkStatus(value: unknown): value is BookingSlotLinkStatus {
  return typeof value === 'string' && LINK_STATUSES.includes(value as BookingSlotLinkStatus);
}

function isSlotAuditActor(value: unknown): value is D1SlotAuditLogRow['actor_type'] {
  return (
    value === 'public_api' ||
    value === 'admin_api' ||
    value === 'stripe_webhook' ||
    value === 'system'
  );
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isStartOrEndTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

export function isIsoInstant(value: unknown): value is string {
  return typeof value === 'string' && ISO_INSTANT_RE.test(value) && !Number.isNaN(Date.parse(value));
}

export function isSlotId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('slot_') && SAFE_ID_RE.test(value.slice(5));
}

export function isHoldId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('hold_') && SAFE_ID_RE.test(value.slice(5));
}

export function isBookingId(value: unknown): value is string {
  return typeof value === 'string' && /^book_[a-z0-9][a-z0-9_-]{4,80}$/i.test(value);
}

export function isStripeSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^cs_(test|live)_[A-Za-z0-9_]{8,200}$/.test(value);
}

export function isStripeEventId(value: unknown): value is string {
  return typeof value === 'string' && /^evt_[A-Za-z0-9_]{8,200}$/.test(value);
}

export function sanitizeSafeString(value: unknown, maxLen = 200): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen).replace(/[<>&"']/g, '');
}

export function normalizeTravelZone(travelMiles: number): string {
  if (travelMiles <= 20) return 'local';
  if (travelMiles <= 30) return 'zone-25';
  if (travelMiles <= 40) return 'zone-40';
  return 'manual-review';
}

export function buildServiceComboKey(services: readonly string[]): string {
  return [...services].sort().join('+');
}

export function addMinutesToTime(startTime: string, durationMinutes: number): string | null {
  if (!isStartOrEndTime(startTime) || !Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    return null;
  }
  const [hourRaw, minuteRaw] = startTime.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const total = hour * 60 + minute + durationMinutes;
  if (total > 24 * 60) return null;
  const endHour = Math.floor(total / 60);
  const endMinute = total % 60;
  return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
}

export function generateSafeId(prefix: 'slot' | 'hold' | 'audit' | 'link' | 'admin'): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
  return `${prefix}_${random.slice(0, 32)}`;
}

function optionalString(value: unknown, maxLen = 200): string | null {
  if (value === undefined || value === null) return null;
  const safe = sanitizeSafeString(value, maxLen);
  return safe.length > 0 ? safe : null;
}

function requiredString(value: unknown, field: string, maxLen = 200): ValidationResult<string> {
  const safe = sanitizeSafeString(value, maxLen);
  if (!safe) return { ok: false, error: `${field} required` };
  return { ok: true, value: safe };
}

function nonNegativeFiniteNumber(value: unknown, field: string): ValidationResult<number> {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return { ok: false, error: `${field} must be a non-negative number` };
  }
  return { ok: true, value };
}

function positiveInteger(value: unknown, field: string, max = 10000): ValidationResult<number> {
  if (!Number.isInteger(value) || typeof value !== 'number' || value <= 0 || value > max) {
    return { ok: false, error: `${field} must be a positive integer` };
  }
  return { ok: true, value };
}

function serviceIds(value: unknown): ValidationResult<string[]> {
  if (!Array.isArray(value)) return { ok: false, error: 'services must be an array' };
  const normalized: string[] = [];
  for (const raw of value) {
    const service = sanitizeSafeString(raw, 60);
    if (!service || !ALLOWED_SERVICES.has(service)) {
      return { ok: false, error: 'service is not allowlisted' };
    }
    if (!normalized.includes(service)) normalized.push(service);
  }
  if (normalized.length === 0) return { ok: false, error: 'at least one service is required' };
  return { ok: true, value: normalized };
}

function validateLookbookInspiration(value: unknown): ValidationResult<PublicLookbookInspiration[] | undefined> {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (!Array.isArray(value)) return { ok: false, error: 'inspiration must be an array' };
  const result: PublicLookbookInspiration[] = [];
  for (const item of value.slice(0, 6)) {
    if (!isRecord(item)) return { ok: false, error: 'inspiration item must be an object' };
    const slug = sanitizeSafeString(item.slug, 80);
    const title = sanitizeSafeString(item.title, 120);
    if (!/^[a-z0-9][a-z0-9-]{1,78}$/.test(slug) || !title) {
      return { ok: false, error: 'inspiration item is malformed' };
    }
    result.push({ slug, title });
  }
  return { ok: true, value: result };
}

export function validateAvailabilityLookupRequest(value: unknown): ValidationResult<AvailabilityLookupRequest> {
  if (!isRecord(value)) return { ok: false, error: 'request body must be an object' };

  const eventType = sanitizeSafeString(value.eventType, 80);
  if (!eventType || !ALLOWED_EVENT_TYPES.has(eventType)) {
    return { ok: false, error: 'eventType required' };
  }

  const services = serviceIds(value.services);
  if (!services.ok) return services;

  const kidsCountBucket = sanitizeSafeString(value.kidsCountBucket, 40);
  if (!kidsCountBucket || !ALLOWED_KIDS_BUCKETS.has(kidsCountBucket)) {
    return { ok: false, error: 'kidsCountBucket required' };
  }

  const kidsCountActual =
    value.kidsCountActual === undefined || value.kidsCountActual === null
      ? null
      : value.kidsCountActual;
  if (
    kidsCountActual !== null &&
    (!Number.isInteger(kidsCountActual) || typeof kidsCountActual !== 'number' || kidsCountActual <= 0 || kidsCountActual > 500)
  ) {
    return { ok: false, error: 'kidsCountActual must be a reasonable positive integer' };
  }

  const designStyle = sanitizeSafeString(value.designStyle, 80) || 'standard-party';
  if (!ALLOWED_DESIGN_STYLES.has(designStyle)) {
    return { ok: false, error: 'designStyle is not allowlisted' };
  }

  const duration = positiveInteger(value.durationMinutes, 'durationMinutes', 480);
  if (!duration.ok) return duration;
  if (duration.value < 30) return { ok: false, error: 'durationMinutes must be at least 30' };

  const travelMiles = nonNegativeFiniteNumber(value.travelMiles, 'travelMiles');
  if (!travelMiles.ok) return travelMiles;

  const eventDateRaw = value.eventDate;
  const eventDate = eventDateRaw === undefined || eventDateRaw === null || eventDateRaw === ''
    ? null
    : eventDateRaw;
  if (eventDate !== null && !isIsoDate(eventDate)) {
    return { ok: false, error: 'eventDate must be YYYY-MM-DD' };
  }

  const startRaw = value.startTime ?? value.eventTime;
  const startTime = startRaw === undefined || startRaw === null || startRaw === '' ? null : startRaw;
  if (startTime !== null && !isStartOrEndTime(startTime)) {
    return { ok: false, error: 'startTime must be HH:MM' };
  }

  const providedEndRaw = value.endTime;
  const providedEndTime = providedEndRaw === undefined || providedEndRaw === null || providedEndRaw === '' ? null : providedEndRaw;
  const derivedEndTime = startTime ? addMinutesToTime(startTime, duration.value) : null;
  const endTime = providedEndTime ?? derivedEndTime;
  if (endTime !== null && !isStartOrEndTime(endTime)) {
    return { ok: false, error: 'endTime must be HH:MM' };
  }

  const inspiration = validateLookbookInspiration(value.inspiration);
  if (!inspiration.ok) return inspiration;

  const requiredCapacityUnits = positiveInteger(value.requiredCapacityUnits ?? 1, 'requiredCapacityUnits', 20);
  if (!requiredCapacityUnits.ok) return requiredCapacityUnits;

  return {
    ok: true,
    value: {
      eventType,
      services: services.value,
      serviceComboKey: buildServiceComboKey(services.value),
      kidsCountBucket,
      kidsCountActual,
      designStyle,
      durationMinutes: duration.value,
      travelMiles: travelMiles.value,
      travelZone: normalizeTravelZone(travelMiles.value),
      eventDate,
      startTime,
      endTime,
      requiredCapacityUnits: requiredCapacityUnits.value,
      ...(inspiration.value ? { inspiration: inspiration.value } : {}),
    },
  };
}

export function validateCheckoutSessionRequest(value: unknown): ValidationResult<CheckoutSessionRequest> {
  const base = validateAvailabilityLookupRequest(value);
  if (!base.ok) return base;
  if (!isRecord(value)) return { ok: false, error: 'request body must be an object' };
  const customerEmail = sanitizeSafeString(value.customerEmail, 254);
  const eventCity = sanitizeSafeString(value.eventCity, 120);
  return {
    ok: true,
    value: {
      ...base.value,
      customerEmail,
      eventCity,
    },
  };
}

export function validateAdminSlotCreateRequest(value: unknown): ValidationResult<AdminSlotCreateRequest> {
  if (!isRecord(value)) return { ok: false, error: 'request body must be an object' };
  const eventDate = isIsoDate(value.eventDate) ? value.eventDate : null;
  const startTime = isStartOrEndTime(value.startTime) ? value.startTime : null;
  const endTime = isStartOrEndTime(value.endTime) ? value.endTime : null;
  if (!eventDate || !startTime || !endTime) {
    return { ok: false, error: 'eventDate, startTime, and endTime are required' };
  }

  const timezone = requiredString(value.timezone ?? 'America/Los_Angeles', 'timezone', 80);
  if (!timezone.ok) return timezone;
  const services = serviceIds(value.services);
  if (!services.ok) return services;
  const capacity = positiveInteger(value.capacityUnitsTotal, 'capacityUnitsTotal', 20);
  if (!capacity.ok) return capacity;
  const travelZone = sanitizeSafeString(value.travelZone, 60);
  if (!ALLOWED_TRAVEL_ZONES.has(travelZone)) return { ok: false, error: 'travelZone is not allowlisted' };
  const status = value.status === undefined ? 'open' : value.status;
  if (!isSlotStatus(status) || !['open', 'blocked', 'unavailable'].includes(status)) {
    return { ok: false, error: 'slot status is not allowed for create' };
  }

  const slotId = value.slotId === undefined ? undefined : value.slotId;
  if (slotId !== undefined && !isSlotId(slotId)) return { ok: false, error: 'slotId is malformed' };

  return {
    ok: true,
    value: {
      ...(slotId ? { slotId } : {}),
      eventDate,
      startTime,
      endTime,
      timezone: timezone.value,
      serviceIds: services.value,
      serviceComboKey: buildServiceComboKey(services.value),
      travelZone,
      capacityUnitsTotal: capacity.value,
      status,
      blockedReasonCode: optionalString(value.blockedReasonCode, 80),
    },
  };
}

export function validateAdminSlotUpdateRequest(value: unknown): ValidationResult<AdminSlotUpdateRequest> {
  if (!isRecord(value)) return { ok: false, error: 'request body must be an object' };
  if (!isSlotId(value.slotId)) return { ok: false, error: 'slotId is malformed' };

  const update: AdminSlotUpdateRequest = { slotId: value.slotId };
  if (value.eventDate !== undefined) {
    if (!isIsoDate(value.eventDate)) return { ok: false, error: 'eventDate must be YYYY-MM-DD' };
    update.eventDate = value.eventDate;
  }
  if (value.startTime !== undefined) {
    if (!isStartOrEndTime(value.startTime)) return { ok: false, error: 'startTime must be HH:MM' };
    update.startTime = value.startTime;
  }
  if (value.endTime !== undefined) {
    if (!isStartOrEndTime(value.endTime)) return { ok: false, error: 'endTime must be HH:MM' };
    update.endTime = value.endTime;
  }
  if (value.timezone !== undefined) {
    const timezone = requiredString(value.timezone, 'timezone', 80);
    if (!timezone.ok) return timezone;
    update.timezone = timezone.value;
  }
  if (value.services !== undefined) {
    const services = serviceIds(value.services);
    if (!services.ok) return services;
    update.serviceIds = services.value;
    update.serviceComboKey = buildServiceComboKey(services.value);
  }
  if (value.serviceComboKey !== undefined) {
    const combo = requiredString(value.serviceComboKey, 'serviceComboKey', 120);
    if (!combo.ok) return combo;
    update.serviceComboKey = combo.value;
  }
  if (value.travelZone !== undefined) {
    const travelZone = sanitizeSafeString(value.travelZone, 60);
    if (!ALLOWED_TRAVEL_ZONES.has(travelZone)) return { ok: false, error: 'travelZone is not allowlisted' };
    update.travelZone = travelZone;
  }
  if (value.capacityUnitsTotal !== undefined) {
    const capacity = positiveInteger(value.capacityUnitsTotal, 'capacityUnitsTotal', 20);
    if (!capacity.ok) return capacity;
    update.capacityUnitsTotal = capacity.value;
  }
  if (value.status !== undefined) {
    if (!isSlotStatus(value.status)) return { ok: false, error: 'slot status is invalid' };
    update.status = value.status;
  }
  if (value.blockedReasonCode !== undefined) {
    update.blockedReasonCode = optionalString(value.blockedReasonCode, 80);
  }
  return { ok: true, value: update };
}

export function validateSlotHoldRequest(value: unknown): ValidationResult<SlotHoldRequest> {
  if (!isRecord(value)) return { ok: false, error: 'slot hold request must be an object' };
  if (!isSlotId(value.slotId)) return { ok: false, error: 'slotId is malformed' };
  if (!isBookingId(value.bookingId)) return { ok: false, error: 'bookingId is malformed' };
  const capacity = positiveInteger(value.requiredCapacityUnits, 'requiredCapacityUnits', 20);
  if (!capacity.ok) return capacity;
  const idempotency = requiredString(value.idempotencyKey, 'idempotencyKey', 160);
  if (!idempotency.ok) return idempotency;
  const holdDuration = positiveInteger(value.holdDurationMinutes, 'holdDurationMinutes', 120);
  if (!holdDuration.ok) return holdDuration;
  return {
    ok: true,
    value: {
      slotId: value.slotId,
      bookingId: value.bookingId,
      requiredCapacityUnits: capacity.value,
      idempotencyKey: idempotency.value,
      holdDurationMinutes: holdDuration.value,
    },
  };
}

export function validateStripeWebhookSlotUpdate(value: unknown): ValidationResult<StripeWebhookSlotUpdate> {
  if (!isRecord(value)) return { ok: false, error: 'Stripe update must be an object' };
  if (!isBookingId(value.bookingId)) return { ok: false, error: 'bookingId is malformed' };
  if (!isSlotId(value.slotId)) return { ok: false, error: 'slotId is malformed' };
  if (!isHoldId(value.holdId)) return { ok: false, error: 'holdId is malformed' };
  if (!isStripeSessionId(value.stripeSessionId)) return { ok: false, error: 'stripeSessionId is malformed' };
  if (!isStripeEventId(value.stripeEventId)) return { ok: false, error: 'stripeEventId is malformed' };
  return {
    ok: true,
    value: {
      bookingId: value.bookingId,
      slotId: value.slotId,
      holdId: value.holdId,
      stripeSessionId: value.stripeSessionId,
      stripeEventId: value.stripeEventId,
    },
  };
}

function rowString(row: Record<string, unknown>, key: string): ValidationResult<string> {
  return requiredString(row[key], key, 500);
}

function rowRawString(row: Record<string, unknown>, key: string, maxLen = 2000): ValidationResult<string> {
  const value = row[key];
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: `${key} must be a string` };
  }
  if (value.length > maxLen) {
    return { ok: false, error: `${key} is too long` };
  }
  return { ok: true, value };
}

function rowNullableString(row: Record<string, unknown>, key: string): ValidationResult<string | null> {
  const value = row[key];
  if (value === null || value === undefined) return { ok: true, value: null };
  const safe = sanitizeSafeString(value, 500);
  if (!safe) return { ok: false, error: `${key} must be a string or null` };
  return { ok: true, value: safe };
}

function rowNumber(row: Record<string, unknown>, key: string): ValidationResult<number> {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ok: false, error: `${key} must be a finite number` };
  }
  return { ok: true, value };
}

export function validateD1AvailabilitySlotRow(value: unknown): ValidationResult<D1AvailabilitySlotRow> {
  if (!isRecord(value)) return { ok: false, error: 'D1 availability row is not an object' };
  if (!isSlotId(value.slot_id)) return { ok: false, error: 'D1 slot_id is malformed' };
  if (!isIsoDate(value.event_date)) return { ok: false, error: 'D1 event_date is malformed' };
  if (!isStartOrEndTime(value.start_time)) return { ok: false, error: 'D1 start_time is malformed' };
  if (!isStartOrEndTime(value.end_time)) return { ok: false, error: 'D1 end_time is malformed' };
  if (!isSlotStatus(value.status)) return { ok: false, error: 'D1 status is malformed' };
  if (value.hold_expires_at !== null && value.hold_expires_at !== undefined && !isIsoInstant(value.hold_expires_at)) {
    return { ok: false, error: 'D1 hold_expires_at is malformed' };
  }
  const timezone = rowString(value, 'timezone');
  if (!timezone.ok) return timezone;
  const serviceIdsJson = rowRawString(value, 'service_ids_json');
  if (!serviceIdsJson.ok) return serviceIdsJson;
  const parsedServices = parseJsonRecord(`{"services":${serviceIdsJson.value}}`);
  if (!parsedServices.ok || !Array.isArray(parsedServices.value.services)) {
    return { ok: false, error: 'D1 service_ids_json is malformed' };
  }
  const services = serviceIds(parsedServices.value.services);
  if (!services.ok) return { ok: false, error: 'D1 service_ids_json contains unallowlisted services' };
  const serviceComboKey = rowString(value, 'service_combo_key');
  if (!serviceComboKey.ok) return serviceComboKey;
  const travelZone = rowString(value, 'travel_zone');
  if (!travelZone.ok || !ALLOWED_TRAVEL_ZONES.has(travelZone.value)) {
    return { ok: false, error: 'D1 travel_zone is malformed' };
  }
  const capacityTotal = rowNumber(value, 'capacity_units_total');
  const capacityHeld = rowNumber(value, 'capacity_units_held');
  const capacityReserved = rowNumber(value, 'capacity_units_reserved');
  if (!capacityTotal.ok || !capacityHeld.ok || !capacityReserved.ok) {
    return { ok: false, error: 'D1 capacity fields are malformed' };
  }
  if (
    capacityTotal.value <= 0 ||
    capacityHeld.value < 0 ||
    capacityReserved.value < 0 ||
    capacityHeld.value + capacityReserved.value > capacityTotal.value
  ) {
    return { ok: false, error: 'D1 capacity values are invalid' };
  }
  const blockedReasonCode = rowNullableString(value, 'blocked_reason_code');
  if (!blockedReasonCode.ok) return blockedReasonCode;
  const createdBy = rowString(value, 'created_by_actor');
  const updatedBy = rowString(value, 'updated_by_actor');
  if (!createdBy.ok || !updatedBy.ok) return { ok: false, error: 'D1 actor fields are malformed' };
  if (!isIsoInstant(value.created_at) || !isIsoInstant(value.updated_at)) {
    return { ok: false, error: 'D1 timestamps are malformed' };
  }
  return {
    ok: true,
    value: {
      slot_id: value.slot_id,
      event_date: value.event_date,
      start_time: value.start_time,
      end_time: value.end_time,
      timezone: timezone.value,
      service_ids_json: serviceIdsJson.value,
      service_combo_key: serviceComboKey.value,
      travel_zone: travelZone.value,
      capacity_units_total: capacityTotal.value,
      capacity_units_held: capacityHeld.value,
      capacity_units_reserved: capacityReserved.value,
      status: value.status,
      hold_expires_at: value.hold_expires_at ?? null,
      blocked_reason_code: blockedReasonCode.value,
      created_by_actor: createdBy.value,
      updated_by_actor: updatedBy.value,
      created_at: value.created_at,
      updated_at: value.updated_at,
    },
  };
}

export function mapD1AvailabilitySlotRow(row: D1AvailabilitySlotRow): ValidationResult<AvailabilitySlot> {
  const parsedServices = parseJsonRecord(`{"services":${row.service_ids_json}}`);
  if (!parsedServices.ok || !Array.isArray(parsedServices.value.services)) {
    return { ok: false, error: 'D1 service list is malformed' };
  }
  const services = serviceIds(parsedServices.value.services);
  if (!services.ok) return services;
  return {
    ok: true,
    value: {
      slotId: row.slot_id,
      eventDate: row.event_date,
      startTime: row.start_time,
      endTime: row.end_time,
      timezone: row.timezone,
      serviceIds: services.value,
      serviceComboKey: row.service_combo_key,
      travelZone: row.travel_zone,
      capacityUnitsTotal: row.capacity_units_total,
      capacityUnitsHeld: row.capacity_units_held,
      capacityUnitsReserved: row.capacity_units_reserved,
      status: row.status,
      holdExpiresAt: row.hold_expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  };
}

export function validateD1SlotHoldRow(value: unknown): ValidationResult<D1SlotHoldRow> {
  if (!isRecord(value)) return { ok: false, error: 'D1 hold row is not an object' };
  if (!isHoldId(value.hold_id)) return { ok: false, error: 'D1 hold_id is malformed' };
  if (!isSlotId(value.slot_id)) return { ok: false, error: 'D1 slot_id is malformed' };
  if (!isBookingId(value.booking_id)) return { ok: false, error: 'D1 booking_id is malformed' };
  const idempotency = rowString(value, 'idempotency_key');
  if (!idempotency.ok) return idempotency;
  const stripeSession = rowNullableString(value, 'stripe_session_id');
  if (!stripeSession.ok) return stripeSession;
  if (stripeSession.value !== null && !isStripeSessionId(stripeSession.value)) {
    return { ok: false, error: 'D1 stripe_session_id is malformed' };
  }
  const capacity = rowNumber(value, 'capacity_units');
  if (!capacity.ok || capacity.value <= 0) return { ok: false, error: 'D1 hold capacity is malformed' };
  if (!isHoldStatus(value.hold_status)) return { ok: false, error: 'D1 hold_status is malformed' };
  if (!isIsoInstant(value.hold_expires_at) || !isIsoInstant(value.created_at) || !isIsoInstant(value.updated_at)) {
    return { ok: false, error: 'D1 hold timestamps are malformed' };
  }
  return {
    ok: true,
    value: {
      hold_id: value.hold_id,
      slot_id: value.slot_id,
      booking_id: value.booking_id,
      idempotency_key: idempotency.value,
      stripe_session_id: stripeSession.value,
      capacity_units: capacity.value,
      hold_status: value.hold_status,
      hold_expires_at: value.hold_expires_at,
      created_at: value.created_at,
      updated_at: value.updated_at,
    },
  };
}

export function validateD1BookingSlotLinkRow(value: unknown): ValidationResult<D1BookingSlotLinkRow> {
  if (!isRecord(value)) return { ok: false, error: 'D1 link row is not an object' };
  if (!SAFE_ID_RE.test(sanitizeSafeString(value.link_id, 120))) return { ok: false, error: 'D1 link_id is malformed' };
  if (!isBookingId(value.booking_id)) return { ok: false, error: 'D1 booking_id is malformed' };
  if (!isSlotId(value.slot_id)) return { ok: false, error: 'D1 slot_id is malformed' };
  if (!isHoldId(value.hold_id)) return { ok: false, error: 'D1 hold_id is malformed' };
  const stripeSession = rowNullableString(value, 'stripe_session_id');
  if (!stripeSession.ok) return stripeSession;
  if (stripeSession.value !== null && !isStripeSessionId(stripeSession.value)) {
    return { ok: false, error: 'D1 stripe_session_id is malformed' };
  }
  if (!isBookingSlotLinkStatus(value.link_status)) return { ok: false, error: 'D1 link_status is malformed' };
  if (!isIsoInstant(value.created_at) || !isIsoInstant(value.updated_at)) {
    return { ok: false, error: 'D1 link timestamps are malformed' };
  }
  return {
    ok: true,
    value: {
      link_id: sanitizeSafeString(value.link_id, 120),
      booking_id: value.booking_id,
      slot_id: value.slot_id,
      hold_id: value.hold_id,
      stripe_session_id: stripeSession.value,
      link_status: value.link_status,
      created_at: value.created_at,
      updated_at: value.updated_at,
    },
  };
}

export function validateD1SlotAuditLogRow(value: unknown): ValidationResult<D1SlotAuditLogRow> {
  if (!isRecord(value)) return { ok: false, error: 'D1 audit row is not an object' };
  if (!SAFE_ID_RE.test(sanitizeSafeString(value.audit_id, 120))) return { ok: false, error: 'D1 audit_id is malformed' };
  const slotId = value.slot_id === null || value.slot_id === undefined ? null : value.slot_id;
  if (slotId !== null && !isSlotId(slotId)) return { ok: false, error: 'D1 audit slot_id is malformed' };
  const holdId = value.hold_id === null || value.hold_id === undefined ? null : value.hold_id;
  if (holdId !== null && !isHoldId(holdId)) return { ok: false, error: 'D1 audit hold_id is malformed' };
  const bookingId = value.booking_id === null || value.booking_id === undefined ? null : value.booking_id;
  if (bookingId !== null && !isBookingId(bookingId)) return { ok: false, error: 'D1 audit booking_id is malformed' };
  const eventType = rowString(value, 'event_type');
  const actorType = rowString(value, 'actor_type');
  const details = rowString(value, 'safe_details_json');
  if (!eventType.ok || !actorType.ok || !details.ok) return { ok: false, error: 'D1 audit fields are malformed' };
  if (!isSlotAuditActor(actorType.value)) {
    return { ok: false, error: 'D1 audit actor_type is malformed' };
  }
  if (!isIsoInstant(value.created_at)) return { ok: false, error: 'D1 audit timestamp is malformed' };
  return {
    ok: true,
    value: {
      audit_id: sanitizeSafeString(value.audit_id, 120),
      slot_id: slotId,
      hold_id: holdId,
      booking_id: bookingId,
      event_type: eventType.value,
      actor_type: actorType.value,
      safe_details_json: details.value,
      created_at: value.created_at,
    },
  };
}

export function validateD1SlotAdminEventRow(value: unknown): ValidationResult<D1SlotAdminEventRow> {
  if (!isRecord(value)) return { ok: false, error: 'D1 admin event row is not an object' };
  if (!SAFE_ID_RE.test(sanitizeSafeString(value.admin_event_id, 120))) {
    return { ok: false, error: 'D1 admin_event_id is malformed' };
  }
  const slotId = value.slot_id === null || value.slot_id === undefined ? null : value.slot_id;
  if (slotId !== null && !isSlotId(slotId)) return { ok: false, error: 'D1 admin event slot_id is malformed' };
  const action = rowString(value, 'action');
  const actorLabel = rowString(value, 'actor_label');
  const details = rowString(value, 'safe_details_json');
  if (!action.ok || !actorLabel.ok || !details.ok) {
    return { ok: false, error: 'D1 admin event fields are malformed' };
  }
  if (!isIsoInstant(value.created_at)) return { ok: false, error: 'D1 admin event timestamp is malformed' };
  return {
    ok: true,
    value: {
      admin_event_id: sanitizeSafeString(value.admin_event_id, 120),
      slot_id: slotId,
      action: action.value,
      actor_label: actorLabel.value,
      safe_details_json: details.value,
      created_at: value.created_at,
    },
  };
}
