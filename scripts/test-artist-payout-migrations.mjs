import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const wrangler = join(
  process.cwd(),
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);

function execute(persistTo, file, expectSuccess = true) {
  const result = spawnSync(
    process.execPath,
    [
      wrangler,
      "d1",
      "execute",
      "PAYOUTS_D1",
      "--config",
      "wrangler.artist-payouts.local.toml",
      "--local",
      "--persist-to",
      persistTo,
      "--file",
      file,
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  const succeeded = result.status === 0;
  if (succeeded !== expectSuccess) {
    if (result.error) process.stderr.write(`${result.error.message}\n`);
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(
      `${file} ${expectSuccess ? "failed" : "unexpectedly succeeded"}`,
    );
  }
}

function testEnvironment(identityFile) {
  const persistTo = mkdtempSync(join(tmpdir(), "hfla-payout-migration-"));
  try {
    execute(persistTo, identityFile);
    execute(
      persistTo,
      "migrations/artist-payouts/0001_artist_payout_system.sql",
    );
    execute(
      persistTo,
      "migrations/artist-payouts/0001_artist_payout_system.sql",
      false,
    );
  } finally {
    rmSync(persistTo, { recursive: true, force: true });
  }
}

testEnvironment(
  "migrations/artist-payouts/sandbox/0000_environment_identity.sql",
);
testEnvironment(
  "migrations/artist-payouts/live/0000_environment_identity.sql",
);
process.stdout.write(
  "Artist payout migrations apply once in sandbox/live and reject replay.\n",
);
