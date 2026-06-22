#!/usr/bin/env node
// @ts-check
/**
 * OWNER BASELINE GUARD  (issue #38 — P0 anti-regression guardrail)
 *
 * Purpose: make it mechanically impossible for any future agent/PR to silently
 * work from a stale branch or reintroduce old phone numbers, old homepage /
 * soccer / Plan My Party baselines, or old sitemap/canonical SEO state.
 *
 * This script is the single mechanical gate. It is run:
 *   - locally, by every agent, BEFORE editing  (npm run guard:owner-baseline)
 *   - in CI, on every PR to main               (.github/workflows/verify-release.yml)
 *
 * It EXITS NON-ZERO and prints the exact failing check if any baseline is
 * missing, stale, or regressed. On success it prints:
 *     OWNER BASELINE GUARD: PASS
 *
 * ───────────────────────────────────────────────────────────────────────────
 * IMPORTANT — pinned values vs. owner confirmation
 * The phone / displayPhone / email below are PINNED to the values currently on
 * main. They are pinned to prevent SILENT regression, not to assert they are
 * the owner's final canonical choice (see docs/OWNER_SOURCE_OF_TRUTH.md, which
 * marks the canonical phone "OWNER CONFIRM REQUIRED"). If the owner confirms a
 * different number, business.ts AND the EXPECTED constant below must change in
 * the SAME reviewed PR — never one without the other. That two-file coupling is
 * the anti-regression mechanism.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Flags:
 *   --update-images   Regenerate the image-inventory baseline manifest. Only run
 *                     this with explicit owner approval to change images, then
 *                     commit the updated manifest in the same PR.
 */

import { readFileSync, existsSync, statSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, sep } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const UPDATE_IMAGES = process.argv.includes('--update-images');

// ── Owner-confirmed / current-main canonical values ────────────────────────
const EXPECTED = {
  phone: '+13108002860',
  displayPhone: '(310) 800-2860',
  email: 'info@happyfacesla.com',
  name: 'Happy Faces LA',
  url: 'https://happyfacesla.com',
};

// Old / blocked business contact numbers. If any of these appear as a Happy
// Faces LA public contact number, that is a regression and the guard fails.
const BLOCKED_PHONES = [
  {
    label: '818-619-5506',
    re: /(?:\+?1[-.\s]?)?\(?818\)?[-.\s]?619[-.\s]?5506/,
  },
  {
    label: '323-747-9474',
    re: /(?:\+?1[-.\s]?)?\(?323\)?[-.\s]?747[-.\s]?9474/,
  },
];

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg', '.ico'];
const IMAGE_MANIFEST_PATH = join(ROOT, 'scripts', 'owner-baseline', 'image-inventory.json');

const failures = [];
const notes = [];
function fail(check, detail) {
  failures.push({ check, detail });
}

// ── Helpers ────────────────────────────────────────────────────────────────
function readIfExists(relPath) {
  const abs = join(ROOT, relPath);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
}

/** Recursively list files under a dir (absolute paths). */
function walk(absDir, acc = []) {
  if (!existsSync(absDir)) return acc;
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      walk(abs, acc);
    } else {
      acc.push(abs);
    }
  }
  return acc;
}

const TEXT_SCAN_EXTENSIONS = [
  '.astro', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx',
  '.json', '.md', '.html', '.css', '.txt', '.vue', '.svelte',
];

