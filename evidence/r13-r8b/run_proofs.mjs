// PUBLIC-BOOKING-R13-R8B live Preview proof runner (HTTP-observable proofs).
// Hits the current-code Preview deployment Functions backed by preview D1 + Stripe TEST.
// No secrets are read or printed. Synthetic non-PII data only.

import { writeFileSync } from 'node:fs';

const BASE = process.env.PROOF_BASE ?? 'https://46d78ff1.happyfacesla.pages.dev';
const DATE = '2026-09-19';

const base = {
  eventType: 'birthday-party',
  services: ['face-painting'],
  kidsCountBucket: '11-18',
  designStyle: 'standard-party',
  durationMinutes: 120,
  travelMiles: 0,
  eventDate: DATE,
};

const results = [];
function record(label, data) {
  results.push({ label, ...data });
  const safe = JSON.stringify(data.body);
  console.log(`\n[${label}] HTTP ${data.status}\n${safe}`);
}

async function post(path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  let parsed;
  const text = await res.text();
  try { parsed = JSON.parse(text); } catch { parsed = { __raw: text.slice(0, 400) }; }
  return { status: res.status, body: parsed };
}

async function get(path, headers = {}) {
  const res = await fetch(`${BASE}${path}`, { method: 'GET', headers });
  let parsed;
  const text = await res.text();
  try { parsed = JSON.parse(text); } catch { parsed = { __raw: text.slice(0, 200) }; }
  return { status: res.status, body: parsed };
}

// P1 — open slot returns confirmed availability from real preview D1.
record('P1_open_confirmed', await post('/api/booking-eligibility', { ...base, startTime: '12:00' }));

// P2 — no matching slot fails closed.
record('P2_nomatch_failclosed', await post('/api/booking-eligibility', { ...base, startTime: '08:00' }));

// P3 — uses P1 response; key allowlist checked in analysis step.

// P4 — non-open states fail closed.
record('P4_malformed', await post('/api/booking-eligibility', { ...base, startTime: '13:00' }));
record('P4_blocked', await post('/api/booking-eligibility', { ...base, startTime: '15:00' }));
record('P4_held', await post('/api/booking-eligibility', { ...base, startTime: '16:00' }));
record('P4_reserved', await post('/api/booking-eligibility', { ...base, startTime: '17:00' }));
record('P4_expired', await post('/api/booking-eligibility', { ...base, startTime: '18:00' }));
record('P4_unavailable', await post('/api/booking-eligibility', { ...base, startTime: '19:00' }));

// P5 — checkout re-checks D1 and refuses blocked slot.
record('P5_checkout_blocked', await post('/api/create-checkout-session', { ...base, startTime: '15:00' }));

// P7 — checkout on no-match availability returns no checkout URL.
record('P7_checkout_nomatch', await post('/api/create-checkout-session', { ...base, startTime: '08:00' }));

// P6 — TEST checkout creates/uses hold before Stripe TEST session.
const p6 = await post('/api/create-checkout-session', { ...base, startTime: '10:00' });
const url = p6.body?.checkoutUrl ?? '';
const sessionMatch = url.match(/cs_test_[A-Za-z0-9]+/);
record('P6_checkout_open', {
  status: p6.status,
  body: {
    ok: p6.body?.ok,
    hasCheckoutUrl: typeof url === 'string' && url.length > 0,
    checkoutUrlHost: url ? new URL(url).host : null,
    sessionIdPrefix: sessionMatch ? sessionMatch[0].slice(0, 12) + '...' : null,
    availability: p6.body?.availability,
  },
});
// Persist hold identifiers for the P8/P9 reservation simulation step.
writeFileSync(new URL('./p6_hold.json', import.meta.url), JSON.stringify({
  safeSlotId: p6.body?.availability?.safeSlotId ?? null,
  safeHoldId: p6.body?.availability?.safeHoldId ?? null,
  holdExpiresAt: p6.body?.availability?.holdExpiresAt ?? null,
  sessionId: sessionMatch ? sessionMatch[0] : null,
}, null, 2));

// P8a — webhook signature verification fails closed (no live signature forgeable without the secret).
record('P8a_webhook_no_sig', await post('/api/stripe/webhook', { type: 'checkout.session.completed' }));
record('P8a_webhook_bad_sig', await post('/api/stripe/webhook', { type: 'checkout.session.completed' }, { 'stripe-signature': 't=1,v1=deadbeef' }));

// P10 — admin token fails closed for missing and wrong token.
record('P10_admin_no_token', await get('/api/admin/slots'));
record('P10_admin_wrong_token', await get('/api/admin/slots', { 'x-admin-token': 'wrong-not-the-real-token' }));

writeFileSync(new URL('./proof_results.json', import.meta.url), JSON.stringify(results, null, 2));
console.log('\n=== PROOF RUNNER COMPLETE ===');
