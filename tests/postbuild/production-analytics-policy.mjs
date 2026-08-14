#!/usr/bin/env node
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const distRoot = path.resolve("dist");
const htmlFiles = [];

async function collectHtml(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectHtml(absolute);
    else if (entry.isFile() && entry.name.endsWith(".html")) htmlFiles.push(absolute);
  }
}

await collectHtml(distRoot);
assert(htmlFiles.length > 0, "a built site is required before analytics post-build QA");

for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  assert.equal(
    html.includes("https://www.googletagmanager.com/gtag/js"),
    false,
    `${path.relative(distRoot, file)} must not load GA4 unconditionally`,
  );
  assert.equal(
    html.includes("https://www.clarity.ms/tag/"),
    false,
    `${path.relative(distRoot, file)} must not load Clarity unconditionally`,
  );
}

const assetRoot = path.join(distRoot, "_astro");
const javascriptFiles = (await readdir(assetRoot))
  .filter((name) => name.endsWith(".js"))
  .map((name) => path.join(assetRoot, name));

const policyBundles = [];
for (const file of javascriptFiles) {
  const javascript = await readFile(file, "utf8");
  if (javascript.includes("production-host-v1")) {
    policyBundles.push({ file, javascript });
  }
}

assert.equal(policyBundles.length, 1, "exactly one built production analytics policy bundle is expected");
const { javascript: policyBundle } = policyBundles[0];
for (const required of [
  "happyfacesla.com",
  "www.happyfacesla.com",
  "G-7NH6RY78TK",
  "wsw4v74jpw",
  "hfla-production-ga4",
  "hfla-production-clarity",
]) {
  assert(policyBundle.includes(required), `built analytics policy must contain ${required}`);
}

console.log("PASS built analytics is host-gated and absent from unconditional HTML");
