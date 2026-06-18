#!/usr/bin/env node
// Pure-logic unit tests for the Thumbtack Command Center engine.
// No server, no network — imports the TypeScript engine directly (Node >= 23
// strips types natively). Run: node tests/thumbtack/logic.test.mjs
//
// These tests also produce the "field mapping" + "sample lead card" proof used
// in docs/integrations/thumbtack/IMPLEMENTATION_REPORT.md.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildLeadCard, parseThumbtackEvent } from "../../src/lib/thumbtack/engine.ts";

const here = dirname(fileURLToPath(import.meta.url));
const payloads = join(here, "..", "..", "docs", "integrations", "thumbtack", "sample-payloads");
const NOW = "2026-06-17T18:42:00.000Z";

let pass = 0;
let fail = 0;
function check(label, cond) {
    if (cond) {
        pass++;
        console.log(`PASS  ${label}`);
    } else {
        fail++;
        console.log(`FAIL  ${label}`);
    }
}
const load = (name) => JSON.parse(readFileSync(join(payloads, name), "utf8"));

// --- New lead: paid birthday with full details ---------------------------------
const leadRaw = load("new-lead.json");
const lead = parseThumbtackEvent(leadRaw, NOW);
console.log("\n# new-lead — normalized 16 fields");
console.log(JSON.stringify(lead, null, 2));

check("lead_id parsed", lead.lead_id === "lead_9f2c8a");
check("customer_name parsed", lead.customer_name === "Jessica M.");
check("lead_type = category", lead.lead_type === "Face Painting");
check("paid_status = paid", lead.paid_status === "paid");
check("lead_fee = 18.5", lead.lead_fee === 18.5);
check("event_city = Burbank", lead.event_city === "Burbank");
check("event_zip = 91505", lead.event_zip === "91505");
check("event_date ISO", lead.event_date === "2026-07-12");
check("event_time not the webhook timestamp", lead.event_time === "1:00 PM");
check("event_length from Q/A", /2/.test(lead.event_length));
check("event_type = Birthday party (not 'LeadCreated')", /birthday/i.test(lead.event_type));
check("requested_services = 2", lead.requested_services.length === 2);
check("guest_count = 20", lead.guest_count === 20);
check("age_range from Q/A", lead.age_range === "4-8 years");
check("pros_contacted = 3", lead.pros_contacted === 3);
check("reply_deadline parsed", lead.reply_deadline === "2026-06-17T20:42:00Z");
check("event detected as lead.created", lead.event === "lead.created");

const leadCard = buildLeadCard(leadRaw, NOW);
console.log("\n# new-lead — full lead card");
console.log(JSON.stringify(leadCard, null, 2));

check("score = high", leadCard.score.score === "high");
check("pricing 2-service standard = $255", leadCard.pricing.recommended === 255);
check("pricing display $255", leadCard.pricing.recommended_display === "$255");
check("retainer is a number", typeof leadCard.pricing.retainer === "number");
check("reply names the customer", leadCard.reply_draft.includes("Jessica"));
check("reply offers a next step", /reply yes/i.test(leadCard.reply_draft));
check("reply has no auto-send (draft only)", !/\bsent\b/i.test(leadCard.reply_draft));
check("5 follow-ups", leadCard.follow_ups.length === 5);
check(
    "follow-up offsets correct",
    leadCard.follow_ups.map((f) => f.offset).join(",") === "15m,12h,24h,48h,5–7d",
);
check("metrics has all columns", "booked_revenue" in leadCard.metrics && "lost_reason" in leadCard.metrics);
check("slack alert mentions recommend", /Recommend/i.test(leadCard.alert.slack_text));

// --- Far-travel, 3-service, weak details => caution + custom quote -------------
const statusCard = buildLeadCard(load("lead-status-update.json"), NOW);
console.log("\n# lead-status-update — card summary:", statusCard.summary);
check("status: caution score", statusCard.score.score === "caution");
check("status: custom quote (3 services)", statusCard.pricing.custom_quote === true);
check("status: travel surcharge flagged", statusCard.pricing.travel_adjustment > 0);
check(
    "status: far-travel caution present",
    statusCard.score.cautions.some((c) => /service area/i.test(c)),
);
check("status: capacity review", statusCard.pricing.capacity_review === true);
check("status: reply mentions extra artist", /extra artist/i.test(statusCard.reply_draft));

// --- Customer message ----------------------------------------------------------
const msgCard = buildLeadCard(load("new-message.json"), NOW);
check("message event detected", msgCard.lead.event === "message.created");
check("message_text captured", /glitter tattoos/i.test(msgCard.lead.message_text));
check("message alert is message-shaped", /new thumbtack message/i.test(msgCard.alert.slack_text));

// --- Review --------------------------------------------------------------------
const reviewCard = buildLeadCard(load("new-review.json"), NOW);
check("review event detected", reviewCard.lead.event === "review.created");
check("review rating = 5", reviewCard.lead.review_rating === 5);
check("review alert shows stars", /5★/.test(reviewCard.alert.slack_text));

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
