export type EventType =
  | 'birthday-party'
  | 'school-event'
  | 'corporate-family-day'
  | 'festival-community'
  | 'other';

export type Service =
  | 'face-painting'
  | 'balloon-twisting'
  | 'glitter-tattoos'
  | 'face-gems'
  | 'combo'
  | 'not-sure';

export type KidsCountBucket =
  | '1-10'
  | '11-18'
  | '19-25'
  | '26-40'
  | '40-plus'
  | 'not-sure';

export type DesignStyle =
  | 'quick-cheek-arm'
  | 'standard-party'
  | 'full-face'
  | 'fast-event-menu'
  | 'not-sure';

// DurationOption: minutes as number, 'custom' for custom plan, null for not yet selected
export type DurationOption = 60 | 90 | 120 | 180 | 240 | 'custom' | null;

export type WizardBranch = 'fast-quote' | 'custom-quote';

export interface WizardAnswers {
  eventType: EventType | null;
  services: Service[];
  kidsCountBucket: KidsCountBucket | null;
  kidsCountActual?: number | null;
  designStyle: DesignStyle | null;
  selectedDurationOption: DurationOption;
  eventDate: string | null;
  eventTime: string | null;
  eventCity: string;
  venueName: string;
  specialRequests: string;
  travelMiles?: number | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface WizardRecommendation {
  recommendedDuration: DurationOption;
  recommendedDurationLabel: string;
  branch: WizardBranch;
  sellingCopy: string;
  conflictWarning: string | null;
  // customQuoteTrigger is internal only — never rendered to the customer UI
  customQuoteTrigger: string | null;
  customQuoteCopy: string | null;
}

export interface WizardState {
  currentStep: number;
  answers: WizardAnswers;
  recommendation: WizardRecommendation | null;
  isSubmitting: boolean;
  isSubmitted: boolean;
  submitError: string | null;
}

export interface QuoteRequestPayload {
  eventType: string;
  services: string[];
  kidsCountBucket: string;
  designStyle: string;
  selectedDurationMinutes: number | 'custom' | null;
  recommendedDurationMinutes: number | 'custom' | null;
  branch: WizardBranch;
  eventDate: string | null;
  eventTime: string | null;
  eventCity: string;
  venueName: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  specialRequests: string | null;
  service?: string | null;
  design_style?: string | null;
  public_look_slug?: string | null;
  public_look_title?: string | null;
  category?: string | null;
  inspiration_image_id?: string | null;
  lookbook_inspirations?: Array<{
    public_look_slug: string | null;
    public_look_title: string | null;
    service: string | null;
    design_style: string | null;
    category?: string | null;
  }>;
  wizardVersion: string;
  submittedAt: string;
}

export interface QuoteRequestResponse {
  ok: boolean;
  message: string;
}
