# CEO REVIEW SUMMARY
## Phase 1C Commercial Candidate Package — DRAFT v1
**Candidate:** `candidates/phase1c/hfla_commercial_draft_v1/`
**Release shell:** `HFLA-REL-DRAFT-COMMERCIAL-V1`
**Prepared for:** CEO commercial review
**Status:** DRAFT — no content is approved or live
**Research date:** 2025-07-21

---

## 1. Purpose of This Package

This package is the first structured commercial governance submission for
Happy Faces LA.  It contains the complete set of DRAFT pricing, booking,
channel, and AI-response governance rules drawn from the current live website,
booking policy, and a review of applicable Google Ads policies.

The CEO's role in this review is to make the **18 binary or value decisions**
documented in Section 7 of this summary.  Once decisions are recorded, the
candidate can advance to `READY_FOR_CEO_REVIEW` and ultimately to a governed
channel release.

**Nothing in this package changes the live website, runs any Google Ads, or
activates any chatbot or operator workflow.** All records are DRAFT.

---

## 2. Current Website State (Verified 2025-07-21)

The following facts were verified from the live website before authoring this
package.  These are the **baseline from which this candidate is built.**

| Fact | Source |
|------|--------|
| Bookings start at $150 | Homepage + Pricing page |
| $50 deposit holds the date (non-refundable) | Homepage + Booking policy |
| Deposit applied to final balance | Booking policy |
| Balance due day-of before services begin | Booking policy |
| Deposit may transfer once (advance notice required) | Booking policy |
| Service area: LA County, Orange County, Ventura County | Homepage + Booking policy |
| Travel fees may apply by location | Booking policy |
| Overtime: pre-approved, added to final balance | Booking policy |
| Outdoor: client provides shaded/protected setup | Booking policy |
| Parking: client responsibility or client covers fees | Booking policy |
| Four services: face painting, balloon twisting, glitter tattoos, face gems | Homepage |
| Five package options listed on pricing page | Pricing page |
| Quote response: 'expect a response quickly' | Homepage |

---

## 3. What This Candidate Governs

The 19 DRAFT rules in this candidate cover seven governance areas:

| Category | Rules | Topic |
|---|---|---|
| PUBLIC_PRICING | 5 | Minimum price floor, deposit, balance timing, multi-service, add-ons |
| BOOKING_POLICY | 4 | Cancellation, rescheduling, overtime, last-minute bookings |
| QUOTE_TRAVEL | 3 | Travel fee method, parking requirements, quote SLA |
| VENDOR_SCHOOL_CORPORATE | 2 | School/festival minimums, corporate invoice terms |
| SAFETY_CARE | 2 | Outdoor weather conditions, product safety standards |
| AI_CUSTOMER_RESPONSE | 2 | Chatbot pricing authority, chatbot escalation threshold |
| CHANNEL_IMPLEMENTATION | 1 | Google Ads claim accuracy and landing page alignment |

---

## 4. Five Channels Being Prepared

This package prepares governance content for five consumer channels.  No
channel is active.  Each channel has two DRAFT projection records and one
DRAFT activation shell.

| Channel | Type | Purpose |
|---|---|---|
| `WEBSITE_PUBLIC` | Public | Pricing page and booking policy text |
| `GOOGLE_ADS_PUBLIC` | Public | Ad headline and description copy |
| `CUSTOMER_CHATBOT_PUBLIC` | Public | Chatbot pricing response and escalation message |
| `COPILOT_INTERNAL_DECISION_SUPPORT` | Internal | Operator decision support, pricing matrix |
| `QUOTE_OPERATOR_INTERNAL` | Internal | Quote operator rate card and travel fee guide |

The restricted `RESTRICTED_OPERATIONS_PII` channel has no projections or
activations in this candidate.

---

## 5. Evidence Base

Six evidence records underpin the rules in this candidate:

| ID | Type | Source |
|---|---|---|
| HFLA-EVD-001 | WEBSITE | Homepage — starting price, deposit, services |
| HFLA-EVD-002 | WEBSITE | Booking policy page — full terms |
| HFLA-EVD-003 | WEBSITE | Pricing/packages page — five packages |
| HFLA-EVD-004 | OFFICIAL_POLICY | Google Ads misrepresentation policy |
| HFLA-EVD-005 | OFFICIAL_POLICY | Google Ads editorial and destination requirements |
| HFLA-EVD-006 | MARKET_RESEARCH | LA-area face painting market rates (limited — competitor sites returned errors) |

