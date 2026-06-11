#!/usr/bin/env node
// PUBLIC-BOOKING-R10 Non-Production Preview QA Execution
// Runs against the deployed *.pages.dev preview URL only — never happyfacesla.com.
// Mirrors R8-R2 browser smoke checks adapted for a deployed preview (no local wrangler server).
// PQ-AVAIL-001/002 (confirmed availability) require PUBLIC_BOOKING_LOCAL_AVAILABILITY_CONFIRMED=true
// in the Cloudflare Pages preview environment — SKIP with reference to EVD-PUBLIC-BOOKING-R8-R2-001.

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/shawn/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright-core');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTROL_ROOT = 'C:/Dev/happyfacesla-commercial-control-room';
const EVIDENCE_DIR = path.join(CONTROL_ROOT, 'docs', 'commercial-booking', 'browser-smoke-evidence', 'r10');
const EVIDENCE_JSON = path.join(EVIDENCE_DIR, 'r10-preview-qa-results.json');
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const PREVIEW_URL = 'https://r10-qa-preview.happyfacesla.pages.dev';

const evidence = {
  script: 'validate-r10-preview-qa',
  phase: 'PUBLIC-BOOKING-R10',
  previewUrl: PREVIEW_URL,
  deploymentAlias: 'r10-qa-preview.happyfacesla.pages.dev',
  hashUrl: '98622e8c.happyfacesla.pages.dev',
  startedAt: new Date().toISOString(),
  checks: [],
  screenshots: [],
  skips: [],
};

let failures = 0;

function scrub(value) {
  return String(value ?? '')
    .replace(/sk_(?:test|live)_[A-Za-z0-9_]+/g, 'sk_***')
    .replace(/whsec_[A-Za-z0-9_]+/g, 'whsec_***')
    .replace(/cs_test_[A-Za-z0-9_]+/g, 'cs_test_***')
    .replace(/pi_[A-Za-z0-9_]+_secret_[A-Za-z0-9_]+/g, 'pi_***_secret_***');
}

function record(status, label, details = {}) {
  const safeDetails = JSON.parse(scrub(JSON.stringify(details)));
  evidence.checks.push({ status, label, details: safeDetails });
  const suffix = Object.keys(safeDetails).length ? ` ${JSON.stringify(safeDetails)}` : '';
  console.log(`${status}: ${label}${suffix}`);
  if (status === 'FAIL') failures += 1;
}

function pass(label, details = {}) { record('PASS', label, details); }
function fail(label, details = {}) { record('FAIL', label, details); }
function note(label, details = {}) { record('NOTE', label, details); }
function skip(label, details = {}) {
  evidence.skips.push({ label, ...details });
  console.log(`SKIP: ${label}`);
}

function assertCheck(condition, label, details = {}) {
  if (condition) pass(label, details);
  else fail(label, details);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('HTTP GET timeout')); });
  });
}

function httpPost(url, bodyObj) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(bodyObj);
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 15000,
    };
    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('HTTP POST timeout')); });
    req.write(data);
    req.end();
  });
}

// ── Playwright helpers ────────────────────────────────────────────────────────

async function screenshot(page, filename, description) {
  const fp = path.join(EVIDENCE_DIR, filename);
  await page.screenshot({ path: fp, fullPage: false });
  evidence.screenshots.push({ file: filename, description });
  note('screenshot captured', { file: filename });
}

async function isVisible(page, selector) {
  try { return await page.isVisible(selector, { timeout: 700 }); }
  catch { return false; }
}

async function clickValue(page, value) {
  await page.click(`input[value="${value}"]`, { timeout: 5000 });
}

async function clickNext(page) {
  await page.click('#btn-next');
}

async function waitForStep(page, step) {
  await page.waitForSelector(`[data-wizard-step="${step}"].active`, { timeout: 10000 });
}

