#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildLeadAttributionCaptureInput } from '../functions/api/lead.ts';
import {
  buildLeadAttributionRecord,
  persistLeadAttributionRecord,
} from '../src/lib/outcome-measurement/attribution-store.ts';
import { buildQuoteAttributionCaptureInput } from '../src/lib/quote-request/delivery.ts';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLICK_FIELDS = ['gclid', 'gbraid', 'wbraid'];
const TRACE_VALUES = {
  gclid: 'TEST-COVERAGE-G',
  gbraid: 'TEST-COVERAGE-B',
  wbraid: 'TEST-COVERAGE-W',
};

const ROUTES = [
  {
    route: 'QuoteForm production callers',
    source_system: 'HFLA_WEB_LEAD',
    file: 'src/components/conversion/QuoteForm.astro',
    endpoint: '/api/lead',
    common: [
      'fetch("/api/lead"',
      'const GOOGLE_CLICK_KEY_LIST = ["gclid", "gbraid", "wbraid"]',
      'selectedGoogleClickTouch()',
      'landing_page: String(fd.get("landing_page")',
    ],
    fields: Object.fromEntries(CLICK_FIELDS.map((field) => [field, [
      `name="${field}"`,
      `${field}: String(fd.get("${field}") || "")`,
      `"${field}"`,
    ]])),
  },
  {
    route: '/packages/',
    source_system: 'HFLA_WEB_LEAD',
    file: 'src/pages/packages.astro',
    endpoint: '/api/lead',
    common: [
      'fetch("/api/lead"',
      'const GOOGLE_CLICK_KEY_LIST = ["gclid", "gbraid", "wbraid"]',
      'selectedGoogleClickTouch()',
      'landing_page: String(fd.get("landing_page")',
    ],
    fields: Object.fromEntries(CLICK_FIELDS.map((field) => [field, [
      `name="${field}"`,
      `${field}: String(fd.get("${field}") || "")`,
      `"${field}"`,
    ]])),
  },
  {
    route: '/hire-face-painter-los-angeles/',
    source_system: 'HFLA_PLAN_MY_PARTY',
    file: 'src/pages/hire-face-painter-los-angeles.astro',
    endpoint: '/api/quote-request',
    common: [
      'fetch("/api/quote-request"',
      'const GOOGLE_CLICK_KEY_LIST = ["gclid", "gbraid", "wbraid"]',
      'selectedGoogleClickTouch()',
      '...attribution',
      'submittedAt: new Date().toISOString()',
    ],
    fields: Object.fromEntries(CLICK_FIELDS.map((field) => [field, [
      `"${field}"`,
      `next[key] = googleTouch?.[key] || ""`,
    ]])),
  },
  {
    route: '/plan-my-party/',
    source_system: 'HFLA_PLAN_MY_PARTY',
    file: 'src/components/wizard/WizardShell.astro',
    endpoint: '/api/quote-request',
    common: [
      "fetch('/api/quote-request'",
      "const GOOGLE_CLICK_KEYS = ['gclid', 'gbraid', 'wbraid'] as const",
      'googleClickTouchFromParams(ap)',
      'out[`submit_${key}`] = selectedGoogleTouch?.[key] || null',
      'submittedAt: new Date().toISOString()',
    ],
    fields: Object.fromEntries(CLICK_FIELDS.map((field) => [field, [`'${field}'`]])),
  },
];

function source(root, path, overrides) {
  return overrides[path] ?? readFileSync(resolve(root, path), 'utf8');
}

function includesEvery(value, fragments) {
  return fragments.every((fragment) => value.includes(fragment));
}

function normalized(value) {
  return value.replace(/\s+/g, ' ');
}

function serverMappingProof(endpoint, field, leadServer, quoteServer) {
  if (endpoint === '/api/lead') {
    const sourceText = normalized(leadServer);
    const callExpression = field === 'gclid'
      ? 'gclid: normalized.gclid || null'
      : `${field}: submitted${field[0].toUpperCase()}${field.slice(1)} || null`;
    return sourceText.includes(`${field}: input.${field}`) && sourceText.includes(callExpression);
  }
  return normalized(quoteServer).includes(
    `${field}: hasSubmitSnapshot ? canonical.submit${field[0].toUpperCase()}${field.slice(1)} : canonical.${field}`,
  );
}

function storageSourceProof(field, storageSource) {
  const sourceText = normalized(storageSource);
  return sourceText.includes('gclid, gbraid, wbraid')
    && sourceText.includes(`record.${field}`);
}

class TraceD1 {
  constructor() {
    this.row = null;
  }

  prepare(sql) {
    const db = this;
    return {
      bind(...values) {
        return {
          async first() {
            return db.row
              ? { record_sha256: db.row.record_sha256, capture_state: db.row.capture_state }
              : null;
          },
          async run() {
            const columns = sql
              .slice(sql.indexOf('(') + 1, sql.indexOf(') VALUES'))
              .split(',')
              .map((column) => column.trim());
            db.row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
            return { success: true, meta: { changes: 1 } };
          },
        };
      },
    };
  }
}

