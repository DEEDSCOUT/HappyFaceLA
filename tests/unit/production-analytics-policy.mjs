#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  CLARITY_PROJECT_ID,
  GA4_MEASUREMENT_ID,
  PRODUCTION_ANALYTICS_POLICY_VERSION,
  installProductionAnalytics,
  isApprovedProductionAnalyticsHost,
  trackProductionAnalyticsEvent,
} from "../../src/lib/analytics/production-analytics.ts";

function makeWindow(hostname) {
  return { location: { hostname } };
}

function makeDocument() {
  const elements = new Map();
  const appended = [];
  const head = {
    appendChild(element) {
      appended.push(element);
      if (element.id) elements.set(element.id, element);
      return element;
    },
  };
  return {
    appended,
    head,
    documentElement: head,
    createElement(tagName) {
      return { tagName: String(tagName).toUpperCase(), id: "", async: false, src: "" };
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
  };
}

for (const hostname of ["happyfacesla.com", "www.happyfacesla.com", "HAPPYFACESLA.COM"]) {
  assert.equal(isApprovedProductionAnalyticsHost(hostname), true, `${hostname} must be allowed`);
}

for (const hostname of [
  "281bf843.happyfacesla.pages.dev",
  "agent-ap02a-ap03a.happyfacesla.pages.dev",
  "happyfacesla.pages.dev",
  "localhost",
  "127.0.0.1",
  "happyfacesla.com.evil.example",
  "preview.happyfacesla.com",
  "",
]) {
  assert.equal(isApprovedProductionAnalyticsHost(hostname), false, `${hostname} must be suppressed`);
}

for (const hostname of [
  "281bf843.happyfacesla.pages.dev",
  "happyfacesla.pages.dev",
  "localhost",
  "127.0.0.1",
]) {
  const previewWindow = makeWindow(hostname);
  const previewDocument = makeDocument();
  const policy = installProductionAnalytics(previewWindow, previewDocument);

  assert.deepEqual(policy, {
    version: PRODUCTION_ANALYTICS_POLICY_VERSION,
    hostname,
    environment: "non-production",
    allowed: false,
  });
  assert.equal(previewDocument.appended.length, 0, "non-production must load no analytics tags");
  assert.equal(previewWindow.dataLayer, undefined, "non-production must not create a production dataLayer");
  assert.equal(previewWindow.gtag, undefined, "non-production must not install gtag");
  assert.equal(previewWindow.clarity, undefined, "non-production must not install Clarity");
  assert.equal(previewWindow.hflaTrackEvent("generate_lead", { test: true }), false);
  assert.equal(previewWindow.dataLayer, undefined, "blocked events must not create a dataLayer");

  previewWindow.__HFLA_ANALYTICS_POLICY__ = {
    version: PRODUCTION_ANALYTICS_POLICY_VERSION,
    hostname,
    environment: "production",
    allowed: true,
  };
  assert.equal(
    trackProductionAnalyticsEvent("hfla_quote_submit", {}, previewWindow),
    false,
    "the current hostname must be rechecked even if policy state is tampered",
  );
}

const productionWindow = makeWindow("happyfacesla.com");
const productionDocument = makeDocument();
const productionPolicy = installProductionAnalytics(productionWindow, productionDocument);
assert.equal(productionPolicy.allowed, true);
assert.equal(productionPolicy.environment, "production");
assert.equal(productionDocument.appended.length, 2);
assert.deepEqual(
  productionDocument.appended.map(({ id, src }) => ({ id, src })),
  [
    {
      id: "hfla-production-ga4",
      src: `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`,
    },
    {
      id: "hfla-production-clarity",
      src: `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`,
    },
  ],
);
assert.equal(productionWindow.dataLayer.length, 2, "GA4 js/config commands should queue once");
assert.equal(productionWindow.dataLayer[0][0], "js");
assert.equal(productionWindow.dataLayer[1][0], "config");
assert.equal(productionWindow.dataLayer[1][1], GA4_MEASUREMENT_ID);
assert.equal(productionWindow.hflaTrackEvent("generate_lead", { route: "contact" }), true);
assert.equal(productionWindow.dataLayer.length, 3);
assert.equal(productionWindow.dataLayer[2][0], "event");
assert.equal(productionWindow.dataLayer[2][1], "generate_lead");

installProductionAnalytics(productionWindow, productionDocument);
assert.equal(productionDocument.appended.length, 2, "analytics installation must be idempotent");
assert.equal(productionWindow.dataLayer.length, 3, "idempotent install must not repeat GA4 config");

const guardedSources = [
  "src/layouts/BaseLayout.astro",
  "src/components/conversion/QuoteForm.astro",
  "src/components/wizard/WizardShell.astro",
  "src/pages/packages.astro",
  "src/pages/hire-face-painter-los-angeles.astro",
  "src/pages/pricing.astro",
  "src/components/content/PartyLookbook.astro",
  "src/pages/share-your-experience.astro",
];

for (const file of guardedSources) {
  const source = await readFile(new URL(`../../${file}`, import.meta.url), "utf8");
  assert.equal(
    source.includes("window.dataLayer.push"),
    false,
    `${file} must not bypass the production analytics policy`,
  );
  assert.equal(
    source.includes('window.gtag("event"'),
    false,
    `${file} must not call production gtag directly`,
  );
}

const baseLayout = await readFile(
  new URL("../../src/layouts/BaseLayout.astro", import.meta.url),
  "utf8",
);
assert.equal(
  baseLayout.includes('<script async src="https://www.googletagmanager.com/gtag/js'),
  false,
  "GA4 must not be loaded unconditionally in static markup",
);
assert.match(baseLayout, /installProductionAnalytics\(\)/);

console.log("PASS production analytics host policy and non-production suppression");