**Note on HFLA-EVD-006:** Direct competitor website access was unavailable during
research (sites returned HTTP errors).  General market knowledge places LA
professional face painters in the $100–$300+ per-hour range.  HFLA's $150
minimum is positioned at the accessible entry of the professional market.
CEO should direct a formal competitor pricing analysis before the Google Ads
campaign launches.

---

## 6. Draft Channel Content (Proposed Wording)

The following is the proposed wording for each channel's draft projections.
All text requires CEO approval before going live.

### Website Public

**Pricing statement** (`HFLA-PROJ-WEB-001`):
> "Bookings start at $150. A $50 deposit reserves your date and is applied
> toward the final balance. Final pricing depends on event location, guest
> count, services requested, and number of artists needed. Submit your
> event details for an accurate quote."

**Booking policy summary** (`HFLA-PROJ-WEB-002`):
> "A $50 deposit is required to reserve your event date. Deposits are
> non-refundable; the deposit may be transferred one time to a new date
> with advance notice, subject to artist availability. The remaining balance
> is due on the event day before services begin. Travel fees may apply
> depending on your event location. Outdoor events require a shaded,
> protected setup area."

### Google Ads

**Primary headline** (`HFLA-PROJ-ADS-001`):
> "Face Painting Los Angeles | Bookings from $150 | Fast Quote Response"

**Description** (`HFLA-PROJ-ADS-002`):
> "Professional face painting, balloon twisting & glitter tattoos for LA
> birthday parties and events. Bookings start at $150. $50 holds your
> date. Submit your event details and get a fast quote."

### Customer Chatbot

**Pricing intro** (`HFLA-PROJ-BOT-001`):
> "Happy Faces LA bookings start at $150 for a single service with one
> dedicated artist. Final pricing depends on your event location, guest
> count, and services selected. To get an accurate quote for your event,
> please submit your details using the contact form or call/text
> 818-619-5506."

**Escalation message** (`HFLA-PROJ-BOT-002`):
> "For a specific price on your event — including school events, corporate
> bookings, multi-artist setups, or any event with special requirements —
> please fill out the quote form at happyfacesla.com/contact/ or call/text
> 818-619-5506. We respond quickly with availability and pricing."

---

## 7. CEO Decision Items (18 Open Blockers)

The following decisions are required to advance this candidate.  Each is
documented as an `OPEN_CEO_INPUT_REQUIRED` blocker with
`blocks_phase_1c_content_loading: false` — these are business decisions, not
structural blockers.

| # | ID | Priority | Decision Required |
|---|---|---|---|
| 1 | HFLA-BLK-001 | HIGH | Confirm $150 as the authorised minimum booking price |
| 2 | HFLA-BLK-002 | HIGH | Hourly rate vs. flat package vs. hybrid pricing model |
| 3 | HFLA-BLK-003 | HIGH | Confirm $50 deposit amount and accepted payment method(s) |
| 4 | HFLA-BLK-004 | HIGH | Travel fee calculation method (flat zone / mileage / by-city / hybrid) |
| 5 | HFLA-BLK-005 | MEDIUM | Specific travel premium amounts for Orange County and Ventura County |
| 6 | HFLA-BLK-006 | MEDIUM | Combined-package starting price (face + balloons) or maintain quote-only |
| 7 | HFLA-BLK-007 | MEDIUM | Add-on starting price (glitter/gems) or maintain quote-only |
| 8 | HFLA-BLK-008 | MEDIUM | School/festival booth minimum booking fee and per-artist rate |
| 9 | HFLA-BLK-009 | MEDIUM | Corporate event invoice terms (net window, deposit, minimum) |
| 10 | HFLA-BLK-010 | MEDIUM | Overtime hourly rate |
| 11 | HFLA-BLK-011 | LOW | Holiday/peak demand surcharge dates and amount |
| 12 | HFLA-BLK-012 | LOW | Last-minute booking surcharge window and amount |
| 13 | HFLA-BLK-013 | HIGH | Cancellation notice window in days |
| 14 | HFLA-BLK-014 | MEDIUM | Reschedule advance notice requirement and one-transfer confirmation |
| 15 | HFLA-BLK-015 | HIGH | Weather cancellation client credit/refund policy |
| 16 | HFLA-BLK-016 | CRITICAL | Google Ads campaign authorisation: budget, targeting, copy, landing page |
| 17 | HFLA-BLK-017 | HIGH | Chatbot authority limit for pricing and approved escalation language |
| 18 | HFLA-BLK-018 | MEDIUM | Quote response SLA: specific window or maintain 'quickly' |

