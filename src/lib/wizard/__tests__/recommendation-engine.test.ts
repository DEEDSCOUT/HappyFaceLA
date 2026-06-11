// Dependency-free recommendation engine validation module
// Previous format: vitest test suite (vitest not installed — add `npm i -D vitest` to restore)
// Current format: zero-dependency TypeScript — type-checked by `npm run astro -- check`
// Executable proof: scripts/validate-wizard-recommendation.mjs (run with `node`, no dependencies)
//
// Coverage:
//   - All 30 duration matrix cells (6 kids buckets × 5 design styles)
//   - All 5 custom quote trigger conditions
//   - Conflict warning: fire and no-fire conditions
//   - computeRecommendation: fast-quote and custom-quote paths
//   - customQuoteTrigger: internal only — not in sellingCopy or customQuoteCopy

import {
  getRecommendedDuration,
  isCustomQuotePath,
  getConflictWarning,
  computeRecommendation,
  formatDurationLabel,
} from '../recommendation-engine.ts';
import type { WizardAnswers } from '../types.ts';

function makeAnswers(overrides: Partial<WizardAnswers> = {}): WizardAnswers {
  return {
    eventType: 'birthday-party',
    services: ['face-painting'],
    kidsCountBucket: '11-18',
    designStyle: 'standard-party',
    selectedDurationOption: 90,
    eventDate: '2026-09-15',
    eventTime: '14:00',
    eventCity: 'Los Angeles',
    venueName: '',
    specialRequests: '',
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.com',
    phone: '',
    ...overrides,
  };
}

