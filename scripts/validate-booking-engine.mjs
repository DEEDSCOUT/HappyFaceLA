// Booking engine validation — PUBLIC-BOOKING-R8
// Run with: node scripts/validate-booking-engine.mjs
//
// Pure JavaScript mirror of:
//   src/lib/booking/capacity-engine.ts
//   src/lib/booking/pricing-engine.ts
//   src/lib/booking/eligibility.ts
//
// No build step. No test runner. No dependencies.
// Compare logic here against the TypeScript sources.

// ── Capacity engine mirror ────────────────────────────────────────────────────
const UTILIZATION_FACTOR = 0.90;
const SETUP_MINUTES = 10;
const BREAKDOWN_MINUTES = 10;

const MINUTES_PER_CHILD = {
  'quick-cheek-arm': 3,
  'fast-event-menu': 3,
  'standard-party': 5,
  'not-sure': 5,
  'full-face': 6,
};

const BUCKET_MIDPOINTS = {
  '1-10': 8, '11-18': 15, '19-25': 22, '26-40': 33, '40-plus': 50, 'not-sure': 25,
};

function getMinutesPerChild(designStyle) {
  return MINUTES_PER_CHILD[designStyle] ?? 5;
}

function calculateCapacity(kidsCount, designStyle, bookedDurationMinutes) {
  const mpc = getMinutesPerChild(designStyle);
  const serviceWindowMinutes = Math.max(0, bookedDurationMinutes - SETUP_MINUTES - BREAKDOWN_MINUTES);
  const usableMinutesPerArtist = serviceWindowMinutes * UTILIZATION_FACTOR;
  const requiredArtistMinutes = kidsCount * mpc;
  const requiredArtistCount = usableMinutesPerArtist > 0
    ? Math.ceil(requiredArtistMinutes / usableMinutesPerArtist)
    : 99;
  return { requiredArtistMinutes, usableMinutesPerArtist, serviceWindowMinutes, requiredArtistCount, kidsCount };
}

function resolveKidsCount(bucket, actual) {
  if (typeof actual === 'number' && actual > 0) return actual;
  if (!bucket) return 25;
  return BUCKET_MIDPOINTS[bucket] ?? 25;
}

// ── Pricing engine mirror ─────────────────────────────────────────────────────
const FIXED_PACKAGES_CENTS = {
  'one-service': { 60: 15000, 90: 21500, 120: 27500 },
  'two-service': { 60: 18000, 90: 25500, 120: 32500 },
};
const HOURLY_RATE_CENTS = 15000;

function getTravelFee(travelMiles) {
  if (travelMiles <= 20) return { feeCents: 0, requiresManualApproval: false };
  if (travelMiles <= 40) return { feeCents: 2500, requiresManualApproval: false };
  if (travelMiles <= 60) return { feeCents: 5000, requiresManualApproval: true };
  return { feeCents: 0, requiresManualApproval: true };
}

function calculatePricing(serviceType, durationMinutes, artistCount, travelMiles) {
  const { feeCents: travelFeeCents, requiresManualApproval } = getTravelFee(travelMiles);
  const fixedPrice = FIXED_PACKAGES_CENTS[serviceType]?.[durationMinutes];
  let pricingModel, basePriceCents;
  if (artistCount === 1 && fixedPrice !== undefined) {
    pricingModel = 'fixed-package';
    basePriceCents = fixedPrice;
  } else {
    pricingModel = 'hourly';
    basePriceCents = artistCount * (durationMinutes / 60) * HOURLY_RATE_CENTS;
  }
  const eventTotalCents = basePriceCents + travelFeeCents;
  const retainerCents = Math.round(eventTotalCents * 0.20);
  return { eventTotalCents, retainerCents, travelFeeCents, pricingModel, requiresManualApproval };
}

// ── Eligibility engine mirror ─────────────────────────────────────────────────
const MAX_INSTANT_DURATION_MINUTES = 240;
const MAX_INSTANT_ARTISTS = 4;
const MAX_INSTANT_TRAVEL_MILES = 40;
const MAX_INSTANT_KIDS = 160;
const INSTANT_BOOK_EVENT_TYPES = new Set(['birthday-party']);
const CUSTOM_REVIEW_EVENT_TYPES = new Set(['school-event', 'corporate-family-day', 'festival-community']);
const INSTANT_BOOK_SERVICES = new Set(['face-painting', 'face-gems']);