**Priority summary:** 1 CRITICAL, 5 HIGH, 8 MEDIUM, 2 LOW, 2 additional HIGH
decisions needed before any content is published on any channel.

---

## 8. Recommended CEO Decision Sequence

For efficient review, the CEO should resolve decisions in this order:

**First session (core commercial decisions):**
1. BLK-001 — Confirm $150 floor (5 minutes)
2. BLK-003 — Confirm $50 deposit and payment method (10 minutes)
3. BLK-002 — Choose pricing model: flat / hourly / hybrid (15 minutes)
4. BLK-013 — Set cancellation window in days (5 minutes)
5. BLK-015 — Set weather cancellation credit/refund policy (10 minutes)

**Second session (travel, add-ons, corporate):**
6. BLK-004 — Choose travel fee calculation method (15 minutes)
7. BLK-005 — Set OC and Ventura travel premiums (10 minutes)
8. BLK-006 — Combined package starting price decision (10 minutes)
9. BLK-007 — Add-on (glitter/gems) starting price decision (10 minutes)
10. BLK-008 — School/festival minimum (10 minutes)
11. BLK-009 — Corporate invoice terms (15 minutes)
12. BLK-010 — Overtime hourly rate (5 minutes)
13. BLK-014 — Reschedule advance notice requirement (5 minutes)

**Third session (channel launch):**
14. BLK-016 — Google Ads campaign authorisation (30 minutes — requires ad copy, budget, targeting review)
15. BLK-017 — Chatbot authority limit and escalation message (15 minutes)
16. BLK-018 — Quote response SLA commitment (10 minutes)

**Deferred:**
17. BLK-011 — Peak demand surcharge (can be set post-launch)
18. BLK-012 — Last-minute surcharge (can be set post-launch)

---

## 9. Google Ads Governance Requirements (CRITICAL)

Before any Google Ads campaign can launch, the following requirements must be
satisfied per Google's misrepresentation and editorial policies:

1. **Price claims must match the landing page.** The proposed headline
   "Bookings from $150" requires that the landing page destination clearly
   states $150 as the starting price.  This is currently satisfied by the
   live pricing page.

2. **Ad copy must not omit pricing conditions.** The description must
   reference that final price depends on location, guest count, and services.
   The current draft description satisfies this requirement.

3. **The landing page must be functional and directly relevant.** The
   recommended landing page is `happyfacesla.com/pricing/`.

4. **CEO must formally authorise the budget and targeting before any spend.**
   This is captured in `HFLA-BLK-016` as a CRITICAL blocker.

---

## 10. What Happens After CEO Review

Once all 18 blockers are resolved with CEO decisions recorded in
`ceo_input_final_answer`:

1. The candidate advances from `DRAFT` to `READY_FOR_CEO_REVIEW` status.
2. Channel text in `approved_channel_text` is populated for each projection.
3. The release advances to `APPROVED_FOR_IMPLEMENTATION`.
4. Each channel activation advances from `DRAFT` → `READY_FOR_QA` → `ACTIVE`.
5. The Google Ads campaign is launched under the authorised budget.
6. The website pricing page and booking policy are updated with approved text.
7. The chatbot is deployed with approved response templates.

---

## 11. Scope Boundaries — What This Package Does NOT Change

This Phase 1C candidate is governance documentation only.  No changes are
made to:

- The live website (`happyfacesla.com`)
- Any Google Ads account or campaign
- Any chatbot deployment
- Any Google Drive asset or workbook
- Any Python control-room source code
- Any existing governance documents

---

## 12. Validation and Integrity

This candidate package was validated through the intake gate:

```
.\.venv\Scripts\python.exe -m hfla_control_room.cli validate-phase1c-input \
    -c config -i candidates/phase1c/hfla_commercial_draft_v1
```

**Required exit: 0 — PHASE 1C INPUT VALIDATION PASSED**

The SHA-256 hash of `candidate.yaml` is recorded in
`receipts/candidate_sha256.txt` within this package directory.
