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
import { dispatchCard } from "../../src/lib/thumbtack/dispatch.ts";

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
check("pricing 2-service 2h = $325", leadCard.pricing.recommended === 325);
check("pricing display $325+", leadCard.pricing.recommended_display === "$325+");
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
check("slack alert includes follow-up schedule", /Follow-ups:/i.test(leadCard.alert.slack_text));

// --- Real Thumbtack lead-details test payload ---------------------------------
const realLeadRaw = load("real-thumbtack-lead-details.sanitized.json");
const realLead = parseThumbtackEvent(realLeadRaw, NOW);
console.log("\n# real-thumbtack-lead-details — normalized official payload");
console.log(JSON.stringify(realLead, null, 2));

check("real payload lead_id from request.requestID", realLead.lead_id === "582664010966958085");
check("real payload customer from customer.firstName/lastName", realLead.customer_name === "Test Customer");
check("real payload category parsed", realLead.lead_type === "Full Service Lawn Care");
check("real payload leadPrice parsed", realLead.lead_fee === 25);
check("real payload event city parsed", realLead.event_city === "San Francisco");
check("real payload event ZIP parsed", realLead.event_zip === "94103");
check("real payload proposedTimes date parsed", realLead.event_date === "2026-01-06");
check("real payload proposedTimes time parsed", realLead.event_time === "10:00 AM");
check("real payload proposedTimes duration parsed", realLead.event_length === "1 hour");
check(
    "real payload service preserved for manual review",
    realLead.requested_services.join(",") === "Full Service Lawn Care",
);
check("real payload detected as lead.created", realLead.event === "lead.created");

const realLeadCard = buildLeadCard(realLeadRaw, NOW);
check("real payload unmapped service uses custom quote", realLeadCard.pricing.custom_quote === true);
check("real payload follow-up schedule generated", realLeadCard.follow_ups.length === 5);
check("real payload ready-to-copy draft generated", /Hi Test/.test(realLeadCard.reply_draft));
check("real payload alert includes ready-to-copy draft", /Ready-to-copy Thumbtack reply:/i.test(realLeadCard.alert.slack_text));

// --- Pricing ladder ------------------------------------------------------------
function pricingPayload({ services, eventLength, guestCount = 12, eventType = "Birthday party", city = "Burbank" }) {
    return {
        eventType: "LeadCreated",
        createTimestamp: NOW,
        lead: {
            leadID: `price_${services.length}_${eventLength.replace(/\W+/g, "_")}`,
            fulfillmentStatus: "PAID",
            customer: { name: "Pricing Test" },
            request: {
                category: services[0],
                location: { city },
                schedule: { eventDate: "2026-07-12", startTime: "1:00 PM" },
                details: [
                    { question: "What type of event is this?", answer: eventType },
                    { question: "How many guests will need face painting?", answer: `${guestCount} kids` },
                    { question: "Which services are you interested in?", answer: services.join(", ") },
                    { question: "How long is the event?", answer: eventLength },
                ],
            },
        },
    };
}

const pricingCases = [
    ["one service 1h = $150", ["Face painting"], "1 hour", 150, "$150"],
    ["one service 90m = $215", ["Face painting"], "90 minutes", 215, "$215"],
    ["one service 2h = $275", ["Face painting"], "2 hours", 275, "$275"],
    ["two services 1h = $180", ["Face painting", "Balloon twisting"], "1 hour", 180, "$180"],
    ["two services 90m = $255", ["Face painting", "Balloon twisting"], "90 minutes", 255, "$255"],
    ["two services 2h = $325+", ["Face painting", "Balloon twisting"], "2 hours", 325, "$325+"],
];

for (const [label, services, eventLength, expected, display] of pricingCases) {
    const card = buildLeadCard(pricingPayload({ services, eventLength }), NOW);
    check(label, card.pricing.recommended === expected && card.pricing.recommended_display === display);
}

const highVolumeCard = buildLeadCard(
    pricingPayload({
        services: ["Face painting", "Balloon twisting"],
        eventLength: "2 hours",
        guestCount: 40,
    }),
    NOW,
);
check("40+ kids requires custom/manual review", highVolumeCard.pricing.custom_quote === true);

const corporateCard = buildLeadCard(
    pricingPayload({
        services: ["Face painting"],
        eventLength: "90 minutes",
        eventType: "Corporate family event",
    }),
    NOW,
);
check("corporate events require custom/manual review", corporateCard.pricing.custom_quote === true);

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
check("status: reply includes capacity caveat", /coverage depends/i.test(statusCard.reply_draft));

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

// --- No customer-facing auto-send (requirement #12) ----------------------------
// Dispatch must only ever reach INTERNAL/owner channels, never Thumbtack or the
// customer. With no env configured, nothing goes out at all.
console.log("\n# no-auto-send guarantee");
const dispatchResults = await dispatchCard({}, leadCard);
const channelSet = dispatchResults.map((r) => r.channel).sort().join(",");
check("dispatch targets exactly 4 internal channels", dispatchResults.length === 4);
check(
    "channels are crm,sheet,slack,sms (no 'thumbtack'/'customer' channel)",
    channelSet === "crm,sheet,slack,sms",
);
check(
    "with no config every channel is skipped — zero outbound",
    dispatchResults.every((r) => r.status === "skipped"),
);
check(
    "reply is a draft only (lives on the card, never a dispatch channel)",
    typeof leadCard.reply_draft === "string" && leadCard.reply_draft.length > 0,
);

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
