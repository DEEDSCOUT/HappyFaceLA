#!/usr/bin/env node
// Cross-platform manual API tests for /api/lead.
// Run against local Cloudflare Pages dev server: npm run pages:dev (default port 8788)
// Usage: node tests/api/lead.mjs
// Override base URL: BASE_URL=http://localhost:8788 node tests/api/lead.mjs

const BASE_URL = process.env.BASE_URL || "http://localhost:8788";
const ENDPOINT = `${BASE_URL}/api/lead`;

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

const json = (obj) => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj)
});

const validLead = {
    first_name: "Test",
    last_name: "User",
    phone: "818-555-0100",
    email: "test@example.com",
    event_date: "2026-08-15",
    event_start_time: "2:00 PM",
    event_city: "Los Angeles",
    event_type: "Birthday Party",
    services_requested: ["Face Painting"],
    consent_to_contact: true
};

const honeypotLead = { ...validLead, first_name: "Bot", honeypot: "filled" };

console.log(`Testing ${ENDPOINT}\n`);

const r1 = await run("valid lead POST returns 200 with ok+leadId", 200, json(validLead));
if (r1.body.includes('"ok":true')) console.log("      ok=true confirmed");
else console.log(`      WARN response missing ok:true -> ${r1.body}`);

await run("missing required fields returns 400", 400, json({ first_name: "" }));
await run("honeypot filled silently returns 200 (bot trap)", 200, json(honeypotLead));
await run("GET returns 405", 405, { method: "GET" });
await run("PUT returns 405", 405, { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" });
await run("malformed JSON returns 400", 400, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-valid-json"
});
await run("wrong content type returns 415", 415, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "first_name=Test"
});

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
