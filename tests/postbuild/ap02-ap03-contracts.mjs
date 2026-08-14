#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

for (const route of ['plan-my-party', 'packages', 'contact', 'hire-face-painter-los-angeles']) {
  const html = await readFile(join(dist, route, 'index.html'), 'utf8');
  assert(html.includes('<form'), `${route} form is present`);
}

const files = await walk(dist);
const scripts = files.filter((path) => path.endsWith('.js'));
const javascript = (await Promise.all(scripts.map((path) => readFile(path, 'utf8')))).join('\n');

for (const token of [
  'submission_id',
  'first_touch',
  'latest_qualifying_touch',
  'submit_touch',
  'conversionEligible',
  'gbraid',
  'wbraid',
]) {
  assert(javascript.includes(token), `built browser contract includes ${token}`);
}

assert.equal(/AW-[A-Z0-9-]+/.test(javascript), false, 'no direct Google Ads tag was introduced');
assert.equal(javascript.includes('send_to'), false, 'no direct Ads send_to was introduced');

for (const sourcePath of [
  'src/components/wizard/WizardShell.astro',
  'src/components/conversion/QuoteForm.astro',
  'src/pages/packages.astro',
  'src/pages/hire-face-painter-los-angeles.astro',
]) {
  const source = await readFile(join(root, sourcePath), 'utf8');
  assert.equal(source.includes('conversion_definition_version: "MV-5"'), false, `${sourcePath} does not reuse MV-5`);
  assert.equal(source.includes("conversion_definition_version: 'MV-5'"), false, `${sourcePath} does not reuse MV-5`);
}

const browserAttributionSource = await readFile(
  join(root, 'src/lib/attribution/browser-attribution.ts'),
  'utf8',
);
assert(browserAttributionSource.includes("LEGACY_STORAGE_KEY = 'hfla_attribution'"));
assert(browserAttributionSource.includes('purgeLegacyAttributionStorage'));

const packagesHtml = await readFile(join(dist, 'packages', 'index.html'), 'utf8');
assert.equal(packagesHtml.includes('Yelp packages availability request'), false, 'package intent is channel-neutral');

console.log('PASS AP-02A/AP-03A post-build contracts');
