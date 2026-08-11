#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const fixturePath = new URL('../tests/fixtures/production-quote-requests-schema.sql', import.meta.url);
const migrationPath = new URL('../migrations/d1/20260810_ap02a_ap03a_canonical_form_identity.sql', import.meta.url);
const [fixture, migration] = await Promise.all([
  readFile(fixturePath, 'utf8'),
  readFile(migrationPath, 'utf8'),
]);

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizedRows(rows) {
  return rows.map((row) => ({ ...row }));
}

function quoteManifest(db) {
  return {
    tableSql: db.prepare(
      "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'quote_requests'",
    ).get().sql,
    columns: normalizedRows(db.prepare("PRAGMA table_info('quote_requests')").all()),
    indexes: normalizedRows(db.prepare(
      "SELECT name, sql FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'quote_requests' AND sql IS NOT NULL ORDER BY name",
    ).all()),
    foreignKeys: normalizedRows(db.prepare("PRAGMA foreign_key_list('quote_requests')").all()),
    rowCount: Number(db.prepare('SELECT COUNT(*) AS count FROM quote_requests').get().count),
  };
}

const additiveTables = [
  'canonical_lead_outbox',
  'lead_notification_outbox',
  'lead_privacy_state',
  'lead_submission_identity',
  'notification_alert_state',
  'notification_operator_audit',
  'notification_worker_runs',
  'privacy_purge_runs',
];
const additiveIndexes = [
  'idx_canonical_lead_outbox_status',
  'idx_lead_notification_outbox_status',
  'idx_lead_privacy_state_click_ids',
  'idx_lead_privacy_state_retention',
  'idx_lead_submission_identity_business_duplicate',
  'idx_lead_submission_identity_route_time',
  'idx_notification_operator_audit_lead',
  'idx_notification_worker_runs_status',
  'idx_privacy_purge_runs_status',
];

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(fixture);
const before = quoteManifest(db);
assert.equal(before.columns.length, 100);
assert.equal(before.indexes.length, 9);
assert.equal(before.foreignKeys.length, 0);
assert.equal(before.rowCount, 0);

db.exec('BEGIN IMMEDIATE;');
try {
  db.exec(migration);
  db.exec('COMMIT;');
} catch (error) {
  db.exec('ROLLBACK;');
  throw error;
}

const after = quoteManifest(db);
assert.deepEqual(after, before, 'the admitted quote_requests schema and row count must not change');

const observedTables = db.prepare(
  `SELECT name FROM sqlite_schema
   WHERE type = 'table' AND name != 'quote_requests'
   ORDER BY name`,
).all().map((row) => row.name);
const observedIndexes = db.prepare(
  `SELECT name FROM sqlite_schema
   WHERE type = 'index' AND sql IS NOT NULL AND tbl_name != 'quote_requests'
   ORDER BY name`,
).all().map((row) => row.name);
assert.deepEqual(observedTables, additiveTables);
assert.deepEqual(observedIndexes, additiveIndexes);

const additiveRowCounts = Object.fromEntries(additiveTables.map((table) => [
  table,
  Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count),
]));
assert.deepEqual(additiveRowCounts, Object.fromEntries(additiveTables.map((table) => [table, 0])));

const foreignKeyViolations = normalizedRows(db.prepare('PRAGMA foreign_key_check').all());
const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
assert.deepEqual(foreignKeyViolations, []);
assert.equal(integrity, 'ok');

const result = {
  status: 'PASS',
  rehearsal_scope: 'local admitted schema fixture only; no production connection or export',
  production_database_id_for_future_approval: '3ea0bd28-abba-4630-99d1-f30ab17c0c36',
  fixture_sha256: sha256(fixture),
  migration_sha256: sha256(migration),
  before: {
    quote_requests_columns: before.columns.length,
    quote_requests_explicit_indexes: before.indexes.length,
    quote_requests_foreign_keys: before.foreignKeys.length,
    quote_requests_rows: before.rowCount,
  },
  after: {
    quote_requests_unchanged: true,
    quote_requests_rows: after.rowCount,
    additive_tables: observedTables,
    additive_indexes: observedIndexes,
    additive_row_counts: additiveRowCounts,
    foreign_key_violations: foreignKeyViolations.length,
    integrity_check: integrity,
  },
};

db.close();
console.log(JSON.stringify(result, null, 2));
