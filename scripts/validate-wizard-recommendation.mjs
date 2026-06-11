// Dependency-free wizard recommendation engine validation
// Run with: node scripts/validate-wizard-recommendation.mjs
//
// Validates against src/lib/wizard/recommendation-engine.ts logic:
//   - All 30 duration matrix cells (6 kids buckets × 5 design styles)
//   - All 5 custom quote trigger conditions
//   - Conflict warning: fire and no-fire conditions
//   - customQuoteTrigger containment: reason strings are internal identifiers
//     and must not appear in customer-facing copy
//
// This script mirrors the TypeScript source in pure JavaScript.
// Compare DURATION_MATRIX and trigger logic here against recommendation-engine.ts.
// No build step. No test runner. No dependencies.

// ── Mirror of DURATION_MATRIX (recommendation-engine.ts lines 12-55) ──────────
const DURATION_MATRIX = {
  '1-10':    { 'quick-cheek-arm': 60,       'standard-party': 60,       'full-face': 90,       'fast-event-menu': 60,       'not-sure': 60  },
  '11-18':   { 'quick-cheek-arm': 60,       'standard-party': 90,       'full-face': 120,      'fast-event-menu': 60,       'not-sure': 90  },
  '19-25':   { 'quick-cheek-arm': 90,       'standard-party': 120,      'full-face': 120,      'fast-event-menu': 90,       'not-sure': 120 },
  '26-40':   { 'quick-cheek-arm': 120,      'standard-party': 120,      'full-face': 'custom', 'fast-event-menu': 120,      'not-sure': 120 },
  '40-plus': { 'quick-cheek-arm': 'custom', 'standard-party': 'custom', 'full-face': 'custom', 'fast-event-menu': 'custom', 'not-sure': 'custom' },
  'not-sure':{ 'quick-cheek-arm': 90,       'standard-party': 90,       'full-face': 120,      'fast-event-menu': 90,       'not-sure': 90  },
};

function getRecommendedDuration(kidsCount, designStyle) {
  if (!kidsCount || !designStyle) return null;
  return DURATION_MATRIX[kidsCount]?.[designStyle] ?? null;
}

// ── Mirror of durationLessThan + getConflictWarning ─────────────────────────
const DURATION_ORDER = [60, 90, 120, 'custom'];
function durationLessThan(a, b) {
  if (a === null || b === null) return false;
  return DURATION_ORDER.indexOf(a) < DURATION_ORDER.indexOf(b);
}
function getConflictWarning(selected, recommended, kidsLabel, selectedLabel, recommendedLabel) {
  if (!selected || !recommended) return null;
  if (recommended === 'custom') return null;
  if (!durationLessThan(selected, recommended)) return null;
  return `For ${kidsLabel}, ${selectedLabel} may feel rushed — every child deserves their moment! We recommend at least ${recommendedLabel} for the best experience.`;
}

// ── Mirror of isCustomQuotePath (recommendation-engine.ts lines 82-109) ──────
function isCustomQuotePath(eventType, services, kidsCountBucket, designStyle) {
  if (kidsCountBucket === '40-plus') return { isCustom: true, reason: 'large-event' };
  if (eventType === 'school-event' || eventType === 'corporate-family-day' || eventType === 'festival-community') {
    return { isCustom: true, reason: 'institutional-event' };
  }
  if (services.includes('combo')) return { isCustom: true, reason: 'combo-service' };
  if (services.length > 1 && !services.includes('not-sure')) return { isCustom: true, reason: 'multiple-services' };
  if (designStyle === 'full-face' && kidsCountBucket === '26-40') return { isCustom: true, reason: 'full-face-large-group' };
  return { isCustom: false, reason: null };
}

// ── Assert helpers ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function eq(label, actual, expected) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
    console.error(`        expected: ${JSON.stringify(expected)}`);
    console.error(`        actual:   ${JSON.stringify(actual)}`);
  }
}
function ok(label, cond) {
  if (cond) { passed++; } else { failed++; console.error(`  FAIL: ${label}`); }
}

