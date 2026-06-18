# Thumbtack Command Center Activation Report

**Activation date:** 2026-06-18, 12:16-12:21 PM PT
**Endpoint:** `https://happyfacesla.com/api/thumbtack-webhook`
**Auth method:** Custom Header
**Header name:** `X-HFL-Webhook-Token`
**Deployed code:** Cloudflare production receiver/parser commit `0db2bb9785e4`; Apps Script source commit `075d0f6e` deployed as Web App Version 11.

## Status

- **Recommendation:** stay enabled with monitoring.
- Production webhook is enabled in Thumbtack for Happy Faces LA.
- Production Cloudflare secrets are set; values remain redacted.
- Google Sheet writes work on `01_LEADS`.
- Slack alerts land in `#thumbtack-leads`.
- Ready-to-copy replies are generated internally only.
- No customer-facing auto-send path exists.

## Production Fix Addendum - 2026-06-18, 2:47-2:51 PM PT

Fix scope:

- Patched Apps Script so webhook writes start at column B. Column A is never included in append formatting, row scans, header insertion, upsert writes, or lead-ID lookup.
- Removed `Lead ID` from the Apps Script write map. The Thumbtack external lead ID is stored in `Notes` as `Thumbtack external lead ID: ...`.
- Added sheet date-value conversion for `Created Date`, `Next Follow-Up Date`, and `Last Contact Date` so the existing column-A formula can continue generating clean internal IDs.
- Reconciled real Happy Faces LA Thumbtack payload parsing for customer name, event date/time/length, city/ZIP, service/add-ons, guest count, event type, lead fee, and message text.

Column A proof:

- Apps Script Web App updated in place to Version 11; existing `/exec` deployment URL was preserved.
- `01_LEADS!A1` still contains the owner-controlled array formula.
- Production proof row 47 has formula-generated `A47 = LEAD-REAL-20260618-046`.
- Row 47 column A has no `userEnteredValue`; the webhook wrote values beginning at column B.
- Row 47 `Notes` contains the external proof ID `prod-v11-sagar-20260618215121`.

Production proof after fix:

- Missing token: HTTP `401`.
- Bad token: HTTP `401`.
- Correct custom header token with sanitized Sagar-style payload: HTTP `200`, `verified: true`, `auth_method: token`.
- Dispatch: Slack `sent`, Sheet `sent row 47`, SMS `skipped` because Twilio is not configured, CRM `skipped` because no CRM webhook is configured.
- Sheet row 47 key fields: `Thumbtack`, `Sagar V11 Proof`, `Fullerton`, `2026-07-25`, `1:30 PM / 1 hour`, `Face Painting + Balloon Twisting`, `21`, quote `$215`.
- Slack `#thumbtack-leads` alert visible at approximately 2:51 PM PT with Birthday party, Fullerton, `2026-07-25 1:30 PM`, Face Painting + Balloon Twisting, 21 guests, `$215` recommendation, follow-up schedule, and ready-to-copy reply draft.

Sanitized real Happy Faces LA fixtures added:

- `docs/integrations/thumbtack/sample-payloads/real-thumbtack-hfla-sagar-lead.sanitized.json`
- `docs/integrations/thumbtack/sample-payloads/real-thumbtack-hfla-angela-lead.sanitized.json`
- `docs/integrations/thumbtack/sample-payloads/real-thumbtack-hfla-angela-message.sanitized.json`

Parser reconciliation proof:

- Sagar lead now parses as Birthday party, Fullerton `92833`, `2026-07-25`, `1:30 PM`, `1 hour`, Face Painting + Balloon Twisting, 21 guests, lead fee `$11.57`, recommended quote `$215`.
- Angela lead now parses as Community event, La Canada Flintridge `91011`, `2026-10-22`, `5:00 PM`, `2 hours`, Balloon Twisting + Face Painting, 71 guests, lead fee `$14.94`, custom quote/manual review.
- Angela message payload is detected as `message.created` and preserves message text for the internal alert.

## Production Auth Proof

Run against `https://happyfacesla.com/api/thumbtack-webhook` after the production deploy:

| Request | Result |
| --- | --- |
| No token | HTTP `401` |
| Bad token | HTTP `401` |
| Correct `X-HFL-Webhook-Token` | HTTP `200`, `verified: true`, `auth_method: token` |

The correct-token auth proof also returned internal dispatch results: Slack sent, Sheet sent, SMS skipped because Twilio is not configured, CRM skipped because no CRM webhook is configured.

## Cloudflare / Apps Script / Slack

Cloudflare Pages production secrets confirmed set, values redacted:

- `THUMBTACK_WEBHOOK_TOKEN`
- `SHEETS_WEBHOOK_URL`
- `SHEETS_WEBHOOK_SECRET`
- `SLACK_WEBHOOK_URL`

