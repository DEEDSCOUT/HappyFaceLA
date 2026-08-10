import type { AttributionJourney } from '../attribution/atomic-attribution.ts';

export type BrowserAttributionSubmission = {
  attribution: AttributionJourney;
  compatibility: Record<string, string | null>;
};

function value(formData: FormData, name: string): string {
  return String(formData.get(name) || '').trim();
}

function values(formData: FormData, name: string): string[] {
  return formData.getAll(name).map((item) => String(item).trim()).filter(Boolean);
}

export function buildContactBrowserPayload(input: {
  formData: FormData;
  submissionId: string;
  submission: BrowserAttributionSubmission;
  presentFieldNames?: ReadonlySet<string>;
}): Record<string, unknown> {
  const { formData, submission } = input;
  const payload: Record<string, unknown> = {
    submission_id: input.submissionId,
    form_route: 'contact',
    attribution: submission.attribution,
    first_name: value(formData, 'first_name'),
    last_name: value(formData, 'last_name'),
    phone: value(formData, 'phone'),
    email: value(formData, 'email'),
    event_date: value(formData, 'event_date'),
    event_start_time: value(formData, 'event_start_time'),
    event_city: value(formData, 'event_city'),
    event_address_or_cross_streets_optional: value(formData, 'event_address_or_cross_streets_optional'),
    event_type: value(formData, 'event_type'),
    estimated_guest_count: value(formData, 'estimated_guest_count'),
    children_count_optional: value(formData, 'children_count_optional'),
    services_requested: values(formData, 'services_requested[]'),
    budget_range: value(formData, 'budget_range'),
    message: value(formData, 'message'),
    source_page: value(formData, 'source_page'),
    consent_to_contact: Boolean(formData.get('consent_to_contact')),
    honeypot: value(formData, 'honeypot'),
    ...submission.compatibility,
  };

  const optionalNames = [
    'lead_source',
    'campaign',
    'organization_venue_name',
    'package_interest',
    'painting_window',
    'venue_permission_confirmed',
    'need_invoice_coi',
  ];
  for (const name of optionalNames) {
    if (!input.presentFieldNames || input.presentFieldNames.has(name)) payload[name] = value(formData, name);
  }
  if (!input.presentFieldNames || input.presentFieldNames.has('selected_package')) {
    payload.selected_package = value(formData, 'selected_package') || value(formData, 'package_interest');
  }
  return payload;
}

export function splitCustomerName(parentName: string): { first_name: string; last_name: string } {
  const parts = parentName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: '', last_name: '' };
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts.slice(0, -1).join(' '), last_name: parts.at(-1) || '' };
}

export function buildPackagesBrowserPayload(input: {
  formData: FormData;
  submissionId: string;
  submission: BrowserAttributionSubmission;
}): Record<string, unknown> {
  const { formData, submission } = input;
  const names = splitCustomerName(value(formData, 'parent_name'));
  const selectedService = value(formData, 'services_primary');
  const kids = value(formData, 'estimated_kids');
  const notes = value(formData, 'message');
  const message = [
    selectedService ? `Services wanted: ${selectedService}` : '',
    notes ? `Party theme / notes: ${notes}` : '',
  ].filter(Boolean).join('\n\n');

  return {
    submission_id: input.submissionId,
    form_route: 'packages',
    attribution: submission.attribution,
    first_name: names.first_name,
    last_name: names.last_name,
    phone: value(formData, 'phone'),
    email: value(formData, 'email'),
    event_date: value(formData, 'event_date'),
    event_start_time: value(formData, 'event_start_time'),
    event_city: value(formData, 'event_city'),
    event_type: value(formData, 'event_type'),
    estimated_guest_count: kids,
    children_count_optional: kids,
    services_requested: selectedService ? [selectedService] : [],
    budget_range: '',
    message,
    source_page: value(formData, 'source_page'),
    lead_source: value(formData, 'lead_source'),
    consent_to_contact: Boolean(formData.get('consent_to_contact')),
    honeypot: value(formData, 'honeypot'),
    ...submission.compatibility,
  };
}

type PlanAnswers = {
  eventType?: string | null;
  services: string[];
  kidsCountBucket?: string | null;
  kidsCountActual?: number | null;
  designStyle?: string | null;
  selectedDurationOption?: number | string | null;
  eventDate?: string | null;
  eventTime?: string | null;
  eventCity?: string | null;
  venueName?: string | null;
  travelMiles?: number | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  specialRequests?: string | null;
  lookbookService?: string | null;
  lookbookDesignStyle?: string | null;
  publicLookSlug?: string | null;
  publicLookTitle?: string | null;
  lookbookCategory?: string | null;
  inspirationImageId?: string | null;
  lookbookInspirations: Array<{
    publicLookSlug: string;
    publicTitle: string;
    service: string;
    designStyle: string;
    category?: string | null;
  }>;
};

export function buildPlanMyPartyBrowserPayload(input: {
  answers: PlanAnswers;
  recommendation: { recommendedDuration?: number | string | null; branch?: string | null };
  currentClassification: string | null;
  submissionId: string;
  sourcePage: string;
  submittedAt: string;
  preferredContactMethod: string;
  wizardVersion?: string;
  submission: BrowserAttributionSubmission;
}): Record<string, unknown> {
  const { answers, recommendation, submission } = input;
  return {
    eventType: answers.eventType ?? '',
    services: answers.services,
    kidsCountBucket: answers.kidsCountBucket ?? '',
    kidsCountActual: answers.kidsCountActual ?? null,
    designStyle: answers.designStyle ?? '',
    selectedDurationMinutes: answers.selectedDurationOption ?? null,
    recommendedDurationMinutes: recommendation.recommendedDuration ?? null,
    branch: recommendation.branch ?? 'custom-quote',
    eventDate: answers.eventDate ?? null,
    eventTime: answers.eventTime ?? null,
    eventCity: answers.eventCity ?? '',
    venueName: answers.venueName || null,
    travelMiles: answers.travelMiles ?? null,
    firstName: answers.firstName ?? '',
    lastName: answers.lastName ?? '',
    email: answers.email ?? '',
    phone: answers.phone || null,
    specialRequests: answers.specialRequests || null,
    service: answers.lookbookService || null,
    design_style: answers.lookbookDesignStyle || null,
    public_look_slug: answers.publicLookSlug || null,
    public_look_title: answers.publicLookTitle || null,
    category: answers.lookbookCategory || null,
    inspiration_image_id: answers.inspirationImageId || null,
    quoteOutcome: input.currentClassification,
    submission_id: input.submissionId,
    form_route: 'plan-my-party',
    consentAcknowledgement: true,
    lookbook_inspirations: answers.lookbookInspirations.map((item) => ({
      public_look_slug: item.publicLookSlug,
      public_look_title: item.publicTitle,
      service: item.service,
      design_style: item.designStyle,
      category: item.category || null,
    })),
    wizardVersion: input.wizardVersion || 'guided-wizard-v1',
    submittedAt: input.submittedAt,
    preferredContactMethod: input.preferredContactMethod,
    source_page: input.sourcePage,
    attribution: submission.attribution,
    ...submission.compatibility,
  };
}
