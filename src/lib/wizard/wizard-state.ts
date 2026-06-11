import type { WizardState, WizardAnswers } from './types.ts';

export function createInitialState(): WizardState {
  return {
    currentStep: 1,
    answers: {
      eventType: null,
      services: [],
      kidsCountBucket: null,
      designStyle: null,
      selectedDurationOption: null,
      eventDate: null,
      eventTime: null,
      eventCity: '',
      venueName: '',
      specialRequests: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
    },
    recommendation: null,
    isSubmitting: false,
    isSubmitted: false,
    submitError: null,
  };
}

export function updateAnswer<K extends keyof WizardAnswers>(
  state: WizardState,
  key: K,
  value: WizardAnswers[K],
): WizardState {
  return {
    ...state,
    answers: { ...state.answers, [key]: value },
  };
}
