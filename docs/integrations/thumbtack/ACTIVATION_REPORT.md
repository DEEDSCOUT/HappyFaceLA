# Thumbtack Command Center — Activation Report

**Date:** 2026-06-18 · **PR:** #19 · **Endpoint:** `https://happyfacesla.com/api/thumbtack-webhook`

This report covers the move from "code-complete" to "live dispatch." It is split
into **what is proven** (the code path, verified end-to-end here) and **what
remains owner-gated** (account wiring I cannot perform from this environment).

---

## TL;DR

- ✅ Auth: Custom Header (`X-HFL-Webhook-Token`) — proven 401/401/200.
- ✅ Dispatch code path: a lead really POSTs the correct **sheet row** and the
  correct **Slack alert** over HTTP — proven against a live capture server,
  including a byte-exact HMAC the Apps Script will accept.
- ✅ No customer-facing auto-send — proven by code + a regression test.
- ⛔ Production env vars, the deployed Apps Script, the Slack/Twilio secrets, and
  the Thumbtack "Test your webhooks" click are **owner-only** — see §6.

---

## 1. Auth proof (Custom Header)

Run against the local Workers runtime with `THUMBTACK_WEBHOOK_TOKEN` set:

| Request | Result |
| --- | --- |
| No `X-HFL-Webhook-Token` header | `401 {"ok":false,"error":"Unauthorized"}` |
| Wrong token value | `401 {"ok":false,"error":"Unauthorized"}` |
| Correct token | `200 {"ok":true,"verified":true,"auth_method":"token",…}` |

## 2. Sheet row proof (code path)

With `SHEETS_WEBHOOK_URL` pointed at a capture server, a `new-lead` POST produced
this outbound request (mapped to the `01_LEADS` columns the Apps Script writes):

```json
{
  "received_at": "2026-06-17T18:42:00Z", "event": "lead.created",
  "lead_id": "lead_9f2c8a", "score": "high", "priority": 100,
  "customer_name": "Jessica M.", "lead_type": "Face Painting",
  "event_type": "Birthday party", "event_city": "Burbank", "event_zip": "91505",
  "event_date": "2026-07-12", "event_time": "1:00 PM", "event_length": "2 hours",
  "requested_services": "Face painting, Balloon twisting", "guest_count": 20,
  "age_range": "4-8 years", "paid_status": "paid", "lead_fee": 18.5,
  "pros_contacted": 3, "reply_deadline": "2026-06-17T20:42:00Z",
  "recommended_quote": "$255", "retainer": 130, "cautions": ""
}
```

