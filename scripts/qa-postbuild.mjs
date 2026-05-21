import { access, readdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

const distDir = join(process.cwd(), "dist");
const requiredFiles = [
    "_redirects",
    "robots.txt",
    "sitemap-index.xml"
];

const requiredHtmlRoutes = [
    "index.html",
    "services/index.html",
    "face-painting-los-angeles/index.html",
    "balloon-twisting-los-angeles/index.html",
    "glitter-tattoos-los-angeles/index.html",
    "face-gems-face-jewelry-los-angeles/index.html",
    "kids-birthday-party-entertainment-los-angeles/index.html",
    "corporate-event-face-painting-los-angeles/index.html",
    "school-festival-face-painting-los-angeles/index.html",
    "pricing/index.html",
    "gallery/index.html",
    "faq/index.html",
    "contact/index.html",
    "service-areas/index.html",
    "service-areas/los-angeles/index.html",
    "service-areas/burbank/index.html",
    "service-areas/glendale/index.html",
    "service-areas/pasadena/index.html",
    "service-areas/sherman-oaks/index.html",
    "service-areas/studio-city/index.html",
    "service-areas/encino/index.html",
    "privacy-policy/index.html",
    "booking-policy/index.html"
];

async function ensureExists(filePath) {
    await access(filePath, constants.F_OK);
}

async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await walk(fullPath)));
        } else {
            files.push(fullPath);
        }
    }

    return files;
}

async function run() {
    const failures = [];

    for (const file of requiredFiles) {
        try {
            await ensureExists(join(distDir, file));
            console.log(`OK required file: dist/${file}`);
        } catch {
            failures.push(`Missing required file: dist/${file}`);
        }
    }

    for (const routeFile of requiredHtmlRoutes) {
        try {
            await ensureExists(join(distDir, routeFile));
            console.log(`OK route HTML: dist/${routeFile}`);
        } catch {
            failures.push(`Missing route HTML: dist/${routeFile}`);
        }
    }

    const htmlFiles = (await walk(distDir)).filter((file) => file.endsWith(".html"));
    const tbdPages = [];

    for (const file of htmlFiles) {
        const content = await readFile(file, "utf8");
        if (content.includes("TBD_BY_OWNER")) {
            tbdPages.push(file.replace(`${distDir}\\`, "dist/"));
        }
    }

    if (tbdPages.length) {
        console.warn("WARN TBD_BY_OWNER detected in built HTML pages:");
        tbdPages.forEach((file) => console.warn(` - ${file}`));
        console.warn("WARN Review and replace customer-facing placeholders before final production launch.");
    } else {
        console.log("OK No TBD_BY_OWNER strings found in built HTML pages.");
    }

    if (failures.length) {
        console.error("\nQA verification failed:");
        failures.forEach((msg) => console.error(` - ${msg}`));
        process.exit(1);
    }

    console.log("\nPost-build QA verification passed.");
}

run().catch((error) => {
    console.error("QA script crashed:", error);
    process.exit(1);
});
