#!/usr/bin/env node
// PUBLIC-BOOKING-R8-R2 real Stripe + Cloudflare Pages Functions + KV proof.
// Reads local env files silently. Never prints secret values.

import Stripe from 'stripe';
import { spawn, execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTROL_ROOT = 'C:/Dev/happyfacesla-commercial-control-room';
const EVIDENCE_DIR = path.join(CONTROL_ROOT, 'docs', 'commercial-booking', 'runtime-evidence', 'r8-r2');
const EVIDENCE_JSON = path.join(EVIDENCE_DIR, 'real-runtime-results.json');
const PERSIST_DIR = path.join(ROOT, '.wrangler', 'state-r8-r2-real-runtime');
const IS_WINDOWS = process.platform === 'win32';
const NPX = IS_WINDOWS ? 'npx.cmd' : 'npx';

const CHECKOUT_PAYLOAD = {
  eventType: 'birthday-party',
  services: ['face-painting'],
  kidsCountBucket: '11-18',
  kidsCountActual: null,
  designStyle: 'standard-party',
  durationMinutes: 90,
  travelMiles: 0,
  eventDate: '2026-09-15',
  eventTime: '14:00',
  eventCity: 'Los Angeles',
  customerEmail: 'r8-r2-stripe-proof@example.com',
};

const evidence = {
  script: 'validate-r8-r2-real-runtime',
  startedAt: new Date().toISOString(),
  checks: [],
};

let failures = 0;
let stripeSecret = '';
let webhookSecret = '';

function scrub(value) {
  let text = String(value ?? '');
  for (const secret of [stripeSecret, webhookSecret]) {
    if (secret && secret.length > 8) {
      text = text.split(secret).join('<redacted>');
    }
  }
  text = text.replace(/sk_(?:test|live)_[A-Za-z0-9_]+/g, 'sk_***');
  text = text.replace(/whsec_[A-Za-z0-9_]+/g, 'whsec_***');
  text = text.replace(/cs_test_[A-Za-z0-9_]+/g, 'cs_test_***');
  text = text.replace(/pi_[A-Za-z0-9_]+_secret_[A-Za-z0-9_]+/g, 'pi_***_secret_***');
  return text;
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

function validateProcessArgs(args) {
  if (!Array.isArray(args)) {
    throw new Error('process args must be an array');
  }
  return args.map((arg, index) => {
    if (arg === undefined || arg === null) {
      throw new Error(`process arg ${index} is ${arg}`);
    }
    const text = String(arg);
    if (text.includes('\0')) {
      throw new Error(`process arg ${index} contains a null character`);
    }
    return text;
  });
}

function validateProcessEnv(env) {
  for (const [key, value] of Object.entries(env)) {
    if (key.includes('\0')) {
      throw new Error('process env key contains a null character');
    }
    if (value !== undefined && String(value).includes('\0')) {
      throw new Error(`process env value for ${key} contains a null character`);
    }
  }
  return env;
}

function makeProcessEnv() {
  return validateProcessEnv({ ...process.env, NO_COLOR: '1', CI: '1' });
}

function makeProcessInvocation(command, args) {
  const safeArgs = validateProcessArgs(args);
  if (IS_WINDOWS) {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', command, ...safeArgs],
      commandName: command,
      argumentCount: safeArgs.length,
    };
  }
  return {
    command,
    args: safeArgs,
    commandName: command,
    argumentCount: safeArgs.length,
  };
}

function execCommand(command, args, options = {}) {
  const invocation = makeProcessInvocation(command, args);
  note('starting child process', {
    commandName: invocation.commandName,
    argumentCount: invocation.argumentCount,
  });
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = execFile(
        invocation.command,
        invocation.args,
        {
          cwd: ROOT,
          env: makeProcessEnv(),
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
    } catch (err) {
      note('child process spawn failed', {
        commandName: invocation.commandName,
        errorCode: err?.code ?? 'unknown',
      });
      reject(err);
      return;
    }
    child?.on('error', err => {
      note('child process error', {
        commandName: invocation.commandName,
        errorCode: err?.code ?? 'unknown',
      });
    });
  });
}

