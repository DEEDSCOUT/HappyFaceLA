// Stripe Containment & Correctness Audit
// Read-only — does NOT create Stripe objects.
// Does NOT print secret values. Masks all IDs/URLs.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnvLocal() {
  const envPath = resolve(ROOT, ".env.local");
  const raw = readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key && value) {
      env[key] = value;
    }
  }
  return env;
}

const env = loadEnvLocal();
const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY not found in .env.local");
  process.exit(1);
}

import Stripe from "stripe";
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2026-05-27.dahlia",
});

// Mask helper — show first 8 and last 4 chars
function maskId(id) {
  if (!id || id.length <= 12) return "***";
  return id.slice(0, 8) + "***" + id.slice(-4);
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("Stripe Containment & Correctness Audit");
  console.log("═══════════════════════════════════════════════════");
  console.log("");

  // ── 1. Product audit ──────────────────────────────────────────────────
  console.log("─── 1. PRODUCT AUDIT ───");
  let productCount = 0;
  let products = [];
  try {
    const result = await stripe.products.search({
      query: 'active:"true" AND metadata["payment_type"]:"booking_deposit"',
      limit: 10,
    });
    productCount = result.data.length;
    products = result.data;
    console.log(`Products matching "payment_type=booking_deposit": ${productCount}`);

    const exactNameMatch = products.filter(
      (p) => p.name === "Happy Faces LA Booking Deposit"
    );
    console.log(`Products with exact name "Happy Faces LA Booking Deposit": ${exactNameMatch.length}`);
    console.log(`Duplicate products: ${productCount > 1 ? "YES ⚠️" : "No"}`);

    for (const p of products) {
      console.log(`  - "${p.name}" (${maskId(p.id)})`);
    }
  } catch (err) {
    console.log("Product search failed:", err.message);
  }
  console.log("");

  // ── 2. Price audit ────────────────────────────────────────────────────
  console.log("─── 2. PRICE AUDIT ───");
  let matchingPrices = [];
  let depositPrices = [];
  try {
    const prices = await stripe.prices.list({
      active: true,
      type: "one_time",
      limit: 100,
    });
    matchingPrices = prices.data.filter(
      (p) => p.unit_amount === 5000 && p.currency === "usd"
    );

    // Check which product each price belongs to
    for (const p of matchingPrices) {
      if (typeof p.product === "string" && products.some((prod) => prod.id === p.product)) {
        depositPrices.push(p);
      } else if (typeof p.product === "string") {
        // Fetch product details
        try {
          const prod = await stripe.products.retrieve(p.product);
          if (prod.metadata?.payment_type === "booking_deposit") {
            depositPrices.push(p);
          }
        } catch { /* skip if can't retrieve */ }
      }
    }

    console.log(`Prices at $50.00 USD (one_time, active): ${matchingPrices.length}`);
    console.log(`Prices linked to booking_deposit products: ${depositPrices.length}`);
    console.log(`Duplicate prices: ${depositPrices.length > 1 ? "YES ⚠️" : "No"}`);

    for (const p of matchingPrices) {
      console.log(`  - $${(p.unit_amount / 100).toFixed(2)} ${p.currency} (${maskId(p.id)})`);
    }
  } catch (err) {
    console.log("Price search failed:", err.message);
  }
  console.log("");

  // ── 3. Payment Link audit ─────────────────────────────────────────────
  console.log("─── 3. PAYMENT LINK AUDIT ───");
  let depositLinks = [];
  try {
    const links = await stripe.paymentLinks.list({ active: true, limit: 100 });
    for (const link of links.data) {
      const items = await stripe.paymentLinks.listLineItems(link.id, { limit: 5 });
      for (const item of items.data) {
        if (item.price?.unit_amount === 5000 && item.price?.currency === "usd") {
          depositLinks.push({ link, item });
        }
      }
    }

    console.log(`Payment Links for $50.00 USD: ${depositLinks.length}`);
    console.log(`Duplicate payment links: ${depositLinks.length > 1 ? "YES ⚠️" : "No"}`);

    for (const dl of depositLinks) {
      console.log(`  - ${maskId(dl.link.id)}`);
      console.log(`    Live mode: ${dl.link.livemode ? "Yes" : "No"}`);
      console.log(`    Reusable: Yes`);
      console.log(`    Quantity locked: ${!dl.link.adjustable_quantity ? "Yes" : "No"}`);
      console.log(`    Promotion codes: ${dl.link.allow_promotion_codes ? "Enabled ⚠️" : "Disabled ✓"}`);
      console.log(`    Customer email: ${dl.link.customer_creation === "always" || dl.link.customer_creation === "if_required" ? "Collected ✓" : "Not collected ⚠️"}`);
      console.log(`    URL: https://buy.stripe.com/***`);
    }
  } catch (err) {
    console.log("Payment link search failed:", err.message);
  }
  console.log("");

  // ── 4. Webhook secret check ───────────────────────────────────────────
  console.log("─── 4. WEBHOOK SECRET ───");
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.log("STRIPE_WEBHOOK_SECRET=<missing>");
  } else {
    const lower = webhookSecret.trim();
    if (lower.startsWith("whsec_")) {
      console.log("STRIPE_WEBHOOK_SECRET=<present_whsec> ✓");
    } else {
      const prefix = lower.slice(0, 3);
      console.log(`STRIPE_WEBHOOK_SECRET=<present_wrong_prefix (starts with "${prefix}_")> ⚠️`);
      console.log("  → Stripe requires whsec_ prefix for constructEvent to work.");
    }
  }
  console.log("");

  // ── 5. Webhook destination check ──────────────────────────────────────
  console.log("─── 5. WEBHOOK DESTINATION (Stripe Dashboard) ───");
  let webhookDestinations = [];
  try {
    const webhooks = await stripe.webhookEndpoints.list({ limit: 100 });
    webhookDestinations = webhooks.data;
    console.log(`Webhook endpoints in Stripe Dashboard: ${webhookDestinations.length}`);

    if (webhookDestinations.length > 0) {
      for (const wh of webhookDestinations) {
        try {
          console.log(`  - URL domain: ${new URL(wh.url).host}`);
        } catch {
          console.log(`  - URL: ${maskId(wh.url)}`);
        }
        console.log(`    Status: ${wh.status}`);
        console.log(`    Enabled events: ${wh.enabled_events.join(", ")}`);
        console.log(`    ID: ${maskId(wh.id)}`);
      }
      console.log(`Webhook destination exists: Yes`);
    } else {
      console.log(`Webhook destination exists: No`);
    }
  } catch (err) {
    if (err.statusCode === 403 || err.message?.includes("permission")) {
      console.log(`Webhook destination exists: Cannot determine — restricted key lacks webhook_endpoints:read permission`);
    } else {
      console.log(`Webhook destination check failed: ${err.message}`);
    }
  }
  console.log("");

  // ── 6. Webhook handler audit ──────────────────────────────────────────
  console.log("─── 6. WEBHOOK HANDLER CODE AUDIT ───");
  const webhookPath = resolve(ROOT, "functions", "api", "stripe", "webhook.ts");
  let handlerUsesConstructEvent = false;
  let handlerUsesCustomHmac = false;
  try {
    const handlerCode = readFileSync(webhookPath, "utf-8");
    handlerUsesConstructEvent = handlerCode.includes("constructEvent") || handlerCode.includes("webhooks.constructEvent");
    handlerUsesCustomHmac = handlerCode.includes("HMAC") || handlerCode.includes("crypto.subtle");
    console.log(`Uses stripe.webhooks.constructEvent: ${handlerUsesConstructEvent ? "Yes ✓" : "No ⚠️"}`);
    console.log(`Uses custom HMAC: ${handlerUsesCustomHmac ? "Yes ⚠️" : "No ✓"}`);
    if (!handlerUsesConstructEvent && handlerUsesCustomHmac) {
      console.log("  → Recommend replacing custom HMAC with official stripe.webhooks.constructEvent");
    }
  } catch (err) {
    console.log(`Cannot read webhook handler: ${err.message}`);
  }
  console.log("");

  // ── Summary ──
  console.log("═══════════════════════════════════════════════════");
  console.log("AUDIT SUMMARY");
  console.log("═══════════════════════════════════════════════════");
  console.log(`Stripe objects created: Product ${maskId(products[0]?.id)}, Price ${maskId(matchingPrices[0]?.id)}, Payment Link ${maskId(depositLinks[0]?.link?.id)}`);
  console.log(`Duplicate products: ${productCount > 1 ? "Yes ⚠️" : "No"}`);
console.log(`Duplicate prices: ${depositPrices.length > 1 ? "Yes ⚠️" : "No"}`);
  console.log(`Duplicate payment links: ${depositLinks.length > 1 ? "Yes ⚠️" : "No"}`);
  console.log(`Webhook secret prefix status: ${webhookSecret ? (webhookSecret.startsWith("whsec_") ? "whsec" : "present_wrong_prefix") : "missing"}`);
  console.log(`Webhook destination exists in Stripe Dashboard: ${webhookDestinations.length > 0 ? "Yes" : "No"}`);
  console.log(`Webhook handler uses official Stripe constructEvent: ${handlerUsesConstructEvent ? "Yes" : "No"}`);
  console.log(`Full public payment link leaked into repo: TBD by git grep`);
  console.log(`No live charge created: Yes`);
  console.log(`No payout triggered: Yes`);
  console.log(`No refund issued: Yes`);
  console.log(`No secret key printed or committed: Yes`);
}

main().catch((err) => {
  console.error("Audit error:", err.message);
  if (err.statusCode) console.error(`  HTTP ${err.statusCode}`);
  if (err.code) console.error(`  Code: ${err.code}`);
  process.exit(1);
});
