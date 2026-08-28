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

const ROOT = resolve(import.meta.dirname, '..');
const EXPECTED_PARENT = '1a51ee9b43aa9a91ab76f07cc05e25a573b378d2';
const DEFAULT_OUTPUT = '.agent/outcome-measurement-slice1/frozen';
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

function run(id, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: 'false',
      ...options.env,
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const safeOutput = `${result.stdout || ''}\n${result.stderr || ''}`
      .replaceAll(ROOT, '<repository>')
      .slice(-12000);
    throw new Error(`${id} failed with exit ${result.status}:\n${safeOutput}`);
  }
  return {
    id,
    exit_code: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function runNpm(id, args) {
  return run(id, process.execPath, [NPM_CLI, ...args]);
}

function parseJsonOutput(output) {
  const start = output.indexOf('{');
  if (start < 0) throw new Error('Expected JSON output was not produced');
  return JSON.parse(output.slice(start));
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
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
if (parent !== EXPECTED_PARENT) {
  throw new Error(`Unexpected direct parent: ${parent}`);
}

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

const coverage = parseJsonOutput(run(
  'capture-coverage-verifier',
  process.execPath,
  ['scripts/verify-outcome-measurement-coverage.mjs'],
).stdout);
if (!coverage.ok) throw new Error('Capture coverage verifier failed');

const localD1 = parseJsonOutput(run(
  'local-d1-verifier',
  process.execPath,
  ['scripts/verify-outcome-measurement-local-d1.mjs'],
).stdout);
if (!localD1.ok || localD1.remote_mutations !== 0) throw new Error('Local D1 verifier failed');

runNpm('owner-baseline-guard', ['run', 'guard:owner-baseline']);
run('stripe-secret-guard', process.execPath, ['scripts/guard-stripe-secrets.mjs']);
run('stripe-secret-guard-self-test', process.execPath, ['tests/security/stripe-secret-guard.mjs']);
run('targeted-typescript-check', process.execPath, [
  'node_modules/typescript/bin/tsc', '--noEmit', '--strict', '--skipLibCheck', '--ignoreConfig',
  '--allowImportingTsExtensions', '--moduleResolution', 'Bundler', '--module', 'ESNext',
  '--target', 'ES2022', '--lib', 'ES2022,DOM',
  'functions/api/lead.ts',
  'functions/api/quote-request.ts',
  'src/lib/outcome-measurement/contracts.ts',
  'src/lib/outcome-measurement/attribution-store.ts',
  'src/lib/quote-request/delivery.ts',
]);
runNpm('release-build', ['run', 'verify:release']);
runNpm('post-build-qa', ['run', 'qa:postbuild']);
run('diff-check', 'git', ['diff', '--check', 'HEAD^', 'HEAD']);

const security = parseJsonOutput(run(
  'slice1-security-scan',
  process.execPath,
  ['scripts/scan-outcome-measurement-slice1-security.mjs'],
).stdout);
if (!security.ok || security.prohibited_findings !== 0) throw new Error('Security scan failed');

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
  .map((item) => ({ path: item.name, sha256: sha256(readFileSync(item.absolute)), bytes: statSync(item.absolute).size }));
const buildResult = {
  status: 'PASS',
  command: 'npm run verify:release',
  post_build_qa: 'PASS',
  stable_manifest: stableBuildManifest,
  built_file_count_excluding_volatile_manifest: builtFiles.length,
  built_output_sha256: sha256(canonicalJson(builtFiles)),
};

const patchBytes = git(['diff', '--binary', 'HEAD^', 'HEAD'], { encoding: null });
const diffResult = {
  status: 'PASS',
  base: parent,
  head,
  changed_file_count: changedFiles.length,
  patch_sha256: sha256(patchBytes),
  diff_check: 'PASS',
  unrelated_dirty_checkout_contamination: 0,
};

const testResults = {
  status: 'PASS',
  head,
  tree,
  suites: testSuites,
  local_d1: 'PASS',
  owner_baseline_guard: 'PASS',
  stripe_secret_guard: 'PASS',
  stripe_secret_guard_self_test: 'PASS',
  targeted_typescript_check: 'PASS',
  release_build: 'PASS',
  post_build_qa: 'PASS',
  network_runtime_calls: 0,
};

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

const artifacts = {
  'changed-files.json': { head, tree, parent, files: changedFiles },
  'test-results.json': testResults,
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