export function runValidation(): { passed: number; failed: number; failures: string[] } {
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  function ok(label: string, cond: boolean): void {
    if (cond) { passed++; } else { failed++; failures.push(label); }
  }
  function eq(label: string, actual: unknown, expected: unknown): void {
    ok(label, actual === expected);
  }
  function truthy(label: string, value: unknown): void {
    ok(label, Boolean(value));
  }
  function nil(label: string, value: unknown): void {
    ok(label, value === null);
  }
  function contains(label: string, value: string | null, needle: string): void {
    ok(label, typeof value === 'string' && value.includes(needle));
  }
  function notContains(label: string, value: string | null | undefined, needle: string): void {
    ok(label, !(typeof value === 'string' && value.includes(needle)));
  }

  // ── formatDurationLabel ──────────────────────────────────────────────────
  eq('formatDurationLabel(60)', formatDurationLabel(60), '1 hour');
  eq('formatDurationLabel(90)', formatDurationLabel(90), '1.5 hours');
  eq('formatDurationLabel(120)', formatDurationLabel(120), '2 hours');
  eq("formatDurationLabel('custom')", formatDurationLabel('custom'), 'Custom plan');
  eq('formatDurationLabel(null)', formatDurationLabel(null), 'Not selected');

  // ── Duration matrix: 30 cells (6 kids buckets × 5 design styles) ────────
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
  eq("40-plus × quick-cheek-arm → 'custom'",  getRecommendedDuration('40-plus', 'quick-cheek-arm'), 'custom');
  eq("40-plus × standard-party → 'custom'",   getRecommendedDuration('40-plus', 'standard-party'), 'custom');
  eq("40-plus × full-face → 'custom'",        getRecommendedDuration('40-plus', 'full-face'), 'custom');
  eq("40-plus × fast-event-menu → 'custom'",  getRecommendedDuration('40-plus', 'fast-event-menu'), 'custom');
  eq("40-plus × not-sure → 'custom'",         getRecommendedDuration('40-plus', 'not-sure'), 'custom');
  // kids: not-sure
  eq('not-sure × quick-cheek-arm → 90',  getRecommendedDuration('not-sure', 'quick-cheek-arm'), 90);
  eq('not-sure × standard-party → 90',   getRecommendedDuration('not-sure', 'standard-party'), 90);
  eq('not-sure × full-face → 120',       getRecommendedDuration('not-sure', 'full-face'), 120);
  eq('not-sure × fast-event-menu → 90',  getRecommendedDuration('not-sure', 'fast-event-menu'), 90);
  eq('not-sure × not-sure → 90',         getRecommendedDuration('not-sure', 'not-sure'), 90);
  // null inputs
  nil('null kidsCount → null', getRecommendedDuration(null, 'standard-party'));
  nil('null designStyle → null', getRecommendedDuration('11-18', null));

  // ── Custom quote triggers: 5 conditions ─────────────────────────────────
  const t1 = isCustomQuotePath(makeAnswers({ kidsCountBucket: '40-plus' }));
  eq('40-plus → isCustom', t1.isCustom, true);
  eq('40-plus → reason large-event', t1.reason, 'large-event');

  const t2 = isCustomQuotePath(makeAnswers({ eventType: 'school-event' }));
  eq('school-event → isCustom', t2.isCustom, true);
  eq('school-event → reason institutional-event', t2.reason, 'institutional-event');

  eq('corporate-family-day → isCustom',
    isCustomQuotePath(makeAnswers({ eventType: 'corporate-family-day' })).isCustom, true);
  eq('festival-community → isCustom',
    isCustomQuotePath(makeAnswers({ eventType: 'festival-community' })).isCustom, true);

  const t3 = isCustomQuotePath(makeAnswers({ services: ['combo'] }));
  eq('combo → isCustom', t3.isCustom, true);
  eq('combo → reason combo-service', t3.reason, 'combo-service');

  const t4 = isCustomQuotePath(makeAnswers({ services: ['face-painting', 'balloon-twisting'] }));
  eq('multiple-services → isCustom', t4.isCustom, true);
  eq('multiple-services → reason', t4.reason, 'multiple-services');

  const t5 = isCustomQuotePath(makeAnswers({ designStyle: 'full-face', kidsCountBucket: '26-40' }));
  eq('full-face + 26-40 → isCustom', t5.isCustom, true);
  eq('full-face + 26-40 → reason full-face-large-group', t5.reason, 'full-face-large-group');

  const tNo = isCustomQuotePath(makeAnswers());
  eq('birthday + face-painting + 11-18 + standard → not custom', tNo.isCustom, false);

  // ── Conflict warning ─────────────────────────────────────────────────────
  const w1 = getConflictWarning(60, 90, '11–18 children', '1 hour', '1.5 hours');
  truthy('conflict warning fires when selected < recommended', w1);
  contains('conflict warning contains kids label', w1, '11–18 children');
  contains('conflict warning contains selected label', w1, '1 hour');
  contains('conflict warning contains recommended label', w1, '1.5 hours');
  nil('no warning when selected === recommended',
    getConflictWarning(90, 90, 'your group', '1.5 hours', '1.5 hours'));
  nil('no warning when selected > recommended',
    getConflictWarning(120, 90, 'your group', '2 hours', '1.5 hours'));
  nil("no warning when recommended is 'custom'",
    getConflictWarning(120, 'custom', 'your group', '2 hours', 'Custom plan'));
  nil('no warning when selected is null',
    getConflictWarning(null, 90, 'your group', 'Not selected', '1.5 hours'));

  // ── computeRecommendation — fast-quote path ──────────────────────────────
  const fq = computeRecommendation(makeAnswers());
  eq('fast-quote: branch', fq.branch, 'fast-quote');
  eq('fast-quote: recommendedDuration', fq.recommendedDuration, 90);
  truthy('fast-quote: sellingCopy set', fq.sellingCopy);
  nil('fast-quote: customQuoteCopy null', fq.customQuoteCopy);

  // ── computeRecommendation — custom-quote path ────────────────────────────
  const cq = computeRecommendation(makeAnswers({ kidsCountBucket: '40-plus' }));
  eq('custom-quote: branch', cq.branch, 'custom-quote');
  truthy('custom-quote: customQuoteCopy set', cq.customQuoteCopy);
  eq('custom-quote: sellingCopy empty string', cq.sellingCopy, '');

  // ── customQuoteTrigger: internal only ────────────────────────────────────
  // Must be set in state but must NOT appear in any customer-facing copy field.
  const cqt = computeRecommendation(makeAnswers({ kidsCountBucket: '40-plus' }));
  eq('customQuoteTrigger value is large-event', cqt.customQuoteTrigger, 'large-event');
  notContains('customQuoteTrigger not in sellingCopy', cqt.sellingCopy, 'large-event');
  notContains('customQuoteTrigger not in customQuoteCopy', cqt.customQuoteCopy, 'large-event');

  return { passed, failed, failures };
}
