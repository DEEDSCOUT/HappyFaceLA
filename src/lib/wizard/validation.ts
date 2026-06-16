import type { WizardAnswers } from './types.ts';

export interface StepValidation {
  valid: boolean;
  errors: string[];
}

export function validateStep(step: number, answers: WizardAnswers): StepValidation {
  switch (step) {
    case 1:
      return answers.eventType !== null
        ? { valid: true, errors: [] }
        : { valid: false, errors: ['Please select your event type.'] };

    case 2:
      return answers.services.length > 0
        ? { valid: true, errors: [] }
        : { valid: false, errors: ['Please select at least one service.'] };

    case 3: {
      if (answers.kidsCountBucket === null) {
        return { valid: false, errors: ['Please select the number of participating children.'] };
      }
      const actual = answers.kidsCountActual;
      if (actual !== null && actual !== undefined) {
        // Exact/estimated count entered — whole number, 1–200.
        if (!Number.isInteger(actual) || actual < 1 || actual > 200) {
          return { valid: false, errors: ['Please enter a whole number of children between 1 and 200.'] };
        }
      } else if (answers.kidsCountBucket !== 'not-sure') {
        // Numeric ranges must include an exact or best-estimate count. The
        // separate "not sure" option is the explicit needs-confirmation path.
        return { valid: false, errors: ['Please enter the exact child count or your best estimate, or choose Not sure yet.'] };
      }
      return { valid: true, errors: [] };
    }

    case 4:
      return answers.designStyle !== null
        ? { valid: true, errors: [] }
        : { valid: false, errors: ['Please select a design style.'] };

    case 5:
      return answers.selectedDurationOption !== null
        ? { valid: true, errors: [] }
        : { valid: false, errors: ['Please select your service window.'] };

    case 6: {
      const errors: string[] = [];
      if (!answers.eventDate) errors.push('Please enter your preferred event date.');
      if (!answers.eventTime) errors.push('Please enter your preferred start time.');
      if (!answers.eventCity.trim()) errors.push('Please enter your event city or neighborhood.');
      return { valid: errors.length === 0, errors };
    }

    case 7:
      return { valid: true, errors: [] }; // recommendation screen — no input required

    case 8: {
      const errors: string[] = [];
      if (!answers.firstName.trim()) errors.push('First name is required.');
      if (!answers.lastName.trim()) errors.push('Last name is required.');
      if (!answers.email.trim()) errors.push('Email address is required.');
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.email))
        errors.push('Please enter a valid email address.');
      return { valid: errors.length === 0, errors };
    }

    default:
      return { valid: true, errors: [] };
  }
}

export function isDateInPast(dateStr: string): boolean {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = new Date(dateStr + 'T00:00:00');
  return selected < today;
}
