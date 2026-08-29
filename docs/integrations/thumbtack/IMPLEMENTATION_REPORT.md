# Thumbtack Command Center — Implementation Report

Converts every Thumbtack webhook (new lead, customer message, review, status
update) into an internal action card: normalized fields → lead score → pricing
recommendation → ready-to-copy reply draft → Slack/SMS alert → Booking Control
Center row → follow-up schedule → metrics.

**Status:** code + tests complete and green. Live activation requires the owner
to (a) register the webhook URL in the Thumbtack Pro dashboard and (b) set the
secrets in `SETUP_GUIDE.md`. The system **never auto-sends** a customer quote —
drafts only (requirement #12).

| Piece | Where |
| --- | --- |
| Production receiver (Cloudflare Worker) | [`functions/api/thumbtack-webhook.ts`](../../../functions/api/thumbtack-webhook.ts) |
| Pure engine (parse/score/price/reply/follow-ups) | [`src/lib/thumbtack/engine.ts`](../../../src/lib/thumbtack/engine.ts) |
| Dispatch (Slack/SMS/Sheet/CRM) | [`src/lib/thumbtack/dispatch.ts`](../../../src/lib/thumbtack/dispatch.ts) |
| Google Sheet writer | [`google-apps-script.gs`](./google-apps-script.gs) |
| Unit test (40 assertions) | [`tests/thumbtack/logic.test.mjs`](../../../tests/thumbtack/logic.test.mjs) |
| HTTP test | [`tests/api/thumbtack-webhook.mjs`](../../../tests/api/thumbtack-webhook.mjs) |
| Sample payloads | [`sample-payloads/`](./sample-payloads/) |

---

## 1. Webhook test payload

[`sample-payloads/new-lead.json`](./sample-payloads/new-lead.json) — a paid
birthday lead in Burbank, 2 services, 20 kids, 2 hours. Three more fixtures
cover messages, reviews, and a far-travel status update.

```json
{
  "eventType": "LeadCreated",
  "createTimestamp": "2026-06-17T18:42:00Z",
  "lead": {
    "leadID": "lead_9f2c8a",
    "fulfillmentStatus": "PAID",
    "leadCharge": { "amount": 18.5, "currency": "USD" },
    "numProsContacted": 3,
    "expectedResponseBy": "2026-06-17T20:42:00Z",
    "customer": { "name": "Jessica M." },
    "request": {
      "category": "Face Painting",
      "location": { "city": "Burbank", "zipCode": "91505" },
      "schedule": { "eventDate": "2026-07-12", "startTime": "1:00 PM" },
      "details": [
        { "question": "What type of event is this?", "answer": "Birthday party" },
        { "question": "How many guests will need face painting?", "answer": "20 kids" },
        { "question": "Age range of the children?", "answer": "4-8 years" },
        { "question": "Which services are you interested in?", "answer": "Face painting, Balloon twisting" },
        { "question": "How long is the event?", "answer": "2 hours" }
      ]
    }
  }
}
```

---

## 2. Field mapping (requirement #4)

The parser is tolerant: for each normalized field it tries an **exact** key
match first (so `startTime` wins over the substring of `createTimestamp`), then
a substring match, then the question/answer "details" array.

| Normalized field | Source in payload | Parsed value |
| --- | --- | --- |
| `lead_id` | `lead.leadID` | `lead_9f2c8a` |
| `customer_name` | `lead.customer.name` | `Jessica M.` |
| `lead_type` | `request.category` | `Face Painting` |
| `paid_status` | `fulfillmentStatus` / fee > 0 | `paid` |
| `lead_fee` | `leadCharge.amount` | `18.5` |
| `event_city` | `request.location.city` | `Burbank` |
| `event_zip` | `request.location.zipCode` | `91505` |
| `event_date` | `schedule.eventDate` → ISO | `2026-07-12` |
| `event_time` | `schedule.startTime` | `1:00 PM` |
| `event_length` | Q/A "how long" | `2 hours` |
| `event_type` | Q/A "type of event" | `Birthday party` |
| `requested_services` | Q/A "which services" → split | `["Face painting","Balloon twisting"]` |
| `guest_count` | Q/A "how many guests" → int | `20` |
| `age_range` | Q/A "age range" | `4-8 years` |
| `pros_contacted` | `numProsContacted` | `3` |
| `reply_deadline` | `expectedResponseBy` | `2026-06-17T20:42:00Z` |
| `message_text` | `message.messageText` / `review.reviewText` | `""` (lead event) |

> Verified by `tests/thumbtack/logic.test.mjs` — every row above is asserted.
> Note the two guard cases the tests lock in: `event_type` resolves to
> *"Birthday party"* (not the envelope's `"LeadCreated"`) and `event_time`
> resolves to *"1:00 PM"* (not `createTimestamp`).

---

## 3. Sample lead card (requirements #6–#11)

`buildLeadCard(new-lead.json)` produces:

```jsonc
{
  "lead":   { /* the 16 fields above */ },
  "score":  { "score": "high", "priority": 100,
              "reasons": ["Direct paid lead — high priority.",
                          "Birthday / private party — high-fit event.",
                          "Clear date, time, service, and guest details."],
              "cautions": [] },
  "pricing": { "service_count": 2, "tier": "standard",
               "recommended": 255, "recommended_display": "$255",
               "ladder": { "basic": 180, "standard": 255, "premium": 325 },
               "retainer": 130, "travel_adjustment": 0,
               "capacity_review": false, "custom_quote": false },
  "follow_ups": [
    { "offset": "15m",  "due_at": "2026-06-17T18:57:00.000Z", "action": "Send the approved reply draft." },
    { "offset": "12h",  "due_at": "2026-06-18T06:42:00.000Z", "action": "Friendly check-in if no reply." },
    { "offset": "24h",  "due_at": "2026-06-18T18:42:00.000Z", "action": "Re-offer to hold the date." },
    { "offset": "48h",  "due_at": "2026-06-19T18:42:00.000Z", "action": "Share a photo / review + value." },
    { "offset": "5–7d", "due_at": "2026-06-23T18:42:00.000Z", "action": "Last touch; mark lost reason." }
  ],
  "metrics": { "lead_fee": 18.5, "quote_amount": 255, "estimate_sent": false,
               "customer_replied": false, "retainer_requested": false,
               "booked": false, "booked_revenue": null, "lost_reason": "" }
}
```

**Pricing ladder used (requirement #7):** 1 service `$150 / $215 / $275`,
2 services `$180 / $255 / $325+`, 3+ services → custom quote. Tier is chosen by
guest count + event length; a flat `$35` travel surcharge is added outside the
core service area; guest count > 25 flags a capacity review (add a 2nd artist).

**Reply draft (requirement #8 — DRAFT ONLY):**

```
Hi Jessica! Thanks for reaching out to Happy Faces LA. 🎨

For Birthday party on 2026-07-12, I'd recommend our Face Painting + Balloons
Package at $255.

Want me to hold your date and send a simple booking link? Just reply YES.
```

---

## 4. Google Sheet row proof (requirement #5)

The Apps Script appends this row to the `Leads` tab (one row per lead):

| received_at | event | lead_id | score | priority | customer_name | lead_type | event_type | event_city | event_date | event_time | requested_services | guest_count | paid_status | lead_fee | recommended_quote | retainer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-17T18:42:00Z | lead.created | lead_9f2c8a | high | 100 | Jessica M. | Face Painting | Birthday party | Burbank | 2026-07-12 | 1:00 PM | Face painting, Balloon twisting | 20 | paid | 18.5 | $255 | 130 |

…followed by the empty metrics columns (`response_time_min`, `estimate_sent`,
`customer_replied`, `retainer_requested`, `booked`, `booked_revenue`,
`lost_reason`) that the owner fills in as the deal progresses (requirement #11).

---

## 5. Slack / SMS proof (requirement #9)

Captured verbatim from the test run.

**Slack:**

```
🟢 *HIGH lead* — Jessica M. (lead_9f2c8a) • fee $18.5
Birthday party • Burbank • 2026-07-12 1:00 PM
Services: Face painting, Balloon twisting • Guests: 20
💰 Recommend: *$255* • retainer $130
— Copy/paste reply —
Hi Jessica! Thanks for reaching out to Happy Faces LA. 🎨

For Birthday party on 2026-07-12, I'd recommend our Face Painting + Balloons Package at $255.

Want me to hold your date and send a simple booking link? Just reply YES.
```

**SMS:**

```
🟢 HIGH TT lead: Jessica M., Birthday party 2026-07-12. Quote $255, retainer $130. Reply deadline 2026-06-17T20:42:00Z.
```

The alert carries every requirement-#9 element: lead summary, score, recommended
quote, retainer, and the copy/paste reply. (A Thumbtack deep-link is included
when the payload provides one.)

---

## 6. Failure handling

- **Bad signature** → `401`, request dropped, warning logged (no body echoed).
- **Wrong method** → `405`; **wrong content-type** → `415`; **bad JSON** → `400`.
- **Unparseable payload** → `422` (lead-card build wrapped in try/catch).
- **Rate limiting** → 60 req/min per IP → `429`.
- **Channel failure isolation** → Slack/SMS/Sheet/CRM run under
  `Promise.allSettled`; one failing channel never blocks the others, and each
  result is reported as `sent` / `skipped` / `error` in the response `dispatch`
  array. Unconfigured channels are `skipped`, so rollout is incremental.
- **Tolerant parsing** → unknown/renamed Thumbtack keys degrade to empty fields
  and lower scores rather than throwing; the lead still lands in the sheet.

---

## 7. Security notes

- **HMAC verification** of inbound webhooks via `THUMBTACK_WEBHOOK_SECRET`
  (SHA-256 over the raw body, constant-time compare). Unverified mode is only
  for the Zapier MVP and is always surfaced as `"verified": false`.
- **Signed outbound** to the Sheet/CRM (`x-hfla-signature` / `x-signature-sha256`).
  The Apps Script re-verifies the HMAC before writing.
- **No secrets in logs** — only host names, status codes, and summaries are
  logged; reply bodies and PII are never dumped.
- **Secrets via env bindings only** (Cloudflare Pages env / `.dev.vars`), never
  committed. See the repo's existing secret-rotation note for `.stripe.txt`.
- **No customer-facing automation** — the endpoint cannot send a quote to a
  customer; it only writes internal records and Shawn-facing alerts (#12).

---

## 8. Run it

```bash
node tests/thumbtack/logic.test.mjs        # 40/40 pure-logic assertions, no network
npm run pages:dev                          # then, in another shell:
node tests/api/thumbtack-webhook.mjs       # HTTP contract test
```
