#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const migrationRoot = path.join(repositoryRoot, "migrations", "artist-payouts");
const manifestPath = path.join(migrationRoot, "manifest.json");

function fail(message) {
  throw new Error(`Artist payout migration manifest rejected: ${message}`);
}

async function sqlFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...(await sqlFiles(path.join(directory, entry.name), relative)));
    } else if (entry.isFile() && entry.name.endsWith(".sql")) {
      found.push(relative);
    }
  }
  return found;
}

const rawManifest = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(rawManifest);
if (
  manifest.version !== 1 ||
  !manifest.sequences ||
  !Array.isArray(manifest.files)
) {
  fail("schema is invalid");
}

const expectedSequences = {
  sandbox: [
    "sandbox/0000_environment_identity.sql",
    "0001_artist_payout_system.sql",
  ],
  live: [
    "live/0000_environment_identity.sql",
    "0001_artist_payout_system.sql",
  ],
};
if (JSON.stringify(manifest.sequences) !== JSON.stringify(expectedSequences))
  fail("environment sequence or order changed");

const entries = new Map();
for (const entry of manifest.files) {
  if (
    !entry ||
    typeof entry.path !== "string" ||
    !/^([a-z]+\/)?\d{4}_[a-z0-9_]+\.sql$/.test(entry.path) ||
    !Number.isSafeInteger(entry.bytes) ||
    entry.bytes < 1 ||
    !/^[a-f0-9]{64}$/.test(entry.sha256) ||
    entries.has(entry.path)
  ) {
    fail("file entry is malformed or duplicated");
  }
  entries.set(entry.path, entry);
}

const discovered = await sqlFiles(migrationRoot);
if (
  JSON.stringify([...entries.keys()].sort()) !==
  JSON.stringify(discovered.sort())
) {
  fail("SQL membership differs from the sealed manifest");
}

for (const [relative, entry] of entries) {
  const bytes = await readFile(path.join(migrationRoot, ...relative.split("/")));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== entry.bytes || digest !== entry.sha256)
    fail(`${relative} bytes or SHA-256 differ`);
}

console.log("Artist payout migration membership, order, bytes, and SHA-256 verified.");
