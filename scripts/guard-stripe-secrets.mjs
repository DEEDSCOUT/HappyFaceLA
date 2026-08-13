#!/usr/bin/env node
// @ts-check

import { spawnSync } from 'node:child_process';

const stripeWebhookPrefix = ['wh', 'sec_'].join('');
const stripeSecretKeyPrefixes = ['sk', 'rk'];
const stripeModes = ['live', 'test'];
const paymentIntentClientSecretPattern =
  'pi_[A-Za-z0-9]{8,}_secret_[A-Za-z0-9]{16,}';
const secretPattern =
  `(${stripeSecretKeyPrefixes.join('|')})_(${stripeModes.join('|')})_[A-Za-z0-9]{16,}` +
  `|${stripeWebhookPrefix}[A-Za-z0-9]{16,}` +
  `|${paymentIntentClientSecretPattern}`;
const redactionPattern = new RegExp(secretPattern, 'g');

function safePath(value) {
  return String(value)
    .replace(redactionPattern, '[REDACTED_STRIPE_SECRET]')
    .replace(/[\u0000-\u001f\u007f]/g, '?');
}

let gitRoot = process.cwd();

function git(args) {
  return spawnSync('git', args, {
    cwd: gitRoot,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function parseNullDelimited(value) {
  return String(value || '').split('\0').filter(Boolean);
}

const failures = [];
function fail(rule, path = '') {
  failures.push({ rule, path: safePath(path) });
}

const root = git(['rev-parse', '--show-toplevel']);
if (root.status !== 0 || !root.stdout.trim()) {
  fail('git-unavailable');
} else {
  gitRoot = root.stdout.trim();
  const conflicts = git(['ls-files', '-u', '-z']);
  if (conflicts.status !== 0) fail('git-index-read-failed');
  else if (conflicts.stdout) fail('git-index-conflict');

  const tracked = git(['ls-files', '--cached', '-z']);
  if (tracked.status !== 0) {
    fail('git-index-read-failed');
  } else {
    for (const path of parseNullDelimited(tracked.stdout)) {
      if (path === '.stripe.txt') fail('tracked-stripe-scratch-file', path);
    }
  }

  for (const [scope, args] of [
    ['index', ['grep', '--cached', '-l', '-z', '-E', secretPattern, '--']],
    ['worktree', ['grep', '-l', '-z', '-E', secretPattern, '--']],
  ]) {
    const result = git(args);
    if (result.status === 0) {
      for (const path of parseNullDelimited(result.stdout)) {
        fail(`stripe-secret-${scope}`, path);
      }
    } else if (result.status !== 1) {
      fail(`git-${scope}-scan-failed`);
    }
  }
}

const unique = new Map();
for (const finding of failures) {
  unique.set(`${finding.rule}\0${finding.path}`, finding);
}
const ordered = [...unique.values()].sort((a, b) =>
  `${a.rule}\0${a.path}`.localeCompare(`${b.rule}\0${b.path}`, 'en'),
);

if (ordered.length === 0) {
  console.log('STRIPE SECRET GUARD: PASS');
  process.exit(0);
}

console.error('STRIPE SECRET GUARD: FAIL');
for (const finding of ordered) {
  console.error(`  [${finding.rule}]${finding.path ? ` ${finding.path}` : ''}`);
}
console.error('Secret values and matching line content are intentionally suppressed.');
process.exit(1);
