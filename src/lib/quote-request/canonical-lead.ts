// src/lib/quote-request/canonical-lead.ts
// PUBLIC-BOOKING POST-DEPLOY P1 — Canonical Plan My Party lead model.
//
// One canonical lead shape that BOTH endpoints feed:
//   - /api/quote-request (rich wizard)  -> buildCanonicalLead from the sanitized wizard payload
//   - /api/lead (legacy contact form)   -> buildCanonicalLead from the mapped legacy payload
//
// Pure: no I/O, no Stripe, no secrets. Every customer-entered field and every
// system-recommended value is captured here, plus truthful derivations:
//   - child-count confidence (never blank; not-sure -> needs_confirmation + manual review)
//   - duration source + computed service end time
//   - travel source / zone / fee / note (never blank)
//   - customer budget vs system-calculated pricing (NEVER conflated)
// buildCanonicalNotificationPayload() produces the complete, well-labeled payload
// delivered to Make -> Gmail / Google Sheets.

import { addMinutesToTime } from '../booking/availability-validation.ts';
import { getTravelFee } from '../booking/pricing-engine.ts';

export type LeadEndpoint = 'quote-request' | 'lead-adapter';

export type PreferredContactMethod = 'text' | 'phone' | 'email' | 'any' | 'not_provided';

export type ChildCountConfidence = 'exact' | 'estimated_bucket' | 'needs_confirmation';

export type DurationSource = 'customer_selected' | 'system_recommended' | 'manual_review';

export type TravelSource = 'exact_address' | 'city_estimate' | 'not_enough_data';

export type TravelZone = 'local' | 'extended' | 'manual_review' | 'unknown';

export type PricingSource = 'system_calculated' | 'system_recommended' | 'manual_review';

export type SourceConfidence =
  | 'gclid'
  | 'gbraid'
  | 'wbraid'
  | 'utm_paid'
  | 'utm_other'
  | 'referrer'
  | 'direct'
  | 'unknown'
  | 'manual_review';

export type QualifiedStatus =
  | 'unreviewed'
  | 'qualified'
  | 'weak'
  | 'spam'
  | 'outside_area'
  | 'wrong_service'
  | 'duplicate'
  | 'cannot_determine';

export type QuoteSentStatus = 'not_sent' | 'sent' | 'not_needed' | 'cannot_determine';

export type BookedStatus = 'pending' | 'not_booked' | 'booked' | 'lost' | 'cannot_determine';

export interface CanonicalLeadInput {
  endpoint: LeadEndpoint;
  leadId: string;
  createdAt: string;
  sourcePage: string | null;
  landingPage?: string | null;
  sourcePath?: string | null;
  referrer?: string | null;
  firstLandingPage?: string | null;
  firstSourcePath?: string | null;
  firstReferrer?: string | null;
  submitLandingPage?: string | null;
  submitSourcePath?: string | null;
  submitReferrer?: string | null;
  // contact
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  preferredContactMethod: PreferredContactMethod;
  // event
  eventType: string;
  eventDate: string | null;
  startTime: string | null;
  eventCity: string;
  venueOrAddress: string | null;
  services: string[];
  // children
  childCountBucket: string;
  childCountActual: number | null;
  // design + duration
  designStyle: string;
  selectedDurationMinutes: number | null;
  recommendedDurationMinutes: number | null;
  serviceWindowMinutes: number | null;
  requiredArtistCount: number | null;
  // travel
  travelMiles: number | null;
  hasExactAddress: boolean;
  // outcome + system pricing (system-calculated, NOT customer budget)
  quoteClassification: string | null;
  recommendationSummary: string | null;
  systemEstimatedTotalCents: number | null;
  systemRetainerCents: number | null;
  pricingModel: string | null;
  // customer budget (only if the customer actually entered/selected one)
  customerBudgetRaw: string | null;
  // notes + attribution
  notes: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  gclid: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  fbclid: string | null;
  msclkid: string | null;
  firstUtmSource?: string | null;
  firstUtmMedium?: string | null;
  firstUtmCampaign?: string | null;
  firstUtmTerm?: string | null;
  firstUtmContent?: string | null;
  firstGclid?: string | null;
  firstGbraid?: string | null;
  firstWbraid?: string | null;
  submitUtmSource?: string | null;
  submitUtmMedium?: string | null;
  submitUtmCampaign?: string | null;
  submitUtmTerm?: string | null;
  submitUtmContent?: string | null;
  submitGclid?: string | null;
  submitGbraid?: string | null;
  submitWbraid?: string | null;
  consentAcknowledgement: boolean;
}

