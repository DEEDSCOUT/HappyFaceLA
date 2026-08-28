#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const SLICE1_BASELINE = '1a51ee9b43aa9a91ab76f07cc05e25a573b378d2';
const SCANNER_PATH = fileURLToPath(import.meta.url);
const ANALYTICS_MARKERS = [
  `data${'Layer'}`,
  `g${'tag'}`,
  `google${'tagmanager'}`,
  `google-${'analytics'}`,
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function candidateFiles(root) {
  const changed = git(root, ['diff', '--name-only', SLICE1_BASELINE, '--'])
    .split(/\r?\n/)
    .filter(Boolean);
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard'])
    .split(/\r?\n/)
    .filter(Boolean);
  return [...new Set([...changed, ...untracked])].sort();
}

function addedLinesFor(root, file) {
  const tracked = git(root, ['ls-files', '--', file]);
  if (!tracked) {
    return readFileSync(resolve(root, file), 'utf8').split(/\r?\n/);
  }
  return git(root, ['diff', '--no-ext-diff', '--unified=0', SLICE1_BASELINE, '--', file])
    .split(/\r?\n/)
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1));
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function scanOutcomeMeasurementSecurity({
  root = ROOT,
  additionalSources = {},
} = {}) {
  const files = candidateFiles(root);
  const findings = [];
  const scannedInputs = [];

  function finding(rule, file, lineNumber) {
    findings.push({ rule, file, line: lineNumber });
  }

  function scanLines(file, lines) {
    scannedInputs.push({ file, sha256: sha256(lines.join('\n')), lines: lines.length });
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
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
        && !line.includes('555')
        && !line.includes('00000000-0000-0000-0000-000000000000')
      ) {
        finding('non_fixture_phone_literal', file, lineNumber);
      }
      if (ANALYTICS_MARKERS.some((marker) => line.toLowerCase().includes(marker.toLowerCase()))) {
        finding('unauthorized_analytics_addition', file, lineNumber);
      }

      for (const match of line.matchAll(/\b(?:gclid|gbraid|wbraid)\s*[:=]\s*['"]([^'"]+)['"]/gi)) {
        if (!/^(?:TEST|NOT|SHOULD)-/i.test(match[1])) finding('non_synthetic_click_id_literal', file, lineNumber);
      }
    });
  }

  for (const file of files) scanLines(file, addedLinesFor(root, file));
  for (const [file, content] of Object.entries(additionalSources)) {
    scanLines(file, String(content).split(/\r?\n/));
  }

  const localWrangler = files.includes('wrangler.outcome-measurement.local.toml')
    ? readFileSync(resolve(root, 'wrangler.outcome-measurement.local.toml'), 'utf8')
    : '';
  if (localWrangler && !/database_id\s*=\s*"00000000-0000-0000-0000-000000000000"/.test(localWrangler)) {
    finding('non_placeholder_d1_database_id', 'wrangler.outcome-measurement.local.toml', 1);
  }

  for (const migrationPath of [
    'migrations/d1/0006_outcome_measurement_sidecar.sql',
    'migrations/outcome-measurement-slice1/0001_outcome_measurement_sidecar.sql',
  ]) {
    const migration = readFileSync(resolve(root, migrationPath), 'utf8');
    const forbiddenPiiColumns = [
      'name', 'email', 'phone', 'address', 'message', 'ip_address', 'hashed_email', 'hashed_phone',
    ];
    for (const column of forbiddenPiiColumns) {
      if (new RegExp(`^\\s*${column}\\s+`, 'mi').test(migration)) {
        finding('pii_column_in_measurement_schema', migrationPath, 1);
      }
    }
  }

  const head = git(root, ['rev-parse', 'HEAD']);
  const tree = git(root, ['show', '-s', '--format=%T', 'HEAD']);
  const worktreeClean = !git(root, ['status', '--porcelain=v1']);
  const scannerBytes = readFileSync(SCANNER_PATH);
  const sortedInputs = scannedInputs.sort((a, b) => a.file.localeCompare(b.file));
  return {
    ok: findings.length === 0,
    scope: 'cumulative Slice 1 additions from verified baseline',
    baseline: SLICE1_BASELINE,
    head,
    tree,
    worktree_clean: worktreeClean,
    scanner_sha256: sha256(scannerBytes),
    scan_input_sha256: sha256(canonicalJson(sortedInputs)),
    files_scanned: files.length,
    self_scanned: files.includes('scripts/scan-outcome-measurement-slice1-security.mjs'),
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
}

if (process.argv[1] && resolve(process.argv[1]) === SCANNER_PATH) {
  const result = scanOutcomeMeasurementSecurity();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
