import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { resolveOutputRoot } from "../src/storage.js";

test("default output root is repository-root stable regardless current working directory", () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(testDir, "../../..");
  const expected = path.join(repoRoot, "data", "gsc");

  const originalCwd = process.cwd();
  try {
    process.chdir(path.resolve(testDir, ".."));
    assert.equal(resolveOutputRoot(undefined), expected);

    process.chdir(repoRoot);
    assert.equal(resolveOutputRoot(undefined), expected);
  } finally {
    process.chdir(originalCwd);
  }
});

test("explicit outputDir still resolves from provided value", () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(testDir, "../../..");

  const originalCwd = process.cwd();
  try {
    process.chdir(path.resolve(testDir, ".."));
    assert.equal(resolveOutputRoot("data/gsc"), path.join(repoRoot, "tools", "gsc_harvester", "data", "gsc"));
  } finally {
    process.chdir(originalCwd);
  }
});