export interface CanonicalPlanMyPartyLead {
  leadId: string;
  endpoint: LeadEndpoint;
  createdAt: string;
  sourcePage: string | null;
  landingPage: string | null;
  sourcePath: string | null;
  referrer: string | null;
  firstLandingPage: string | null;
  firstSourcePath: string | null;
  firstReferrer: string | null;
  submitLandingPage: string | null;
  submitSourcePath: string | null;
  submitReferrer: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  preferredContactMethod: PreferredContactMethod;
  eventType: string;
  eventDate: string | null;
  startTime: string | null;
  computedEndTime: string | null;
  eventCity: string;
  venueOrAddress: string | null;
  services: string[];
  childCountBucket: string;
  childCountActual: number | null;
  childCountConfidence: ChildCountConfidence;
  designStyle: string;
  durationMinutes: number | null;
  selectedDurationMinutes: number | null;
  recommendedDurationMinutes: number | null;
  durationSource: DurationSource;
  serviceWindowMinutes: number | null;
  requiredArtistCount: number | null;
  travelMiles: number | null;
  travelSource: TravelSource;
  travelZone: TravelZone;
  travelFeeCents: number | null;
  travelNote: string | null;
  quoteClassification: string | null;
  recommendationSummary: string | null;
  // budget vs pricing — kept strictly separate
  customerBudgetProvided: boolean;
  customerBudgetAmountCents: number | null;
  customerBudgetLabel: string;
  systemEstimatedTotalCents: number | null;
  systemRetainerCents: number | null;
  pricingModel: string | null;
  pricingSource: PricingSource;
  pricingConfidence: 'deterministic' | 'estimate' | 'unavailable';
  budgetDisplayLabel: string;
  manualReviewReasons: string[];
  notes: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
  msclkid: string | null;
  firstUtmSource: string | null;
  firstUtmMedium: string | null;
  firstUtmCampaign: string | null;
  firstUtmTerm: string | null;
  firstUtmContent: string | null;
  firstGclid: string | null;
  firstGbraid: string | null;
  firstWbraid: string | null;
  submitUtmSource: string | null;
  submitUtmMedium: string | null;
  submitUtmCampaign: string | null;
  submitUtmTerm: string | null;
  submitUtmContent: string | null;
  submitGclid: string | null;
  submitGbraid: string | null;
  submitWbraid: string | null;
  sourceConfidence: SourceConfidence;
  attributionSummary: string;
  qualifiedStatus: QualifiedStatus;
  quoteSentStatus: QuoteSentStatus;
  bookedStatus: BookedStatus;
  bookedRevenueCents: number | null;
  bookedRevenueCurrency: string;
  lostReason: string | null;
  duplicateOfLeadId: string | null;
  ownerReviewNotes: string | null;
  isInternalTest: boolean;
  internalTestReason: string | null;
  consentAcknowledgement: boolean;
}

export type LeadNotificationValidationResult =
  | { ok: true }
  | { ok: false; code: 'BLANK_LEAD_EMAIL_BLOCKED'; missingFields: string[] };

const DEFAULT_NOTIFICATION_TEXT = new Set([
  '',
  'not provided',
  'not available',
  'needs confirmation',
  'unavailable',
  'unknown',
  'not-sure',
  'not_provided',
  'manual_review',
  'customer budget: not provided',
]);

function isMeaningfulNotificationText(value: unknown): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const normalized = String(value).trim().toLowerCase();
  return Boolean(normalized) && !DEFAULT_NOTIFICATION_TEXT.has(normalized);
}

function isMeaningfulNotificationArray(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((item) => isMeaningfulNotificationText(item));
}

