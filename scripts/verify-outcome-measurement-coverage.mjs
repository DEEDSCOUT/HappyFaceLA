#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ROUTES = [
  {
    route: 'QuoteForm production callers',
    source_system: 'HFLA_WEB_LEAD',
    file: 'src/components/conversion/QuoteForm.astro',
    endpoint: '/api/lead',
    evidence: {
      gclid: ['name="gclid"', 'gclid: String(fd.get("gclid")'],
      gbraid: ['name="gbraid"', 'gbraid: String(fd.get("gbraid")'],
      wbraid: ['name="wbraid"', 'wbraid: String(fd.get("wbraid")'],
      sourceLeadId: ['fetch("/api/lead"'],
      submittedAt: ['fetch("/api/lead"'],
      landingPage: ['name="landing_page"', 'landing_page: String(fd.get("landing_page")'],
    },
  },
  {
    route: '/packages/',
    source_system: 'HFLA_WEB_LEAD',
    file: 'src/pages/packages.astro',
    endpoint: '/api/lead',
    evidence: {
      gclid: ['name="gclid"', 'gclid: String(fd.get("gclid")'],
      gbraid: ['name="gbraid"', 'gbraid: String(fd.get("gbraid")'],
      wbraid: ['name="wbraid"', 'wbraid: String(fd.get("wbraid")'],
      sourceLeadId: ['fetch("/api/lead"'],
      submittedAt: ['fetch("/api/lead"'],
      landingPage: ['name="landing_page"', 'landing_page: String(fd.get("landing_page")'],
    },
  },
  {
    route: '/hire-face-painter-los-angeles/',
    source_system: 'HFLA_PLAN_MY_PARTY',
    file: 'src/pages/hire-face-painter-los-angeles.astro',
    endpoint: '/api/quote-request',
    evidence: {
      gclid: ['"gclid",', '...attribution'],
      gbraid: ['"gbraid",', '...attribution'],
      wbraid: ['"wbraid",', '...attribution'],
      sourceLeadId: ['fetch("/api/quote-request"'],
      submittedAt: ['submittedAt: new Date().toISOString()'],
      landingPage: ['landing_page: window.location.pathname'],
    },
  },
  {
    route: '/plan-my-party/',
    source_system: 'HFLA_PLAN_MY_PARTY',
    file: 'src/components/wizard/WizardShell.astro',
    endpoint: '/api/quote-request',
    evidence: {
      gclid: ["'gclid',", '...buildSubmitAttributionPayload()'],
      gbraid: ["'gbraid',", '...buildSubmitAttributionPayload()'],
      wbraid: ["'wbraid',", '...buildSubmitAttributionPayload()'],
      sourceLeadId: ["fetch('/api/quote-request'"],
      submittedAt: ['submittedAt: new Date().toISOString()'],
      landingPage: ['submit_landing_page: currentUrl'],
    },
  },
];

function includesEvery(source, fragments) {
  return fragments.every((fragment) => source.includes(fragment));
}

export function verifyOutcomeMeasurementCoverage({ root = REPOSITORY_ROOT, sourceOverrides = {} } = {}) {
  const leadServer = sourceOverrides['functions/api/lead.ts']
    ?? readFileSync(resolve(root, 'functions/api/lead.ts'), 'utf8');
  const quoteServer = sourceOverrides['src/lib/quote-request/delivery.ts']
    ?? readFileSync(resolve(root, 'src/lib/quote-request/delivery.ts'), 'utf8');
  const contract = sourceOverrides['src/lib/outcome-measurement/contracts.ts']
    ?? readFileSync(resolve(root, 'src/lib/outcome-measurement/contracts.ts'), 'utf8');

  const rows = ROUTES.map((definition) => {
    const source = sourceOverrides[definition.file] ?? readFileSync(resolve(root, definition.file), 'utf8');
    const server = definition.endpoint === '/api/lead' ? leadServer : quoteServer;
    const supportsGclid = includesEvery(source, definition.evidence.gclid) && server.includes('gclid:');
    const supportsGbraid = includesEvery(source, definition.evidence.gbraid) && server.includes('gbraid:');
    const supportsWbraid = includesEvery(source, definition.evidence.wbraid) && server.includes('wbraid:');
    const supportsSourceLeadId = includesEvery(source, definition.evidence.sourceLeadId)
      && server.includes('source_lead_id:');
    const supportsSubmittedAt = includesEvery(source, definition.evidence.submittedAt)
      && server.includes('submitted_at:');
    const supportsLandingPage = includesEvery(source, definition.evidence.landingPage)
      && server.includes('landing_page:');
    const captureVersion = contract.includes("ATTRIBUTION_CAPTURE_V1")
      ? 'ATTRIBUTION_CAPTURE_V1'
      : null;

    const problems = [];
    if (!supportsGclid) problems.push('gclid_not_preserved');
    if (!supportsGbraid) problems.push('gbraid_not_preserved');
    if (!supportsWbraid) problems.push('wbraid_not_preserved');
    if (!supportsSourceLeadId) problems.push('source_lead_id_not_server_bound');
    if (!supportsSubmittedAt) problems.push('submitted_at_not_server_bound');
    if (!supportsLandingPage) problems.push('landing_page_not_preserved');
    if (!captureVersion) problems.push('capture_version_missing');

    return {
      route: definition.route,
      source_system: definition.source_system,
      supports_gclid: supportsGclid,
      supports_gbraid: supportsGbraid,
      supports_wbraid: supportsWbraid,
      supports_source_lead_id: supportsSourceLeadId,
      supports_submitted_at: supportsSubmittedAt,
      supports_landing_page: supportsLandingPage,
      capture_version: captureVersion,
      problems,
    };
  });

  return {
    ok: rows.every((row) => row.problems.length === 0),
    routes: rows,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyOutcomeMeasurementCoverage();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
