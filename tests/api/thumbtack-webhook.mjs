#!/usr/bin/env node
// Cross-platform manual API tests for /api/thumbtack-webhook.
// Run against local Cloudflare Pages dev server: npm run pages:dev (default port 8788)
// Usage: node tests/api/thumbtack-webhook.mjs
// Override base URL: BASE_URL=http://localhost:8788 node tests/api/thumbtack-webhook.mjs
//
// NOTE: with no secrets configured locally, the endpoint runs in unverified mode
// and every dispatch channel returns status "skipped" — that is the expected
// MVP/dev result and the test asserts it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE_URL = process.env.BASE_URL || "http://localhost:8788";
const ENDPOINT = `${BASE_URL}/api/thumbtack-webhook`;
const here = dirname(fileURLToPath(import.meta.url));
const payloads = join(here, "..", "..", "docs", "integrations", "thumbtack", "sample-payloads");
const load = (name) => readFileSync(join(payloads, name), "utf8");

let pass = 0;
let fail = 0;

async function run(label, expectedStatus, init) {
    try {
        const res = await fetch(ENDPOINT, init);
        const text = await res.text();
        if (res.status === expectedStatus) {
            console.log(`PASS  [${res.status}] ${label}`);
            pass++;
            return { status: res.status, body: text };
        }
        console.log(`FAIL  [got ${res.status}, want ${expectedStatus}] ${label}`);
        console.log(`      body: ${text}`);
        fail++;
        return { status: res.status, body: text };
    } catch (err) {
        console.log(`FAIL  [network error] ${label}: ${err.message}`);
        fail++;
        return { status: 0, body: "" };
    }
}

const post = (body) => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
});

console.log(`Testing ${ENDPOINT}\n`);

const r1 = await run("new lead POST returns 200 ok", 200, post(load("new-lead.json")));
if (r1.body.includes('"score":"high"')) console.log("      score=high confirmed");
if (r1.body.includes('"dispatch"')) console.log("      dispatch results present");

await run("new message POST returns 200", 200, post(load("new-message.json")));
await run("review POST returns 200", 200, post(load("new-review.json")));
await run("status update POST returns 200", 200, post(load("lead-status-update.json")));

await run("GET health returns 200", 200, { method: "GET" });
await run("PUT returns 405", 405, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: "{}",
});
await run("malformed JSON returns 400", 400, post("not-json"));
await run("wrong content type returns 415", 415, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "hi",
});

console.log(`\nResults: ${pass} passed, ${fail} failed`);
console.log(
    "\nTip: set THUMBTACK_WEBHOOK_SECRET in .dev.vars to exercise the 401 invalid-signature path.",
);
process.exit(fail === 0 ? 0 : 1);
