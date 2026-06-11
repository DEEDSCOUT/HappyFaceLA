// Zero-dependency booking engine validation module — PUBLIC-BOOKING-R8
// Format: runValidation() pattern (matches existing recommendation-engine.test.ts)
// Executable via: node scripts/validate-booking-engine.mjs

import { calculateCapacity, getMinutesPerChild, resolveKidsCount } from '../capacity-engine.ts';
import { calculatePricing, getTravelFee } from '../pricing-engine.ts';
import { assessEligibility } from '../eligibility.ts';

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
    ok(label, value === null || value === undefined);
  }

  // ── Minutes per child (DEC-R7-001..004) ─────────────────────────────────────
  eq('quick-cheek-arm: 3 min/child',  getMinutesPerChild('quick-cheek-arm'), 3);
  eq('fast-event-menu: 3 min/child',  getMinutesPerChild('fast-event-menu'), 3);
  eq('standard-party: 5 min/child',   getMinutesPerChild('standard-party'), 5);
  eq('not-sure: 5 min/child',         getMinutesPerChild('not-sure'), 5);
  eq('full-face: 6 min/child',        getMinutesPerChild('full-face'), 6);
  eq('unknown style: defaults to 5',  getMinutesPerChild('unknown'), 5);

  // ── Bucket midpoints ─────────────────────────────────────────────────────────
  eq('resolveKidsCount: actual wins', resolveKidsCount('1-10', 75), 75);
  eq('resolveKidsCount: bucket fallback 1-10', resolveKidsCount('1-10', null), 8);
  eq('resolveKidsCount: bucket fallback 40-plus', resolveKidsCount('40-plus', null), 50);
  eq('resolveKidsCount: null bucket default', resolveKidsCount(null, null), 25);

  // ── Capacity: service window (DEC-R7-011..013, DEC-R7-067) ──────────────────
  // 1h: window = 60 - 10 - 10 = 40 min; usable = 36 min
  const c1h10std = calculateCapacity({ kidsCount: 10, designStyle: 'standard-party', bookedDurationMinutes: 60 });
  eq('1h: serviceWindowMinutes = 40',              c1h10std.serviceWindowMinutes, 40);
  eq('1h: usableMinutesPerArtist = 36',            c1h10std.usableMinutesPerArtist, 36);
  eq('1h 10kids std: requiredArtistMinutes = 50',  c1h10std.requiredArtistMinutes, 50);
  eq('1h 10kids std: requiredArtistCount = 2',     c1h10std.requiredArtistCount, 2);

  // 1h 10kids quick: 10×3=30 needed; 36 usable → 1 artist
  const c1h10qk = calculateCapacity({ kidsCount: 10, designStyle: 'quick-cheek-arm', bookedDurationMinutes: 60 });
  eq('1h 10kids quick: requiredArtistCount = 1', c1h10qk.requiredArtistCount, 1);

  // 2h: window = 100 min; usable = 90 min
  const c2h18std = calculateCapacity({ kidsCount: 18, designStyle: 'standard-party', bookedDurationMinutes: 120 });
  eq('2h: serviceWindowMinutes = 100',              c2h18std.serviceWindowMinutes, 100);
  eq('2h: usableMinutesPerArtist = 90',             c2h18std.usableMinutesPerArtist, 90);
  eq('2h 18kids std: requiredArtistMinutes = 90',   c2h18std.requiredArtistMinutes, 90);
  eq('2h 18kids std: requiredArtistCount = 1',      c2h18std.requiredArtistCount, 1);

  // 2h 25kids std: 25×5=125; 90 usable → ceil(125/90) = 2 artists
  const c2h25std = calculateCapacity({ kidsCount: 25, designStyle: 'standard-party', bookedDurationMinutes: 120 });
  eq('2h 25kids std: requiredArtistCount = 2', c2h25std.requiredArtistCount, 2);

  // 100kids 2h quick: 100×3=300; 90 usable → ceil(300/90) = 4 artists (≤ max → eligible)
  const c2h100qk = calculateCapacity({ kidsCount: 100, designStyle: 'quick-cheek-arm', bookedDurationMinutes: 120 });
  eq('100kids quick 2h: requiredArtistMinutes = 300', c2h100qk.requiredArtistMinutes, 300);
  eq('100kids quick 2h: usableMinutes = 90',          c2h100qk.usableMinutesPerArtist, 90);
  eq('100kids quick 2h: requiredArtistCount = 4',     c2h100qk.requiredArtistCount, 4);
  ok('100kids quick 2h: ≤ 4 artists',                 c2h100qk.requiredArtistCount <= 4);

  // 100kids 2h std: 100×5=500; 90 usable → ceil(500/90) = 6 artists (> max → custom review)
  const c2h100std = calculateCapacity({ kidsCount: 100, designStyle: 'standard-party', bookedDurationMinutes: 120 });
  eq('100kids std 2h: requiredArtistCount = 6', c2h100std.requiredArtistCount, 6);
  ok('100kids std 2h: > 4 artists',             c2h100std.requiredArtistCount > 4);

  // 4h: window = 220 min; usable = 198 min
  const c4h = calculateCapacity({ kidsCount: 50, designStyle: 'standard-party', bookedDurationMinutes: 240 });
  eq('4h: serviceWindowMinutes = 220', c4h.serviceWindowMinutes, 220);
  eq('4h: usableMinutesPerArtist = 198', c4h.usableMinutesPerArtist, 198);

  // Zero usable time guard
  const c0 = calculateCapacity({ kidsCount: 5, designStyle: 'standard-party', bookedDurationMinutes: 10 });
  eq('10min booking: serviceWindowMinutes = 0', c0.serviceWindowMinutes, 0);
  ok('10min booking: requiredArtistCount = 99 (guard)', c0.requiredArtistCount === 99);

  // ── Travel fee (DEC-R7-041..043) ────────────────────────────────────────────
  eq('travel 0mi: fee = 0',      getTravelFee(0).feeCents, 0);
  ok('travel 0mi: no approval',  !getTravelFee(0).requiresManualApproval);
  eq('travel 20mi: fee = 0',     getTravelFee(20).feeCents, 0);
  eq('travel 21mi: fee = 2500',  getTravelFee(21).feeCents, 2500);
  ok('travel 21mi: no approval', !getTravelFee(21).requiresManualApproval);
  eq('travel 40mi: fee = 2500',  getTravelFee(40).feeCents, 2500);
  ok('travel 40mi: no approval', !getTravelFee(40).requiresManualApproval);
  eq('travel 41mi: fee = 5000',  getTravelFee(41).feeCents, 5000);
  ok('travel 41mi: requires approval', getTravelFee(41).requiresManualApproval);
  eq('travel 60mi: fee = 5000',  getTravelFee(60).feeCents, 5000);
  ok('travel 70mi: requires approval', getTravelFee(70).requiresManualApproval);

  // ── Fixed package pricing (DEC-R7-058..061) ─────────────────────────────────
  // 1artist / 1h / one-service → $150
  const p1h1a = calculatePricing({ serviceType: 'one-service', durationMinutes: 60, artistCount: 1, travelMiles: 0 });
  eq('1h 1artist one-service: $150',            p1h1a.eventTotalCents, 15000);
  eq('1h 1artist one-service: retainer = 3000', p1h1a.retainerCents, 3000);
  eq('1h 1artist: model = fixed-package',       p1h1a.pricingModel, 'fixed-package');
  ok('1h 1artist: no manual approval',          !p1h1a.requiresManualApproval);

  // 1.5h / one-service → $215
  const p15h = calculatePricing({ serviceType: 'one-service', durationMinutes: 90, artistCount: 1, travelMiles: 0 });
  eq('1.5h one-service: $215',     p15h.eventTotalCents, 21500);
  eq('1.5h retainer: $43',         p15h.retainerCents, 4300);

  // 2h / one-service → $275
  const p2h = calculatePricing({ serviceType: 'one-service', durationMinutes: 120, artistCount: 1, travelMiles: 0 });
  eq('2h one-service: $275',       p2h.eventTotalCents, 27500);
  eq('2h retainer: $55',           p2h.retainerCents, 5500);

  // two-service 1h → $180
  const p2svc = calculatePricing({ serviceType: 'two-service', durationMinutes: 60, artistCount: 1, travelMiles: 0 });
  eq('1h two-service: $180', p2svc.eventTotalCents, 18000);

  // two-service 2h → $325
  const p2svc2h = calculatePricing({ serviceType: 'two-service', durationMinutes: 120, artistCount: 1, travelMiles: 0 });
  eq('2h two-service: $325', p2svc2h.eventTotalCents, 32500);

  // ── Hourly pricing (multi-artist or > 2h) ───────────────────────────────────
  // 3h 1artist → 3 × 15000 = $450
  const p3h1a = calculatePricing({ serviceType: 'one-service', durationMinutes: 180, artistCount: 1, travelMiles: 0 });
  eq('3h 1artist: $450 hourly',    p3h1a.eventTotalCents, 45000);
  eq('3h model: hourly',           p3h1a.pricingModel, 'hourly');
  eq('3h retainer: $90',           p3h1a.retainerCents, 9000);

  // 4h 2artists → 4 × 2 × 15000 = $1200
  const p4h2a = calculatePricing({ serviceType: 'one-service', durationMinutes: 240, artistCount: 2, travelMiles: 0 });
  eq('4h 2artists: $1200',         p4h2a.eventTotalCents, 120000);
  eq('4h 2artists retainer: $240', p4h2a.retainerCents, 24000);

  // 2h 2artists (multi-artist → hourly even at 2h) → 2 × 2 × 15000 = $600
  const p2h2a = calculatePricing({ serviceType: 'one-service', durationMinutes: 120, artistCount: 2, travelMiles: 0 });
  eq('2h 2artists: $600 hourly',   p2h2a.eventTotalCents, 60000);
  eq('2h 2artists model: hourly',  p2h2a.pricingModel, 'hourly');

  // 100kids quick 2h → 4 artists → 4 × 2 × 15000 = $1200
  const p100q2h = calculatePricing({ serviceType: 'one-service', durationMinutes: 120, artistCount: 4, travelMiles: 0 });
  eq('4artists 2h: $1200',         p100q2h.eventTotalCents, 120000);
  eq('4artists 2h retainer: $240', p100q2h.retainerCents, 24000);

  // ── Travel fee included in pricing ──────────────────────────────────────────
  // 1h 1artist + 30mi travel ($25) → $150 + $25 = $175
  const p1hT30 = calculatePricing({ serviceType: 'one-service', durationMinutes: 60, artistCount: 1, travelMiles: 30 });
  eq('1h + 30mi: $175',            p1hT30.eventTotalCents, 17500);
  eq('1h + 30mi retainer: $35',    p1hT30.retainerCents, 3500);

  // 50mi travel → manual approval
  const p50mi = calculatePricing({ serviceType: 'one-service', durationMinutes: 60, artistCount: 1, travelMiles: 50 });
  ok('50mi: requires manual approval', p50mi.requiresManualApproval);

  // ── Eligibility: instant-book ────────────────────────────────────────────────
  const capSimple = calculateCapacity({ kidsCount: 10, designStyle: 'quick-cheek-arm', bookedDurationMinutes: 60 });
  const eligSimple = assessEligibility({
    eventType: 'birthday-party', services: ['face-painting'],
    kidsCount: 10, designStyle: 'quick-cheek-arm',
    durationMinutes: 60, travelMiles: 10, capacityResult: capSimple,
  });
  eq('simple birthday: instant-book',        eligSimple.status, 'instant-book');
  truthy('simple birthday: pricing present',  eligSimple.pricing);
  ok('simple birthday: no reasons',           eligSimple.reasons.length === 0);

  // ── Eligibility: institutional event → custom-review ────────────────────────
  const capSchool = calculateCapacity({ kidsCount: 10, designStyle: 'standard-party', bookedDurationMinutes: 60 });
  const eligSchool = assessEligibility({
    eventType: 'school-event', services: ['face-painting'],
    kidsCount: 10, designStyle: 'standard-party',
    durationMinutes: 60, travelMiles: 10, capacityResult: capSchool,
  });
  eq('school event: custom-review', eligSchool.status, 'custom-review');
  ok('school event: institutional-event reason', eligSchool.reasons.includes('institutional-event'));
  nil('school event: no pricing', eligSchool.pricing);

  // corporate and festival also custom
  const capCorp = calculateCapacity({ kidsCount: 10, designStyle: 'standard-party', bookedDurationMinutes: 60 });
  eq('corporate: custom-review',
    assessEligibility({ eventType: 'corporate-family-day', services: ['face-painting'], kidsCount: 10, designStyle: 'standard-party', durationMinutes: 60, travelMiles: 0, capacityResult: capCorp }).status,
    'custom-review');
  eq('festival: custom-review',
    assessEligibility({ eventType: 'festival-community', services: ['face-painting'], kidsCount: 10, designStyle: 'standard-party', durationMinutes: 60, travelMiles: 0, capacityResult: capCorp }).status,
    'custom-review');

  // ── Eligibility: > 4 artists → custom-review ────────────────────────────────
  const eligLarge = assessEligibility({
    eventType: 'birthday-party', services: ['face-painting'],
    kidsCount: 100, designStyle: 'standard-party',
    durationMinutes: 120, travelMiles: 10, capacityResult: c2h100std,
  });
  eq('100kids std 2h: custom-review',         eligLarge.status, 'custom-review');
  ok('100kids std 2h: exceeds-max-artists',   eligLarge.reasons.includes('exceeds-max-artists'));

  // ── Eligibility: 100kids 2h quick → instant-book (4 artists ≤ max) ──────────
  const elig100qk2h = assessEligibility({
    eventType: 'birthday-party', services: ['face-painting'],
    kidsCount: 100, designStyle: 'quick-cheek-arm',
    durationMinutes: 120, travelMiles: 10, capacityResult: c2h100qk,
  });
  eq('100kids quick 2h: instant-book',         elig100qk2h.status, 'instant-book');
  eq('100kids quick 2h: 4 artists confirmed',  elig100qk2h.capacityResult.requiredArtistCount, 4);
  truthy('100kids quick 2h: pricing present',  elig100qk2h.pricing);
  eq('100kids quick 2h: $1200 event total',    elig100qk2h.pricing?.eventTotalCents, 120000);
  eq('100kids quick 2h: $240 retainer',        elig100qk2h.pricing?.retainerCents, 24000);

  // ── Eligibility: > 4h → custom-review ───────────────────────────────────────
  const cap5h = calculateCapacity({ kidsCount: 20, designStyle: 'standard-party', bookedDurationMinutes: 300 });
  const elig5h = assessEligibility({
    eventType: 'birthday-party', services: ['face-painting'],
    kidsCount: 20, designStyle: 'standard-party',
    durationMinutes: 300, travelMiles: 10, capacityResult: cap5h,
  });
  eq('5h: custom-review',                   elig5h.status, 'custom-review');
  ok('5h: exceeds-max-duration reason',     elig5h.reasons.includes('exceeds-max-duration'));

  // ── Eligibility: > 40mi → custom-review ─────────────────────────────────────
  const capFar = calculateCapacity({ kidsCount: 10, designStyle: 'standard-party', bookedDurationMinutes: 60 });
  const eligFar = assessEligibility({
    eventType: 'birthday-party', services: ['face-painting'],
    kidsCount: 10, designStyle: 'standard-party',
    durationMinutes: 60, travelMiles: 50, capacityResult: capFar,
  });
  eq('50mi: custom-review',                 eligFar.status, 'custom-review');
  ok('50mi: exceeds-max-travel reason',     eligFar.reasons.includes('exceeds-max-travel'));

  // ── Eligibility: combo → custom-review ──────────────────────────────────────
  const capCombo = calculateCapacity({ kidsCount: 10, designStyle: 'standard-party', bookedDurationMinutes: 60 });
  const eligCombo = assessEligibility({
    eventType: 'birthday-party', services: ['combo'],
    kidsCount: 10, designStyle: 'standard-party',
    durationMinutes: 60, travelMiles: 10, capacityResult: capCombo,
  });
  eq('combo: custom-review',               eligCombo.status, 'custom-review');
  ok('combo: combo-service reason',         eligCombo.reasons.includes('combo-service'));

  // ── Eligibility: non-face service → custom-review ───────────────────────────
  const capBalloon = calculateCapacity({ kidsCount: 10, designStyle: 'standard-party', bookedDurationMinutes: 60 });
  const eligBalloon = assessEligibility({
    eventType: 'birthday-party', services: ['balloon-twisting'],
    kidsCount: 10, designStyle: 'standard-party',
    durationMinutes: 60, travelMiles: 10, capacityResult: capBalloon,
  });
  eq('balloon-twisting: custom-review',    eligBalloon.status, 'custom-review');

  // ── Eligibility: face-gems add-on → two-service pricing ─────────────────────
  const capGems = calculateCapacity({ kidsCount: 10, designStyle: 'quick-cheek-arm', bookedDurationMinutes: 60 });
  const eligGems = assessEligibility({
    eventType: 'birthday-party', services: ['face-painting', 'face-gems'],
    kidsCount: 10, designStyle: 'quick-cheek-arm',
    durationMinutes: 60, travelMiles: 0, capacityResult: capGems,
  });
  eq('face-gems add-on: instant-book',     eligGems.status, 'instant-book');
  eq('face-gems: two-service pricing',     eligGems.pricing?.eventTotalCents, 18000);

  // ── Eligibility: > 160 kids → custom-review ─────────────────────────────────
  const cap200 = calculateCapacity({ kidsCount: 200, designStyle: 'quick-cheek-arm', bookedDurationMinutes: 240 });
  const elig200 = assessEligibility({
    eventType: 'birthday-party', services: ['face-painting'],
    kidsCount: 200, designStyle: 'quick-cheek-arm',
    durationMinutes: 240, travelMiles: 0, capacityResult: cap200,
  });
  eq('200 kids: custom-review',            elig200.status, 'custom-review');
  ok('200 kids: exceeds-max-kids reason',  elig200.reasons.includes('exceeds-max-kids'));

  return { passed, failed, failures };
}