async function navigateToStep7(page, options = {}) {
  const {
    eventType = 'birthday-party',
    kidsBucket = '11-18',
    designStyle = 'standard-party',
    duration = 90,
  } = options;
  await page.goto(`${PREVIEW_URL}/plan-my-party/`, { waitUntil: 'networkidle', timeout: 30000 });
  await clickValue(page, eventType);
  await clickNext(page);
  await waitForStep(page, 2);
  await clickValue(page, 'face-painting');
  await clickNext(page);
  await waitForStep(page, 3);
  await clickValue(page, kidsBucket);
  await clickNext(page);
  await waitForStep(page, 4);
  await clickValue(page, designStyle);
  await clickNext(page);
  await waitForStep(page, 5);
  await page.waitForTimeout(800);
  await clickValue(page, String(duration));
  await clickNext(page);
  await waitForStep(page, 6);
  await page.fill('#field-eventDate', '2026-09-15');
  await page.fill('#field-eventTime', '14:00');
  await page.fill('#field-eventCity', 'Los Angeles');
  await clickNext(page);
  await waitForStep(page, 7);
  await page.waitForTimeout(1800);
}

async function navigateToDurationStep(page) {
  await page.goto(`${PREVIEW_URL}/plan-my-party/`, { waitUntil: 'networkidle', timeout: 30000 });
  await clickValue(page, 'birthday-party');
  await clickNext(page);
  await waitForStep(page, 2);
  await clickValue(page, 'face-painting');
  await clickNext(page);
  await waitForStep(page, 3);
  await clickValue(page, '11-18');
  await clickNext(page);
  await waitForStep(page, 4);
  await clickValue(page, 'standard-party');
  await clickNext(page);
  await waitForStep(page, 5);
  await page.waitForTimeout(1000);
}

