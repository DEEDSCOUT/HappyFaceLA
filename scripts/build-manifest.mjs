import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const baselineVersion = "homepage-visual-baseline-v0.3-owner-gallery-20260616";
const rootDir = process.cwd();
const distDir = join(rootDir, "dist");
const imageManifestPath = join(
  rootDir,
  "evidence",
  "homepage-visual-baseline",
  "homepage_image_manifest.json",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function firstEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }
  return null;
}

const imageManifest = await readFile(imageManifestPath, "utf8");
const homepageHtml = await readFile(join(distDir, "index.html"), "utf8");

const buildManifest = {
  generatedAt: new Date().toISOString(),
  deploymentSourcePath: rootDir,
  gitBranch:
    firstEnv("CF_PAGES_BRANCH", "GITHUB_REF_NAME", "BRANCH_NAME") ??
    "unavailable_no_git_invocation",
  gitCommit:
    firstEnv("CF_PAGES_COMMIT_SHA", "GITHUB_SHA", "COMMIT_SHA") ??
    "unavailable_no_git_invocation",
  homepageVisualBaselineVersion: baselineVersion,
  imageManifestSha256: sha256(imageManifest),
  homepageHtmlSha256: sha256(homepageHtml),
  homepageVisualBaselineMarkerPresent: homepageHtml.includes(
    'name="hfla-homepage-visual-baseline"',
  ),
  notes:
    "Generated locally after Astro build. Values are source provenance only and contain no secrets.",
};

await writeFile(
  join(distDir, "build-manifest.json"),
  `${JSON.stringify(buildManifest, null, 2)}\n`,
);

console.log("OK wrote dist/build-manifest.json");