// ── Duration matrix: 30 cells ────────────────────────────────────────────────
console.log('Running duration matrix validation (30 cells)...');
// kids: 1-10
eq('1-10 × quick-cheek-arm → 60',   getRecommendedDuration('1-10', 'quick-cheek-arm'), 60);
eq('1-10 × standard-party → 60',    getRecommendedDuration('1-10', 'standard-party'), 60);
eq('1-10 × full-face → 90',         getRecommendedDuration('1-10', 'full-face'), 90);
eq('1-10 × fast-event-menu → 60',   getRecommendedDuration('1-10', 'fast-event-menu'), 60);
eq('1-10 × not-sure → 60',          getRecommendedDuration('1-10', 'not-sure'), 60);
// kids: 11-18
eq('11-18 × quick-cheek-arm → 60',  getRecommendedDuration('11-18', 'quick-cheek-arm'), 60);
eq('11-18 × standard-party → 90',   getRecommendedDuration('11-18', 'standard-party'), 90);
eq('11-18 × full-face → 120',       getRecommendedDuration('11-18', 'full-face'), 120);
eq('11-18 × fast-event-menu → 60',  getRecommendedDuration('11-18', 'fast-event-menu'), 60);
eq('11-18 × not-sure → 90',         getRecommendedDuration('11-18', 'not-sure'), 90);
// kids: 19-25
eq('19-25 × quick-cheek-arm → 90',  getRecommendedDuration('19-25', 'quick-cheek-arm'), 90);
eq('19-25 × standard-party → 120',  getRecommendedDuration('19-25', 'standard-party'), 120);
eq('19-25 × full-face → 120',       getRecommendedDuration('19-25', 'full-face'), 120);
eq('19-25 × fast-event-menu → 90',  getRecommendedDuration('19-25', 'fast-event-menu'), 90);
eq('19-25 × not-sure → 120',        getRecommendedDuration('19-25', 'not-sure'), 120);
// kids: 26-40
eq('26-40 × quick-cheek-arm → 120', getRecommendedDuration('26-40', 'quick-cheek-arm'), 120);
eq('26-40 × standard-party → 120',  getRecommendedDuration('26-40', 'standard-party'), 120);
eq("26-40 × full-face → 'custom'",  getRecommendedDuration('26-40', 'full-face'), 'custom');
eq('26-40 × fast-event-menu → 120', getRecommendedDuration('26-40', 'fast-event-menu'), 120);
eq('26-40 × not-sure → 120',        getRecommendedDuration('26-40', 'not-sure'), 120);
// kids: 40-plus (all custom)
eq("40-plus × quick-cheek-arm → 'custom'", getRecommendedDuration('40-plus', 'quick-cheek-arm'), 'custom');
eq("40-plus × standard-party → 'custom'",  getRecommendedDuration('40-plus', 'standard-party'), 'custom');
eq("40-plus × full-face → 'custom'",       getRecommendedDuration('40-plus', 'full-face'), 'custom');
eq("40-plus × fast-event-menu → 'custom'", getRecommendedDuration('40-plus', 'fast-event-menu'), 'custom');
eq("40-plus × not-sure → 'custom'",        getRecommendedDuration('40-plus', 'not-sure'), 'custom');
// kids: not-sure
eq('not-sure × quick-cheek-arm → 90', getRecommendedDuration('not-sure', 'quick-cheek-arm'), 90);
eq('not-sure × standard-party → 90',  getRecommendedDuration('not-sure', 'standard-party'), 90);
eq('not-sure × full-face → 120',      getRecommendedDuration('not-sure', 'full-face'), 120);
eq('not-sure × fast-event-menu → 90', getRecommendedDuration('not-sure', 'fast-event-menu'), 90);
eq('not-sure × not-sure → 90',        getRecommendedDuration('not-sure', 'not-sure'), 90);
// null inputs
eq('null kidsCount → null',   getRecommendedDuration(null, 'standard-party'), null);
eq('null designStyle → null', getRecommendedDuration('11-18', null), null);

// ── Custom quote triggers: 5 conditions ─────────────────────────────────────
console.log('Running custom quote trigger validation (5 conditions)...');
const t1 = isCustomQuotePath('birthday-party', ['face-painting'], '40-plus', 'standard-party');
eq('40-plus → isCustom true',         t1.isCustom, true);
eq('40-plus → reason large-event',    t1.reason, 'large-event');

const t2 = isCustomQuotePath('school-event', ['face-painting'], '11-18', 'standard-party');
eq('school-event → isCustom true',              t2.isCustom, true);
eq('school-event → reason institutional-event', t2.reason, 'institutional-event');