function assessEligibility(eventType, services, kidsCount, durationMinutes, travelMiles, capacityResult) {
  const reasons = [];
  if (CUSTOM_REVIEW_EVENT_TYPES.has(eventType)) reasons.push('institutional-event');
  else if (!INSTANT_BOOK_EVENT_TYPES.has(eventType)) reasons.push('event-type-not-supported');
  if (services.includes('combo')) {
    reasons.push('combo-service');
  } else {
    const unsupported = services.filter(s => !INSTANT_BOOK_SERVICES.has(s) && s !== 'not-sure');
    if (unsupported.length > 0) reasons.push('service-not-supported-for-instant-book');
  }
  if (capacityResult.requiredArtistCount > MAX_INSTANT_ARTISTS) reasons.push('exceeds-max-artists');
  if (durationMinutes > MAX_INSTANT_DURATION_MINUTES) reasons.push('exceeds-max-duration');
  if (travelMiles > MAX_INSTANT_TRAVEL_MILES) reasons.push('exceeds-max-travel');
  if (kidsCount > MAX_INSTANT_KIDS) reasons.push('exceeds-max-kids');

  const preEligible = reasons.length === 0;
  let pricing = null;
  if (preEligible) {
    const hasFaceGems = services.includes('face-gems');
    const serviceType = hasFaceGems ? 'two-service' : 'one-service';
    pricing = calculatePricing(serviceType, durationMinutes, capacityResult.requiredArtistCount, travelMiles);
    if (pricing.requiresManualApproval) reasons.push('pricing-requires-manual-approval');
  }
  const status = reasons.length === 0 ? 'instant-book' : 'custom-review';
  return { status, reasons, pricing: status === 'instant-book' ? pricing : null, capacityResult };
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
function nil(label, value) {
  ok(label, value === null || value === undefined);
}

// ── Capacity tests ────────────────────────────────────────────────────────────
console.log('Running capacity engine validation...');

// Minutes per child
eq('quick-cheek-arm: 3',    getMinutesPerChild('quick-cheek-arm'), 3);
eq('fast-event-menu: 3',    getMinutesPerChild('fast-event-menu'), 3);
eq('standard-party: 5',     getMinutesPerChild('standard-party'), 5);
eq('not-sure: 5',           getMinutesPerChild('not-sure'), 5);
eq('full-face: 6',          getMinutesPerChild('full-face'), 6);
eq('unknown style → 5',     getMinutesPerChild('unknown'), 5);

// Bucket midpoints
eq('resolveKidsCount actual wins',      resolveKidsCount('1-10', 75), 75);
eq('resolveKidsCount 1-10 bucket',      resolveKidsCount('1-10', null), 8);
eq('resolveKidsCount 40-plus bucket',   resolveKidsCount('40-plus', null), 50);
eq('resolveKidsCount null → 25',        resolveKidsCount(null, null), 25);

// Service window: 60-10-10=40; usable=36
const c1h10std = calculateCapacity(10, 'standard-party', 60);
eq('1h window=40',          c1h10std.serviceWindowMinutes, 40);
eq('1h usable=36',          c1h10std.usableMinutesPerArtist, 36);
eq('1h 10kids std: needed=50', c1h10std.requiredArtistMinutes, 50);
eq('1h 10kids std: 2 artists', c1h10std.requiredArtistCount, 2);

// 1h 10kids quick: 30 needed; 36 usable → 1 artist
const c1h10qk = calculateCapacity(10, 'quick-cheek-arm', 60);
eq('1h 10kids quick: 1 artist', c1h10qk.requiredArtistCount, 1);

// 2h window=100; usable=90
const c2h18std = calculateCapacity(18, 'standard-party', 120);
eq('2h window=100', c2h18std.serviceWindowMinutes, 100);
eq('2h usable=90',  c2h18std.usableMinutesPerArtist, 90);
eq('2h 18kids std: 90 needed', c2h18std.requiredArtistMinutes, 90);
eq('2h 18kids std: 1 artist',  c2h18std.requiredArtistCount, 1);

// 100kids 2h quick: ceil(300/90)=4
const c2h100qk = calculateCapacity(100, 'quick-cheek-arm', 120);
eq('100kids quick 2h: needed=300', c2h100qk.requiredArtistMinutes, 300);
eq('100kids quick 2h: 4 artists',  c2h100qk.requiredArtistCount, 4);
ok('100kids quick 2h: ≤4',         c2h100qk.requiredArtistCount <= 4);

// 100kids 2h std: ceil(500/90)=6
const c2h100std = calculateCapacity(100, 'standard-party', 120);
eq('100kids std 2h: 6 artists',   c2h100std.requiredArtistCount, 6);
ok('100kids std 2h: >4',           c2h100std.requiredArtistCount > 4);

// 4h window=220; usable=198
const c4h50 = calculateCapacity(50, 'standard-party', 240);
eq('4h window=220', c4h50.serviceWindowMinutes, 220);
eq('4h usable=198', c4h50.usableMinutesPerArtist, 198);

// Zero usable time guard
const c0 = calculateCapacity(5, 'standard-party', 10);
eq('10min window=0',     c0.serviceWindowMinutes, 0);
ok('10min: guard=99',    c0.requiredArtistCount === 99);

// ── Travel fee tests ──────────────────────────────────────────────────────────
console.log('Running travel fee validation...');
eq('0mi fee=0',     getTravelFee(0).feeCents, 0);
ok('0mi no approv', !getTravelFee(0).requiresManualApproval);
eq('20mi fee=0',    getTravelFee(20).feeCents, 0);
eq('21mi fee=2500', getTravelFee(21).feeCents, 2500);
ok('21mi no approv',!getTravelFee(21).requiresManualApproval);
eq('40mi fee=2500', getTravelFee(40).feeCents, 2500);
eq('41mi fee=5000', getTravelFee(41).feeCents, 5000);
ok('41mi requires', getTravelFee(41).requiresManualApproval);
ok('70mi requires', getTravelFee(70).requiresManualApproval);

// ── Pricing tests ─────────────────────────────────────────────────────────────
console.log('Running pricing engine validation...');

// Fixed packages
const p1h1a = calculatePricing('one-service', 60, 1, 0);
eq('1h 1a one-svc: $150',      p1h1a.eventTotalCents, 15000);
eq('1h retainer: $30',         p1h1a.retainerCents, 3000);
eq('1h model: fixed-package',  p1h1a.pricingModel, 'fixed-package');

const p15h = calculatePricing('one-service', 90, 1, 0);
eq('1.5h: $215',               p15h.eventTotalCents, 21500);
eq('1.5h retainer: $43',       p15h.retainerCents, 4300);

const p2h = calculatePricing('one-service', 120, 1, 0);
eq('2h: $275',                 p2h.eventTotalCents, 27500);
eq('2h retainer: $55',         p2h.retainerCents, 5500);

const p2svc = calculatePricing('two-service', 60, 1, 0);
eq('1h two-svc: $180',         p2svc.eventTotalCents, 18000);

const p2svc2h = calculatePricing('two-service', 120, 1, 0);
eq('2h two-svc: $325',         p2svc2h.eventTotalCents, 32500);

// Hourly
const p3h1a = calculatePricing('one-service', 180, 1, 0);
eq('3h 1a: $450 hourly',       p3h1a.eventTotalCents, 45000);
eq('3h model: hourly',         p3h1a.pricingModel, 'hourly');
eq('3h retainer: $90',         p3h1a.retainerCents, 9000);

const p4h2a = calculatePricing('one-service', 240, 2, 0);
eq('4h 2a: $1200',             p4h2a.eventTotalCents, 120000);
eq('4h 2a retainer: $240',     p4h2a.retainerCents, 24000);

const p2h2a = calculatePricing('one-service', 120, 2, 0);
eq('2h 2a: $600 hourly',       p2h2a.eventTotalCents, 60000);
eq('2h 2a model: hourly',      p2h2a.pricingModel, 'hourly');

const p4a2h = calculatePricing('one-service', 120, 4, 0);
eq('4a 2h: $1200',             p4a2h.eventTotalCents, 120000);
eq('4a 2h retainer: $240',     p4a2h.retainerCents, 24000);

const p1hT30 = calculatePricing('one-service', 60, 1, 30);
eq('1h + 30mi: $175',          p1hT30.eventTotalCents, 17500);
eq('1h + 30mi ret: $35',       p1hT30.retainerCents, 3500);

ok('50mi: manual approval',    calculatePricing('one-service', 60, 1, 50).requiresManualApproval);

// ── Eligibility tests ─────────────────────────────────────────────────────────
console.log('Running eligibility engine validation...');

// Simple birthday → instant-book
const eSimple = assessEligibility('birthday-party', ['face-painting'], 10, 60, 10, c1h10qk);
eq('simple birthday: instant-book',        eSimple.status, 'instant-book');
ok('simple birthday: pricing present',     eSimple.pricing !== null);
ok('simple birthday: no reasons',          eSimple.reasons.length === 0);

// School → custom-review
const eSchool = assessEligibility('school-event', ['face-painting'], 10, 60, 10,
  calculateCapacity(10, 'standard-party', 60));
eq('school: custom-review',               eSchool.status, 'custom-review');
ok('school: institutional-event reason',  eSchool.reasons.includes('institutional-event'));
nil('school: no pricing',                 eSchool.pricing);

// Corporate and festival
eq('corporate: custom-review',
  assessEligibility('corporate-family-day', ['face-painting'], 10, 60, 0,
    calculateCapacity(10, 'standard-party', 60)).status, 'custom-review');
eq('festival: custom-review',
  assessEligibility('festival-community', ['face-painting'], 10, 60, 0,
    calculateCapacity(10, 'standard-party', 60)).status, 'custom-review');

// > 4 artists → custom-review
const eLarge = assessEligibility('birthday-party', ['face-painting'], 100, 120, 10, c2h100std);
eq('100kids std 2h: custom-review',       eLarge.status, 'custom-review');
ok('exceeds-max-artists reason',           eLarge.reasons.includes('exceeds-max-artists'));

// 100kids 2h quick → instant-book (4 artists ≤ max)
const e100qk = assessEligibility('birthday-party', ['face-painting'], 100, 120, 10, c2h100qk);
eq('100kids quick 2h: instant-book',      e100qk.status, 'instant-book');
eq('100kids quick 2h: 4 artists',         e100qk.capacityResult.requiredArtistCount, 4);
ok('100kids quick 2h: pricing present',   e100qk.pricing !== null);
eq('100kids quick 2h: $1200',             e100qk.pricing?.eventTotalCents, 120000);
eq('100kids quick 2h: $240 retainer',     e100qk.pricing?.retainerCents, 24000);

// > 4h → custom-review
const cap5h = calculateCapacity(20, 'standard-party', 300);
eq('5h: custom-review',
  assessEligibility('birthday-party', ['face-painting'], 20, 300, 10, cap5h).status,
  'custom-review');

// > 40mi → custom-review
const capFar = calculateCapacity(10, 'standard-party', 60);
const eFar = assessEligibility('birthday-party', ['face-painting'], 10, 60, 50, capFar);
eq('50mi: custom-review',                 eFar.status, 'custom-review');
ok('50mi: exceeds-max-travel reason',     eFar.reasons.includes('exceeds-max-travel'));

// combo → custom-review
eq('combo: custom-review',
  assessEligibility('birthday-party', ['combo'], 10, 60, 10, capFar).status, 'custom-review');

// balloon → custom-review
eq('balloon: custom-review',
  assessEligibility('birthday-party', ['balloon-twisting'], 10, 60, 10, capFar).status, 'custom-review');

// face-gems add-on → instant-book, two-service pricing
const capGems = calculateCapacity(10, 'quick-cheek-arm', 60);
const eGems = assessEligibility('birthday-party', ['face-painting', 'face-gems'], 10, 60, 0, capGems);
eq('face-gems: instant-book',             eGems.status, 'instant-book');
eq('face-gems: two-service $180',         eGems.pricing?.eventTotalCents, 18000);

// > 160 kids → custom-review
const cap200 = calculateCapacity(200, 'quick-cheek-arm', 240);
ok('200 kids: custom-review',
  assessEligibility('birthday-party', ['face-painting'], 200, 240, 0, cap200).status === 'custom-review');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
if (failed === 0) {
  console.log(`PASS — All ${passed} validations passed.`);
  process.exit(0);
} else {
  console.error(`FAIL — ${failed} of ${passed + failed} validations failed.`);
  process.exit(1);
}