export function validateLeadNotificationPayload(payload: Record<string, unknown>): LeadNotificationValidationResult {
  const missingFields: string[] = [];
  const hasLeadId = isMeaningfulNotificationText(payload.lead_id);
  const hasCreatedAt = isMeaningfulNotificationText(payload.created_at);
  const hasSourcePage = isMeaningfulNotificationText(payload.source_page);
  const hasContactChannel =
    isMeaningfulNotificationText(payload.phone) ||
    isMeaningfulNotificationText(payload.email);
  const hasContactIdentity =
    isMeaningfulNotificationText(payload.first_name) ||
    isMeaningfulNotificationText(payload.last_name) ||
    hasContactChannel;
  const hasCustomerProvidedField =
    isMeaningfulNotificationText(payload.first_name) ||
    isMeaningfulNotificationText(payload.last_name) ||
    isMeaningfulNotificationText(payload.phone) ||
    isMeaningfulNotificationText(payload.email) ||
    isMeaningfulNotificationText(payload.event_type) ||
    isMeaningfulNotificationText(payload.event_date) ||
    isMeaningfulNotificationText(payload.preferred_start_time) ||
    isMeaningfulNotificationText(payload.event_city) ||
    isMeaningfulNotificationText(payload.event_venue_or_address) ||
    isMeaningfulNotificationArray(payload.services_requested) ||
    isMeaningfulNotificationText(payload.notes) ||
    isMeaningfulNotificationText(payload.customer_budget_label);

  if (!hasLeadId) missingFields.push('lead_id');
  if (!hasCreatedAt) missingFields.push('created_at');
  if (!hasSourcePage) missingFields.push('source_page');
  if (!hasContactChannel) missingFields.push('phone_or_email');
  if (!hasContactIdentity) missingFields.push('contact_identity');
  if (!hasCustomerProvidedField) missingFields.push('customer_provided_field');

  return missingFields.length
    ? { ok: false, code: 'BLANK_LEAD_EMAIL_BLOCKED', missingFields }
    : { ok: true };
}

export function assertLeadNotificationPayloadCanSend(payload: Record<string, unknown>): void {
  const result = validateLeadNotificationPayload(payload);
  if (!result.ok) {
    const err = new Error('BLANK_LEAD_EMAIL_BLOCKED');
    (err as Error & { missingFields?: string[] }).missingFields = result.missingFields;
    throw err;
  }
}

export function deriveChildCount(
  bucket: string,
  actual: number | null,
): { confidence: ChildCountConfidence; manualReviewReason: string | null } {
  if (typeof actual === 'number' && Number.isInteger(actual) && actual > 0) {
    return { confidence: 'exact', manualReviewReason: null };
  }
  if (bucket && bucket !== 'not-sure') {
    return { confidence: 'estimated_bucket', manualReviewReason: null };
  }
  return { confidence: 'needs_confirmation', manualReviewReason: 'child_count_unknown' };
}

export function deriveDuration(
  selected: number | null,
  recommended: number | null,
): { durationMinutes: number | null; durationSource: DurationSource } {
  if (typeof selected === 'number' && selected > 0) {
    return { durationMinutes: selected, durationSource: 'customer_selected' };
  }
  if (typeof recommended === 'number' && recommended > 0) {
    return { durationMinutes: recommended, durationSource: 'system_recommended' };
  }
  return { durationMinutes: null, durationSource: 'manual_review' };
}

export function computeServiceEndTime(startTime: string | null, durationMinutes: number | null): string | null {
  if (!startTime || !durationMinutes || durationMinutes <= 0) return null;
  return addMinutesToTime(startTime, durationMinutes);
}

export function deriveTravel(
  travelMiles: number | null,
  hasExactAddress: boolean,
  hasCity: boolean,
): { source: TravelSource; zone: TravelZone; feeCents: number | null; note: string | null } {
  const source: TravelSource = hasExactAddress ? 'exact_address' : hasCity ? 'city_estimate' : 'not_enough_data';
  let zone: TravelZone = 'unknown';
  let feeCents: number | null = null;
  if (typeof travelMiles === 'number' && travelMiles >= 0) {
    feeCents = getTravelFee(travelMiles).feeCents;
    zone = travelMiles <= 20 ? 'local' : travelMiles <= 40 ? 'extended' : travelMiles <= 60 ? 'manual_review' : 'manual_review';
  }
  const note = source === 'exact_address' ? null : 'Exact venue address needed to confirm travel.';
  return { source, zone, feeCents, note };
}

