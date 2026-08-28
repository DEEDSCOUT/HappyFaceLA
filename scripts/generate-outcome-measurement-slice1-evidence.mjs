#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const EXPECTED_PARENT = '6db3f70e7623235e543b9bd20229e1e7103d1e2f';
const DEFAULT_OUTPUT = '.agent/outcome-measurement-slice1/remediation-frozen';
const NETWORK_GUARD = resolve(ROOT, 'scripts/outcome-measurement-network-guard.mjs');
const NPM_CLI = process.env.npm_execpath
  || resolve(process.execPath, '..', 'node_modules/npm/bin/npm-cli.js');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: Object.hasOwn(options, 'encoding') ? options.encoding : 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function commandIdentity(command, args) {
  const executable = command === process.execPath ? 'node' : command;
  return sha256(canonicalJson({ executable, args }));
}

function parseGuardLog(path) {
  const entries = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return {
    loaded: entries.some((entry) => entry.type === 'loaded'),
    blocked: entries.filter((entry) => entry.type === 'blocked'),
  };
}

const executions = [];
let networkLogSequence = 0;
let networkLogDirectory;

function run(id, command, args, options = {}) {
  networkLogSequence += 1;
  const networkGuarded = options.networkGuard !== false;
  const networkLog = networkGuarded
    ? resolve(networkLogDirectory, `${String(networkLogSequence).padStart(2, '0')}.jsonl`)
    : null;
  if (networkLog) writeFileSync(networkLog, '', 'utf8');

  const nodeOptions = [
    process.env.NODE_OPTIONS || '',
    networkGuarded ? `--import=${pathToFileURL(NETWORK_GUARD).href}` : '',
  ].filter(Boolean).join(' ');
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: 'false',
      ASTRO_TELEMETRY_DISABLED: '1',
      ...(networkGuarded ? {
        NODE_OPTIONS: nodeOptions,
        OUTCOME_MEASUREMENT_NETWORK_GUARD_LOG: networkLog,
      } : {}),
      ...options.env,
    },
    maxBuffer: 64 * 1024 * 1024,
  });

  const guard = networkGuarded ? parseGuardLog(networkLog) : { loaded: false, blocked: [] };
  if (networkGuarded && !guard.loaded) {
    throw new Error(`${id} did not load the required external-network guard`);
  }
  if (networkGuarded && guard.blocked.length > 0) {
    throw new Error(`${id} attempted external network access on an instrumented surface`);
  }
  if (result.status !== 0) {
    const safeOutput = `${result.stdout || ''}\n${result.stderr || ''}`
      .replaceAll(ROOT, '<repository>')
      .slice(-12000);
    throw new Error(`${id} failed with exit ${result.status}:\n${safeOutput}`);
  }

  const execution = {
    id,
    command_sha256: commandIdentity(command, args),
    exit_code: result.status,
    result_sha256: null,
    network_guard_loaded: networkGuarded ? guard.loaded : null,
    instrumented_external_attempts: networkGuarded ? guard.blocked.length : null,
  };
  executions.push(execution);
  return {
    execution,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function bindResult(runResult, deterministicResult) {
  runResult.execution.result_sha256 = sha256(canonicalJson(deterministicResult));
  return deterministicResult;
}

function runNpm(id, args) {
  return run(id, process.execPath, [NPM_CLI, ...args]);
}

function parseJsonOutput(output) {
  const start = output.indexOf('{');
  if (start < 0) throw new Error('Expected JSON output was not produced');
  return JSON.parse(output.slice(start));
}

function filesUnder(root, prefix = '') {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const absolute = resolve(root, entry.name);
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      return entry.isDirectory() ? filesUnder(absolute, name) : [{ absolute, name }];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const outputRelative = argument('--output', DEFAULT_OUTPUT).replaceAll('\\', '/');
if (!outputRelative.startsWith('.agent/outcome-measurement-slice1/')) {
  throw new Error('Evidence output must remain under .agent/outcome-measurement-slice1/');
}
const outputDirectory = resolve(ROOT, outputRelative);
const allowedRoot = resolve(ROOT, '.agent/outcome-measurement-slice1');
if (outputDirectory === allowedRoot || !outputDirectory.startsWith(`${allowedRoot}${sep}`)) {
  throw new Error('Evidence output path failed the local-only safety boundary');
}

const status = git(['status', '--porcelain=v1']).trim();
if (status) throw new Error('Exact-head evidence generation requires a clean worktree');

const head = git(['rev-parse', 'HEAD']).trim();
const tree = git(['show', '-s', '--format=%T', 'HEAD']).trim();
const parent = git(['show', '-s', '--format=%P', 'HEAD']).trim();
if (parent !== EXPECTED_PARENT) throw new Error(`Unexpected direct parent: ${parent}`);

mkdirSync(allowedRoot, { recursive: true });
networkLogDirectory = resolve(allowedRoot, '.network-guard');
rmSync(networkLogDirectory, { recursive: true, force: true });
mkdirSync(networkLogDirectory, { recursive: true });

const changedNames = git(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'])
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .sort();
const changedFiles = changedNames.map((path) => {
  const bytes = git(['show', `HEAD:${path}`], { encoding: null });
  return { path, sha256: sha256(bytes), bytes: bytes.length };
});

const testRun = runNpm('full-test-suite', ['test']);
const testSuites = Array.from(testRun.stdout.matchAll(/^(\d+) (.+?) tests passed$/gm))
  .map((match) => ({ name: match[2], passed: Number(match[1]), failed: 0 }));
if (testSuites.length !== 3) throw new Error('Expected three deterministic test-suite totals');
const testPassNames = Array.from(testRun.stdout.matchAll(/^PASS (.+)$/gm)).map((match) => match[1]);
bindResult(testRun, { suites: testSuites, pass_names_sha256: sha256(canonicalJson(testPassNames)) });

const coverageRun = run('capture-coverage-verifier', process.execPath, [
  'scripts/verify-outcome-measurement-coverage.mjs',
]);
const coverage = parseJsonOutput(coverageRun.stdout);
if (!coverage.ok) throw new Error('Capture coverage verifier failed');
bindResult(coverageRun, coverage);

const localD1Run = run('local-d1-verifier', process.execPath, [
  'scripts/verify-outcome-measurement-local-d1.mjs',
]);
const localD1 = parseJsonOutput(localD1Run.stdout);
if (!localD1.ok || localD1.remote_mutations !== 0) throw new Error('Local D1 verifier failed');
bindResult(localD1Run, localD1);

const ownerGuard = runNpm('owner-baseline-guard', ['run', 'guard:owner-baseline']);
const ownerGuardPassed = /OWNER BASELINE GUARD: PASS/.test(ownerGuard.stdout);
if (!ownerGuardPassed) throw new Error('Owner baseline guard did not emit its accepted PASS result');
bindResult(ownerGuard, { pass: ownerGuardPassed, exit_code: 0 });
const stripeGuard = run('stripe-secret-guard', process.execPath, ['scripts/guard-stripe-secrets.mjs']);
const stripeGuardPassed = /STRIPE SECRET GUARD: PASS/.test(stripeGuard.stdout);
if (!stripeGuardPassed) throw new Error('Stripe secret guard did not emit its accepted PASS result');
bindResult(stripeGuard, { pass: stripeGuardPassed, exit_code: 0 });
const stripeSelfTest = run('stripe-secret-guard-self-test', process.execPath, [
  'tests/security/stripe-secret-guard.mjs',
]);
const stripeSelfTestPassed = /STRIPE SECRET GUARD TESTS: PASS/.test(stripeSelfTest.stdout);
if (!stripeSelfTestPassed) throw new Error('Stripe secret guard self-test did not emit its accepted PASS result');
bindResult(stripeSelfTest, { pass: stripeSelfTestPassed, exit_code: 0 });
const typeCheck = run('targeted-typescript-check', process.execPath, [
  'node_modules/typescript/bin/tsc', '--noEmit', '--strict', '--skipLibCheck', '--ignoreConfig',
  '--allowImportingTsExtensions', '--moduleResolution', 'Bundler', '--module', 'ESNext',
  '--target', 'ES2022', '--lib', 'ES2022,DOM',
  'functions/api/lead.ts',
  'functions/api/quote-request.ts',
  'src/lib/outcome-measurement/contracts.ts',
  'src/lib/outcome-measurement/attribution-store.ts',
  'src/lib/quote-request/delivery.ts',
]);
const typeDiagnosticsEmpty = !(typeCheck.stdout + typeCheck.stderr).trim();
if (!typeDiagnosticsEmpty) throw new Error('Targeted TypeScript check emitted unexpected diagnostics');
bindResult(typeCheck, { exit_code: 0, diagnostics_empty: typeDiagnosticsEmpty });

const releaseBuild = runNpm('release-build', ['run', 'verify:release']);
const postBuild = runNpm('post-build-qa', ['run', 'qa:postbuild']);
const diffCheck = run('diff-check', 'git', ['diff', '--check', 'HEAD^', 'HEAD'], { networkGuard: false });

const securityRun = run('slice1-security-scan', process.execPath, [
  'scripts/scan-outcome-measurement-slice1-security.mjs',
]);
const security = parseJsonOutput(securityRun.stdout);
if (!security.ok || security.prohibited_findings !== 0 || !security.self_scanned) {
  throw new Error('Security scan failed');
}
if (security.head !== head || security.tree !== tree || !security.worktree_clean) {
  throw new Error('Security scan was not bound to the exact clean HEAD');
}
bindResult(securityRun, security);

const buildManifest = JSON.parse(readFileSync(resolve(ROOT, 'dist/build-manifest.json'), 'utf8'));
const stableBuildManifest = {
  homepageVisualBaselineVersion: buildManifest.homepageVisualBaselineVersion,
  imageManifestSha256: buildManifest.imageManifestSha256,
  homepageHtmlSha256: buildManifest.homepageHtmlSha256,
  homepageVisualBaselineMarkerPresent: buildManifest.homepageVisualBaselineMarkerPresent,
  notes: buildManifest.notes,
};
const builtFiles = filesUnder(resolve(ROOT, 'dist'))
  .filter((item) => item.name !== 'build-manifest.json')
  .map((item) => ({
    path: item.name,
    sha256: sha256(readFileSync(item.absolute)),
    bytes: statSync(item.absolute).size,
  }));
const buildResult = {
  status: releaseBuild.execution.exit_code === 0 && postBuild.execution.exit_code === 0 ? 'PASS' : 'FAIL',
  build_command_id: releaseBuild.execution.id,
  build_command_sha256: releaseBuild.execution.command_sha256,
  build_exit_code: releaseBuild.execution.exit_code,
  post_build_command_id: postBuild.execution.id,
  post_build_command_sha256: postBuild.execution.command_sha256,
  post_build_exit_code: postBuild.execution.exit_code,
  stable_manifest: stableBuildManifest,
  built_file_count_excluding_volatile_manifest: builtFiles.length,
  built_output_sha256: sha256(canonicalJson(builtFiles)),
};
if (buildResult.status !== 'PASS') throw new Error('Build evidence could not derive PASS');
bindResult(releaseBuild, { build_output_sha256: buildResult.built_output_sha256, exit_code: 0 });
bindResult(postBuild, { stable_manifest: stableBuildManifest, exit_code: 0 });

const patchBytes = git(['diff', '--binary', 'HEAD^', 'HEAD'], { encoding: null });
const diffResult = {
  status: diffCheck.execution.exit_code === 0 ? 'PASS' : 'FAIL',
  base: parent,
  head,
  changed_file_count: changedFiles.length,
  patch_sha256: sha256(patchBytes),
  diff_check_exit_code: diffCheck.execution.exit_code,
  unrelated_dirty_checkout_contamination: 0,
};
bindResult(diffCheck, diffResult);

if (executions.some((execution) => !execution.result_sha256)) {
  throw new Error('An executed evidence command lacks a bound deterministic result digest');
}
const guardedExecutions = executions.filter((execution) => execution.network_guard_loaded !== null);
const instrumentedExternalAttempts = guardedExecutions.reduce(
  (total, execution) => total + execution.instrumented_external_attempts,
  0,
);
if (
  guardedExecutions.length === 0
  || guardedExecutions.some((execution) => !execution.network_guard_loaded)
  || instrumentedExternalAttempts !== 0
) {
  throw new Error('Instrumented external-network control failed closed');
}

const executionEvidence = {
  head,
  tree,
  parent,
  generator_sha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
  network_guard_sha256: sha256(readFileSync(NETWORK_GUARD)),
  network_control: {
    claim_scope: 'Node fetch, HTTP, HTTPS, TCP, and TLS surfaces for every relevant executed verifier/test/build command',
    guard_loaded_for_every_relevant_execution: guardedExecutions.every((execution) => execution.network_guard_loaded),
    instrumented_external_attempts: instrumentedExternalAttempts,
    uninstrumented_zero_network_claim: false,
  },
  executions,
};

const mechanicallyDerivedStatus = executions.every((execution) => (
  execution.exit_code === 0
  && /^[0-9a-f]{64}$/.test(execution.result_sha256)
)) && security.ok && coverage.ok && localD1.ok && buildResult.status === 'PASS'
  ? 'PASS'
  : 'FAIL';
function derivedExecutionStatus(id) {
  const execution = executions.find((item) => item.id === id);
  return execution
    && execution.exit_code === 0
    && /^[0-9a-f]{64}$/.test(execution.result_sha256)
    ? 'PASS'
    : 'FAIL';
}
const testResults = {
  status: mechanicallyDerivedStatus,
  head,
  tree,
  suites: testSuites,
  local_d1: derivedExecutionStatus('local-d1-verifier'),
  owner_baseline_guard: derivedExecutionStatus('owner-baseline-guard'),
  stripe_secret_guard: derivedExecutionStatus('stripe-secret-guard'),
  stripe_secret_guard_self_test: derivedExecutionStatus('stripe-secret-guard-self-test'),
  targeted_typescript_check: derivedExecutionStatus('targeted-typescript-check'),
  release_build: derivedExecutionStatus('release-build'),
  post_build_qa: derivedExecutionStatus('post-build-qa'),
  instrumented_external_attempts: instrumentedExternalAttempts,
  network_claim_scope: executionEvidence.network_control.claim_scope,
};

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

const artifacts = {
  'changed-files.json': { head, tree, parent, files: changedFiles },
  'test-results.json': testResults,
  'execution-evidence.json': executionEvidence,
  'coverage-verifier.json': coverage,
  'local-d1-verifier.json': localD1,
  'security-scan.json': security,
  'build-result.json': buildResult,
  'diff-result.json': diffResult,
};

for (const [name, value] of Object.entries(artifacts)) {
  writeFileSync(resolve(outputDirectory, name), canonicalJson(value), 'utf8');
}

const artifactIndex = Object.keys(artifacts)
  .sort()
  .map((name) => {
    const bytes = readFileSync(resolve(outputDirectory, name));
    return { path: name, sha256: sha256(bytes), bytes: bytes.length };
  });
writeFileSync(resolve(outputDirectory, 'artifact-index.json'), canonicalJson({ head, tree, artifacts: artifactIndex }), 'utf8');

const indexBytes = readFileSync(resolve(outputDirectory, 'artifact-index.json'));
rmSync(networkLogDirectory, { recursive: true, force: true });
process.stdout.write(`${canonicalJson({
  ok: true,
  head,
  tree,
  parent,
  output: relative(ROOT, outputDirectory).replaceAll('\\', '/'),
  artifact_index_sha256: sha256(indexBytes),
  artifacts: [...artifactIndex, {
    path: 'artifact-index.json',
    sha256: sha256(indexBytes),
    bytes: indexBytes.length,
  }],
})}`);
