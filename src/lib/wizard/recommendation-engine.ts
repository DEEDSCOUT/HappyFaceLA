import type {
  WizardAnswers,
  WizardRecommendation,
  KidsCountBucket,
  DesignStyle,
  DurationOption,
} from './types.ts';
import { CAPACITY_GUIDANCE, SPEED_GUIDANCE, KIDS_LABELS, DESIGN_LABELS } from './capacity-guidance.ts';

// Duration recommendation matrix: kidsCountBucket × designStyle → minutes or 'custom'
// null inputs handled separately before lookup
const DURATION_MATRIX: Record<KidsCountBucket, Record<DesignStyle, DurationOption>> = {
  '1-10': {
    'quick-cheek-arm': 60,
    'standard-party':  60,
    'full-face':       90,
    'fast-event-menu': 60,
    'not-sure':        60,
  },
  '11-18': {
    'quick-cheek-arm': 60,
    'standard-party':  90,
    'full-face':       120,
    'fast-event-menu': 60,
    'not-sure':        90,
  },
  '19-25': {
    'quick-cheek-arm': 90,
    'standard-party':  120,
    'full-face':       120,
    'fast-event-menu': 90,
    'not-sure':        120,
  },
  '26-40': {
    'quick-cheek-arm': 120,
    'standard-party':  120,
    'full-face':       'custom',
    'fast-event-menu': 120,
    'not-sure':        120,
  },
  '40-plus': {
    'quick-cheek-arm': 'custom',
    'standard-party':  'custom',
    'full-face':       'custom',
    'fast-event-menu': 'custom',
    'not-sure':        'custom',
  },
  'not-sure': {
    'quick-cheek-arm': 90,
    'standard-party':  90,
    'full-face':       120,
    'fast-event-menu': 90,
    'not-sure':        90,
  },
};

export function formatDurationLabel(duration: DurationOption): string {
  if (duration === 60) return '1 hour';
  if (duration === 90) return '1.5 hours';
  if (duration === 120) return '2 hours';
  if (duration === 180) return '3 hours';
  if (duration === 240) return '4 hours';
  if (duration === 'custom') return 'Custom plan';
  return 'Not selected';
}

// Duration comparison: returns true if a < b in the ordering 60 < 90 < 120 < 180 < 240 < 'custom'
function durationLessThan(a: DurationOption, b: DurationOption): boolean {
  if (a === null || b === null) return false;
  const order: DurationOption[] = [60, 90, 120, 180, 240, 'custom'];
  return order.indexOf(a) < order.indexOf(b);
}

export function getRecommendedDuration(
  kidsCount: KidsCountBucket | null,
  designStyle: DesignStyle | null,
): DurationOption {
  if (!kidsCount || !designStyle) return null;
  // Treat 'not-sure' services as 'standard-party' for design style lookup
  const style: DesignStyle = designStyle;
  return DURATION_MATRIX[kidsCount][style];
}

export function isCustomQuotePath(answers: WizardAnswers): { isCustom: boolean; reason: string | null } {
  const { eventType, services, kidsCountBucket, designStyle } = answers;

  if (kidsCountBucket === '40-plus') {
    return { isCustom: true, reason: 'large-event' };
  }
  if (
    eventType === 'school-event' ||
    eventType === 'corporate-family-day' ||
    eventType === 'festival-community'
  ) {
    return { isCustom: true, reason: 'institutional-event' };
  }
  if (services.includes('combo')) {
    return { isCustom: true, reason: 'combo-service' };
  }
  if (services.length > 1 && !services.includes('not-sure')) {
    return { isCustom: true, reason: 'multiple-services' };
  }
  if (
    designStyle === 'full-face' &&
    kidsCountBucket === '26-40'
  ) {
    return { isCustom: true, reason: 'full-face-large-group' };
  }

  return { isCustom: false, reason: null };
}

export function getConflictWarning(
  selected: DurationOption,
  recommended: DurationOption,
  kidsLabel: string,
  selectedLabel: string,
  recommendedLabel: string,
): string | null {
  if (!selected || !recommended) return null;
  if (recommended === 'custom') return null; // custom is always sufficient
  if (!durationLessThan(selected, recommended)) return null;
  return (
    `For ${kidsLabel}, ${selectedLabel} may feel rushed — every child deserves their moment! ` +
    `We recommend at least ${recommendedLabel} for the best experience.`
  );
}

function buildSellingCopy(answers: WizardAnswers, recommendedDuration: DurationOption): string {
  const { kidsCountBucket } = answers;
  const dLabel = formatDurationLabel(recommendedDuration);

  if (kidsCountBucket === '1-10') {
    return "A cozy party size — we can take our time and make each design special. Every child gets a moment to shine.";
  }
  if (kidsCountBucket === '11-18') {
    return `A lively group! ${dLabel} gives every child a quality design without the line feeling endless. Most families with this group size love this option.`;
  }
  if (kidsCountBucket === '19-25') {
    return `For 19–25 children, ${dLabel} is our sweet spot — enough time for beautiful designs and happy kids. Most parents with a similar group choose this option and love the results.`;
  }
  if (kidsCountBucket === '26-40') {
    return `A bigger group needs a bigger plan — ${dLabel} keeps the line moving and every child smiling. Want shorter lines? A fast event menu can serve more kids in the same window.`;
  }
  return `${dLabel} is the right choice for your group. We'll confirm the final details when we send your official quote.`;
}

function buildCustomCopy(reason: string | null): string {
  if (reason === 'large-event') {
    return "Wow, what a party! For events with more than 40 children, we build a custom entertainment plan — possibly with a second artist — so no child waits too long. Our team will reach out with a tailored plan.";
  }
  if (reason === 'institutional-event') {
    return "School, corporate, and festival events deserve a custom plan. We'll review your details and put together something that fits your event perfectly.";
  }
  if (reason === 'combo-service' || reason === 'multiple-services') {
    return "Multi-service events need a little more planning to make sure everything runs smoothly. Our team will confirm the best combination and timing for your event.";
  }
  if (reason === 'full-face-large-group') {
    return "Detailed full-face designs for a larger group need a custom schedule to give every child the wow experience. We'll plan the perfect timeline for you.";
  }
  return "This looks like a special event — our team will review your details and build a plan that fits perfectly.";
}

export function computeRecommendation(answers: WizardAnswers): WizardRecommendation {
  const { isCustom, reason } = isCustomQuotePath(answers);
  const recommendedDuration = getRecommendedDuration(answers.kidsCountBucket, answers.designStyle);
  const recommendedLabel = formatDurationLabel(recommendedDuration);
  const selectedLabel = formatDurationLabel(answers.selectedDurationOption);
  const kidsLabel = answers.kidsCountBucket ? KIDS_LABELS[answers.kidsCountBucket] : 'your group';

  const conflictWarning = isCustom
    ? null
    : getConflictWarning(
        answers.selectedDurationOption,
        recommendedDuration,
        kidsLabel,
        selectedLabel,
        recommendedLabel,
      );

  return {
    recommendedDuration,
    recommendedDurationLabel: recommendedLabel,
    branch: isCustom ? 'custom-quote' : 'fast-quote',
    sellingCopy: isCustom ? '' : buildSellingCopy(answers, recommendedDuration),
    conflictWarning,
    customQuoteTrigger: reason, // stored in state only — never rendered to customer UI
    customQuoteCopy: isCustom ? buildCustomCopy(reason) : null,
  };
}

// Re-export for convenience
export { CAPACITY_GUIDANCE, SPEED_GUIDANCE, KIDS_LABELS, DESIGN_LABELS };
