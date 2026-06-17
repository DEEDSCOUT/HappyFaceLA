// src/lib/quote-request/canonical-lead.ts
// PUBLIC-BOOKING POST-DEPLOY P1 — Canonical Plan My Party lead model.
//
// One canonical lead shape for the Plan My Party wizard and any internal adapters:
//   - /api/quote-request (rich wizard) -> buildCanonicalLead from the sanitized wizard payload
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

export interface CanonicalLeadInput {
  endpoint: LeadEndpoint;
  leadId: string;
  createdAt: string;
  sourcePage: string | null;
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
  fbclid: string | null;
  msclkid: string | null;
  consentAcknowledgement: boolean;
}

export interface CanonicalPlanMyPartyLead {
  leadId: string;
  endpoint: LeadEndpoint;
  createdAt: string;
  sourcePage: string | null;
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
  fbclid: string | null;
  msclkid: string | null;
  consentAcknowledgement: boolean;
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

export function buildCanonicalLead(input: CanonicalLeadInput): CanonicalPlanMyPartyLead {
  const child = deriveChildCount(input.childCountBucket, input.childCountActual);
  const duration = deriveDuration(input.selectedDurationMinutes, input.recommendedDurationMinutes);
  const computedEndTime = computeServiceEndTime(input.startTime, duration.durationMinutes);
  const travel = deriveTravel(input.travelMiles, input.hasExactAddress, Boolean(input.eventCity));
  const budget = parseCustomerBudget(input.customerBudgetRaw);

  const manualReviewReasons: string[] = [];
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
    fbclid: input.fbclid,
    msclkid: input.msclkid,
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
    gclid: lead.gclid,
    fbclid: lead.fbclid,
    msclkid: lead.msclkid,
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
  'utm_source', 'utm_medium', 'utm_campaign', 'gclid', 'fbclid', 'msclkid',
];
