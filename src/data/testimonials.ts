export type TestimonialItem = {
  firstName: string;
  cityOrArea: string;
  eventType: string;
  quote: string;
  dateLabel?: string;
  /** e.g. "Google Review", "Direct feedback", "Instagram DM" */
  source?: string;
  /**
   * Must be true before publishing. Owner must have explicit customer permission
   * to use the customer's name and quote on the website.
   */
  permissionConfirmed: boolean;
};

// ---------------------------------------------------------------------------
// REAL TESTIMONIALS — leave empty until owner provides verified customer
// quotes with explicit permission to publish.
//
// Minimum target:
//   3 × birthday party
//   1 × school/carnival/festival
//   1 × corporate/family event
//   1 × repeat/general customer
//
// Each entry needs: firstName, cityOrArea, eventType, quote, permissionConfirmed: true
// ---------------------------------------------------------------------------
export const testimonials: TestimonialItem[] = [];