async function executedTraceProof() {
  const leadInput = buildLeadAttributionCaptureInput({
    sourceLeadId: 'lead_coverage_trace',
    submittedAt: '2026-08-28T18:00:00.000Z',
    landingPage: '/coverage/',
    sourcePage: '/coverage/',
    ...TRACE_VALUES,
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: 'coverage',
    utmTerm: null,
    utmContent: null,
  });
  const quoteInput = buildQuoteAttributionCaptureInput({
    leadId: 'lead_quote_coverage_trace',
    createdAt: '2026-08-28T18:00:00.000Z',
    sourcePage: '/plan-my-party/',
    landingPage: '/first/',
    sourcePath: '/first/',
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    gclid: null,
    gbraid: null,
    wbraid: null,
    submitLandingPage: '/plan-my-party/',
    submitSourcePath: '/plan-my-party/',
    submitUtmSource: 'google',
    submitUtmMedium: 'cpc',
    submitUtmCampaign: 'coverage',
    submitUtmTerm: null,
    submitUtmContent: null,
    submitGclid: TRACE_VALUES.gclid,
    submitGbraid: TRACE_VALUES.gbraid,
    submitWbraid: TRACE_VALUES.wbraid,
  });
  const record = await buildLeadAttributionRecord(leadInput, '2026-08-28T18:00:01.000Z');
  const db = new TraceD1();
  await persistLeadAttributionRecord(db, record);

  return Object.fromEntries(CLICK_FIELDS.map((field) => [field,
    leadInput[field] === TRACE_VALUES[field]
      && quoteInput[field] === TRACE_VALUES[field]
      && record[field] === TRACE_VALUES[field]
      && db.row?.[field] === TRACE_VALUES[field],
  ]));
}

export async function verifyOutcomeMeasurementCoverage({ root = REPOSITORY_ROOT, sourceOverrides = {} } = {}) {
  const leadServer = source(root, 'functions/api/lead.ts', sourceOverrides);
  const quoteServer = source(root, 'src/lib/quote-request/delivery.ts', sourceOverrides);
  const storageSource = source(root, 'src/lib/outcome-measurement/attribution-store.ts', sourceOverrides);
  const contract = source(root, 'src/lib/outcome-measurement/contracts.ts', sourceOverrides);
  const runtimeTrace = await executedTraceProof();

  const rows = ROUTES.map((definition) => {
    const browserSource = source(root, definition.file, sourceOverrides);
    const commonBrowserProof = includesEvery(browserSource, definition.common);
    const fieldProof = Object.fromEntries(CLICK_FIELDS.map((field) => [field,
      commonBrowserProof
        && includesEvery(browserSource, definition.fields[field])
        && serverMappingProof(definition.endpoint, field, leadServer, quoteServer)
        && storageSourceProof(field, storageSource)
        && runtimeTrace[field] === true,
    ]));
    const supportsSourceLeadId = definition.endpoint === '/api/lead'
      ? normalized(leadServer).includes('source_lead_id: input.sourceLeadId')
      : normalized(quoteServer).includes('source_lead_id: canonical.leadId');
    const supportsSubmittedAt = definition.endpoint === '/api/lead'
      ? normalized(leadServer).includes('submitted_at: input.submittedAt')
      : normalized(quoteServer).includes('submitted_at: canonical.createdAt');
    const supportsLandingPage = commonBrowserProof
      && (definition.endpoint === '/api/lead'
        ? normalized(leadServer).includes('landing_page: input.landingPage')
        : normalized(quoteServer).includes('landing_page: hasSubmitSnapshot'));
    const captureVersion = contract.includes("ATTRIBUTION_CAPTURE_VERSION = 'ATTRIBUTION_CAPTURE_V1'")
      ? 'ATTRIBUTION_CAPTURE_V1'
      : null;

    const problems = [];
    for (const field of CLICK_FIELDS) {
      if (!fieldProof[field]) problems.push(`${field}_not_preserved_end_to_end`);
    }
    if (!supportsSourceLeadId) problems.push('source_lead_id_not_server_bound');
    if (!supportsSubmittedAt) problems.push('submitted_at_not_server_bound');
    if (!supportsLandingPage) problems.push('landing_page_not_preserved');
    if (!captureVersion) problems.push('capture_version_missing');

    return {
      route: definition.route,
      source_system: definition.source_system,
      supports_gclid: fieldProof.gclid,
      supports_gbraid: fieldProof.gbraid,
      supports_wbraid: fieldProof.wbraid,
      supports_source_lead_id: supportsSourceLeadId,
      supports_submitted_at: supportsSubmittedAt,
      supports_landing_page: supportsLandingPage,
      capture_version: captureVersion,
      proof_layers: {
        browser_payload: commonBrowserProof,
        server_mapper_executed: CLICK_FIELDS.every((field) => runtimeTrace[field] === true),
        canonical_record_executed: CLICK_FIELDS.every((field) => runtimeTrace[field] === true),
        storage_mapper_executed: CLICK_FIELDS.every((field) => runtimeTrace[field] === true),
      },
      problems,
    };
  });

  return {
    ok: rows.every((row) => row.problems.length === 0),
    verifier: 'OUTCOME_MEASUREMENT_COVERAGE_V2_EXECUTED',
    routes: rows,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await verifyOutcomeMeasurementCoverage();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
