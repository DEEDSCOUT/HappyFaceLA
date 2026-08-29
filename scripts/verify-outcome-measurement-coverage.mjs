#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import {
  buildLeadAttributionCaptureInput,
  createLeadAttributionRequestParser,
} from '../functions/api/lead.ts';
import {
  LEAD_ATTRIBUTION_STORAGE_COLUMNS,
  buildLeadAttributionRecord,
  persistLeadAttributionRecord,
} from '../src/lib/outcome-measurement/attribution-store.ts';
import {
  OUTCOME_MEASUREMENT_BROWSER_ROUTES,
  createOutcomeMeasurementBrowserSubmitter,
} from '../src/lib/outcome-measurement/browser-route.ts';
import {
  buildQuoteAttributionCaptureInput,
  createQuoteAttributionRequestParser,
} from '../src/lib/quote-request/delivery.ts';

const CLICK_FIELDS = ['gclid', 'gbraid', 'wbraid'];
const TRACE_VALUES = {
  gclid: 'TEST-GCLID-SENTINEL-A',
  gbraid: 'TEST-GBRAID-SENTINEL-B',
  wbraid: 'TEST-WBRAID-SENTINEL-C',
};
const FIRST_TOUCH_VALUES = {
  gclid: 'TEST-GCLID-FIRST-TOUCH-X',
  gbraid: 'TEST-GBRAID-FIRST-TOUCH-Y',
  wbraid: 'TEST-WBRAID-FIRST-TOUCH-Z',
};
const IDENTIFIER_CASES = [
  { name: 'gclid', identifiers: { gclid: TRACE_VALUES.gclid, gbraid: null, wbraid: null } },
  { name: 'gbraid', identifiers: { gclid: null, gbraid: TRACE_VALUES.gbraid, wbraid: null } },
  { name: 'wbraid', identifiers: { gclid: null, gbraid: null, wbraid: TRACE_VALUES.wbraid } },
  {
    name: 'gclid_gbraid_same_touch',
    identifiers: { gclid: TRACE_VALUES.gclid, gbraid: TRACE_VALUES.gbraid, wbraid: null },
  },
];
const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');

function filesRecursively(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesRecursively(path) : [path];
  });
}

function discoverActiveBrowserRoutes() {
  const routeIds = [];
  const problems = [];
  const astroFiles = filesRecursively(resolve(REPOSITORY_ROOT, 'src'))
    .filter((path) => path.endsWith('.astro'));
  for (const path of astroFiles) {
    const astro = readFileSync(path, 'utf8');
    for (const match of astro.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
      const sourceFile = ts.createSourceFile(path, match[1], ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
      function visit(node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          if (node.expression.text === 'fetch') {
            const target = node.arguments[0];
            if (target && ts.isStringLiteralLike(target) && ['/api/lead', '/api/quote-request'].includes(target.text)) {
              problems.push('direct_lead_api_fetch_bypasses_shared_submitter');
            }
          }
          if (node.expression.text === 'submitOutcomeMeasurementBrowserRoute') {
            const options = node.arguments[0];
            if (!options || !ts.isObjectLiteralExpression(options)) {
              problems.push('browser_route_submitter_options_not_static');
            } else {
              const routeProperty = options.properties.find((property) => (
                ts.isPropertyAssignment(property)
                && ((ts.isIdentifier(property.name) && property.name.text === 'routeId')
                  || (ts.isStringLiteralLike(property.name) && property.name.text === 'routeId'))
              ));
              if (!routeProperty || !ts.isPropertyAssignment(routeProperty)
                || !ts.isStringLiteralLike(routeProperty.initializer)) {
                problems.push('browser_route_id_not_literal');
              } else {
                routeIds.push(routeProperty.initializer.text);
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);
    }
  }
  const expected = OUTCOME_MEASUREMENT_BROWSER_ROUTES.map((route) => route.id).sort();
  const observed = [...routeIds].sort();
  if (JSON.stringify(expected) !== JSON.stringify(observed)) {
    problems.push('active_browser_route_registration_mismatch');
  }
  return { routeIds: observed, problems: [...new Set(problems)].sort() };
}

class TraceD1 {
  constructor(mutateStorageValues) {
    this.row = null;
    this.mutateStorageValues = mutateStorageValues;
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
            const storedValues = db.mutateStorageValues
              ? db.mutateStorageValues([...values], [...LEAD_ATTRIBUTION_STORAGE_COLUMNS])
              : values;
            const columns = sql
              .slice(sql.indexOf('(') + 1, sql.indexOf(') VALUES'))
              .split(',')
              .map((column) => column.trim());
            db.row = Object.fromEntries(columns.map((column, index) => [column, storedValues[index]]));
            return { success: true, meta: { changes: 1 } };
          },
        };
      },
    };
  }
}

