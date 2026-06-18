# Thumbtack Deployment Guardrails

Last updated: 2026-06-18

The live Thumbtack receiver was activated before the draft PR was merged. Any
future Cloudflare Pages production deploy from `main` must include the live
receiver/parser and Apps Script fixes documented in `ACTIVATION_REPORT.md`.

## Required Before Production Deploy

- Reconcile PR #19 or its replacement branch onto current `main`.
- Confirm `functions/api/thumbtack-webhook.ts`, `src/lib/thumbtack/*`,
  `docs/integrations/thumbtack/google-apps-script.gs`, sample payload fixtures,
  and the Thumbtack tests match the live fix branch behavior.
- Run:

```text
node tests/thumbtack/logic.test.mjs
node tests/api/thumbtack-webhook.mjs
```

- Do not deploy a normal site build that drops or reverts the Thumbtack webhook
  files.

## 01_LEADS Sheet Rules

- `01_LEADS` column A is formula-controlled by the owner.
- Webhook writes must start at column B.
- Apps Script must not add `Lead ID` to its writable header list.
- Apps Script must not write Thumbtack external lead IDs into column A.
- Thumbtack external lead IDs belong in `Notes` or another explicit
  non-formula field only.
- `tests/thumbtack/logic.test.mjs` includes source-level guardrail assertions
  for these rules.

## Thumbtack Message Events

- `message.created` events from `Customer` are internal urgent events: update
  the matching lead, alert Slack/owner channels, and generate a ready-to-copy
  draft.
- `message.created` events from `Business` are outbound echoes: do not alert
  Slack, do not generate a reply draft, and do not create a new lead row.
- Standalone message events should match existing leads by request/lead ID,
  negotiation ID, customer/business IDs, then customer name only as a last
  fallback. Do not append a new row for a business outbound message.

## Customer-Send Boundary

The webhook may generate internal drafts, follow-up schedules, Sheet rows,
Slack alerts, owner SMS alerts, and internal CRM payloads. It must not send:

- Thumbtack customer replies
- estimates
- retainer requests
- Stripe links
- customer SMS
- customer email
