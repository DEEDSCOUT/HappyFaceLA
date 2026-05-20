export type TestimonialItem = {
  firstName: string;
  cityOrArea: string;
  eventType: string;
  quote: string;
  dateLabel?: string;
  /** e.g. "Google Review", "Direct feedback", "Instagram DM" */
  source?: string;
  /** Optional public link to the original review (e.g. Google Business Profile URL). */
  sourceUrl?: string;
  /**
   * Must be true before publishing. Owner must have explicit customer permission
   * to use the customer's name and quote on the website. See
   * docs/reviews/collection-flow.md for the required intake/consent procedure.
   */
  permissionConfirmed: boolean;
  /** ISO date (YYYY-MM-DD) the customer granted publishing permission. */
  permissionGrantedOn?: string;
  /** How permission was captured (e.g. "SMS reply", "Email reply", "Google review (public)"). */
  consentMethod?: string;
};

// ---------------------------------------------------------------------------
// REAL TESTIMONIALS — leave empty until owner provides verified customer
// quotes with explicit permission to publish.
//
// Intake procedure: docs/reviews/collection-flow.md
//
// Each entry MUST have:
//   - firstName, cityOrArea, eventType, quote
//   - permissionConfirmed: true
//   - permissionGrantedOn (YYYY-MM-DD)
//   - consentMethod
//
// DO NOT add fabricated, AI-generated, or unverified reviews. Publishing fake
// testimonials violates FTC 16 CFR Part 465 (up to ~$51,744 per violation) and
// Google Ads misrepresentation policy (account suspension risk).
// ---------------------------------------------------------------------------
export const testimonials: TestimonialItem[] = [];

/** Returns only testimonials approved for public display. */
export function getPublishableTestimonials(): TestimonialItem[] {
  return testimonials.filter((t) => t.permissionConfirmed === true);
}

