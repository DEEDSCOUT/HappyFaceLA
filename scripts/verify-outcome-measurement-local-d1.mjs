#!/usr/bin/env node

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const WRANGLER = resolve(ROOT, 'node_modules/wrangler/bin/wrangler.js');
const CONFIG = resolve(ROOT, 'wrangler.outcome-measurement.local.toml');
const MIGRATION = resolve(ROOT, 'migrations/d1/0006_outcome_measurement_sidecar.sql');

function runWrangler(args) {
  const result = spawnSync(process.execPath, [WRANGLER, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: 'false',
    },
  });
  if (result.status !== 0) {
    const safeDetail = [result.stdout, result.stderr]
      .filter(Boolean)
      .join('\n')
      .replaceAll(ROOT, '<repository>')
      .slice(0, 4000);
    throw new Error(`Local D1 verification failed (exit ${result.status}): ${safeDetail}`);
  }
  return result.stdout;
}

const persistenceRoot = mkdtempSync(resolve(tmpdir(), 'hfla-slice1-d1-'));

try {
  runWrangler([
    'd1', 'execute', 'OUTCOME_MEASUREMENT_D1',
    '--local', '--yes', '--json',
    '--config', CONFIG,
    '--persist-to', persistenceRoot,
    '--file', MIGRATION,
  ]);

  const readback = runWrangler([
    'd1', 'execute', 'OUTCOME_MEASUREMENT_D1',
    '--local', '--yes', '--json',
    '--config', CONFIG,
    '--persist-to', persistenceRoot,
    '--command', [
      'SELECT COUNT(*) AS attribution_count FROM lead_attribution_v1',
      'SELECT COUNT(*) AS audit_count FROM lead_attribution_insert_audit_v1',
      'SELECT COUNT(*) AS required_table_count FROM sqlite_schema WHERE type = \'table\' AND name IN (\'lead_attribution_v1\', \'lead_attribution_insert_audit_v1\')',
    ].join('; '),
  ]);

  const parsed = JSON.parse(readback);
  const serialized = JSON.stringify(parsed);
  const requiredFragments = [
    '"attribution_count":0',
    '"audit_count":0',
    '"required_table_count":2',
  ];
  for (const fragment of requiredFragments) {
    if (!serialized.includes(fragment)) {
      throw new Error(`Local D1 readback omitted required safe result: ${fragment}`);
    }
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    binding: 'OUTCOME_MEASUREMENT_D1',
    execution: 'local-only',
    remote_mutations: 0,
    migration: '0006_outcome_measurement_sidecar.sql',
    attribution_count: 0,
    audit_count: 0,
    required_table_count: 2,
  }, null, 2)}\n`);
} finally {
  rmSync(persistenceRoot, { recursive: true, force: true });
}
