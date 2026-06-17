import type { KidsCountBucket, DesignStyle } from './types.ts';

export const CAPACITY_GUIDANCE: Record<KidsCountBucket, string> = {
  '1-10':
    'Great for a smaller, intimate party. A 1-hour booking is usually enough for simple or standard designs — ' +
    'plenty of time for every child to get a great experience.',
  '11-18':
    'A medium-sized group. We typically recommend 1.5 hours so every child gets a quality design ' +
    'without feeling rushed. 1 hour works for quick designs only.',
  '19-25':
    'A lively party size! 2 hours gives everyone a quality experience. ' +
    'We can also discuss a fast-design menu if your time window is tighter.',
  '26-40':
    'This is a bigger group — 2 or more hours, or a fast event menu, helps keep the line moving ' +
    'and every child happy. We may recommend a set fast-design menu for this size.',
  '40-plus':
    "Large-event territory! We'll build a custom entertainment plan — possibly with a second artist — " +
    "so no child waits too long. Request your plan and we'll be in touch.",
  'not-sure':
    "No problem — give us your best estimate and we'll make sure the plan fits. " +
    "We'll confirm the final details when we follow up.",
};

export const SPEED_GUIDANCE: Record<DesignStyle, string> = {
  'quick-cheek-arm':
    'Quick designs let us serve the most kids per hour — great for tight schedules or larger groups.',
  'standard-party':
    'The most popular choice — a great mix of variety and speed. Most families with your group size love this.',
  'full-face':
    'Stunning results, but each design takes more time. Best for smaller groups or when your time window is generous.',
  'fast-event-menu':
    'A set menu of fan-favorite designs — great for events where the line needs to keep moving.',
  'not-sure':
    "We'll recommend the best style for your group size and party window.",
};

export const KIDS_LABELS: Record<KidsCountBucket, string> = {
  '1-10': '1–10 children',
  '11-18': '11–18 children',
  '19-25': '19–25 children',
  '26-40': '26–40 children',
  '40-plus': 'more than 40 children',
  'not-sure': 'your group',
};

export const DESIGN_LABELS: Record<DesignStyle, string> = {
  'quick-cheek-arm': 'quick cheek or arm designs',
  'standard-party': 'standard party designs',
  'full-face': 'wow or full-face designs',
  'fast-event-menu': 'fast event menu',
  'not-sure': 'recommended designs',
};
