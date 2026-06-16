import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const rootDir = process.cwd();
const mode = process.env.HFLA_HOMEPAGE_VISUAL_LOCK_MODE || "deploy";
const baseUrl = process.env.HFLA_LIVE_HOMEPAGE_URL || "https://happyfacesla.com/";
const baselineVersion = "homepage-visual-baseline-v0.2-draft-20260615";
const manifestPath = join(
  rootDir,
  "evidence",
  "homepage-visual-baseline",
  "homepage_image_manifest.json",
);
const resultsPath = join(
  rootDir,
  "evidence",
  "homepage-visual-regression",
  "live_homepage_visual_lock_results.json",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stripTags(value) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractAnchors(html) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((match) => {
    const href = match[1].match(/\bhref="([^"]*)"/i)?.[1] || "";
    return { href, text: stripTags(match[2]) };
  });
}

function extractImageSources(html) {
  return [
    ...new Set(
      [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)]
        .map((match) => match[1])
        .filter((src) => src.startsWith("/") && !src.includes("${")),
    ),
  ].sort();
}

function findManifestEntry(src, images) {
  return images.find(
    (image) =>
      image.path === src ||
      (image.generatedPathPrefix && src.startsWith(image.generatedPathPrefix)),
  );
}

async function fetchPublicImageHash(origin, src) {
  if (!src.startsWith("/images/")) {
    return null;
  }
  const response = await fetch(new URL(src, origin), { cache: "no-store" });
  if (!response.ok) {
    return null;
  }
  return sha256(Buffer.from(await response.arrayBuffer()));
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const forbiddenOldImages = manifest.forbiddenOldImages ?? [];
const url = new URL(baseUrl);
url.searchParams.set("visual-proof", new Date().toISOString().replace(/[:.]/g, ""));

const response = await fetch(url, {
  cache: "no-store",
  headers: {
    "cache-control": "no-cache",
    pragma: "no-cache",
  },
});

const html = await response.text();
const anchors = extractAnchors(html);
const imageSources = extractImageSources(html);
const failures = [];
const reviewFindings = [];
const imageResults = [];
const unknownImages = [];

if (response.status !== 200) {
  failures.push(`Live homepage returned HTTP ${response.status}.`);
}

if (!html.includes("Plan My Party")) {
  failures.push("Live homepage does not contain Plan My Party.");
}

const planMyPartyAnchors = anchors.filter(
  (anchor) => anchor.text.includes("Plan My Party") && anchor.href === "/plan-my-party/",
);
if (planMyPartyAnchors.length < 3) {
  failures.push(
    `Expected at least 3 Plan My Party links on live homepage; found ${planMyPartyAnchors.length}.`,
  );
}

if (!html.includes(`content="${baselineVersion}"`)) {
  failures.push("Live homepage visual baseline meta marker is missing.");
}

for (const anchor of anchors) {
  if (
    anchor.href === "/contact/" &&
    /Get Quote|Get Availability & Pricing|Request Availability & Pricing/i.test(anchor.text)
  ) {
    failures.push(`Forbidden old booking CTA found on live homepage: ${anchor.text} -> /contact/.`);
  }
}

if (html.includes("Request Availability & Pricing")) {
  failures.push("Forbidden Request Availability & Pricing copy found on live homepage.");
}

for (const src of imageSources) {
  const forbidden = forbiddenOldImages.find((image) => image.path === src);
  if (forbidden) {
    failures.push(`Forbidden old live homepage image returned: ${src}`);
    imageResults.push({ src, status: "forbidden_old_image" });
    continue;
  }

  const entry = findManifestEntry(src, manifest.images);
  if (!entry) {
    failures.push(`Live homepage image is not listed in manifest: ${src}`);
    imageResults.push({ src, status: "missing_from_manifest" });
    continue;
  }

  const actualPublicHash = await fetchPublicImageHash(url.origin, src);
  const hashMatches = actualPublicHash === null ? null : actualPublicHash === entry.sha256;
  const isUnknown = entry.status === "unknown_requires_owner_approval";

  if (hashMatches === false) {
    failures.push(`Live public image hash changed unexpectedly for ${src}.`);
  }

  if (isUnknown) {
    unknownImages.push(src);
  }

  imageResults.push({
    src,
    manifestPath: entry.path,
    status: entry.status,
    hashMatches,
  });
}

if (mode !== "review") {
  if (manifest.status !== "APPROVED_OWNER_ACCEPTED") {
    failures.push(`Manifest status is ${manifest.status}; owner-approved status is required for deploy mode.`);
  }
  if (unknownImages.length) {
    failures.push(`Unknown live homepage images require owner approval before deploy mode: ${unknownImages.join(", ")}`);
  }
} else if (unknownImages.length) {
  reviewFindings.push(
    `Unknown live homepage images surfaced for owner approval: ${unknownImages.join(", ")}`,
  );
}

const results = {
  ok: failures.length === 0,
  mode,
  checkedUrl: url.toString(),
  httpStatus: response.status,
  cfCacheStatus: response.headers.get("cf-cache-status"),
  baselineVersion,
  generatedAt: new Date().toISOString(),
  planMyPartyAnchorCount: planMyPartyAnchors.length,
  imageResults,
  unknownImages,
  reviewFindings,
  failures,
};

await mkdir(dirname(resultsPath), { recursive: true });
await writeFile(resultsPath, `${JSON.stringify(results, null, 2)}\n`);

if (failures.length) {
  console.error("Live homepage visual lock failed:");
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

if (reviewFindings.length) {
  console.warn("Live homepage visual lock review findings:");
  reviewFindings.forEach((finding) => console.warn(` - ${finding}`));
}

console.log("Live homepage visual lock passed.");