function basePayload(route) {
  if (route.endpoint === '/api/lead') {
    return {
      landing_page: '/coverage/',
      source_page: '/coverage/',
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'coverage',
    };
  }
  return {
    source_page: '/plan-my-party/',
    landing_page: '/first/',
    source_path: '/first/',
    submit_landing_page: '/plan-my-party/',
    submit_source_path: '/plan-my-party/',
    submit_utm_source: 'google',
    submit_utm_medium: 'cpc',
    submit_utm_campaign: 'coverage',
  };
}

function exactIdentifiers(value, expected) {
  return CLICK_FIELDS.every((field) => (value?.[field] ?? null) === expected[field]);
}

async function executeRouteDataFlow(route, identifierCase, mutations) {
  const submitBrowserRoute = createOutcomeMeasurementBrowserSubmitter({
    mutatePayload: mutations.browserPayload,
    mutateSerializedBody: mutations.serializedBody,
  });
  let requestPayload = null;
  const fetchImpl = async (_url, init = {}) => {
    requestPayload = JSON.parse(String(init.body ?? '{}'));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const selectedTouch = { ...identifierCase.identifiers };
  const firstTouch = { ...FIRST_TOUCH_VALUES };
  await submitBrowserRoute({
    routeId: route.id,
    basePayload: basePayload(route),
    selectedGoogleTouch: selectedTouch,
    firstGoogleTouch: firstTouch,
    fetchImpl,
  });
  if (!requestPayload) throw new Error('Browser request payload was not executed');

  const sourceLeadId = `lead_coverage_${route.id.toLowerCase()}_${identifierCase.name}`;
  const submittedAt = '2026-08-28T18:00:00.000Z';
  let parsedIdentifiers;
  let captureInput;
  if (route.endpoint === '/api/lead') {
    const parseLead = createLeadAttributionRequestParser(mutations.leadParser);
    const parsed = parseLead(requestPayload, new Request('https://www.happyfacesla.com/api/lead'));
    parsedIdentifiers = parsed;
    captureInput = buildLeadAttributionCaptureInput({
      sourceLeadId,
      submittedAt,
      ...parsed,
    });
  } else {
    const parseQuote = createQuoteAttributionRequestParser(mutations.quoteParser);
    const parsed = parseQuote(requestPayload);
    parsedIdentifiers = {
      gclid: parsed.submitGclid,
      gbraid: parsed.submitGbraid,
      wbraid: parsed.submitWbraid,
    };
    captureInput = buildQuoteAttributionCaptureInput({
      leadId: sourceLeadId,
      createdAt: submittedAt,
      sourcePage: '/plan-my-party/',
      ...parsed,
    });
  }

  const record = await buildLeadAttributionRecord(captureInput, '2026-08-28T18:00:01.000Z');
  const db = new TraceD1(mutations.storageValues);
  await persistLeadAttributionRecord(db, record);
  const expected = identifierCase.identifiers;
  const browserIdentifiers = {
    gclid: requestPayload.gclid ?? null,
    gbraid: requestPayload.gbraid ?? null,
    wbraid: requestPayload.wbraid ?? null,
  };
  const stageValues = [browserIdentifiers, parsedIdentifiers, captureInput, record, db.row];
  const fieldPass = Object.fromEntries(CLICK_FIELDS.map((field) => [
    field,
    stageValues.every((stage) => (stage?.[field] ?? null) === expected[field]),
  ]));
  const quoteSubmitExact = route.endpoint === '/api/lead' || CLICK_FIELDS.every((field) => (
    (requestPayload[`submit_${field}`] ?? null) === expected[field]
  ));
  const atomicTouch = exactIdentifiers(browserIdentifiers, expected)
    && exactIdentifiers(captureInput, expected)
    && quoteSubmitExact;

  return {
    fieldPass,
    sourceLeadId: db.row?.source_lead_id === sourceLeadId,
    submittedAt: db.row?.submitted_at === submittedAt,
    atomicTouch,
  };
}

export function outcomeMeasurementCoverageMutationCases() {
  return [
    {
      name: 'browser_serialization_gbraid_drop',
      mutations: { browserPayload: (payload) => ({ ...payload, gbraid: null, submit_gbraid: null }) },
    },
    {
      name: 'browser_late_overwrite_gbraid_drop',
      mutations: {
        serializedBody: (body) => JSON.stringify({ ...JSON.parse(body), gbraid: null, submit_gbraid: null }),
      },
    },
    {
      name: 'lead_parser_gbraid_drop',
      mutations: { leadParser: (parsed) => ({ ...parsed, gbraid: null }) },
    },
    {
      name: 'quote_parser_gbraid_drop',
      mutations: {
        quoteParser: (parsed) => ({ ...parsed, gbraid: null, submitGbraid: null }),
      },
    },
    {
      name: 'storage_mapper_gbraid_drop',
      mutations: {
        storageValues(values, columns) {
          values[columns.indexOf('gbraid')] = null;
          return values;
        },
      },
    },
    {
      name: 'browser_wbraid_drop',
      mutations: { browserPayload: (payload) => ({ ...payload, wbraid: null, submit_wbraid: null }) },
    },
    {
      name: 'browser_gclid_drop',
      mutations: { browserPayload: (payload) => ({ ...payload, gclid: null, submit_gclid: null }) },
    },
    {
      name: 'mixed_touch_assembly',
      mutations: {
        browserPayload(payload, context) {
          return {
            ...payload,
            gclid: context.selectedGoogleTouch?.gclid ?? null,
            gbraid: context.firstGoogleTouch?.gbraid ?? null,
            submit_gclid: context.selectedGoogleTouch?.gclid ?? null,
            submit_gbraid: context.firstGoogleTouch?.gbraid ?? null,
          };
        },
      },
    },
  ];
}

export async function verifyOutcomeMeasurementCoverage({ mutations = {} } = {}) {
  const activeRoutes = discoverActiveBrowserRoutes();
  const rows = [];
  for (const route of OUTCOME_MEASUREMENT_BROWSER_ROUTES) {
    const results = [];
    for (const identifierCase of IDENTIFIER_CASES) {
      results.push(await executeRouteDataFlow(route, identifierCase, mutations));
    }
    const fieldPass = Object.fromEntries(CLICK_FIELDS.map((field) => [
      field,
      results.every((result) => result.fieldPass[field]),
    ]));
    const sourceLeadId = results.every((result) => result.sourceLeadId);
    const submittedAt = results.every((result) => result.submittedAt);
    const atomicTouch = results.every((result) => result.atomicTouch);
    const problems = [];
    for (const field of CLICK_FIELDS) {
      if (!fieldPass[field]) problems.push(`${field}_not_preserved_end_to_end`);
    }
    if (!sourceLeadId) problems.push('source_lead_id_not_preserved');
    if (!submittedAt) problems.push('submitted_at_not_preserved');
    if (!atomicTouch) problems.push('atomic_touch_not_preserved');
    problems.push(...activeRoutes.problems);
    rows.push({
      route: route.route,
      gclid_end_to_end: fieldPass.gclid ? 'PASS' : 'FAIL',
      gbraid_end_to_end: fieldPass.gbraid ? 'PASS' : 'FAIL',
      wbraid_end_to_end: fieldPass.wbraid ? 'PASS' : 'FAIL',
      source_lead_id: sourceLeadId ? 'PASS' : 'FAIL',
      submitted_at: submittedAt ? 'PASS' : 'FAIL',
      atomic_touch: atomicTouch ? 'PASS' : 'FAIL',
      problems,
    });
  }

  return {
    ok: rows.every((row) => row.problems.length === 0),
    verifier: 'OUTCOME_MEASUREMENT_COVERAGE_V3_EXECUTABLE_DATA_FLOW',
    routes: rows,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await verifyOutcomeMeasurementCoverage();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
