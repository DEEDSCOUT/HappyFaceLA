import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function listSourceFiles(): string[] {
  const srcRoot = path.resolve("src");
  const result: string[] = [];

  const walk = (dir: string): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".ts")) {
        result.push(full);
      }
    }
  };

  walk(srcRoot);
  return result;
}

test("executable source does not contain forbidden mutation operation references", () => {
  const forbidden = /manage_sitemaps|add_site|delete_site|request indexing|request_indexing|Test Live URL/i;
  const offenders: string[] = [];

  for (const filePath of listSourceFiles()) {
    const content = fs.readFileSync(filePath, "utf8");
    if (forbidden.test(content)) {
      offenders.push(path.relative(process.cwd(), filePath).replaceAll("\\", "/"));
    }
  }

  assert.deepEqual(offenders, []);
});

test("source does not hardcode local secret paths or credential values", () => {
  const blocking = /happyfacesla-secrets|BEGIN PRIVATE KEY|AIza[0-9A-Za-z_-]{20,}|GOCSPX-[0-9A-Za-z_-]{10,}|1\/\/[0-9A-Za-z_-]{20,}/;
  const offenders: string[] = [];

  for (const filePath of listSourceFiles()) {
    const content = fs.readFileSync(filePath, "utf8");
    if (blocking.test(content)) {
      offenders.push(path.relative(process.cwd(), filePath).replaceAll("\\", "/"));
    }
  }

  assert.deepEqual(offenders, []);
});