function parseEnvText(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = normalized.indexOf('=');
    if (eq <= 0) continue;
    const key = normalized.slice(0, eq).trim();
    let value = normalized.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function loadLocalEnv() {
  const candidates = ['.dev.vars', '.env.local', '.env'];
  const merged = { ...process.env };
  const loaded = [];
  for (const rel of candidates) {
    const fp = path.join(ROOT, rel);
    if (!existsSync(fp)) continue;
    const parsed = parseEnvText(await readFile(fp, 'utf8'));
    Object.assign(merged, parsed);
    loaded.push(rel);
  }
  pass('local env files loaded without printing values', { files: loaded });
  return merged;
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

  const invocation = makeProcessInvocation(NPX, args);
  note('starting child process', {
    commandName: invocation.commandName,
    argumentCount: invocation.argumentCount,
  });

  let child;
  try {
    child = spawn(invocation.command, invocation.args, {
      cwd: ROOT,
      env: makeProcessEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch (err) {
    note('child process spawn failed', {
      commandName: invocation.commandName,
      errorCode: err?.code ?? 'unknown',
    });
    throw err;
  }

  const logs = [];
  child.stdout.on('data', chunk => logs.push(scrub(chunk.toString())));
  child.stderr.on('data', chunk => logs.push(scrub(chunk.toString())));
  child.on('error', err => {
    note('child process error', {
      commandName: invocation.commandName,
      errorCode: err?.code ?? 'unknown',
    });
  });
  child.on('exit', (code, signal) => {
    note('child process exited', {
      commandName: invocation.commandName,
      exitCode: code,
      signal,
    });
  });

  return {
    child,
    logs,
    port,
    commandName: invocation.commandName,
    argumentCount: invocation.argumentCount,
  };
}

function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
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
      // The process may already have exited; the follow-up wait/fallback handles that case.
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
    pass('Cloudflare Pages local runtime started', {
      port: options.port,
      availabilityConfirmed: !!options.availabilityConfirmed,
      kvBinding: 'BOOKINGS_KV',
    });
    return await fn(baseUrl);
  } finally {
    await stopPagesDev(server);
  }
}

async function postJson(baseUrl, pathname, body) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // leave null
  }
  return { status: res.status, text, json };
}

async function postRaw(baseUrl, pathname, body, headers = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers,
    body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // leave null
  }
  return { status: res.status, text, json };
}

function extractSessionId(checkoutUrl) {
  const match = String(checkoutUrl ?? '').match(/cs_test_[A-Za-z0-9_]+/);
  return match?.[0] ?? null;
}

function maskedCheckoutUrl(checkoutUrl) {
  const url = String(checkoutUrl ?? '');
  if (!url) return '';
  return scrub(url.split('#')[0]);
}

async function retrieveLineItem(stripe, sessionId) {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
    limit: 1,
    expand: ['data.price.product'],
  });
  return { session, lineItem: lineItems.data[0] };
}

async function readLocalKv(key) {
  const { stdout } = await execCommand(NPX, [
    'wrangler',
    'kv',
    'key',
    'get',
    key,
    '--namespace-id',
    'BOOKINGS_KV',
    '--local',
    '--persist-to',
    PERSIST_DIR,
    '--text',
  ]);
  const text = stdout.trim();
  if (text === 'Value not found') {
    throw new Error(`local KV key not found: ${key}`);
  }
  return text;
}

