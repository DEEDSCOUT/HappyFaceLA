#!/usr/bin/env node
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const sessionStorage = new MemoryStorage();
const localStorage = new MemoryStorage();
sessionStorage.setItem('hfla_attribution', JSON.stringify({ landing_page: 'https://happyfacesla.com/?private=legacy' }));
localStorage.setItem('hfla_attribution', JSON.stringify({ gclid: 'legacy', arbitrary: 'query-data' }));
localStorage.setItem('hfla_attribution_v1', JSON.stringify({ stale: 'previously-consented' }));

globalThis.window = {
  location: {
    href: 'https://happyfacesla.com/contact/?gclid=G-ALLOW&utm_source=google&private=drop-me',
    origin: 'https://happyfacesla.com',
  },
  sessionStorage,
  localStorage,
};
globalThis.document = { referrer: 'https://www.google.com/search?q=private' };

const {
  APPROVED_ATTRIBUTION_RETENTION_MS,
  captureBrowserAttribution,
  clearBrowserAttribution,
  purgeLegacyAttributionStorage,
} = await import('../../src/lib/attribution/browser-attribution.ts');

purgeLegacyAttributionStorage();
assert.equal(sessionStorage.getItem('hfla_attribution'), null);
assert.equal(localStorage.getItem('hfla_attribution'), null);

const journey = captureBrowserAttribution(Date.parse('2026-08-10T18:00:00.000Z'));
assert.equal(journey.first_touch.gclid, 'G-ALLOW');
assert.equal(journey.first_touch.landing_path, '/contact/');
assert.equal(journey.first_touch.sanitized_referrer, 'https://www.google.com/search');
assert.equal(sessionStorage.getItem('hfla_attribution_v1'), null, 'transient storage is gated off by default');
assert.equal(localStorage.getItem('hfla_attribution_v1'), null, 'persistent storage is gated off by default');

clearBrowserAttribution();
window.__HFLA_ATTRIBUTION_CONFIG__ = {
  transientStorageAllowed: true,
  persistentStorageAllowed: true,
  consentGranted: true,
  retentionMs: 365 * 24 * 60 * 60 * 1000,
};
const consentedJourney = captureBrowserAttribution(Date.parse('2026-08-10T18:01:00.000Z'));
assert.equal(consentedJourney.first_touch.gclid, 'G-ALLOW');
const serialized = sessionStorage.getItem('hfla_attribution_v1');
assert(serialized);
assert.equal(serialized.includes('drop-me'), false);
assert.equal(serialized.includes('q=private'), false);
assert(localStorage.getItem('hfla_attribution_v1'));
assert.equal(
  Date.parse(consentedJourney.expires_at) - Date.parse('2026-08-10T18:01:00.000Z'),
  APPROVED_ATTRIBUTION_RETENTION_MS,
  'runtime configuration cannot extend the approved 30-day envelope TTL',
);

window.__HFLA_ATTRIBUTION_CONFIG__ = {
  transientStorageAllowed: false,
  persistentStorageAllowed: false,
  consentGranted: false,
};
captureBrowserAttribution(Date.parse('2026-08-10T18:02:00.000Z'));
assert.equal(sessionStorage.getItem('hfla_attribution_v1'), null, 'revocation removes transient attribution');
assert.equal(localStorage.getItem('hfla_attribution_v1'), null, 'revocation removes persistent attribution');

console.log('PASS legacy purge, allowlisting, and fail-closed consent/storage gates');
