#!/usr/bin/env node
// @ts-check

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const routePath = resolve(
  here,
  '..',
  '..',
  'functions',
  'api',
  'internal',
  'stripe-ir03b-binding-check.ts',
);
const source = await readFile(routePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: routePath,
  reportDiagnostics: true,
});
assert.deepEqual(transpiled.diagnostics, []);

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`;
const { createBindingCheckHandler } = await import(moduleUrl);

const probeToken = 'synthetic-probe-token-that-is-not-a-credential';
const matchingSecret = 'synthetic-stripe-secret-for-deterministic-test';
const matchingFingerprint = Buffer.from(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(matchingSecret)),
).toString('hex').toUpperCase();

let fetchCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error('fetch must not be called');
};

const capturedLogs = [];
const originalConsole = { ...console };
for (const method of ['debug', 'error', 'info', 'log', 'warn']) {
  console[method] = (...values) => capturedLogs.push(values.join(' '));
}

function request({ method = 'GET', token, query = '' } = {}) {
  const headers = new Headers();
  if (token !== undefined) headers.set('x-hfla-ir03b-probe', token);
  return new Request(`https://happyfacesla.com/api/internal/stripe-ir03b-binding-check${query}`, {
    method,
    headers,
    redirect: 'error',
  });
}

function env(stripeSecret) {
  const allowed = {
    STRIPE_IR03B_PROBE_TOKEN: probeToken,
    STRIPE_SECRET_KEY: stripeSecret,
  };
  return new Proxy(allowed, {
    get(target, property) {
      assert.equal(
        property === 'STRIPE_IR03B_PROBE_TOKEN' || property === 'STRIPE_SECRET_KEY',
        true,
        `unexpected environment access: ${String(property)}`,
      );
      return target[property];
    },
  });
}

async function invoke({ stripeSecret = matchingSecret, ...options } = {}) {
  const handler = createBindingCheckHandler(matchingFingerprint);
  return handler({ request: request(options), env: env(stripeSecret) });
}

try {
  const missing = await invoke();
  assert.equal(missing.status, 401);
  assert.deepEqual(await missing.json(), { ok: false });

  const wrong = await invoke({ token: 'wrong-token' });
  assert.equal(wrong.status, 401);
  assert.deepEqual(await wrong.json(), { ok: false });

  const matching = await invoke({ token: probeToken });
  assert.equal(matching.status, 200);
  assert.equal(matching.headers.get('location'), null);
  assert.deepEqual(await matching.clone().json(), {
    ok: true,
    match: true,
    deployment: 'stripe-ir03b-binding-check-v1',
  });

  const different = await invoke({ token: probeToken, stripeSecret: 'different-synthetic-secret' });
  assert.equal(different.status, 200);
  assert.deepEqual(await different.clone().json(), {
    ok: true,
    match: false,
    deployment: 'stripe-ir03b-binding-check-v1',
  });

  const wrongMethod = await invoke({ method: 'POST', token: probeToken });
  assert.equal(wrongMethod.status, 405);

  const query = await invoke({ token: probeToken, query: '?probe=not-accepted' });
  assert.equal(query.status, 400);

  const responseText = `${await matching.text()}\n${await different.text()}`;
  for (const forbidden of [probeToken, matchingSecret, matchingFingerprint]) {
    assert.equal(responseText.includes(forbidden), false);
    assert.equal(capturedLogs.join('\n').includes(forbidden), false);
  }

  assert.equal(fetchCalls, 0);
  assert.equal(capturedLogs.length, 0);

  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bconsole\s*\./);
  assert.doesNotMatch(source, /from\s+['\"]stripe['\"]/);
  assert.doesNotMatch(source, /AVAILABILITY_D1|BOOKINGS_KV|STRIPE_WEBHOOK_SECRET|MAKE|GMAIL|SHEETS/i);
  assert.match(
    source,
    /type Env = \{\s*STRIPE_SECRET_KEY\?: string;\s*STRIPE_IR03B_PROBE_TOKEN\?: string;\s*\};/,
  );

  originalConsole.log('STRIPE IR-03B BINDING CHECK TEST: PASS');
} finally {
  globalThis.fetch = originalFetch;
  Object.assign(console, originalConsole);
}