function responseHasNoSecrets(label, responseText) {
  const text = String(responseText ?? '');
  assertCheck(!/STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/.test(text), `${label}: env secret names not returned`);
  assertCheck(!/sk_(?:test|live)_/.test(text), `${label}: Stripe secret key prefix not returned`);
  assertCheck(!/whsec_/.test(text), `${label}: webhook secret prefix not returned`);
  assertCheck(!/client_secret/.test(text), `${label}: client secret not returned`);
  assertCheck(!/payment_intent[^"]*secret|pi_[A-Za-z0-9_]+_secret_/.test(text), `${label}: PaymentIntent secret not returned`);
}

function makeCompletedEvent({ eventId, session }) {
  return {
    id: eventId,
    object: 'event',
    api_version: '2025-05-28.basil',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: 'checkout.session.completed',
    data: {
      object: {
        id: session.id,
        object: 'checkout.session',
        amount_total: session.amount_total,
        currency: session.currency,
        metadata: session.metadata,
        mode: 'payment',
        payment_status: 'paid',
      },
    },
  };
}

async function main() {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const env = await loadLocalEnv();
  stripeSecret = env.STRIPE_SECRET_KEY ?? '';
  webhookSecret = env.STRIPE_WEBHOOK_SECRET ?? '';

  assertCheck(stripeSecret.startsWith('sk_test_'), 'Stripe secret is present and test-mode only');
  assertCheck(!stripeSecret.startsWith('sk_live_'), 'Stripe live secret is not used');
  assertCheck(webhookSecret.startsWith('whsec_'), 'Stripe webhook signing secret is present');

  if (failures > 0) {
    throw new Error('required test-mode Stripe/Webhook environment is not configured');
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: '2025-05-28.basil' });
  let primarySessionId = null;
  let primarySession = null;
  let bookingId = null;
  let eventId = null;

  await withServer({ port: 8788, availabilityConfirmed: true }, async baseUrl => {
    const eligibility = await postJson(baseUrl, '/api/booking-eligibility', CHECKOUT_PAYLOAD);
    assertCheck(eligibility.status === 200 && eligibility.json?.ok === true, 'POST /api/booking-eligibility works', {
      status: eligibility.status,
      eligibilityStatus: eligibility.json?.status,
      availability: eligibility.json?.availability?.status,
    });
    assertCheck(eligibility.json?.availability?.paymentAllowed === true, 'availability-confirmed runtime permits payment');
    assertCheck(eligibility.json?.pricing?.eventTotalCents === 45000, 'server-calculated total is 45000 cents');
    assertCheck(eligibility.json?.pricing?.retainerCents === 9000, 'server-calculated retainer is 20 percent');
    responseHasNoSecrets('booking-eligibility response', eligibility.text);

    const checkout = await postJson(baseUrl, '/api/create-checkout-session', CHECKOUT_PAYLOAD);
    assertCheck(checkout.status === 200 && checkout.json?.ok === true, 'POST /api/create-checkout-session creates eligible session', {
      status: checkout.status,
      checkoutUrl: maskedCheckoutUrl(checkout.json?.checkoutUrl),
    });
    responseHasNoSecrets('eligible checkout response', checkout.text);
    primarySessionId = extractSessionId(checkout.json?.checkoutUrl);
    assertCheck(!!primarySessionId, 'Checkout URL contains Stripe test Checkout Session id');

    const retrieved = await retrieveLineItem(stripe, primarySessionId);
    primarySession = retrieved.session;
    const lineItem = retrieved.lineItem;
    const product = lineItem?.price?.product;
    const productName = typeof product === 'string' ? product : product?.name;
    bookingId = primarySession.metadata?.booking_id ?? null;
    assertCheck(primarySession.livemode === false, 'Stripe Checkout Session is test mode');
    assertCheck(lineItem?.amount_total === 9000, 'Stripe line item retainer amount is 9000 cents');
    assertCheck(lineItem?.currency === 'usd', 'Stripe line item currency is USD');
    assertCheck(productName === '20% Booking Retainer - Happy Faces LA', 'Stripe product label is customer-safe', {
      productName,
    });
    assertCheck(primarySession.metadata?.event_total_cents === '45000', 'Stripe metadata stores server-calculated total');
    assertCheck(primarySession.metadata?.retainer_cents === '9000', 'Stripe metadata stores 20 percent retainer');
    assertCheck(!!bookingId, 'Stripe metadata contains stable booking_id');

    const tampered = await postJson(baseUrl, '/api/create-checkout-session', {
      ...CHECKOUT_PAYLOAD,
      eventTotalCents: 1,
      retainerCents: 1,
      price: 1,
      checkoutUrl: 'https://attacker.invalid',
    });
    assertCheck(tampered.status === 200 && tampered.json?.ok === true, 'tampered client price request still creates session from server price');
    const tamperedSessionId = extractSessionId(tampered.json?.checkoutUrl);
    const tamperedRetrieved = await retrieveLineItem(stripe, tamperedSessionId);
    assertCheck(tamperedRetrieved.lineItem?.amount_total === 9000, 'tampered client price ignored: retainer remains 9000 cents');
    responseHasNoSecrets('tampered checkout response', tampered.text);

    const customReview = await postJson(baseUrl, '/api/create-checkout-session', {
      ...CHECKOUT_PAYLOAD,
      eventType: 'school-event',
    });
    assertCheck(customReview.status === 400 && customReview.json?.ok === false, 'custom-review event is rejected');
    responseHasNoSecrets('custom-review response', customReview.text);

    const travelReject = await postJson(baseUrl, '/api/create-checkout-session', {
      ...CHECKOUT_PAYLOAD,
      travelMiles: 41,
    });
    assertCheck(travelReject.status === 400 && travelReject.json?.ok === false, 'ineligible travel is rejected');

    const durationReject = await postJson(baseUrl, '/api/create-checkout-session', {
      ...CHECKOUT_PAYLOAD,
      durationMinutes: 300,
    });
    assertCheck(durationReject.status === 400 && durationReject.json?.ok === false, 'ineligible duration is rejected');

    const artistReject = await postJson(baseUrl, '/api/create-checkout-session', {
      ...CHECKOUT_PAYLOAD,
      kidsCountBucket: '40-plus',
      kidsCountActual: 160,
      durationMinutes: 60,
    });
    assertCheck(artistReject.status === 400 && artistReject.json?.ok === false, 'ineligible artist-count is rejected');
  });

  const initialRaw = await readLocalKv(`booking:${bookingId}`);
  const initialRecord = JSON.parse(initialRaw);
  assertCheck(initialRecord.bookingId === bookingId, 'KV booking_id is stable after checkout response');
  assertCheck(initialRecord.paymentStatus === 'pending', 'KV booking record is written before webhook');
  assertCheck(initialRecord.stripeSessionId === primarySessionId, 'KV stores Stripe session ID before checkout response is returned');
  assertCheck(initialRecord.availabilityConfirmed === true, 'KV records availability_confirmed=true only for confirmed runtime');

  await withServer({ port: 8788, availabilityConfirmed: true }, async baseUrl => {
    eventId = `evt_r8r2_${Date.now()}`;
    const event = makeCompletedEvent({ eventId, session: primarySession });
    const payload = JSON.stringify(event);
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });

    const unsigned = await postRaw(baseUrl, '/api/stripe/webhook', payload, {
      'content-type': 'application/json',
    });
    assertCheck(unsigned.status === 400, 'POST /api/stripe/webhook rejects unsigned event', {
      status: unsigned.status,
    });
    responseHasNoSecrets('unsigned webhook response', unsigned.text);

    const invalid = await postRaw(baseUrl, '/api/stripe/webhook', payload, {
      'content-type': 'application/json',
      'stripe-signature': 't=111,v1=invalid',
    });
    assertCheck(invalid.status === 401, 'POST /api/stripe/webhook rejects invalid signature', {
      status: invalid.status,
    });
    responseHasNoSecrets('invalid webhook response', invalid.text);

    const valid = await postRaw(baseUrl, '/api/stripe/webhook', payload, {
      'content-type': 'application/json',
      'stripe-signature': signature,
    });
    assertCheck(valid.status === 200 && valid.json?.received === true, 'POST /api/stripe/webhook accepts valid signed test event', {
      status: valid.status,
      type: valid.json?.type,
    });
    responseHasNoSecrets('valid webhook response', valid.text);

    const duplicate = await postRaw(baseUrl, '/api/stripe/webhook', payload, {
      'content-type': 'application/json',
      'stripe-signature': signature,
    });
    assertCheck(duplicate.status === 200 && duplicate.json?.received === true, 'duplicate webhook is accepted idempotently', {
      status: duplicate.status,
      type: duplicate.json?.type,
    });
  });

  const updatedRaw = await readLocalKv(`booking:${bookingId}`);
  const updatedRecord = JSON.parse(updatedRaw);
  assertCheck(updatedRecord.bookingId === bookingId, 'webhook updates the same booking record');
  assertCheck(updatedRecord.paymentStatus === 'retainer_paid', 'webhook updates paymentStatus to retainer_paid');
  assertCheck(updatedRecord.stripeSessionId === primarySessionId, 'webhook preserves Stripe session ID on same booking');
  const idempotencyValue = await readLocalKv(`stripe_event:${eventId}`);
  assertCheck(idempotencyValue === 'processed', 'webhook idempotency key persisted once');

  await withServer({ port: 8789, availabilityConfirmed: false }, async baseUrl => {
    const eligibility = await postJson(baseUrl, '/api/booking-eligibility', CHECKOUT_PAYLOAD);
    assertCheck(eligibility.status === 200 && eligibility.json?.availability?.status === 'unknown', 'availability-unknown runtime reports unknown availability');
    assertCheck(eligibility.json?.availability?.paymentAllowed === false, 'availability-unknown runtime does not permit payment');
    const checkout = await postJson(baseUrl, '/api/create-checkout-session', CHECKOUT_PAYLOAD);
    assertCheck(checkout.status === 409 && checkout.json?.ok === false, 'availability-unknown runtime rejects checkout creation', {
      status: checkout.status,
      error: checkout.json?.error,
    });
    responseHasNoSecrets('availability-unknown checkout response', checkout.text);
  });

  evidence.completedAt = new Date().toISOString();
  evidence.result = failures === 0 ? 'PASS' : 'FAIL';
  await writeFile(EVIDENCE_JSON, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`EVIDENCE_JSON: ${EVIDENCE_JSON}`);

  if (failures > 0) {
    process.exitCode = 1;
  }
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
