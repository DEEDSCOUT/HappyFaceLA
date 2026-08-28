#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function candidateFiles() {
  const dirty = git(['status', '--porcelain=v1']);
  if (dirty) {
    const tracked = git(['diff', '--name-only']).split(/\r?\n/).filter(Boolean);
    const untracked = git(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/).filter(Boolean);
    return [...new Set([...tracked, ...untracked])];
  }
  return git(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'])
    .split(/\r?\n/)
    .filter(Boolean);
}

function addedLinesFor(file, dirty) {
  if (dirty && git(['ls-files', '--', file]).length === 0) {
    return readFileSync(resolve(ROOT, file), 'utf8').split(/\r?\n/);
  }
  const base = dirty ? 'HEAD' : 'HEAD^';
  const patch = git(['diff', '--no-ext-diff', '--unified=0', base, '--', file]);
  return patch
    .split(/\r?\n/)
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1));
}

const files = candidateFiles().sort();
const dirty = Boolean(git(['status', '--porcelain=v1']));
const findings = [];

function finding(rule, file, lineNumber) {
  findings.push({ rule, file, line: lineNumber });
}

for (const file of files) {
  const lines = addedLinesFor(file, dirty);
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (file === 'scripts/scan-outcome-measurement-slice1-security.mjs') return;
    if (/\b(?:sk|rk)_live_[A-Za-z0-9]{12,}/.test(line)) finding('stripe_live_secret', file, lineNumber);
    if (/\bpi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+/.test(line)) finding('payment_intent_client_secret', file, lineNumber);
    if (/\bAIza[0-9A-Za-z_-]{20,}/.test(line)) finding('google_api_key', file, lineNumber);
    if (/\bya29\.[0-9A-Za-z_-]{20,}/.test(line)) finding('google_oauth_token', file, lineNumber);
    if (/https:\/\/(?:hook|us\d+\.make)\.[^\s'"`]+/i.test(line)) finding('make_webhook_endpoint', file, lineNumber);
    if (/x-make-apikey\s*[:=]\s*['"][^'"]+['"]/i.test(line)) finding('make_api_key_value', file, lineNumber);
    if (/\b[A-Z0-9._%+-]+@(?!example\.test\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(line)) {
      finding('non_fixture_email_literal', file, lineNumber);
    }
    if (
      /(?:\+?1[\s.-]*)?\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}/.test(line)
      && !/\b555\b/.test(line)
      && !line.includes('00000000-0000-0000-0000-000000000000')
    ) {
      finding('non_fixture_phone_literal', file, lineNumber);
    }
    if (/\b(?:dataLayer|gtag|googletagmanager|google-analytics)\b/i.test(line)) {
      finding('unauthorized_analytics_addition', file, lineNumber);
    }

    for (const match of line.matchAll(/\b(?:gclid|gbraid|wbraid)\s*[:=]\s*['"]([^'"]+)['"]/gi)) {
      if (!/^(?:TEST|NOT|SHOULD)-/i.test(match[1])) finding('non_synthetic_click_id_literal', file, lineNumber);
    }
  });
}

const localWrangler = files.includes('wrangler.outcome-measurement.local.toml')
  ? readFileSync(resolve(ROOT, 'wrangler.outcome-measurement.local.toml'), 'utf8')
  : '';
if (localWrangler && !/database_id\s*=\s*"00000000-0000-0000-0000-000000000000"/.test(localWrangler)) {
  finding('non_placeholder_d1_database_id', 'wrangler.outcome-measurement.local.toml', 1);
}

const migration = readFileSync(resolve(ROOT, 'migrations/d1/0006_outcome_measurement_sidecar.sql'), 'utf8');
const forbiddenPiiColumns = ['name', 'email', 'phone', 'address', 'message', 'ip_address', 'hashed_email', 'hashed_phone'];
for (const column of forbiddenPiiColumns) {
  if (new RegExp(`^\\s*${column}\\s+`, 'mi').test(migration)) {
    finding('pii_column_in_measurement_schema', 'migrations/d1/0006_outcome_measurement_sidecar.sql', 1);
  }
}

const result = {
  ok: findings.length === 0,
  scope: 'exact Slice 1 candidate additions',
  files_scanned: files.length,
  prohibited_findings: findings.length,
  findings,
  controls: {
    stripe_or_payment_secrets: findings.filter((item) => item.rule.includes('stripe') || item.rule.includes('payment_intent')).length,
    google_credentials: findings.filter((item) => item.rule.includes('google_api') || item.rule.includes('oauth')).length,
    make_endpoints_or_keys: findings.filter((item) => item.rule.includes('make_')).length,
    customer_pii_literals: findings.filter((item) => item.rule.includes('email_literal') || item.rule.includes('phone_literal')).length,
    real_click_id_literals: findings.filter((item) => item.rule === 'non_synthetic_click_id_literal').length,
    production_d1_credentials: findings.filter((item) => item.rule === 'non_placeholder_d1_database_id').length,
    unauthorized_analytics_changes: findings.filter((item) => item.rule === 'unauthorized_analytics_addition').length,
    pii_schema_columns: findings.filter((item) => item.rule === 'pii_column_in_measurement_schema').length,
  },
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
