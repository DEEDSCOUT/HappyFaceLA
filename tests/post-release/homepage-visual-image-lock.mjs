import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const rootDir = process.cwd();
const mode = process.env.HFLA_HOMEPAGE_VISUAL_LOCK_MODE || "deploy";
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
  "homepage_visual_image_lock_results.json",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(filePath) {
  return sha256(await readFile(filePath));
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

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const forbiddenOldImages = manifest.forbiddenOldImages ?? [];
const homepageHtmlPath = join(rootDir, "dist", "index.html");
const homepageSourcePath = join(rootDir, "src", "pages", "index.astro");
const mobileStickyPath = join(
  rootDir,
  "src",
  "components",
  "layout",
  "MobileStickyCtas.astro",
);

const failures = [];
const reviewFindings = [];

if (!existsSync(homepageHtmlPath)) {
  failures.push("dist/index.html is missing; run npm run build before this guard.");
}

const homepageHtml = existsSync(homepageHtmlPath)
  ? await readFile(homepageHtmlPath, "utf8")
  : "";
const homepageSource = await readFile(homepageSourcePath, "utf8");
const mobileStickySource = await readFile(mobileStickyPath, "utf8");
const anchors = extractAnchors(homepageHtml);
const imageSources = extractImageSources(homepageHtml);
const planMyPartyAnchors = anchors.filter(
  (anchor) => anchor.text.includes("Plan My Party") && anchor.href === "/plan-my-party/",
);

if (!homepageHtml.includes("Plan My Party")) {
  failures.push("Built homepage does not contain Plan My Party.");
}

if (planMyPartyAnchors.length < 3) {
  failures.push(
    `Expected at least 3 Plan My Party links on built homepage; found ${planMyPartyAnchors.length}.`,
  );
}

if (
  !homepageSource.includes('primaryCtaLabel="Plan My Party"') ||
  !homepageSource.includes('primaryCtaHref="/plan-my-party/"')
) {
  failures.push("Homepage hero source CTA is not Plan My Party -> /plan-my-party/.");
}

if (
  !homepageSource.includes('CTASection ctaPrimaryLabel="Plan My Party"') ||
  !homepageSource.includes('ctaPrimaryHref="/plan-my-party/"')
) {
  failures.push("Homepage bottom CTA source is not Plan My Party -> /plan-my-party/.");
}

if (
  mobileStickySource.includes('href="/contact/"') &&
  mobileStickySource.includes("Get Quote")
) {
  failures.push("Mobile sticky booking CTA still contains Get Quote -> /contact/.");
}

if (
  !mobileStickySource.includes('href="/plan-my-party/"') ||
  !mobileStickySource.includes("Plan My Party")
) {
  failures.push("Mobile sticky booking CTA is not Plan My Party -> /plan-my-party/.");
}

if (!homepageHtml.includes(`content="${baselineVersion}"`)) {
  failures.push("Homepage visual baseline meta marker is missing from built homepage.");
}

for (const anchor of anchors) {
  if (
    anchor.href === "/contact/" &&
    /Get Quote|Get Availability & Pricing|Request Availability & Pricing/i.test(anchor.text)
  ) {
    failures.push(`Forbidden old booking CTA found in built homepage: ${anchor.text} -> /contact/.`);
  }
}

if (homepageHtml.includes("Request Availability & Pricing")) {
  failures.push("Forbidden Request Availability & Pricing copy found in built homepage.");
}

const heroEntry = findManifestEntry(
  "/images/hero/happy-faces-la-hero-face-painting-butterfly-01.webp",
  manifest.images,
);
if (!heroEntry) {
  failures.push("Butterfly hero image is missing from manifest.");
} else if (!imageSources.includes(heroEntry.path)) {
  failures.push("Butterfly hero image is missing from built homepage.");
}

const unknownImages = [];
const imageResults = [];

for (const src of imageSources) {
  const forbidden = forbiddenOldImages.find((image) => image.path === src);
  if (forbidden) {
    failures.push(`Forbidden old homepage image returned: ${src}`);
    imageResults.push({ src, status: "forbidden_old_image" });
    continue;
  }

  const entry = findManifestEntry(src, manifest.images);
  if (!entry) {
    failures.push(`Homepage image is not listed in manifest: ${src}`);
    imageResults.push({ src, status: "missing_from_manifest" });
    continue;
  }

  const sourceFilePath = join(rootDir, entry.sourceFilePath);
  const fileExists = existsSync(sourceFilePath);
  const actualHash = fileExists ? await sha256File(sourceFilePath) : null;
  const hashMatches = actualHash === entry.sha256;
  const isUnknown = entry.status === "unknown_requires_owner_approval";

  if (!fileExists) {
    failures.push(`Manifest source file missing for ${src}: ${entry.sourceFilePath}`);
  } else if (!hashMatches) {
    failures.push(`Image hash changed unexpectedly for ${src}.`);
  }

  if (isUnknown) {
    unknownImages.push(src);
  }

  imageResults.push({
    src,
    manifestPath: entry.path,
    status: entry.status,
    hashMatches,
    sourceFilePath: entry.sourceFilePath,
  });
}

if (mode !== "review") {
  if (manifest.status !== "APPROVED_OWNER_ACCEPTED") {
    failures.push(`Manifest status is ${manifest.status}; owner-approved status is required for deploy mode.`);
  }
  if (unknownImages.length) {
    failures.push(`Unknown homepage images require owner approval before deploy mode: ${unknownImages.join(", ")}`);
  }
} else if (unknownImages.length) {
  reviewFindings.push(
    `Unknown homepage images surfaced for owner approval: ${unknownImages.join(", ")}`,
  );
}

const results = {
  ok: failures.length === 0,
  mode,
  baselineVersion,
  generatedAt: new Date().toISOString(),
  planMyPartyAnchorCount: planMyPartyAnchors.length,
  mobileStickyBookingCta: {
    label: mobileStickySource.includes("Plan My Party") ? "Plan My Party" : "missing",
    href: mobileStickySource.includes('href="/plan-my-party/"')
      ? "/plan-my-party/"
      : "missing",
  },
  imageResults,
  unknownImages,
  reviewFindings,
  failures,
};

await mkdir(dirname(resultsPath), { recursive: true });
await writeFile(resultsPath, `${JSON.stringify(results, null, 2)}\n`);

if (failures.length) {
  console.error("Homepage visual/image lock failed:");
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

if (reviewFindings.length) {
  console.warn("Homepage visual/image lock review findings:");
  reviewFindings.forEach((finding) => console.warn(` - ${finding}`));
}

console.log("Homepage visual/image lock passed.");
