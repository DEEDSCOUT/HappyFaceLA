# Thumbtack Command Center Activation Report

**Activation date:** 2026-06-18, 12:16-12:21 PM PT  
**Endpoint:** `https://happyfacesla.com/api/thumbtack-webhook`  
**Auth method:** Custom Header  
**Header name:** `X-HFL-Webhook-Token`  
**Deployed code:** clean production release branch commit `0da0506360aa`

## Status

- **Recommendation:** stay enabled with monitoring.
- Production webhook is enabled in Thumbtack for Happy Faces LA.
- Production Cloudflare secrets are set; values remain redacted.
- Google Sheet writes work on `01_LEADS`.
- Slack alerts land in `#thumbtack-leads`.
- Ready-to-copy replies are generated internally only.
- No customer-facing auto-send path exists.

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
- `node tests/thumbtack/logic.test.mjs`: 68 passed, 0 failed.
- `node tests/api/thumbtack-webhook.mjs`: 9 passed, 0 failed.

## Remaining Risks

- Thumbtack's test payload used a lawn-care sample category, not a real Happy Faces LA category. The parser now handles the field shape and forces unmapped categories to custom/manual quote.
- Thumbtack did not expose separate real message/review payload samples in this test flow. Existing synthetic message/review fixtures still pass, but real message/review payloads should be captured when Thumbtack provides them.
- Twilio SMS is not configured; Slack is the active urgent alert channel.
- `01_LEADS` still shows an existing header/formula `#REF!` artifact in the first lead-ID column area. Writes and updates succeeded, but the sheet formula/header structure should be reviewed separately before broader sheet cleanup.
- There is no retry queue for transient Slack or Apps Script outages. Dispatch failures are reported in the webhook response, but failed alerts are not replayed automatically.
