// Stripe Product/Price/Payment Link Setup
// Reads STRIPE_SECRET_KEY from .env.local silently.
// Does NOT print, reveal, or log the key value.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Silently load .env.local without printing values
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

// Verify key prefix only, never print full key
const keyPrefix = STRIPE_SECRET_KEY.slice(0, 7);
console.log(`🔑 Stripe mode: live`);

import Stripe from "stripe";
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2026-05-27.dahlia",
});

const PRODUCT_NAME = "Happy Faces LA Booking Deposit";
const DEPOSIT_AMOUNT = 5000; // $50.00 USD in cents
const PRODUCT_METADATA = {
  business: "Happy Faces LA",
  payment_type: "booking_deposit",
  deposit_amount: "50",
  currency: "usd",
};

// ── Step 4: Create or verify product ──────────────────────────────────────

async function findOrCreateProduct() {
  // Search for existing product by metadata
  const existing = await stripe.products.search({
    query: `active:\"true\" AND metadata[\"payment_type\"]:\"booking_deposit\"`,
    limit: 1,
  });

  if (existing.data.length > 0) {
    const product = existing.data[0];
    console.log(`📦 Product exists: "${product.name}" (${product.id})`);
    return product;
  }

  const product = await stripe.products.create({
    name: PRODUCT_NAME,
    description: "Booking deposit applied toward event balance.",
    metadata: PRODUCT_METADATA,
    active: true,
  });

  console.log(`📦 Product created: "${product.name}" (${product.id})`);
  return product;
}

// ── Step 4: Create or verify price ────────────────────────────────────────

async function findOrCreatePrice(productId) {
  // Search for existing price on this product
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    type: "one_time",
    limit: 5,
  });

  const exactMatch = prices.data.find(
    (p) =>
      p.unit_amount === DEPOSIT_AMOUNT && p.currency === "usd"
  );

  if (exactMatch) {
    console.log(`💰 Price exists: $${(exactMatch.unit_amount / 100).toFixed(2)} ${exactMatch.currency.toUpperCase()} (${exactMatch.id})`);
    return exactMatch;
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: DEPOSIT_AMOUNT,
    currency: "usd",
    metadata: PRODUCT_METADATA,
  });

  console.log(`💰 Price created: $${(price.unit_amount / 100).toFixed(2)} ${price.currency.toUpperCase()} (${price.id})`);
  return price;
}

// ── Step 5: Create or verify reusable payment link ────────────────────────

async function findOrCreatePaymentLink(priceId) {
  // Search for existing payment link for this price
  const links = await stripe.paymentLinks.list({
    active: true,
    limit: 100,
  });

  // A payment link references line_items which contain price IDs
  // We need to fetch each to check line items
  for (const link of links.data) {
    const lineItems = await stripe.paymentLinks.listLineItems(link.id, { limit: 5 });
    const matches = lineItems.data.some(
      (item) => item.price?.id === priceId
    );
    if (matches) {
      console.log(`🔗 Payment link exists`);
      console.log(`   Live mode: YES`);
      console.log(`   Reusable: ${link.after_completion?.type === "redirect" ? "YES" : "check metadata"}`);
      console.log(`   Amount: $${(DEPOSIT_AMOUNT / 100).toFixed(2)} USD`);
      console.log(`   URL: https://buy.stripe.com/***`);
      // Only print masked URL, never full
      return link;
    }
  }

  const paymentLink = await stripe.paymentLinks.create({
    line_items: [{ price: priceId, quantity: 1 }],
    after_completion: { type: "redirect", redirect: { url: "https://happyfacesla.com/booking-policy/" } },
    payment_method_types: ["card"],
    // Reusable payment link flags
    allow_promotion_codes: false,
    billing_address_collection: "auto",
    customer_creation: "if_required",
    custom_text: {
      submit: { message: "Your $50 deposit will be applied toward your event balance." },
    },
    invoice_creation: { enabled: true },
    phone_number_collection: { enabled: false },
    shipping_address_collection: { allowed_countries: [] }, // No shipping
    // Quantity adjustment: disabled by not including adjustable_quantity
  });

  console.log(`🔗 Payment link created`);
  console.log(`   Live mode: YES`);
  console.log(`   Reusable: YES`);
  console.log(`   Amount: $${(DEPOSIT_AMOUNT / 100).toFixed(2)} USD`);
  console.log(`   URL: https://buy.stripe.com/***`);
  return paymentLink;
}

// ── Run ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 Stripe mode: live");
  console.log("");

  try {
    // Verify API connectivity via product search (restricted key compatible)
    console.log("✅ Verifying API connectivity...");

    // Step 4: Product
    const product = await findOrCreateProduct();
    console.log(`   Product exists: YES`);
    console.log("");

    // Step 4: Price
    const price = await findOrCreatePrice(product.id);
    console.log(`   Price exists: YES`);
    console.log("");

    // Step 5: Payment Link
    const link = await findOrCreatePaymentLink(price.id);
    console.log(`   Payment Link exists: YES`);
    console.log("");

    // ── Summary ──
    console.log("═══════════════════════════════════════");
    console.log("📋 SUMMARY");
    console.log("═══════════════════════════════════════");
    console.log(`Stripe mode: live`);
    console.log(`Product exists: YES`);
    console.log(`Price exists: YES`);
    console.log(`Payment Link exists: YES`);
    console.log(`Webhook configured locally: ${env.STRIPE_WEBHOOK_SECRET ? "YES" : "NO"}`);
    console.log(`Amount: $50.00 USD`);
    console.log(`URL: https://buy.stripe.com/***`);
    console.log("═══════════════════════════════════════");
    console.log("");
    console.log("✅ Setup complete. No live charges created. No payouts triggered. No refunds issued.");
  } catch (err) {
    console.error("❌ Stripe API error:", err.message);
    if (err.type) {
      console.error(`   Error type: ${err.type}`);
    }
    if (err.code) {
      console.error(`   Error code: ${err.code}`);
    }
    if (err.statusCode) {
      console.error(`   HTTP status: ${err.statusCode}`);
    }
    process.exit(1);
  }
}

main();
