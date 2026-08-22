# 08 — Sandbox evidence

Status: **NO STRIPE SANDBOX CONTEXT ACCESSIBLE — SANDBOX ACCEPTANCE NOT RUN — NOT LAUNCH READY**

## What is present

- Source supports exact `sandbox` mode with a configured platform Account ID, dedicated keys, webhook secrets, claim secret, all seven roster/source/CRM routes, Access configuration, D1 binding, and owner reserve.
- Sandbox and live D1 identity migrations are separate and manifest-pinned.
- Feature flags default to false.
- Local tests use synthetic Stripe objects and adapters; they are not provider execution evidence.

## What was not possible

The Stripe connector exposed only the Happy Faces LA live account. There was no accessible Sandbox context. Accordingly, this workflow did **not**:

- create or reuse a Sandbox recipient Account;
- create an Account Link or complete hosted onboarding;
- create, read back, fail, recover, reverse, or reconcile a Sandbox Transfer;
- receive or replay Sandbox account/payout webhook events;
- prove automatic standard Payout membership;
- prove that Balance Settings reports an enabled non-manual payout schedule and that any replacement Payout still exposes the original Transfer destination-payment membership;
- verify and record that Instant Payouts are disabled at the Stripe Dashboard/platform level;
- prove a full Stripe-to-D1-to-CRM test-copy cycle.

No live Stripe mutation was substituted for the missing Sandbox.

## Acceptance evidence still required

An owner-only native Booking Control Center nonproduction copy exists at Drive ID `1FfqtINg0a5nBp1esTOnE8dW1CwawIoaX36LQ6QN9pPc`. Its exact additive schema, strict validations, checkbox defaults, identifier/link preservation, and representative legacy formula/validation preservation are verified at copy revision `4`. The signed adapter has not been deployed or exercised against it.

Use three synthetic artists—ready, requirements-pending, and payout-failure/recovery—against a dedicated Stripe Sandbox, fresh sandbox D1, protected preview, deployed seven-route sandbox Apps Script adapter, and that approved copy. Prove separate portal-link/code delivery, wrong-code lockout, exact single consumption, owner-only immutable payee-identity verification with an opaque evidence reference, and Dashboard-level Instant Payouts disablement. Exercise the full signed roster list through its 120-character ID, 100-row/page, 100-page, 10,000-artist, list-only 192 KiB and failure bounds; verify signed JSON `null` for an absent payout projection. Verify the selected-artist account panel, aggregates and detail cursors, global totals, failed-webhook pages, and the closed-loop Stripe/D1/CRM recovery paths. Capture only redacted object/event IDs, exact state transitions, command exit codes, signed roster-list revision/count completion, and CRM revision readbacks. Until then, Sandbox status is **FAIL / BLOCKED BY ACCESS**, not PASS.
