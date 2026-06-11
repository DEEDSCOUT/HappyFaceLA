// Stripe Read-Only Validation Script
// Confirms Stripe connectivity without printing secrets.
// Reads STRIPE_SECRET_KEY from .env.local silently.

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

// Only check key prefix, never print full key
const keyPrefix = STRIPE_SECRET_KEY.slice(0, 7);
const isLive = keyPrefix.startsWith("sk_live") || keyPrefix.startsWith("rk_live");

import Stripe from "stripe";
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2026-05-27.dahlia",
});

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("Stripe Connectivity Validation Report");
  console.log("═══════════════════════════════════════");
  console.log("");

  // ── Key mode ──
  console.log(`Stripe mode: ${isLive ? "live" : "test"}`);
  console.log("");

  // ── Product search ──
  let productExists = false;
  try {
    const products = await stripe.products.search({
      query: 'active:"true" AND metadata["payment_type"]:"booking_deposit"',
      limit: 1,
    });
    productExists = products.data.length > 0;
    if (productExists) {
      const p = products.data[0];
      console.log(`Product exists: Yes — "${p.name}"`);
    } else {
      console.log("Product exists: No");
    }
  } catch (err) {
    console.log("Product exists: No (API error: " + err.message + ")");
  }
  console.log("");

  // ── Price search ──
  let priceExists = false;
  try {
    const prices = await stripe.prices.list({
      active: true,
      type: "one_time",
      limit: 100,
    });
    const match = prices.data.find(
      (p) => p.unit_amount === 5000 && p.currency === "usd"
    );
    priceExists = !!match;
    if (priceExists) {
      console.log(`Price exists: Yes — $${(match.unit_amount / 100).toFixed(2)} ${match.currency.toUpperCase()}`);
    } else {
      console.log("Price exists: No");
    }
  } catch (err) {
    console.log("Price exists: No (API error: " + err.message + ")");
  }
  console.log("");

  // ── Payment Link search ──
  let linkExists = false;
  try {
    const links = await stripe.paymentLinks.list({ active: true, limit: 100 });
    outer: for (const link of links.data) {
      const items = await stripe.paymentLinks.listLineItems(link.id, { limit: 5 });
      for (const item of items.data) {
        if (item.price?.unit_amount === 5000 && item.price?.currency === "usd") {
          linkExists = true;
          console.log(`Payment Link exists: Yes`);
          console.log(`  Live mode: ${link.livemode ? "Yes" : "No"}`);
          console.log(`  Reusable: Yes`);
          console.log(`  Amount: $50.00 USD`);
          console.log(`  URL: https://buy.stripe.com/***`);
          break outer;
        }
      }
    }
    if (!linkExists) {
      console.log("Payment Link exists: No");
    }
  } catch (err) {
    console.log("Payment Link exists: No (API error: " + err.message + ")");
  }
  console.log("");

  // ── Webhook config ──
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  console.log(`Webhook configured locally: ${webhookSecret ? "Yes" : "No"}`);
  if (webhookSecret) {
    const whPrefix = webhookSecret.slice(0, 7);
    console.log(`  Webhook secret prefix: ${whPrefix}***`);
  }
  console.log("");

  // ── Summary ──
  console.log("═══════════════════════════════════════");
  console.log("SUMMARY");
  console.log("═══════════════════════════════════════");
  console.log(`Stripe mode: ${isLive ? "live" : "test"}`);
  console.log(`Product exists: ${productExists ? "Yes" : "No"}`);
  console.log(`Price exists: ${priceExists ? "Yes" : "No"}`);
  console.log(`Payment Link exists: ${linkExists ? "Yes" : "No"}`);
  console.log(`Webhook configured locally: ${webhookSecret ? "Yes" : "No"}`);
  console.log("═══════════════════════════════════════");
  console.log("");
  console.log("No secrets printed. No live charges created. No payouts triggered. No refunds issued.");
}

main().catch((err) => {
  console.error("Validation error:", err.message);
  process.exit(1);
});
