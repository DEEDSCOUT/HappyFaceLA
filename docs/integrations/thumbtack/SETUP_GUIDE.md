# Thumbtack Command Center — Setup Guide

This is the operator runbook for turning the code in this PR into a live system.
It covers the two supported receivers (Zapier for MVP, Cloudflare Worker for
production), webhook configuration, the Google Sheet, and the Slack/SMS alerts.

> **Safety rule (requirement #12):** nothing in this system auto-sends a
> customer-facing quote. Every customer reply is produced as a **draft** that
> Shawn approves and sends by hand inside Thumbtack.

---

## 0. Verify supported events first (requirement #1)

Open the Thumbtack **Pro** dashboard → developer/webhook settings and confirm
the event names and payload structure for:

- new lead details
- new customer messages
- customer reviews
- lead / status updates

Thumbtack's exact JSON field paths can change and are gated behind the Pro API
program. The parser in `src/lib/thumbtack/engine.ts` is intentionally
**tolerant** — it searches multiple candidate key names and also reads the
question/answer "details" array — but you should still drop one real captured
payload into `docs/integrations/thumbtack/sample-payloads/` and re-run the unit
test to confirm the field mapping against production reality.

---

## 1. MVP path — Zapier Catch Hook (fastest)

1. Create a Zap with trigger **Webhooks by Zapier → Catch Hook**. Copy the
   custom webhook URL.
2. In Thumbtack, register that URL for the events above.
3. Add an action **Webhooks by Zapier → POST** to
   `https://happyfacesla.com/api/thumbtack-webhook` with:
   - Payload type: **JSON**
   - Body: pass the raw Thumbtack payload straight through
   - Header: `Content-Type: application/json`
4. Leave `THUMBTACK_WEBHOOK_SECRET` **unset** — the Worker runs in unverified
   mode and the response is flagged `"verified": false`. (Zapier cannot easily
   compute the HMAC, so use Zapier only behind a hard-to-guess URL.)

This gets you live in minutes. Move to the production path when you want
signature verification and lower latency.

## 2. Production path — Cloudflare Worker (recommended)

The receiver already ships as a Pages Function:
`functions/api/thumbtack-webhook.ts`. It deploys automatically with the site
(Pages is Git-connected; merging to `main` ships it).

1. Point the Thumbtack webhook directly at
   `https://happyfacesla.com/api/thumbtack-webhook`.
2. In the Cloudflare Pages project → **Settings → Environment variables**, set
   the production secrets listed in section 4.
3. Set `THUMBTACK_WEBHOOK_SECRET` and configure Thumbtack (or a thin proxy) to
   send `x-thumbtack-signature: <hex HMAC-SHA256 of the raw body>`. Requests
   that fail verification get `401`.

---

## 3. Google Sheet — Booking Control Center (requirement #5)

1. Create / open the **Booking Control Center** spreadsheet.
2. **Extensions → Apps Script**, paste `google-apps-script.gs` from this folder.
3. Set `SHARED_SECRET` in the script to the same value you'll use for
   `SHEETS_WEBHOOK_SECRET`.
4. **Deploy → New deployment → Web app**, execute as *Me*, access *Anyone*
   (the HMAC is the real gate). Copy the `/exec` URL.
5. Set `SHEETS_WEBHOOK_URL` = that URL and `SHEETS_WEBHOOK_SECRET` = the secret.

The script creates a `Leads` tab with one row per lead, including the metrics
columns (`booked`, `booked_revenue`, `lost_reason`, …) you update as deals move.

---

## 4. Environment variables

| Variable | Purpose | Required |
| --- | --- | --- |
| `THUMBTACK_WEBHOOK_SECRET` | HMAC verify inbound webhooks | Prod only |
| `SLACK_WEBHOOK_URL` | Incoming-webhook URL for the alert channel | One of Slack/SMS |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio REST auth | For SMS |
| `TWILIO_FROM` | Twilio sending number (E.164) | For SMS |
| `OWNER_SMS_TO` | Shawn's mobile (E.164) | For SMS |
| `SHEETS_WEBHOOK_URL` / `SHEETS_WEBHOOK_SECRET` | Booking Control Center writer | For Sheet |
| `THUMBTACK_CRM_WEBHOOK_URL` / `THUMBTACK_CRM_WEBHOOK_SECRET` | Optional CRM mirror | Optional |

Any channel whose config is absent is **skipped** gracefully (the response's
`dispatch` array shows `"status": "skipped"`), so you can roll channels out one
at a time.

### Slack
Create an **Incoming Webhook** at api.slack.com → Your Apps → Incoming Webhooks,
pick the channel, copy the URL into `SLACK_WEBHOOK_URL`.

### SMS (Twilio)
Buy a number, then copy Account SID / Auth Token / the number into the Twilio
vars and set `OWNER_SMS_TO` to Shawn's phone.

---

## 5. Test it

```bash
# Pure logic (no server, no secrets) — also prints a full sample lead card:
node tests/thumbtack/logic.test.mjs

# End-to-end against the local dev server:
npm run pages:dev          # terminal 1
node tests/api/thumbtack-webhook.mjs   # terminal 2
```

To exercise the signature path, set `THUMBTACK_WEBHOOK_SECRET` in `.dev.vars`
and send a request with a correct `x-thumbtack-signature` header.
