// PUBLIC-BOOKING-R13-R8D live Preview proof runner (checkout/webhook portion + re-smoke).
// Preview deployment, preview D1, Preview BOOKINGS_KV, Stripe TEST only. Synthetic non-PII.
// No secrets read or printed. customerEmail intentionally omitted (no PII in KV record).

import { writeFileSync } from 'node:fs';

const BASE = process.env.PROOF_BASE ?? 'https://bfe094c3.happyfacesla.pages.dev';
const base = {
  eventType: 'birthday-party', services: ['face-painting'], kidsCountBucket: '11-18',
  designStyle: 'standard-party', durationMinutes: 120, travelMiles: 0, eventDate: '2026-09-19',
};
const results = [];
function rec(label, data) { results.push({ label, ...data }); console.log(`\n[${label}] HTTP ${data.status}\n${JSON.stringify(data.body)}`); }
async function post(path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const text = await res.text(); let b; try { b = JSON.parse(text); } catch { b = { __raw: text.slice(0, 300) }; }
  return { status: res.status, body: b };
}
async function get(path, headers = {}) {
  const res = await fetch(`${BASE}${path}`, { method: 'GET', headers });
  const text = await res.text(); let b; try { b = JSON.parse(text); } catch { b = { __raw: text.slice(0, 150) }; }
  return { status: res.status, body: b };
}

// P1 — open slot confirmed from real preview D1.
rec('P1_open_confirmed', await post('/api/booking-eligibility', { ...base, startTime: '12:00' }));
// P2 — no matching slot fails closed.
rec('P2_nomatch_failclosed', await post('/api/booking-eligibility', { ...base, startTime: '08:00' }));
// P5 — checkout re-checks D1 and refuses blocked slot (now past KV gate).
rec('P5_checkout_blocked', await post('/api/create-checkout-session', { ...base, startTime: '15:00' }));
// P7 — unknown/no-match availability returns no checkout URL.
const p7 = await post('/api/create-checkout-session', { ...base, startTime: '08:00' });
rec('P7_checkout_nomatch', { status: p7.status, body: { ...p7.body, hasCheckoutUrl: !!p7.body?.checkoutUrl } });
// P10 — admin token fails closed.
rec('P10_admin_no_token', await get('/api/admin/slots'));
rec('P10_admin_wrong_token', await get('/api/admin/slots', { 'x-admin-token': 'wrong-not-the-real-token' }));

// P6 — TEST checkout creates/uses hold before Stripe TEST session (open slot, capacity 1).
const p6 = await post('/api/create-checkout-session', { ...base, startTime: '10:00' });
const url = p6.body?.checkoutUrl ?? '';
const m = url.match(/cs_test_[A-Za-z0-9]+/);
rec('P6_checkout_open', { status: p6.status, body: {
  ok: p6.body?.ok, hasCheckoutUrl: !!url, checkoutHost: url ? new URL(url).host : null,
  sessionIdPrefix: m ? m[0].slice(0, 12) + '...' : null, availability: p6.body?.availability,
} });
writeFileSync(new URL('./p6_hold.json', import.meta.url), JSON.stringify({
  safeSlotId: p6.body?.availability?.safeSlotId ?? null,
  safeHoldId: p6.body?.availability?.safeHoldId ?? null,
  holdExpiresAt: p6.body?.availability?.holdExpiresAt ?? null,
  sessionId: m ? m[0] : null,
}, null, 2));
writeFileSync(new URL('./proof_results.json', import.meta.url), JSON.stringify(results, null, 2));
console.log('\n=== PROOF RUNNER COMPLETE ===');