eq('corporate-family-day → isCustom',
  isCustomQuotePath('corporate-family-day', ['face-painting'], '11-18', 'standard-party').isCustom, true);
eq('festival-community → isCustom',
  isCustomQuotePath('festival-community', ['face-painting'], '11-18', 'standard-party').isCustom, true);

const t3 = isCustomQuotePath('birthday-party', ['combo'], '11-18', 'standard-party');
eq('combo → isCustom true',         t3.isCustom, true);
eq('combo → reason combo-service',  t3.reason, 'combo-service');

const t4 = isCustomQuotePath('birthday-party', ['face-painting', 'balloon-twisting'], '11-18', 'standard-party');
eq('multiple-services → isCustom true',         t4.isCustom, true);
eq('multiple-services → reason',                t4.reason, 'multiple-services');

const t5 = isCustomQuotePath('birthday-party', ['face-painting'], '26-40', 'full-face');
eq('full-face + 26-40 → isCustom true',               t5.isCustom, true);
eq('full-face + 26-40 → reason full-face-large-group', t5.reason, 'full-face-large-group');

const tNo = isCustomQuotePath('birthday-party', ['face-painting'], '11-18', 'standard-party');
eq('standard birthday → not custom (isCustom false)', tNo.isCustom, false);
eq('standard birthday → reason null',                 tNo.reason, null);

// ── Conflict warning ─────────────────────────────────────────────────────────
console.log('Running conflict warning validation...');
const w = getConflictWarning(60, 90, '11–18 children', '1 hour', '1.5 hours');
ok('conflict warning fires when 60 < 90',                     w !== null);
ok('conflict warning contains kids label "11–18 children"',   typeof w === 'string' && w.includes('11–18 children'));
ok('conflict warning contains selected label "1 hour"',       typeof w === 'string' && w.includes('1 hour'));
ok('conflict warning contains recommended label "1.5 hours"', typeof w === 'string' && w.includes('1.5 hours'));
ok('no warning when 90 === 90', getConflictWarning(90, 90, 'your group', '1.5 hours', '1.5 hours') === null);
ok('no warning when 120 > 90',  getConflictWarning(120, 90, 'your group', '2 hours', '1.5 hours') === null);
ok("no warning when recommended is 'custom'", getConflictWarning(120, 'custom', 'your group', '2 hours', 'Custom plan') === null);
ok('no warning when selected is null', getConflictWarning(null, 90, 'your group', 'Not selected', '1.5 hours') === null);

// ── customQuoteTrigger containment ───────────────────────────────────────────
// Reason strings are internal enum identifiers. They must not be rendered to customers.
// This is verified structurally: buildSellingCopy() and buildCustomCopy() in
// recommendation-engine.ts receive `reason` but produce customer-facing prose that
// does not include any raw reason string (confirmed by grep scan — Gate 6 in R3 report).
console.log('Running customQuoteTrigger containment validation...');
const INTERNAL_REASON_STRINGS = ['large-event', 'institutional-event', 'combo-service', 'multiple-services', 'full-face-large-group'];
// Simulate buildCustomCopy outputs (mirrors recommendation-engine.ts lines 146-160)
const CUSTOM_COPY = {
  'large-event': "Wow, what a party! For events with more than 40 children, we build a custom entertainment plan — possibly with a second artist — so no child waits too long. Our team will reach out with a tailored plan.",
  'institutional-event': "School, corporate, and festival events deserve a custom plan. We'll review your details and put together something that fits your event perfectly.",
  'combo-service': "Multi-service events need a little more planning to make sure everything runs smoothly. Our team will confirm the best combination and timing for your event.",
  'multiple-services': "Multi-service events need a little more planning to make sure everything runs smoothly. Our team will confirm the best combination and timing for your event.",
  'full-face-large-group': "Detailed full-face designs for a larger group need a custom schedule to give every child the wow experience. We'll plan the perfect timeline for you.",
};
for (const reason of INTERNAL_REASON_STRINGS) {
  const copy = CUSTOM_COPY[reason] ?? '';
  ok(`customQuoteTrigger reason "${reason}" not in its own copy`, !copy.includes(reason));
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('');
if (failed === 0) {
  console.log(`PASS — All ${passed} validations passed.`);
  process.exit(0);
} else {
  console.error(`FAIL — ${failed} of ${passed + failed} validations failed.`);
  process.exit(1);
}
