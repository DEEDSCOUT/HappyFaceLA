#!/usr/bin/env node
// PUBLIC-BOOKING-R8-R2 browser smoke for Option A availability gate.
// Runs local Cloudflare Pages runtime only. Never prints env values or secrets.

import { createRequire } from 'node:module';
import { spawn, execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/shawn/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright-core');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTROL_ROOT = 'C:/Dev/happyfacesla-commercial-control-room';
const EVIDENCE_DIR = path.join(CONTROL_ROOT, 'docs', 'commercial-booking', 'browser-smoke-evidence', 'r8-r2');
const EVIDENCE_JSON = path.join(EVIDENCE_DIR, 'browser-smoke-results.json');
const PERSIST_DIR = path.join(ROOT, '.wrangler', 'state-r8-r2-browser-smoke');
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const IS_WINDOWS = process.platform === 'win32';
const NPX = IS_WINDOWS ? 'npx.cmd' : 'npx';

const evidence = {
  script: 'validate-r8-r2-browser-smoke',
  startedAt: new Date().toISOString(),
  checks: [],
  screenshots: [],
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

function pass(label, details = {}) {
  record('PASS', label, details);
}

function fail(label, details = {}) {
  record('FAIL', label, details);
}

function note(label, details = {}) {
  record('NOTE', label, details);
}

function assertCheck(condition, label, details = {}) {
  if (condition) pass(label, details);
  else fail(label, details);
}

function validateArgs(args) {
  return args.map((arg, index) => {
    if (arg === undefined || arg === null) throw new Error(`process arg ${index} is ${arg}`);
    const text = String(arg);
    if (text.includes('\0')) throw new Error(`process arg ${index} contains a null character`);
    return text;
  });
}

function makeEnv() {
  const env = { ...process.env, NO_COLOR: '1', CI: '1' };
  for (const [key, value] of Object.entries(env)) {
    if (key.includes('\0')) throw new Error('process env key contains a null character');
    if (value !== undefined && String(value).includes('\0')) {
      throw new Error(`process env value for ${key} contains a null character`);
    }
  }
  return env;
}

function makeInvocation(command, args) {
  const safeArgs = validateArgs(args);
  if (IS_WINDOWS) {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', command, ...safeArgs],
      commandName: command,
      argumentCount: safeArgs.length,
    };
  }
  return { command, args: safeArgs, commandName: command, argumentCount: safeArgs.length };
}

function execCommand(command, args, options = {}) {
  const invocation = makeInvocation(command, args);
  note('starting child process', {
    commandName: invocation.commandName,
    argumentCount: invocation.argumentCount,
  });
  return new Promise((resolve, reject) => {
    execFile(
      invocation.command,
      invocation.args,
      {
        cwd: ROOT,
        env: makeEnv(),
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        ...options,
      },
      (error, stdout, stderr) => {
        note('child process exited', {
          commandName: invocation.commandName,
          exitCode: error?.code ?? 0,
        });
        if (error) {
          error.stdout = scrub(stdout);
          error.stderr = scrub(stderr);
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

function startPagesDev({ port, availabilityConfirmed }) {
  const args = [
    'wrangler',
    'pages',
    'dev',
    'dist',
    '--port',
    String(port),
    '--kv',
    'BOOKINGS_KV',
    '--persist-to',
    PERSIST_DIR,
    '--env-file',
    '.env.local',
    '--log-level',
    'warn',
    '--show-interactive-dev-session=false',
  ];
  if (availabilityConfirmed) {
    args.push('--binding', 'PUBLIC_BOOKING_LOCAL_AVAILABILITY_CONFIRMED=true');
  }

  const invocation = makeInvocation(NPX, args);
  note('starting child process', {
    commandName: invocation.commandName,
    argumentCount: invocation.argumentCount,
  });
  const child = spawn(invocation.command, invocation.args, {
    cwd: ROOT,
    env: makeEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const logs = [];
  child.stdout.on('data', chunk => logs.push(scrub(chunk.toString())));
  child.stderr.on('data', chunk => logs.push(scrub(chunk.toString())));
  child.on('exit', (code, signal) => {
    note('child process exited', { commandName: invocation.commandName, exitCode: code, signal });
  });
  return { child, logs, port };
}

function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function stopPagesDev(server) {
  if (!server?.child || server.child.killed) return;
  if (IS_WINDOWS && server.child.pid) {
    try {
      await execCommand('taskkill.exe', ['/PID', String(server.child.pid), '/T', '/F']);
    } catch {
      // Process may already be gone.
    }
    await waitForChildExit(server.child, 4000);
    if (server.child.exitCode !== null || server.child.signalCode !== null) return;
  }
  await new Promise(resolve => {
    const timer = setTimeout(() => {
      try {
        server.child.kill('SIGKILL');
      } catch {
        // ignore
      }
      resolve();
    }, 4000);
    server.child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      server.child.kill('SIGTERM');
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

async function waitForServer(baseUrl, server) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`pages dev exited early: ${server.logs.slice(-20).join('\n')}`);
    }
    try {
      const res = await fetch(baseUrl, { method: 'GET' });
      if (res.status < 500) return;
    } catch {
      // wait
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`pages dev did not become ready: ${server.logs.slice(-20).join('\n')}`);
}

async function withServer(options, fn) {
  const server = startPagesDev(options);
  const baseUrl = `http://localhost:${options.port}`;
  try {
    await waitForServer(baseUrl, server);
    pass('Cloudflare Pages local runtime started for browser smoke', {
      port: options.port,
      availabilityConfirmed: !!options.availabilityConfirmed,
      kvBinding: 'BOOKINGS_KV',
    });
    return await fn(baseUrl);
  } finally {
    await stopPagesDev(server);
  }
}

async function screenshot(page, filename, description) {
  const fp = path.join(EVIDENCE_DIR, filename);
  await page.screenshot({ path: fp, fullPage: false });
  evidence.screenshots.push({ file: filename, description });
  note('screenshot captured', { file: filename });
}

async function isVisible(page, selector) {
  try {
    return await page.isVisible(selector, { timeout: 700 });
  } catch {
    return false;
  }
}

async function clickValue(page, value) {
  await page.click(`input[value="${value}"]`, { timeout: 5000 });
}

async function clickNext(page) {
  await page.click('#btn-next');
}

async function waitForStep(page, step) {
  await page.waitForSelector(`[data-wizard-step="${step}"].active`, { timeout: 7000 });
}

async function navigateToStep7(page, baseUrl, options = {}) {
  const {
    eventType = 'birthday-party',
    kidsBucket = '11-18',
    designStyle = 'standard-party',
    duration = 90,
  } = options;
  await page.goto(`${baseUrl}/plan-my-party/`, { waitUntil: 'networkidle', timeout: 20000 });
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
  await page.waitForTimeout(1400);
}

async function navigateToDurationStep(page, baseUrl) {
  await page.goto(`${baseUrl}/plan-my-party/`, { waitUntil: 'networkidle', timeout: 20000 });
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
  ];
  for (const [pattern, description] of patterns) {
    assertCheck(!html.includes(pattern), `${label}: ${description} absent from DOM`);
  }
}

async function runConfirmedFlow(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await navigateToStep7(page, baseUrl);
  await screenshot(page, 'A01_confirmed_eligible_step7.png', 'Eligible + availability confirmed');
  assertCheck(await isVisible(page, '#rec-fast'), 'eligible confirmed: fast quote panel visible');
  assertCheck(await isVisible(page, '#rec-pricing-panel'), 'eligible confirmed: pricing panel visible');
  const priceText = await page.$eval('#rec-price-display', el => el.textContent?.trim() ?? '').catch(() => '');
  const retainerText = await page.$eval('#rec-retainer-display', el => el.textContent?.trim() ?? '').catch(() => '');
  assertCheck(priceText.includes('$450'), 'eligible confirmed: $450 server price displayed', { priceText });
  assertCheck(retainerText.includes('$90'), 'eligible confirmed: $90 20% retainer displayed', { retainerText });
  assertCheck(await isVisible(page, '#btn-stripe-reserve'), 'eligible confirmed: Stripe retainer button visible');
  await checkNoDomSecrets(page, 'eligible confirmed');
  await context.close();
}

async function runUnknownFlow(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await navigateToStep7(page, baseUrl);
  await screenshot(page, 'B01_unknown_eligible_step7.png', 'Eligible + availability unknown');
  assertCheck(await isVisible(page, '#rec-fast'), 'eligible unknown: quote path panel visible');
  assertCheck(!(await isVisible(page, '#rec-pricing-panel')), 'eligible unknown: pricing panel hidden');
  assertCheck(!(await isVisible(page, '#btn-stripe-reserve')), 'eligible unknown: Stripe retainer button hidden');
  const text = await page.$eval('#rec-fast', el => el.textContent ?? '').catch(() => '');
  assertCheck(text.includes('No payment is due yet'), 'eligible unknown: quote/review copy shown');
  await checkNoDomSecrets(page, 'eligible unknown');
  await context.close();
}

async function runCustomReviewFlow(browser, baseUrl, eventType) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await navigateToStep7(page, baseUrl, { eventType });
  await screenshot(page, `C01_${eventType}_custom_review.png`, `${eventType} custom review`);
  assertCheck(await isVisible(page, '#rec-custom'), `${eventType}: custom review panel visible`);
  assertCheck(!(await isVisible(page, '#rec-pricing-panel')), `${eventType}: pricing panel hidden`);
  assertCheck(!(await isVisible(page, '#btn-stripe-reserve')), `${eventType}: Stripe retainer button hidden`);
  await checkNoDomSecrets(page, `${eventType} custom-review`);
  await context.close();
}

async function runDurationLabelsFlow(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await navigateToDurationStep(page, baseUrl);
  await screenshot(page, 'D01_duration_labels.png', 'Duration labels');
  const labels = {};
  for (const id of ['60', '90', '120', '180', '240', 'custom']) {
    labels[id] = await page.$eval(`#badge-${id}`, el => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || el.classList.contains('hidden')) return '';
      return el.textContent?.trim() ?? '';
    }).catch(() => '');
  }
  const visibleLabels = Object.values(labels).filter(Boolean);
  const primaryLabels = ['Best fit', 'Possible with quick designs'];
  const primaryCount = visibleLabels.filter(label => primaryLabels.includes(label)).length;
  assertCheck(primaryCount === 1, 'duration labels: exactly one primary recommendation', { labels });
  assertCheck(!visibleLabels.every(label => label === 'Recommended'), 'duration labels: not all visible labels are Recommended', { labels });
  await context.close();
}

async function main() {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    await withServer({ port: 8790, availabilityConfirmed: true }, async baseUrl => {
      await runConfirmedFlow(browser, baseUrl);
      await runCustomReviewFlow(browser, baseUrl, 'school-event');
      await runCustomReviewFlow(browser, baseUrl, 'festival-community');
      await runCustomReviewFlow(browser, baseUrl, 'corporate-family-day');
      await runDurationLabelsFlow(browser, baseUrl);
    });

    await withServer({ port: 8791, availabilityConfirmed: false }, async baseUrl => {
      await runUnknownFlow(browser, baseUrl);
    });
  } finally {
    await browser.close();
  }

  evidence.completedAt = new Date().toISOString();
  evidence.result = failures === 0 ? 'PASS' : 'FAIL';
  await writeFile(EVIDENCE_JSON, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`EVIDENCE_JSON: ${EVIDENCE_JSON}`);
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