**HMAC proof:** the request carried `x-hfla-signature` (and `?sig=` for Apps
Script, which can't read custom headers). Recomputing HMAC-SHA256 over the exact
captured body with the shared secret reproduced the signature **byte-for-byte**,
so the Apps Script's `Utilities.computeHmacSha256Signature` check will pass.

> The Apps Script appends to a tab named **`01_LEADS`** (created with the header
> row if missing) in the *Happy Faces LA — Booking Control Center* spreadsheet.
> This proves the **payload + signature** the sheet receives; the actual row
> appears once the owner deploys the Apps Script (§6) — that step needs the
> owner's Google account.

## 3. Alert proof (code path)

With `SLACK_WEBHOOK_URL` pointed at the capture server, the same lead delivered
this Slack message verbatim — it contains every required field:

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

| Required field | In alert |
| --- | --- |
| customer name | Jessica M. |
| event date | 2026-07-12 |
| city | Burbank |
| services | Face painting, Balloon twisting |
| guest count | 20 |
| score | HIGH |
| recommended quote | $255 (retainer $130) |
| ready-to-copy reply | ✓ (the block after "Copy/paste reply") |

Dispatch result for the run: `slack: sent (200)`, `sheet: sent (200)`,
`sms: skipped` (Twilio not set), `crm: skipped`. Each channel is independent —
configure SMS instead of/alongside Slack by setting the Twilio vars.

## 4. No customer-facing auto-send proof (requirement #12)

- **Code:** the only outbound `fetch` destinations in `dispatch.ts` are Slack
  (owner channel), Twilio → `OWNER_SMS_TO` (Shawn), the Google Sheet, and the
  optional CRM. A grep for any Thumbtack messaging / reply / estimate / quote-send
  API returns **zero matches**. The reply only ever travels as `reply_draft` in
  the JSON response and inside the owner's Slack message.
- **Test:** `tests/thumbtack/logic.test.mjs` asserts dispatch targets are exactly
  `{crm, sheet, slack, sms}`, that with no config every channel is skipped (zero
  outbound), and that the reply exists only as a draft on the card.
- **Result:** no automatic Thumbtack reply, no automatic estimate, no automatic
  retainer request. ✅

## 5. Test status

```
node tests/thumbtack/logic.test.mjs   → 44/44  (incl. 4 no-auto-send assertions)
node tests/api/thumbtack-webhook.mjs  →  8/8   (HTTP contract, no-secret mode)
```

---

## 6. Remaining owner-gated steps (cannot be done from this environment)

These need credentials/dashboards I don't have. Each is ~2 minutes.

1. **Deploy the Apps Script** (`google-apps-script.gs`) bound to the *Booking
   Control Center* sheet; set its `SHARED_SECRET`; deploy as a Web App; copy the
   `/exec` URL. *(Owner's Google account.)*
2. **Create a Slack incoming webhook** (or gather Twilio SID/token/from + Shawn's
   number). *(Owner's Slack/Twilio.)*
3. **Set Cloudflare Pages production env vars:** `THUMBTACK_WEBHOOK_TOKEN`,
   `SHEETS_WEBHOOK_URL` + `SHEETS_WEBHOOK_SECRET`, and `SLACK_WEBHOOK_URL` (or the
   Twilio vars). *(Owner's Cloudflare dashboard.)*
4. **Configure the Thumbtack webhook:** URL `https://happyfacesla.com/api/thumbtack-webhook`,
   Auth = **Custom Header**, Header name `X-HFL-Webhook-Token`, value = the token
   from step 3. *(Owner's Thumbtack Pro dashboard.)*
5. **Click "Test your webhooks"** in Thumbtack and capture the real payloads
   (lead, message, review). *(Owner's Thumbtack dashboard.)*
6. **Reconcile real payloads:** drop sanitized real payloads into
   `sample-payloads/`, re-run both test commands. The parser is tolerant, but the
   live field paths should be confirmed against reality (it's built from assumed
   shapes).

> **Want me to do steps 3–6 of the proof for real right now?** If you paste the
> deployed Apps Script `/exec` URL + a Slack webhook URL, I'll point a local
> worker at them and prove a row lands in your actual `01_LEADS` tab and an alert
> lands in your actual Slack — same as §2/§3 but against your live endpoints.
> Setting the *production* Cloudflare env vars still requires your dashboard.

---

## 7. Remaining risks

- **Assumed payload schema.** The parser uses tolerant matching over *assumed*
  Thumbtack field names + the Q/A "details" array. Until step 5/6, real field
  paths are unconfirmed; a renamed field degrades to an empty value + lower score
  (it won't crash), but verify before trusting scores/quotes.
- **Rate limit is per-isolate.** The 60 req/min limiter is in-memory per Worker
  isolate, not global — fine for Thumbtack volumes, not a hard quota.
- **Apps Script header limitation.** Apps Script can't read custom request
  headers, so the HMAC is verified from the `?sig=` query param (the worker sends
  both). Keep the `/exec` URL itself secret.
- **Twilio/Slack delivery is best-effort.** A channel failure is isolated and
  reported as `error` in the response `dispatch` array, but there is no retry
  queue yet — a transient Slack 5xx means that one alert is missed (the row still
  writes). Add a retry/queue if missed alerts become a problem.
- **No dedupe.** If Thumbtack re-delivers the same event, you get a second row +
  alert. Add idempotency on `lead_id`+`event` in the Apps Script if needed.