// Parse a customer-entered budget string into cents, ONLY if the customer actually
// provided one. System-calculated pricing must never be routed through here.
export function parseCustomerBudget(raw: string | null): { provided: boolean; amountCents: number | null; label: string } {
  if (!raw || !raw.trim()) return { provided: false, amountCents: null, label: 'Not provided' };
  const cleaned = raw.trim();
  const match = cleaned.replace(/,/g, '').match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (!match) {
    // Customer typed a non-numeric budget hint (e.g. a range word) — preserve it as a label.
    return { provided: true, amountCents: null, label: cleaned.slice(0, 80) };
  }
  const amountCents = Math.round(Number(match[1]) * 100);
  return { provided: true, amountCents, label: cleaned.slice(0, 80) };
}

function hasValue(value: unknown): boolean {
  return typeof value === 'string' && Boolean(value.trim());
}

function isPaidUtm(source: unknown, medium: unknown): boolean {
  const sourceValue = typeof source === 'string' ? source.trim().toLowerCase() : '';
  const mediumValue = typeof medium === 'string' ? medium.trim().toLowerCase() : '';
  return (
    sourceValue === 'google' &&
    ['cpc', 'paid', 'paid_search', 'ppc', 'sem'].includes(mediumValue)
  );
}

function deriveSourceConfidence(input: CanonicalLeadInput): SourceConfidence {
  if (hasValue(input.gclid) || hasValue(input.submitGclid) || hasValue(input.firstGclid)) return 'gclid';
  if (hasValue(input.gbraid) || hasValue(input.submitGbraid) || hasValue(input.firstGbraid)) return 'gbraid';
  if (hasValue(input.wbraid) || hasValue(input.submitWbraid) || hasValue(input.firstWbraid)) return 'wbraid';
  if (isPaidUtm(input.utmSource, input.utmMedium) || isPaidUtm(input.submitUtmSource, input.submitUtmMedium) || isPaidUtm(input.firstUtmSource, input.firstUtmMedium)) return 'utm_paid';
  if (hasValue(input.utmSource) || hasValue(input.utmMedium) || hasValue(input.utmCampaign)) return 'utm_other';
  if (hasValue(input.referrer) || hasValue(input.firstReferrer) || hasValue(input.submitReferrer)) return 'referrer';
  if (input.landingPage || input.sourcePath || input.sourcePage) return 'direct';
  return 'unknown';
}

function buildAttributionSummary(input: CanonicalLeadInput, sourceConfidence: SourceConfidence): string {
  const parts = [
    `source_confidence=${sourceConfidence}`,
    input.utmSource ? `utm_source=${input.utmSource}` : '',
    input.utmMedium ? `utm_medium=${input.utmMedium}` : '',
    input.utmCampaign ? `utm_campaign=${input.utmCampaign}` : '',
    input.sourcePage ? `source_page=${input.sourcePage}` : '',
    input.landingPage ? `landing_page=${input.landingPage}` : '',
    input.gclid ? 'gclid_present=yes' : 'gclid_present=no',
    input.gbraid ? 'gbraid_present=yes' : 'gbraid_present=no',
    input.wbraid ? 'wbraid_present=yes' : 'wbraid_present=no',
  ].filter(Boolean);
  return parts.join('; ').slice(0, 1000);
}

function detectInternalTest(input: CanonicalLeadInput): { isInternalTest: boolean; reason: string | null } {
  const haystack = [
    input.firstName,
    input.lastName,
    input.email,
    input.phone,
    input.notes,
  ].filter(Boolean).join(' ').toLowerCase();
  const markers = [
    'hfl tracking test',
    'internal tracking test',
    'do not quote',
    'do not book',
  ];
  const matched = markers.find((marker) => haystack.includes(marker));
  return matched
    ? { isInternalTest: true, reason: matched }
    : { isInternalTest: false, reason: null };
}