Apps Script deployment:

- Web App deployed as `/exec`.
- URL form: `https://script.google.com/macros/s/[redacted]/exec`
- Script Properties include the matching sheet secret and spreadsheet target.
- The Apps Script rejects unsigned or incorrectly signed writes.

Slack:

- Incoming webhook is configured for `#thumbtack-leads`.
- Final proof alert was visible in the channel.

## Dispatch Proof

Final Happy Faces-style production proof:

- Lead ID: `tt_prod_final_1781810184986`
- HTTP response: `200`
- Auth: `verified: true`, `auth_method: token`
- Event: `lead.created`
- Recommended quote: `$325+`
- Retainer recommendation: `$165`
- Ready-to-copy reply draft: generated
- Follow-up schedule: 5 steps generated
- Dispatch: Slack `sent`, Sheet `sent row 47`, SMS `skipped`, CRM `skipped`

Verified `01_LEADS` row 47:

- Lead Source: `Thumbtack`
- Client Name: `Test Customer`
- Event City: `Burbank`
- Event Date: `2026-07-12`
- Requested Time Frame: `1:00 PM / 2 hours`
- Service Requested: `Face Painting + Balloon Twisting`
- Estimated Kids / Guests: `20 4-8 years`
- Pipeline Status: `New Inquiry`
- Quote Sent?: `No`
- Quote Amount: `$325+`
- Notes include: ready-to-copy Thumbtack reply draft generated; no customer auto-send.

Verified Slack alert:

- Channel: `#thumbtack-leads`
- Timestamp: approximately 12:16 PM PT
- Proof ID visible: `tt_prod_final_1781810184986`
- Alert included lead type, status, city/date/time, services, guest count, lead fee, score, recommended quote, retainer, follow-up schedule, and ready-to-copy reply.

## Thumbtack Test Event

After auth and dispatch proof, Thumbtack's `Test your webhooks` control was clicked for Happy Faces LA. Thumbtack showed:

`Test lead sent successfully. Please check your webhook URLs to see the test payload.`

Captured lead-details payload was sanitized and saved at:

`docs/integrations/thumbtack/sample-payloads/real-thumbtack-lead-details.sanitized.json`

Sanitization removed phone, street/unit address, image URL, attachment URL, and any auth material. Field names and structure were preserved.

## Real Payload Reconciliation

The captured Thumbtack lead-details payload uses this shape:

- top-level `customer.firstName` / `customer.lastName`
- top-level `request.requestID`
- top-level `request.category.name`
- top-level `request.proposedTimes[]`
- top-level `request.location`
- top-level `leadPrice`

Parser reconciliation completed:

- Client name parses as `Test Customer`.
- Lead ID parses as `582664010966958085`.
- Event city/ZIP parses as `San Francisco / 94103`.
- Date/time/length parses as `2026-01-06`, `10:00 AM`, `1 hour`.
- Service/category parses as `Full Service Lawn Care`.
- Lead fee parses as `$25`.
- Follow-up schedule and ready-to-copy draft are generated.
- The non-Happy-Faces test category is treated as manual/custom quote instead of applying the party price ladder.

Production real-payload proof:

- Lead ID: `582664010966958085`
- HTTP response: `200`
- Auth: `verified: true`, `auth_method: token`
- Event: `lead.created`
- Recommended quote: `Custom quote`
- Dispatch: Slack `sent`, Sheet `sent row 43`, SMS `skipped`, CRM `skipped`

Verified `01_LEADS` row 43 after reconciliation:

- Client Name: `Test Customer`
- Event City: `San Francisco`
- Event Date: `2026-01-06`
- Requested Time Frame: `10:00 AM / 1 hour`
- Service Requested: `Custom Quote`
- Quote Amount: `Custom quote`
- Notes include the appended authenticated webhook dispatch, manual quote reason, and no-auto-send note.

Verified Slack alert:

- Channel: `#thumbtack-leads`
- Timestamp: approximately 12:21 PM PT
- Lead ID visible: `582664010966958085`
- Alert includes `Test Customer`, `Full Service Lawn Care`, `San Francisco`, `Custom quote`, follow-ups, and `Ready-to-copy Thumbtack reply:`.

## Pricing Logic

Regression tests confirm the Happy Faces LA ladder:

- One service: 1 hour `$150`, 90 minutes `$215`, 2 hours `$275`
- Two services: 1 hour `$180`, 90 minutes `$255`, 2 hours `$325+`
- Three or more services: custom quote
- Schools, festivals, corporate, high-volume, 40+ kids, extended duration, unmapped services, and capacity-heavy cases require manual/custom review
- Outside core service area adds the travel adjustment note

## No Customer Auto-Send Proof