// ── CHECK 1 — business.ts is the single source of truth ────────────────────
const businessSrc = readIfExists('src/data/business.ts');
if (businessSrc == null) {
  fail('business-source', 'src/data/business.ts is missing — it is the single source of truth for owner facts.');
} else {
  const assertField = (field, value) => {
    // matches:  field: "value"   (value escaped for regex)
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${field}\\s*:\\s*["']${escaped}["']`);
    if (!re.test(businessSrc)) {
      fail(
        'business-source',
        `src/data/business.ts must contain  ${field}: "${value}"  (pinned current-main value). ` +
          `If the owner confirmed a change, update this script's EXPECTED.${field} in the same PR.`,
      );
    }
  };
  assertField('phone', EXPECTED.phone);
  assertField('displayPhone', EXPECTED.displayPhone);
  assertField('email', EXPECTED.email);
  assertField('name', EXPECTED.name);
  assertField('url', EXPECTED.url);
}

// ── CHECK 2 — no blocked old phone numbers anywhere in src/ or public/ ──────
{
  const scanRoots = ['src', 'public'].map((d) => join(ROOT, d));
  const offenders = [];
  for (const rootDir of scanRoots) {
    for (const abs of walk(rootDir)) {
      const lower = abs.toLowerCase();
      if (!TEXT_SCAN_EXTENSIONS.some((ext) => lower.endsWith(ext))) continue;
      let content;
      try {
        content = readFileSync(abs, 'utf8');
      } catch {
        continue;
      }
      for (const blocked of BLOCKED_PHONES) {
        if (blocked.re.test(content)) {
          offenders.push(`${relative(ROOT, abs).split(sep).join('/')}  →  ${blocked.label}`);
        }
      }
    }
  }
  if (offenders.length) {
    fail(
      'blocked-phone',
      'Old/blocked business phone number(s) reintroduced:\n      ' + offenders.join('\n      '),
    );
  }
}

// ── CHECK 3 — homepage baseline markers ────────────────────────────────────
{
  const index = readIfExists('src/pages/index.astro');
  if (index == null) {
    fail('homepage-baseline', 'src/pages/index.astro is missing.');
  } else {
    const required = [
      ['homepageVisualBaseline="homepage-visual-baseline-v0.3-owner-gallery-20260616"', 'visual baseline marker'],
      ['LA Face Painting & Kids Party Entertainment | Happy Faces LA', 'SEO title'],
      ['faqJsonLd(commonFaqs)', 'FAQ structured data'],
      ['Kids Party Entertainment Services in Los Angeles', 'primary H2 copy'],
    ];
    for (const [needle, what] of required) {
      if (!index.includes(needle)) {
        fail('homepage-baseline', `src/pages/index.astro is missing the ${what}: \`${needle}\``);
      }
    }
  }
}

// ── CHECK 4 + 5 — Plan My Party route exists with trailing-slash canonical ──
{
  const plan = readIfExists('src/pages/plan-my-party.astro');
  if (plan == null) {
    fail('plan-my-party', 'src/pages/plan-my-party.astro is missing — the primary conversion route.');
  } else if (!/['"`]\/plan-my-party\/['"`]/.test(plan)) {
    fail('plan-my-party', "src/pages/plan-my-party.astro must keep the trailing-slash canonical '/plan-my-party/'.");
  }
}

// ── CHECK 6 — sitemap exclusions + trailing-slash (SEO baseline / PR #12) ───
{
  const cfg = readIfExists('astro.config.mjs');
  if (cfg == null) {
    fail('sitemap-seo', 'astro.config.mjs is missing.');
  } else {
    if (!/trailingSlash\s*:\s*['"]always['"]/.test(cfg)) {
      fail('sitemap-seo', "astro.config.mjs must keep trailingSlash: 'always'.");
    }
    // /booking-confirmed is a noindex post-payment utility page and must stay
    // excluded from the sitemap. (NOTE: /reviews is intentionally NOT excluded
    // on current main — it was deliberately surfaced for SEO. Do not re-add it.)
    for (const needle of ['/booking-confirmed', '/booking-confirmed/']) {
      if (!cfg.includes(`'${needle}'`) && !cfg.includes(`"${needle}"`)) {
        fail('sitemap-seo', `astro.config.mjs must keep the sitemap exclusion for '${needle}'.`);
      }
    }
  }
}

// ── CHECK 7 — Header/Footer consume business facts (not hardcoded) ─────────
{
  for (const relPath of ['src/components/layout/Header.astro', 'src/components/layout/Footer.astro']) {
    const src = readIfExists(relPath);
    if (src == null) {
      fail('header-footer', `${relPath} is missing.`);
      continue;
    }
    if (!/from\s+["'][^"']*data\/business["']/.test(src)) {
      fail('header-footer', `${relPath} must import the central \`business\` facts (data/business).`);
    }
    if (!/business\.phone/.test(src) || !/business\.displayPhone/.test(src)) {
      fail('header-footer', `${relPath} must render business.phone / business.displayPhone, not a hardcoded number.`);
    }
  }
}

// ── CHECK 8 — soccer page baseline (route + confirmed sentinel copy) ───────
{
  const soccer = readIfExists('src/pages/soccer-fan-face-painting-los-angeles.astro');
  if (soccer == null) {
    fail('soccer-baseline', 'src/pages/soccer-fan-face-painting-los-angeles.astro is missing.');
  } else if (!soccer.includes('Soccer Fan Face Painting Los Angeles | Happy Faces LA')) {
    fail('soccer-baseline', 'soccer page must keep its confirmed SEO title sentinel "Soccer Fan Face Painting Los Angeles | Happy Faces LA".');
  }
}

// ── CHECK 9 — no committed/generated dist used as source ────────────────────
{
  const gitignore = readIfExists('.gitignore') || '';
  if (!/^\s*dist\/?\s*$/m.test(gitignore)) {
    fail('no-dist', '.gitignore must ignore dist/ (generated output must never be committed or used as source).');
  }
  try {
    const tracked = execFileSync('git', ['ls-files', 'dist'], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (tracked) {
      fail('no-dist', `Generated dist/ files are committed:\n      ${tracked.split('\n').join('\n      ')}`);
    }
  } catch {
    notes.push('Skipped git dist-tracking check (git not available).');
  }
}

// ── CHECK 10 — image inventory unchanged unless owner-approved ──────────────
{
  const current = buildImageInventory();
  if (UPDATE_IMAGES) {
    writeImageManifest(current);
    notes.push(`Image inventory baseline regenerated: ${current.count} files. Commit this with owner approval.`);
  } else if (!existsSync(IMAGE_MANIFEST_PATH)) {
    // First run: seed the baseline so the gate is active from here on.
    writeImageManifest(current);
    notes.push(`Image inventory baseline created (${current.count} files). Review & commit scripts/owner-baseline/image-inventory.json.`);
  } else {
    const baseline = JSON.parse(readFileSync(IMAGE_MANIFEST_PATH, 'utf8'));
    const diff = diffInventory(baseline.files || {}, current.files);
    if (diff.added.length || diff.removed.length || diff.changed.length) {
      const lines = [];
      if (diff.added.length) lines.push('ADDED:\n        ' + diff.added.join('\n        '));
      if (diff.removed.length) lines.push('REMOVED:\n        ' + diff.removed.join('\n        '));
      if (diff.changed.length) lines.push('CHANGED:\n        ' + diff.changed.join('\n        '));
      fail(
        'image-inventory',
        'Image inventory changed without approval:\n      ' +
          lines.join('\n      ') +
          '\n      If the owner approved these image changes, run:  node scripts/guard-owner-baseline.mjs --update-images' +
          '\n      and commit the updated scripts/owner-baseline/image-inventory.json in the same PR.',
      );
    }
  }
}

// ── Report ─────────────────────────────────────────────────────────────────
for (const n of notes) console.log(`note: ${n}`);

if (failures.length === 0) {
  console.log('OWNER BASELINE GUARD: PASS');
  process.exit(0);
}

console.error('\nOWNER BASELINE GUARD: FAIL');
console.error(`${failures.length} baseline check(s) failed:\n`);
for (const f of failures) {
  console.error(`  [${f.check}] ${f.detail}`);
}
console.error('\nSee docs/OWNER_SOURCE_OF_TRUTH.md. Do not bypass this guard — fix the regression.');
process.exit(1);

// ── Image-inventory implementation ─────────────────────────────────────────
function listImageFiles() {
  // Prefer git (tracked files only) so build artifacts never count.
  try {
    const out = execFileSync('git', ['ls-files', '-z', 'public', 'src'], { cwd: ROOT, encoding: 'utf8' });
    const files = out.split('\0').filter(Boolean);
    const imgs = files.filter((f) => IMAGE_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext)));
    if (imgs.length) return imgs.map((f) => f.split('/').join('/'));
  } catch {
    // fall through to fs walk
  }
  const acc = [];
  for (const d of ['public', 'src']) {
    for (const abs of walk(join(ROOT, d))) {
      if (IMAGE_EXTENSIONS.some((ext) => abs.toLowerCase().endsWith(ext))) {
        acc.push(relative(ROOT, abs).split(sep).join('/'));
      }
    }
  }
  return acc;
}

function buildImageInventory() {
  const files = {};
  let totalBytes = 0;
  for (const rel of listImageFiles().sort()) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) continue;
    const size = statSync(abs).size;
    files[rel] = size;
    totalBytes += size;
  }
  return { count: Object.keys(files).length, totalBytes, files };
}

function writeImageManifest(inv) {
  mkdirSync(dirname(IMAGE_MANIFEST_PATH), { recursive: true });
  const payload = {
    note: 'Auto-generated by scripts/guard-owner-baseline.mjs. Image change-control baseline (issue #38). Regenerate ONLY with owner approval via --update-images.',
    generatedAt: new Date().toISOString(),
    count: inv.count,
    totalBytes: inv.totalBytes,
    files: inv.files,
  };
  writeFileSync(IMAGE_MANIFEST_PATH, JSON.stringify(payload, null, 2) + '\n');
}

function diffInventory(baseFiles, curFiles) {
  const added = [];
  const removed = [];
  const changed = [];
  for (const f of Object.keys(curFiles)) {
    if (!(f in baseFiles)) added.push(f);
    else if (baseFiles[f] !== curFiles[f]) changed.push(`${f} (${baseFiles[f]}B → ${curFiles[f]}B)`);
  }
  for (const f of Object.keys(baseFiles)) {
    if (!(f in curFiles)) removed.push(f);
  }
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}
