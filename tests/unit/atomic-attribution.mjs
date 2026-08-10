#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  ATTRIBUTION_VERSION,
  buildSubmissionJourney,
  capturePageAttribution,
  captureTouch,
  flattenJourney,
  sanitizeJourney,
} from '../../src/lib/attribution/atomic-attribution.ts';

const ORIGIN = 'https://happyfacesla.com';
const T0 = Date.parse('2026-08-10T18:00:00.000Z');
const TTL = 90_000;

function capture(current, url, offset = 0, referrer = null, retentionMs = TTL) {
  return capturePageAttribution(current, {
    url,
    referrer,
    capturedAt: new Date(T0 + offset).toISOString(),
  }, { expectedOrigin: ORIGIN, nowMs: T0 + offset, retentionMs });
}

function submit(current, url, offset = 0, referrer = null, retentionMs = TTL) {
  return buildSubmissionJourney(current, {
    url,
    referrer,
    capturedAt: new Date(T0 + offset).toISOString(),
  }, { expectedOrigin: ORIGIN, nowMs: T0 + offset, retentionMs });
}

const google = capture(
  null,
  `${ORIGIN}/kids-birthday-party-entertainment-los-angeles/?gclid=G-ONE&utm_source=google&utm_medium=cpc&utm_campaign=birthday&utm_term=face+painter&utm_content=rsa-a&ignored_secret=nope#fragment`,
  0,
  'https://www.google.com/search?q=private-data',
);
assert.equal(google.version, ATTRIBUTION_VERSION);
assert.equal(google.first_touch.gclid, 'G-ONE');
assert.equal(google.first_touch.utm_campaign, 'birthday');
assert.equal(google.first_touch.landing_path, '/kids-birthday-party-entertainment-los-angeles/');
assert.equal(google.first_touch.sanitized_referrer, 'https://www.google.com/search');
assert.equal(JSON.stringify(google).includes('ignored_secret'), false);
assert.equal(JSON.stringify(google).includes('private-data'), false);

const paidInternalSubmit = submit(
  capture(google, `${ORIGIN}/services/`, 1000, `${ORIGIN}/kids-birthday-party-entertainment-los-angeles/`),
  `${ORIGIN}/plan-my-party/`,
  2000,
  `${ORIGIN}/services/`,
);
assert.equal(paidInternalSubmit.latest_qualifying_touch.gclid, 'G-ONE');
assert.equal(paidInternalSubmit.submit_touch.gclid, null);
assert.equal(paidInternalSubmit.submit_touch.source_path, '/plan-my-party/');
assert.equal(paidInternalSubmit.submit_touch.source_confidence, 'direct');

const googleThenYelp = capture(
  google,
  `${ORIGIN}/packages/?utm_source=yelp&utm_medium=referral&utm_campaign=profile`,
  3000,
  'https://www.yelp.com/biz/happy-faces-la?tracking=private',
);
assert.equal(googleThenYelp.first_touch.gclid, 'G-ONE');
assert.equal(googleThenYelp.latest_qualifying_touch.utm_source, 'yelp');
assert.equal(googleThenYelp.latest_qualifying_touch.gclid, null);
assert.equal(flattenJourney(submit(googleThenYelp, `${ORIGIN}/packages/`, 4000)).gclid, null);

const yelp = capture(
  null,
  `${ORIGIN}/packages/?utm_source=yelp&utm_medium=referral&utm_campaign=profile`,
  0,
  'https://www.yelp.com/biz/happy-faces-la',
);
const yelpThenGoogle = capture(
  yelp,
  `${ORIGIN}/contact/?gbraid=GB-ONE&utm_source=google&utm_medium=cpc`,
  1000,
  'https://www.google.com/',
);
assert.equal(yelpThenGoogle.first_touch.utm_source, 'yelp');
assert.equal(yelpThenGoogle.latest_qualifying_touch.gbraid, 'GB-ONE');
assert.equal(yelpThenGoogle.latest_qualifying_touch.utm_source, 'google');
assert.equal(yelpThenGoogle.latest_qualifying_touch.utm_campaign, null);

const wbraid = capture(null, `${ORIGIN}/contact/?wbraid=WB-ONE`, 0);
assert.equal(wbraid.latest_qualifying_touch.source_confidence, 'wbraid');
const fullUtm = capture(null, `${ORIGIN}/contact/?utm_source=newsletter&utm_medium=email&utm_campaign=summer&utm_term=party&utm_content=button`, 0);
assert.equal(fullUtm.latest_qualifying_touch.utm_content, 'button');
const partialUtm = capture(null, `${ORIGIN}/contact/?utm_campaign=partial-only`, 0);
assert.equal(partialUtm.latest_qualifying_touch.utm_campaign, 'partial-only');
assert.equal(partialUtm.latest_qualifying_touch.utm_source, null);

const directReturn = submit(google, `${ORIGIN}/contact/`, 5000);
assert.equal(directReturn.latest_qualifying_touch.gclid, 'G-ONE');
assert.equal(directReturn.submit_touch.gclid, null);

const beforeExpiry = capture(google, `${ORIGIN}/services/`, TTL - 1);
assert.equal(beforeExpiry.first_touch.gclid, 'G-ONE');
const atExpiry = capture(google, `${ORIGIN}/services/`, TTL);
assert.equal(atExpiry.first_touch.gclid, null);
assert.equal(atExpiry.latest_qualifying_touch, null);
const afterExpiry = capture(google, `${ORIGIN}/services/`, TTL + 1);
assert.equal(afterExpiry.first_touch.gclid, null);

const unsafe = captureTouch({
  url: 'javascript:alert(1)',
  referrer: 'https://user:secret@example.com/path?token=secret#hash',
  capturedAt: 'not-a-date',
}, { expectedOrigin: ORIGIN, nowMs: T0 });
assert.equal(unsafe.landing_path, '/');
assert.equal(unsafe.sanitized_referrer, 'https://example.com/path');
assert.equal(unsafe.captured_at, new Date(T0).toISOString());

assert.equal(sanitizeJourney({ version: 99 }, { nowMs: T0 }), null);
assert.equal(sanitizeJourney({ version: 1, first_touch: null }, { nowMs: T0 }), null);

console.log('PASS 17 atomic attribution fixtures');