async function checkNoDomSecrets(page, label) {
  const html = await page.evaluate(() => document.body.innerHTML);
  const patterns = [
    ['STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY variable name'],
    ['STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_SECRET variable name'],
    ['sk_live_', 'Stripe live key prefix'],
    ['sk_test_', 'Stripe test key prefix'],
    ['whsec_', 'Stripe webhook secret prefix'],
    ['client_secret', 'client secret marker'],
    ['payment_intent_secret', 'PaymentIntent secret marker'],
    ['RELEASE STATE', 'internal release marker'],
    ['stripeSessionId', 'internal Stripe session storage field'],
    ['availabilityConfirmed', 'internal availability storage field'],
    ['RPV-PRIVATE-DISPATCH', 'private dispatch ID'],
    ['EVD-PUBLIC-BOOKING', 'internal evidence ID'],
  ];
  for (const [pattern, description] of patterns) {
    assertCheck(!html.includes(pattern), `${label} (PQ-SEC): ${description} absent from DOM`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  note('R10 Non-Production Preview QA', {
    previewUrl: PREVIEW_URL,
    date: new Date().toISOString(),
    note: 'PQ-AVAIL-001/002 SKIPPED — confirmed availability requires PUBLIC_BOOKING_LOCAL_AVAILABILITY_CONFIRMED=true in Cloudflare Pages preview env; proven by EVD-PUBLIC-BOOKING-R8-R2-001',
  });

  // ── PQ-ROUTE: HTTP route checks ─────────────────────────────────────────────
  note('PQ-ROUTE checks');

  const ppResp = await httpGet(`${PREVIEW_URL}/plan-my-party/`);
  assertCheck(ppResp.status === 200, 'PQ-ROUTE-001: /plan-my-party HTTP 200', { status: ppResp.status });

  const bcResp = await httpGet(`${PREVIEW_URL}/booking-confirmed/`);
  assertCheck(bcResp.status === 200, 'PQ-ROUTE-002: /booking-confirmed HTTP 200', { status: bcResp.status });

  const bookResp = await httpGet(`${PREVIEW_URL}/book/`);
  assertCheck(bookResp.status === 404 || bookResp.status >= 300, 'PQ-ROUTE-003: /book not accessible (404 or redirect)', { status: bookResp.status });

  const coResp = await httpGet(`${PREVIEW_URL}/checkout/`);
  assertCheck(coResp.status === 404 || coResp.status >= 300, 'PQ-ROUTE-004: /checkout not accessible (404 or redirect)', { status: coResp.status });

  // ── PQ-SEC: DOM security checks via HTML source ──────────────────────────────
  note('PQ-SEC checks via HTTP HTML source');
  const ppHtml = ppResp.body;
  const secPatterns = [
    ['PQ-SEC-001', 'internal field names (booking_id / event_total_cents)', /booking_id|event_total_cents/],
    ['PQ-SEC-002', 'Stripe secret prefixes (sk_test_ / sk_live_ / whsec_)', /sk_test_|sk_live_|whsec_/],
    ['PQ-SEC-003', 'client_secret', /client_secret/],
    ['PQ-SEC-004', 'internal release state (RELEASE STATE NO_GO)', /RELEASE STATE NO_GO/],
    ['PQ-SEC-005', 'RPV-PRIVATE-DISPATCH identifier', /RPV-PRIVATE-DISPATCH/],
  ];
  for (const [id, description, pattern] of secPatterns) {
    assertCheck(!pattern.test(ppHtml), `${id}: ${description} absent from /plan-my-party HTML`);
  }

  // ── PQ-AVAIL-001/002 SKIP (confirmed state) ──────────────────────────────────
  skip('PQ-AVAIL-001: eligible confirmed shows price', {
    reason: 'Requires PUBLIC_BOOKING_LOCAL_AVAILABILITY_CONFIRMED=true in Cloudflare Pages preview environment',
    priorEvidence: 'EVD-PUBLIC-BOOKING-R8-R2-001 PASS: $450 price + $90 20% retainer verified in real local runtime',
  });
  skip('PQ-AVAIL-002: eligible confirmed shows Stripe button', {
    reason: 'Requires PUBLIC_BOOKING_LOCAL_AVAILABILITY_CONFIRMED=true in Cloudflare Pages preview environment',
    priorEvidence: 'EVD-PUBLIC-BOOKING-R8-R2-001 PASS: #btn-stripe-reserve visible for confirmed state verified in real local runtime',
  });

  // ── PQ-AVAIL-009/010: API-level ineligible checks ────────────────────────────
  note('PQ-AVAIL-009/010 API-level ineligible checks');

  // Correct API schema: { eventType, services: string[], kidsCountBucket, kidsCountActual?, designStyle, durationMinutes, travelMiles }
  const longDurResp = await httpPost(`${PREVIEW_URL}/api/booking-eligibility`, {
    eventType: 'birthday-party', services: ['face-painting'], kidsCountBucket: '11-18', kidsCountActual: 15,
    designStyle: 'standard-party', durationMinutes: 300, travelMiles: 0,
  });
  try {
    const ld = JSON.parse(longDurResp.body);
    assertCheck(
      ld.status === 'custom-review' || ld.status === 'ineligible' || ld.status === 'review-required',
      `PQ-AVAIL-009: ineligible duration (300 min > 4h) → status=${ld.status} (button hidden)`,
      { httpStatus: longDurResp.status, eligibilityStatus: ld.status, paymentAllowed: ld.availability?.paymentAllowed },
    );
  } catch {
    fail('PQ-AVAIL-009: ineligible duration API parse error', { status: longDurResp.status, body: longDurResp.body.slice(0, 200) });
  }

  const longTravelResp = await httpPost(`${PREVIEW_URL}/api/booking-eligibility`, {
    eventType: 'birthday-party', services: ['face-painting'], kidsCountBucket: '11-18', kidsCountActual: 15,
    designStyle: 'standard-party', durationMinutes: 90, travelMiles: 60,
  });
  try {
    const lt = JSON.parse(longTravelResp.body);
    assertCheck(
      lt.status === 'custom-review' || lt.status === 'ineligible' || lt.status === 'review-required' ||
        (lt.availability && lt.availability.paymentAllowed === false),
      `PQ-AVAIL-010: ineligible travel (60 mi > 40 mi limit) → status=${lt.status} paymentAllowed=${lt.availability?.paymentAllowed} (button hidden)`,
      { httpStatus: longTravelResp.status, eligibilityStatus: lt.status, paymentAllowed: lt.availability?.paymentAllowed },
    );
  } catch {
    fail('PQ-AVAIL-010: ineligible travel API parse error', { status: longTravelResp.status, body: longTravelResp.body.slice(0, 200) });
  }

  // ── PQ-CONFIRM: /booking-confirmed page copy ─────────────────────────────────
  note('PQ-CONFIRM checks via HTTP HTML source');
  const bcHtml = bcResp.body;
  // Actual h1: "Retainer received!" — the page is the post-Stripe success page
  assertCheck(/[Rr]etainer received|[Rr]etainer has been received|[Yy]our date is reserved/i.test(bcHtml), 'PQ-CONFIRM-001: retainer-received / date-reserved copy present on /booking-confirmed');
  assertCheck(!/sk_test_|sk_live_|whsec_|client_secret/.test(bcHtml), 'PQ-CONFIRM-002: no secrets in /booking-confirmed HTML');
  assertCheck(!/RPV-PRIVATE-DISPATCH|EVD-PUBLIC-BOOKING/.test(bcHtml), 'PQ-CONFIRM-003: no internal IDs in /booking-confirmed HTML');

  // ── Playwright browser checks ─────────────────────────────────────────────────
  note('Playwright browser checks (chromium headless against preview URL)');

  const browser = await chromium.launch({
    executablePath: existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    // PQ-SS-001/002: Initial load screenshots
    const dCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const dPage = await dCtx.newPage();
    await dPage.goto(`${PREVIEW_URL}/plan-my-party/`, { waitUntil: 'networkidle', timeout: 30000 });
    pass('PQ-ROUTE-001 (browser): /plan-my-party loaded in browser');
    await screenshot(dPage, 'PQ-SS-002-desktop-plan-my-party-initial.png', 'PQ-SS-002: Desktop /plan-my-party initial load');
    pass('PQ-SS-002: Desktop screenshot captured');

    const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mPage = await mCtx.newPage();
    await mPage.goto(`${PREVIEW_URL}/plan-my-party/`, { waitUntil: 'networkidle', timeout: 30000 });
    await screenshot(mPage, 'PQ-SS-001-mobile-plan-my-party-initial.png', 'PQ-SS-001: Mobile /plan-my-party initial load');
    pass('PQ-SS-001: Mobile screenshot captured');
    await mCtx.close();

    // /booking-confirmed screenshot (PQ-SS-007)
    const bcPage = await dCtx.newPage();
    await bcPage.goto(`${PREVIEW_URL}/booking-confirmed/`, { waitUntil: 'networkidle', timeout: 30000 });
    await screenshot(bcPage, 'PQ-SS-007-booking-confirmed.png', 'PQ-SS-007: /booking-confirmed page');
    pass('PQ-SS-007: /booking-confirmed screenshot captured');
    assertCheck(/[Rr]etainer received|[Rr]etainer has been received|[Yy]our date is reserved/i.test(await bcPage.content()), 'PQ-CONFIRM-001 (browser): retainer-received / date-reserved copy present on /booking-confirmed');
    await dCtx.close();

    // PQ-AVAIL-003/004: Unknown availability — birthday-party → step 7
    const uCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const uPage = await uCtx.newPage();
    await navigateToStep7(uPage, { eventType: 'birthday-party' });
    await screenshot(uPage, 'PQ-SS-005-unknown-availability.png', 'PQ-SS-005: Eligible + availability unknown — Stripe button hidden');
    pass('PQ-SS-005: Unknown availability screenshot captured');
    assertCheck(await isVisible(uPage, '#rec-fast'), 'PQ-AVAIL-004: eligible unknown — review path panel (#rec-fast) visible');
    assertCheck(!(await isVisible(uPage, '#rec-pricing-panel')), 'PQ-AVAIL-003a: eligible unknown — pricing panel hidden');
    assertCheck(!(await isVisible(uPage, '#btn-stripe-reserve')), 'PQ-AVAIL-003: eligible unknown — Stripe retainer button hidden');
    await checkNoDomSecrets(uPage, 'eligible unknown step 7');
    await uCtx.close();

    // PQ-AVAIL-005: school-event → custom review
    const sCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const sPage = await sCtx.newPage();
    await navigateToStep7(sPage, { eventType: 'school-event' });
    await screenshot(sPage, 'PQ-SS-006-school-event-hidden.png', 'PQ-SS-006: school-event — Stripe button hidden');
    pass('PQ-SS-006: school-event screenshot captured');
    assertCheck(await isVisible(sPage, '#rec-custom'), 'PQ-AVAIL-005a: school-event — custom review panel visible');
    assertCheck(!(await isVisible(sPage, '#btn-stripe-reserve')), 'PQ-AVAIL-005: school-event — Stripe retainer button hidden');
    await checkNoDomSecrets(sPage, 'school-event step 7');
    await sCtx.close();

    // PQ-AVAIL-006: festival-community → custom review
    const fCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const fPage = await fCtx.newPage();
    await navigateToStep7(fPage, { eventType: 'festival-community' });
    assertCheck(await isVisible(fPage, '#rec-custom'), 'PQ-AVAIL-006a: festival-community — custom review panel visible');
    assertCheck(!(await isVisible(fPage, '#btn-stripe-reserve')), 'PQ-AVAIL-006: festival-community — Stripe retainer button hidden');
    await fCtx.close();

    // PQ-AVAIL-007: corporate-family-day → custom review
    const cCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const cPage = await cCtx.newPage();
    await navigateToStep7(cPage, { eventType: 'corporate-family-day' });
    assertCheck(await isVisible(cPage, '#rec-custom'), 'PQ-AVAIL-007a: corporate-family-day — custom review panel visible');
    assertCheck(!(await isVisible(cPage, '#btn-stripe-reserve')), 'PQ-AVAIL-007: corporate-family-day — Stripe retainer button hidden');
    await cCtx.close();

    // PQ-DURATION-001/002: Duration labels
    const durCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const durPage = await durCtx.newPage();
    await navigateToDurationStep(durPage);
    await screenshot(durPage, 'D01-duration-labels.png', 'Duration labels at wizard step 5');
    const labels = {};
    for (const id of ['60', '90', '120', '180', '240', 'custom']) {
      labels[id] = await durPage.$eval(`#badge-${id}`, el => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || el.classList.contains('hidden')) return '';
        return el.textContent?.trim() ?? '';
      }).catch(() => '');
    }
    const visibleLabels = Object.values(labels).filter(Boolean);
    const primaryLabels = ['Best fit', 'Possible with quick designs'];
    const primaryCount = visibleLabels.filter(l => primaryLabels.includes(l)).length;
    assertCheck(primaryCount === 1, 'PQ-DURATION-001: exactly one primary duration recommendation', { labels });
    assertCheck(!visibleLabels.every(l => l === 'Recommended'), 'PQ-DURATION-002: not all visible duration labels are "Recommended"', { labels });
    await durCtx.close();

  } finally {
    await browser.close();
  }

  // ── PQ-SS-003/004 SKIP (confirmed state screenshots) ──────────────────────────
  skip('PQ-SS-003: Mobile pricing panel screenshot (confirmed state)', {
    reason: 'Requires PUBLIC_BOOKING_LOCAL_AVAILABILITY_CONFIRMED=true in Cloudflare Pages preview env',
    priorEvidence: 'EVD-PUBLIC-BOOKING-R8-R2-001 A01_confirmed_eligible_step7.png captured in real local runtime',
  });
  skip('PQ-SS-004: Desktop pricing panel screenshot (confirmed state)', {
    reason: 'Requires PUBLIC_BOOKING_LOCAL_AVAILABILITY_CONFIRMED=true in Cloudflare Pages preview env',
    priorEvidence: 'EVD-PUBLIC-BOOKING-R8-R2-001 A01_confirmed_eligible_step7.png captured in real local runtime',
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  evidence.completedAt = new Date().toISOString();
  evidence.result = failures === 0 ? 'PASS' : 'FAIL';
  evidence.failureCount = failures;
  evidence.skipCount = evidence.skips.length;

  const passCount = evidence.checks.filter(c => c.status === 'PASS').length;
  const failCount = evidence.checks.filter(c => c.status === 'FAIL').length;
  const noteCount = evidence.checks.filter(c => c.status === 'NOTE').length;
  console.log(`\nR10 QA RESULT: ${evidence.result}`);
  console.log(`Checks: ${passCount} PASS / ${failCount} FAIL / ${evidence.skips.length} SKIP / ${noteCount} NOTE`);
  console.log(`Screenshots: ${evidence.screenshots.length} captured`);
  console.log(`Evidence: ${EVIDENCE_JSON}`);

  await writeFile(EVIDENCE_JSON, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

  if (failures > 0) process.exitCode = 1;
}

main().catch(async err => {
  fail('script threw', { message: scrub(err?.message ?? String(err)) });
  evidence.completedAt = new Date().toISOString();
  evidence.result = 'FAIL';
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await writeFile(EVIDENCE_JSON, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`EVIDENCE_JSON: ${EVIDENCE_JSON}`);
  process.exitCode = 1;
});
