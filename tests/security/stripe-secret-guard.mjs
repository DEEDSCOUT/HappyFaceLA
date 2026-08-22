#!/usr/bin/env node
// @ts-check

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scanner = resolve(here, '..', '..', 'scripts', 'guard-stripe-secrets.mjs');
const stripeAudit = resolve(here, '..', '..', 'scripts', 'stripe-audit.mjs');
const scratchRoots = [];

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
}

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'hfla-stripe-guard-'));
  scratchRoots.push(root);
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'security-test@invalid.example']);
  git(root, ['config', 'user.name', 'Security Test']);
  writeFileSync(join(root, '.gitignore'), '.ignored-secret\n', 'utf8');
  writeFileSync(join(root, 'clean.txt'), 'clean\n', 'utf8');
  git(root, ['add', '.gitignore', 'clean.txt']);
  return root;
}

function write(root, path, value) {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, value, 'utf8');
}

function run(root, cwd = root) {
  const result = spawnSync(process.execPath, [scanner], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  return { status: result.status, output: `${result.stdout || ''}${result.stderr || ''}` };
}

const standardTest = ['sk', 'test', 'A'.repeat(40)].join('_');
const standardLive = ['sk', 'live', 'B'.repeat(40)].join('_');
const restrictedTest = ['rk', 'test', 'C'.repeat(40)].join('_');
const restrictedLive = ['rk', 'live', 'D'.repeat(40)].join('_');
const webhook = `${['wh', 'sec'].join('')}_${'E'.repeat(40)}`;
const paymentIntentClientSecret = [
  'pi',
  'F'.repeat(24),
  'secret',
  'G'.repeat(32),
].join('_');
const secrets = [
  standardTest,
  standardLive,
  restrictedTest,
  restrictedLive,
  webhook,
  paymentIntentClientSecret,
];

try {
  {
    const root = repo();
    const result = run(root);
    assert.equal(result.status, 0);
    assert.match(result.output, /STRIPE SECRET GUARD: PASS/);
  }

  {
    const root = repo();
    write(root, 'root-secret.txt', `${standardTest}\n`);
    write(root, 'nested/placeholder.txt', 'clean\n');
    git(root, ['add', 'root-secret.txt', 'nested/placeholder.txt']);
    const result = run(root, join(root, 'nested'));
    assert.notEqual(result.status, 0);
    assert.match(result.output, /stripe-secret-index/);
    assert.equal(result.output.includes(standardTest), false);
  }

  {
    const root = repo();
    write(root, '.stripe.txt', '');
    git(root, ['add', '.stripe.txt']);
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /tracked-stripe-scratch-file/);
  }

  {
    const root = repo();
    write(root, 'untracked-secret.txt', `${standardTest}\n`);
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /stripe-secret-untracked/);
    assert.equal(result.output.includes(standardTest), false);
  }

  {
    const root = repo();
    write(root, '.stripe.txt', 'clean\n');
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /untracked-stripe-scratch-file/);
  }

  for (const [index, secret] of secrets.entries()) {
    const root = repo();
    write(root, `fixture-${index}.txt`, `credential=${secret}\n`);
    git(root, ['add', `fixture-${index}.txt`]);
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /stripe-secret-index/);
    assert.equal(result.output.includes(secret), false);
  }

  {
    const root = repo();
    const binarySecret = Buffer.from(`prefix\0${standardTest}\0suffix`, 'utf8');
    writeFileSync(join(root, 'binary-secret.bin'), binarySecret);
    git(root, ['add', 'binary-secret.bin']);
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /stripe-secret-index/);
    assert.equal(result.output.includes(standardTest), false);
  }

  {
    const root = repo();
    const binaryClientSecret = Buffer.from(
      `prefix\0${paymentIntentClientSecret}\0suffix`,
      'utf8',
    );
    writeFileSync(join(root, 'binary-client-secret.bin'), binaryClientSecret);
    git(root, ['add', 'binary-client-secret.bin']);
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /stripe-secret-index/);
    assert.equal(result.output.includes(paymentIntentClientSecret), false);
  }

  {
    const root = repo();
    write(root, '.gitattributes', '*.credential binary\n');
    write(root, 'marked.credential', `${paymentIntentClientSecret}\n`);
    git(root, ['add', '.gitattributes', 'marked.credential']);
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /stripe-secret-index/);
    assert.equal(result.output.includes(paymentIntentClientSecret), false);
  }

  {
    const root = repo();
    write(root, 'safe-placeholders.txt', [
      'STRIPE_SECRET_KEY=',
      'STRIPE_WEBHOOK_SECRET=',
      'pk_test_publishable_example',
      ['sk', 'test', 'placeholder'].join('_'),
      `${['wh', 'sec'].join('')}_placeholder`,
      ['pi', '123'].join('_'),
      ['pi', 'H'.repeat(24)].join('_'),
      ['pi', 'short', 'secret', 'tiny'].join('_'),
      '',
    ].join('\n'));
    git(root, ['add', 'safe-placeholders.txt']);
    assert.equal(run(root).status, 0);
  }

  {
    const root = repo();
    write(root, 'tracked.txt', 'clean\n');
    git(root, ['add', 'tracked.txt']);
    git(root, ['commit', '-qm', 'baseline']);
    write(root, 'tracked.txt', `${paymentIntentClientSecret}\n`);
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /stripe-secret-worktree/);
    assert.equal(result.output.includes(paymentIntentClientSecret), false);
  }

  {
    const syntheticWrongPrefix = ['sk', 'test', 'F'.repeat(40)].join('_');
    const result = spawnSync(process.execPath, [stripeAudit, '--format-webhook-status'], {
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, HFLA_TEST_WEBHOOK_VALUE: syntheticWrongPrefix },
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    assert.equal(result.status, 0);
    assert.match(output, /present_wrong_prefix/);
    assert.equal(output.includes(syntheticWrongPrefix), false);
    assert.equal(output.includes(syntheticWrongPrefix.slice(0, 3)), false);
  }

  {
    const root = repo();
    write(root, '.ignored-secret', `${standardTest}\n`);
    assert.equal(run(root).status, 0);
  }

  {
    const root = repo();
    write(root, '.stripe.txt', `${webhook}\n`);
    git(root, ['add', '.stripe.txt']);
    git(root, ['commit', '-qm', 'historical secret fixture']);
    rmSync(join(root, '.stripe.txt'));
    git(root, ['add', '-u']);
    const result = run(root);
    assert.equal(result.status, 0);
    assert.equal(result.output.includes(webhook), false);
  }

  console.log('STRIPE SECRET GUARD TESTS: PASS');
} finally {
  for (const root of scratchRoots) rmSync(root, { recursive: true, force: true });
}
