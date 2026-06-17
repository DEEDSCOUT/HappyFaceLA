type EligibilityStatus = 'instant-book' | 'custom-review' | string;

export type QuoteClassification =
  | 'instant-quote-eligible'
  | 'unavailable-no-checkout'
  | 'manual-approval-required'
  | 'custom-quote-required';

export type QuoteClassificationInput = {
  eligibilityStatus: EligibilityStatus;
  reasons?: string[];
  travelMiles?: number | null;
  availabilityConfirmed?: boolean;
  conditionalHoldAvailable?: boolean;
  customPlanReason?: string | null;
};

const CUSTOM_REVIEW_REASONS = new Set([
  'combo-service',
  'multiple-services',
  'large-event',
  'full-face-large-group',
  'exceeds-max-artists',
  'exceeds-max-duration',
  'exceeds-max-kids',
  'exceeds-max-travel',
  'institutional-event',
  'event-type-not-supported',
  'service-not-supported-for-instant-book',
  'pricing-requires-manual-approval',
]);

export const CLASSIFICATION_LABELS: Record<QuoteClassification, string> = {
  'instant-quote-eligible': 'Availability Hold available',
  'unavailable-no-checkout': 'Availability check needed',
  'manual-approval-required': 'Manual review needed',
  'custom-quote-required': 'Custom plan needed',
};

export const CUSTOM_PLAN_COPY =
  'No payment is due yet. We will review your party details, confirm availability, and follow up with next steps.';

export function classifyQuoteOutcome(input: QuoteClassificationInput): QuoteClassification {
  if (input.eligibilityStatus === 'instant-book') {
    return input.availabilityConfirmed || input.conditionalHoldAvailable
      ? 'instant-quote-eligible'
      : 'unavailable-no-checkout';
  }

  const reasons = input.reasons ?? [];
  const hasCustomReason = Boolean(input.customPlanReason) ||
    reasons.some((reason) => CUSTOM_REVIEW_REASONS.has(reason));

  if (hasCustomReason || (typeof input.travelMiles === 'number' && input.travelMiles > 40)) {
    return 'custom-quote-required';
  }

  return 'manual-approval-required';
}
