// PUBLIC-BOOKING-R13-R8D continuation HTTP proof runner.
// Fresh Preview deployment + Preview D1 + Preview BOOKINGS_KV + Stripe TEST only.
// Synthetic non-PII. No secret values are read or printed.

import { writeFileSync } from 'node:fs';

const BASE = process.env.PROOF_BASE ?? 'https://c5d78321.happyfacesla.pages.dev';
const DATE = '2026-11-28';

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
const failures = [];

function safeBody(body) {
  const copy = structuredClone(body ?? {});
  if (typeof copy.checkoutUrl === 'string') {
    const sessionMatch = copy.checkoutUrl.match(/cs_test_[A-Za-z0-9_]+/);
    copy.hasCheckoutUrl = true;
    copy.checkoutHost = new URL(copy.checkoutUrl).host;
    copy.sessionIdPrefix = sessionMatch ? `${sessionMatch[0].slice(0, 12)}...` : null;
    delete copy.checkoutUrl;
  }
  return copy;
}

function record(label, data) {
  const row = { label, status: data.status, body: safeBody(data.body) };
  results.push(row);
  console.log(`\n[${label}] HTTP ${row.status}\n${JSON.stringify(row.body)}`);
}

function expect(condition, label) {
  if (!condition) failures.push(label);
}

async function post(path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { __raw: text.slice(0, 300) };
  }
  return { status: res.status, body: parsed };
}

async function get(path, headers = {}) {
  const res = await fetch(`${BASE}${path}`, { method: 'GET', headers });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { __raw: text.slice(0, 150) };
  }
  return { status: res.status, body: parsed };
}

const p1 = await post('/api/booking-eligibility', { ...base, startTime: '12:00' });
record('P1_open_confirmed', p1);
expect(p1.status === 200 && p1.body?.availability?.status === 'confirmed' && p1.body?.availability?.paymentAllowed === true, 'P1 confirmed availability');

const p2 = await post('/api/booking-eligibility', { ...base, startTime: '08:00' });
record('P2_nomatch_failclosed', p2);
expect(p2.status === 200 && p2.body?.availability?.status === 'unavailable' && p2.body?.availability?.paymentAllowed === false, 'P2 unavailable no-match');

const p5 = await post('/api/create-checkout-session', { ...base, startTime: '15:00' });
record('P5_checkout_blocked', p5);
expect(p5.status === 409 && !p5.body?.checkoutUrl && p5.body?.availability?.paymentAllowed === false, 'P5 blocked checkout refused');

const p7 = await post('/api/create-checkout-session', { ...base, startTime: '08:00' });
record('P7_checkout_nomatch', p7);
expect(p7.status === 409 && !p7.body?.checkoutUrl && p7.body?.availability?.paymentAllowed === false, 'P7 no-match checkout refused');

const p8NoSig = await post('/api/stripe/webhook', { type: 'checkout.session.completed' });
record('P8a_webhook_no_signature', p8NoSig);
expect(p8NoSig.status === 400, 'P8a missing signature fails closed');

const p8BadSig = await post('/api/stripe/webhook', { type: 'checkout.session.completed' }, { 'stripe-signature': 't=1,v1=deadbeef' });
record('P8a_webhook_bad_signature', p8BadSig);
expect(p8BadSig.status === 401, 'P8a bad signature fails closed');

const p10NoToken = await get('/api/admin/slots');
record('P10_admin_no_token', p10NoToken);
expect(p10NoToken.status === 401, 'P10 missing admin token fails closed');

const p10WrongToken = await get('/api/admin/slots', { 'x-admin-token': 'wrong-not-the-real-token' });
record('P10_admin_wrong_token', p10WrongToken);
expect(p10WrongToken.status === 401, 'P10 wrong admin token fails closed');

const p6 = await post('/api/create-checkout-session', { ...base, startTime: '10:00' });
record('P6_checkout_open', p6);
const checkoutUrl = p6.body?.checkoutUrl ?? '';
const sessionMatch = typeof checkoutUrl === 'string' ? checkoutUrl.match(/cs_test_[A-Za-z0-9_]+/) : null;
expect(
  p6.status === 200 &&
    p6.body?.ok === true &&
    !!checkoutUrl &&
    new URL(checkoutUrl).host === 'checkout.stripe.com' &&
    !!sessionMatch &&
    p6.body?.availability?.status === 'held' &&
    p6.body?.availability?.safeSlotId === 'slot_r13r8d_cont_checkout_007' &&
    typeof p6.body?.availability?.safeHoldId === 'string',
  'P6 checkout hold and Stripe TEST session created',
);

writeFileSync(new URL('./continuation_p6_hold.json', import.meta.url), JSON.stringify({
  safeSlotId: p6.body?.availability?.safeSlotId ?? null,
  safeHoldId: p6.body?.availability?.safeHoldId ?? null,
  holdExpiresAt: p6.body?.availability?.holdExpiresAt ?? null,
  sessionIdPrefix: sessionMatch ? `${sessionMatch[0].slice(0, 12)}...` : null,
}, null, 2));

writeFileSync(new URL('./continuation_http_results.json', import.meta.url), JSON.stringify(results, null, 2));

if (failures.length) {
  console.error(`\nFAILURES: ${failures.join('; ')}`);
  process.exitCode = 1;
} else {
  console.log('\n=== R13-R8D CONTINUATION HTTP PROOF RUNNER PASS ===');
}
