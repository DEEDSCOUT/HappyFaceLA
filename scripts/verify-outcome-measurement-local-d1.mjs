#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const WRANGLER = resolve(ROOT, 'node_modules/wrangler/bin/wrangler.js');
const CONFIG = resolve(ROOT, 'wrangler.outcome-measurement.local.toml');
const MIGRATION_DIRECTORY = resolve(ROOT, 'migrations/outcome-measurement-slice1');
const MIGRATION_NAME = '0001_outcome_measurement_sidecar.sql';
const MIGRATION = resolve(MIGRATION_DIRECTORY, MIGRATION_NAME);
const AUTHORITATIVE_MIGRATION = resolve(ROOT, 'migrations/d1/0006_outcome_measurement_sidecar.sql');
const executedCommands = [];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function runWrangler(args) {
  if (!args.includes('--local') || args.includes('--remote')) {
    throw new Error('Local D1 verifier refuses any command without the explicit --local boundary');
  }
  executedCommands.push(args.map((arg) => arg === persistenceRoot ? '<temporary-local-persistence>' : arg));
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
  const config = readFileSync(CONFIG, 'utf8');
  if (!/migrations_dir\s*=\s*"migrations\/outcome-measurement-slice1"/.test(config)) {
    throw new Error('Local D1 configuration does not use the isolated Slice 1 migration directory');
  }
  const migrationFiles = readdirSync(MIGRATION_DIRECTORY)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  if (JSON.stringify(migrationFiles) !== JSON.stringify([MIGRATION_NAME])) {
    throw new Error('The isolated Slice 1 migration directory contains an unauthorized migration');
  }
  const migrationBytes = readFileSync(MIGRATION);
  if (!migrationBytes.equals(readFileSync(AUTHORITATIVE_MIGRATION))) {
    throw new Error('The isolated migration is not byte-identical to the approved Slice 1 migration');
  }

  const listOutput = runWrangler([
    'd1', 'migrations', 'list', 'OUTCOME_MEASUREMENT_D1',
    '--local',
    '--config', CONFIG,
    '--persist-to', persistenceRoot,
  ]);
  if (!listOutput.includes(MIGRATION_NAME) || listOutput.includes('0005_closed_loop_ads_attribution_outbox.sql')) {
    throw new Error('Wrangler migration discovery did not remain isolated to the Slice 1 migration');
  }

  runWrangler([
    'd1', 'migrations', 'apply', 'OUTCOME_MEASUREMENT_D1',
    '--local',
    '--config', CONFIG,
    '--persist-to', persistenceRoot,
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
    migration: MIGRATION_NAME,
    authorized_migrations: migrationFiles,
    shared_migration_0005_excluded: true,
    migration_sha256: sha256(migrationBytes),
    command_count: executedCommands.length,
    command_identity_sha256: sha256(`${JSON.stringify(executedCommands)}\n`),
    attribution_count: 0,
    audit_count: 0,
    required_table_count: 2,
  }, null, 2)}\n`);
} finally {
  rmSync(persistenceRoot, { recursive: true, force: true });
}