Allowed behavior only:

- internal Google Sheet write
- internal Slack alert
- optional owner SMS if Twilio is configured
- optional internal CRM webhook
- ready-to-copy reply draft
- follow-up schedule and metrics

Proven absent:

- no Thumbtack customer reply send
- no estimate auto-send
- no retainer auto-request
- no Stripe link send
- no customer SMS
- no customer email

Code proof:

- `functions/api/thumbtack-webhook.ts` returns the draft in JSON and dispatches only through `dispatchCard`.
- `src/lib/thumbtack/dispatch.ts` only targets Slack, owner SMS, Sheet, and optional internal CRM.
- `tests/thumbtack/logic.test.mjs` asserts dispatch channels are exactly `crm,sheet,slack,sms` and that no configured env means zero outbound sends.

## Test Commands

```text
npm run build
node tests/thumbtack/logic.test.mjs
node tests/api/thumbtack-webhook.mjs
```

Results:

- Build passed.
- `node tests/thumbtack/logic.test.mjs`: 100 passed, 0 failed.
- `node tests/api/thumbtack-webhook.mjs`: 12 passed, 0 failed.

## Remaining Risks

- Thumbtack's test payload used a lawn-care sample category, not a real Happy Faces LA category. The parser now handles the field shape and forces unmapped categories to custom/manual quote.
- Thumbtack did not expose separate real message/review payload samples in this test flow. Existing synthetic message/review fixtures still pass, but real message/review payloads should be captured when Thumbtack provides them.
- Twilio SMS is not configured; Slack is the active urgent alert channel.
- Older weak Slack cards remain in channel history from before the parser reconciliation; new proof alerts show the corrected real-payload fields.
- There is no retry queue for transient Slack or Apps Script outages. Dispatch failures are reported in the webhook response, but failed alerts are not replayed automatically.

## 2026-06-18 Cleanup And Message Filter Addendum

Operational cleanup was completed on `01_LEADS` without editing column A:

- Angela C. remains as the real Thumbtack lead row with `Details Received`,
  `Customer replied`, `Quote Sent? = No`, quote amount `$575`, and travel fee
  blank.
- The duplicate Angela Cho message-only row was cleared in `B:AD`.
- The `Sagar Parser Proof` and `Sagar V11 Proof` rows were cleared in `B:AD`.
- The real Sagar Mandalia booking row remains intact and booked/confirmed.
- `A1` still contains the owner-controlled array formula, no `#REF!` was
  observed, and cleared rows return blank column-A output.

Message-event behavior was reconciled:

- Customer messages still generate internal urgent Slack alerts, update the
  matching lead path, and keep the ready-to-copy draft internal.
- Business outbound messages now skip urgent Slack, owner SMS, CRM forwarding,
  reply-draft generation, and follow-up generation. Apps Script will append an
  outbound note only when it can reliably match an existing lead; otherwise the
  event is ignored without creating a lead row.
- New sanitized fixture:
  `docs/integrations/thumbtack/sample-payloads/real-thumbtack-hfla-angela-business-message.sanitized.json`.

Regression evidence:

```text
npm run build
node tests/thumbtack/logic.test.mjs
node tests/api/thumbtack-webhook.mjs
```

- Build passed.
- `node tests/thumbtack/logic.test.mjs`: 126 passed, 0 failed.
- `node tests/api/thumbtack-webhook.mjs`: 13 passed, 0 failed.

## 2026-06-18 Production Message-Filter Update

Time: 2026-06-18 15:30 PT.

Production updates applied:

- Cloudflare Pages production was redeployed from commit `a720abe` with the
  outbound-business message filter.
- The active Apps Script web app deployment was updated in place to version 12.
  The existing `/exec` deployment URL was preserved and remains redacted.
- Required Cloudflare production secret names were verified as present; values
  were not printed or committed.

Redacted production auth proof after deploy:

- Missing `X-HFL-Webhook-Token`: HTTP 401.
- Bad `X-HFL-Webhook-Token`: HTTP 401.
- Correct `X-HFL-Webhook-Token`: HTTP 200, `verified: true`,
  `auth_method: token`.

Production outbound-business message proof:

- Probe event: `message.created`, `from: Business`, synthetic non-matching
  customer/negotiation identifiers.
- Response: HTTP 200, empty reply draft, zero follow-ups.
- Slack: skipped as `business outbound message`.
- Owner SMS: skipped as `business outbound message`.
- CRM: skipped as `business outbound message`.
- Sheet receiver returned HTTP 200 and did not create a `01_LEADS` row for the
  synthetic non-matching business echo.

Customer-message proof remains covered by regression tests rather than a new
production fake customer alert, to avoid adding more test noise to Slack or
`01_LEADS`.