export function buildCanonicalLead(input: CanonicalLeadInput): CanonicalPlanMyPartyLead {
  const child = deriveChildCount(input.childCountBucket, input.childCountActual);
  const duration = deriveDuration(input.selectedDurationMinutes, input.recommendedDurationMinutes);
  const computedEndTime = computeServiceEndTime(input.startTime, duration.durationMinutes);
  const travel = deriveTravel(input.travelMiles, input.hasExactAddress, Boolean(input.eventCity));
  const budget = parseCustomerBudget(input.customerBudgetRaw);
  const sourceConfidence = deriveSourceConfidence(input);
  const attributionSummary = buildAttributionSummary(input, sourceConfidence);
  const internalTest = detectInternalTest(input);

  const manualReviewReasons: string[] = [];
  if (!input.eventType) manualReviewReasons.push('event_type_missing');
  if (!input.eventDate) manualReviewReasons.push('event_date_missing');
  if (!input.eventCity) manualReviewReasons.push('event_city_missing');
  if (input.services.length === 0) manualReviewReasons.push('services_missing');
  if (child.manualReviewReason) manualReviewReasons.push(child.manualReviewReason);
  if (duration.durationSource === 'manual_review') manualReviewReasons.push('duration_unknown');
  if (travel.zone === 'manual_review') manualReviewReasons.push('travel_exceeds_standard_zone');
  if (input.quoteClassification === 'custom-quote-required' || input.quoteClassification === 'manual-approval-required') {
    manualReviewReasons.push('custom_or_manual_review_quote');
  }

  const hasSystemPricing = input.systemEstimatedTotalCents !== null;
  const pricingSource: PricingSource = hasSystemPricing
    ? (input.pricingModel === 'fixed-package' ? 'system_calculated' : 'system_recommended')
    : 'manual_review';
  const pricingConfidence = hasSystemPricing
    ? (input.pricingModel === 'fixed-package' ? 'deterministic' : 'estimate')
    : 'unavailable';

  const budgetDisplayLabel = budget.provided
    ? `Customer budget: ${budget.amountCents !== null ? formatCents(budget.amountCents) : budget.label}`
    : 'Customer budget: Not provided';

  return {
    leadId: input.leadId,
    endpoint: input.endpoint,
    createdAt: input.createdAt,
    sourcePage: input.sourcePage,
    landingPage: input.landingPage ?? null,
    sourcePath: input.sourcePath ?? null,
    referrer: input.referrer ?? null,
    firstLandingPage: input.firstLandingPage ?? null,
    firstSourcePath: input.firstSourcePath ?? null,
    firstReferrer: input.firstReferrer ?? null,
    submitLandingPage: input.submitLandingPage ?? null,
    submitSourcePath: input.submitSourcePath ?? null,
    submitReferrer: input.submitReferrer ?? null,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    preferredContactMethod: input.preferredContactMethod,
    eventType: input.eventType,
    eventDate: input.eventDate,
    startTime: input.startTime,
    computedEndTime,
    eventCity: input.eventCity,
    venueOrAddress: input.venueOrAddress,
    services: input.services,
    childCountBucket: input.childCountBucket,
    childCountActual: input.childCountActual,
    childCountConfidence: child.confidence,
    designStyle: input.designStyle,
    durationMinutes: duration.durationMinutes,
    selectedDurationMinutes: input.selectedDurationMinutes,
    recommendedDurationMinutes: input.recommendedDurationMinutes,
    durationSource: duration.durationSource,
    serviceWindowMinutes: input.serviceWindowMinutes,
    requiredArtistCount: input.requiredArtistCount,
    travelMiles: input.travelMiles,
    travelSource: travel.source,
    travelZone: travel.zone,
    travelFeeCents: travel.feeCents,
    travelNote: travel.note,
    quoteClassification: input.quoteClassification,
    recommendationSummary: input.recommendationSummary,
    customerBudgetProvided: budget.provided,
    customerBudgetAmountCents: budget.amountCents,
    customerBudgetLabel: budget.provided ? budget.label : 'Not provided',
    systemEstimatedTotalCents: input.systemEstimatedTotalCents,
    systemRetainerCents: input.systemRetainerCents,
    pricingModel: input.pricingModel,
    pricingSource,
    pricingConfidence,
    budgetDisplayLabel,
    manualReviewReasons,
    notes: input.notes,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    utmTerm: input.utmTerm,
    utmContent: input.utmContent,
    gclid: input.gclid,
    gbraid: input.gbraid ?? null,
    wbraid: input.wbraid ?? null,
    fbclid: input.fbclid,
    msclkid: input.msclkid,
    firstUtmSource: input.firstUtmSource ?? null,
    firstUtmMedium: input.firstUtmMedium ?? null,
    firstUtmCampaign: input.firstUtmCampaign ?? null,
    firstUtmTerm: input.firstUtmTerm ?? null,
    firstUtmContent: input.firstUtmContent ?? null,
    firstGclid: input.firstGclid ?? null,
    firstGbraid: input.firstGbraid ?? null,
    firstWbraid: input.firstWbraid ?? null,
    submitUtmSource: input.submitUtmSource ?? null,
    submitUtmMedium: input.submitUtmMedium ?? null,
    submitUtmCampaign: input.submitUtmCampaign ?? null,
    submitUtmTerm: input.submitUtmTerm ?? null,
    submitUtmContent: input.submitUtmContent ?? null,
    submitGclid: input.submitGclid ?? null,
    submitGbraid: input.submitGbraid ?? null,
    submitWbraid: input.submitWbraid ?? null,
    sourceConfidence,
    attributionSummary,
    qualifiedStatus: 'unreviewed',
    quoteSentStatus: 'not_sent',
    bookedStatus: 'pending',
    bookedRevenueCents: null,
    bookedRevenueCurrency: 'USD',
    lostReason: null,
    duplicateOfLeadId: null,
    ownerReviewNotes: null,
    isInternalTest: internalTest.isInternalTest,
    internalTestReason: internalTest.reason,
    consentAcknowledgement: input.consentAcknowledgement,
  };
}

function formatCents(cents: number | null): string {
  if (cents === null) return 'Not provided';
  return `$${(cents / 100).toFixed(2)}`;
}

const CHILD_CONFIDENCE_LABEL: Record<ChildCountConfidence, string> = {
  exact: 'exact count',
  estimated_bucket: 'estimated bucket',
  needs_confirmation: 'needs confirmation',
};

const DURATION_SOURCE_LABEL: Record<DurationSource, string> = {
  customer_selected: 'customer selected',
  system_recommended: 'system recommended',
  manual_review: 'needs confirmation',
};

const CONTACT_METHOD_LABEL: Record<PreferredContactMethod, string> = {
  text: 'Text',
  phone: 'Call',
  email: 'Email',
  any: 'Any is fine',
  not_provided: 'Not provided',
};

// The COMPLETE, well-labeled payload delivered to Make -> Gmail / Google Sheets.
// Every customer-entered field and every system-recommended value is present and
// truthfully labeled. Child count is never blank; customer budget is never
// conflated with system pricing.
export function buildCanonicalNotificationPayload(lead: CanonicalPlanMyPartyLead): Record<string, unknown> {
  return {
    lead_id: lead.leadId,
    source: 'plan-my-party',
    source_endpoint: lead.endpoint,
    source_page: lead.sourcePage,
    landing_page: lead.landingPage,
    source_path: lead.sourcePath,
    referrer: lead.referrer,
    created_at: lead.createdAt,

    // Contact
    first_name: lead.firstName,
    last_name: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    preferred_contact_method: lead.preferredContactMethod,
    preferred_contact_method_label: CONTACT_METHOD_LABEL[lead.preferredContactMethod],

    // Event basics
    event_type: lead.eventType,
    event_date: lead.eventDate,
    preferred_start_time: lead.startTime,
    estimated_service_end_time: lead.computedEndTime,
    event_city: lead.eventCity,
    event_venue_or_address: lead.venueOrAddress,

    // Services + design
    services_requested: lead.services,
    design_style: lead.designStyle,

    // Children — never blank
    child_range: lead.childCountBucket,
    exact_child_count: lead.childCountActual !== null ? lead.childCountActual : 'Not provided',
    child_count_confidence: lead.childCountConfidence,
    child_count_confidence_label: CHILD_CONFIDENCE_LABEL[lead.childCountConfidence],

    // Duration / service window
    duration_minutes: lead.durationMinutes,
    selected_duration_minutes: lead.selectedDurationMinutes,
    recommended_duration_minutes: lead.recommendedDurationMinutes,
    duration_source: lead.durationSource,
    duration_source_label: DURATION_SOURCE_LABEL[lead.durationSource],
    service_window_minutes: lead.serviceWindowMinutes,
    required_artist_count: lead.requiredArtistCount,

    // Travel — never blank
    travel_miles: lead.travelMiles,
    travel_source: lead.travelSource,
    travel_zone: lead.travelZone,
    travel_fee_estimate_cents: lead.travelFeeCents,
    travel_note: lead.travelNote,

    // Quote / recommendation
    quote_classification: lead.quoteClassification,
    recommendation_summary: lead.recommendationSummary,

    // Budget vs system pricing — strictly separate
    customer_budget_provided: lead.customerBudgetProvided,
    customer_budget_amount_cents: lead.customerBudgetAmountCents,
    customer_budget_label: lead.customerBudgetLabel,
    budget_display_label: lead.budgetDisplayLabel,
    system_estimated_total_cents: lead.systemEstimatedTotalCents,
    system_retainer_cents: lead.systemRetainerCents,
    pricing_source: lead.pricingSource,
    pricing_confidence: lead.pricingConfidence,

    // Manual review
    manual_review_reasons: lead.manualReviewReasons,
    manual_review_required: lead.manualReviewReasons.length > 0,

    // Notes + attribution
    notes: lead.notes,
    utm_source: lead.utmSource,
    utm_medium: lead.utmMedium,
    utm_campaign: lead.utmCampaign,
    utm_term: lead.utmTerm,
    utm_content: lead.utmContent,
    source_confidence: lead.sourceConfidence,
    attribution_summary: lead.attributionSummary,
    gclid_present: lead.gclid ? 'yes' : 'no',
    gbraid_present: lead.gbraid ? 'yes' : 'no',
    wbraid_present: lead.wbraid ? 'yes' : 'no',
    google_click_id_present: lead.gclid || lead.gbraid || lead.wbraid ? 'yes' : 'no',
    // Do not expose full Google click IDs in broad owner notifications.
    gclid: lead.gclid ? '[present]' : null,
    gbraid: lead.gbraid ? '[present]' : null,
    wbraid: lead.wbraid ? '[present]' : null,
    fbclid: lead.fbclid ? '[present]' : null,
    msclkid: lead.msclkid ? '[present]' : null,
    qualified_status: lead.qualifiedStatus,
    quote_sent_status: lead.quoteSentStatus,
    booked_status: lead.bookedStatus,
    booked_revenue_cents: lead.bookedRevenueCents,
    lost_reason: lead.lostReason,
    duplicate_of_lead_id: lead.duplicateOfLeadId,
    owner_review_notes: lead.ownerReviewNotes,
    is_internal_test: lead.isInternalTest,
    internal_test_reason: lead.internalTestReason,
  };
}

// The canonical critical-field set Gmail / Google Sheets must include. Used by the
// contract tests to prove completeness.
export const CANONICAL_REQUIRED_NOTIFICATION_KEYS: readonly string[] = [
  'lead_id', 'source_endpoint', 'source_page', 'created_at',
  'first_name', 'last_name', 'email', 'phone', 'preferred_contact_method',
  'event_type', 'event_date', 'preferred_start_time', 'estimated_service_end_time', 'event_city', 'event_venue_or_address',
  'services_requested', 'design_style',
  'child_range', 'exact_child_count', 'child_count_confidence',
  'duration_minutes', 'duration_source', 'service_window_minutes', 'required_artist_count',
  'travel_miles', 'travel_source', 'travel_zone', 'travel_fee_estimate_cents', 'travel_note',
  'quote_classification', 'recommendation_summary',
  'customer_budget_provided', 'customer_budget_label', 'budget_display_label',
  'system_estimated_total_cents', 'system_retainer_cents', 'pricing_source',
  'manual_review_reasons',
  'utm_source', 'utm_medium', 'utm_campaign',
  'source_confidence', 'attribution_summary',
  'gclid_present', 'gbraid_present', 'wbraid_present',
  'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid',
];
