# 09 — Webhook evidence

Status: **LOCAL IMPLEMENTATION AND DETERMINISTIC TESTS PASS; PROVIDER E2E NOT RUN**

## Implemented topology

- Account route: `functions/api/stripe/connect-account-webhook.ts` for Accounts v2 thin events, followed by current Account retrieval.
- Payout route: `functions/api/stripe/connect-payout-webhook.ts` for connected-account v1 snapshots, followed by current Transfer/Payout retrieval.
- Each route selects an environment-specific secret and rejects wrong-mode objects.
- Raw-body signature verification precedes durable event registration.
- D1 event identity is `(stripe_event_id, environment)`; semantic replay is handled idempotently.
- Processing uses claim tokens and renewable fixed-duration leases. A lost or expired lease cannot be resurrected; a recovered worker fences the former worker before further mutations.
- Payout processing keyset-pages through more than 500 unreconciled ledgers rather than silently truncating candidate membership.
- Stripe-confirmed `PAID` evidence requires automatic Payout reconciliation completion, exact destination-payment membership, and any required immutable destination-variance approval. D1 may then hold `PAID` with `reconciled=false`; the independently signed CRM write/readback is the later terminal gate for cross-system reconciliation, not for the Stripe-confirmed `PAID` state.
- Account and payout webhooks also project the current safe connected-account/readiness state to the artist roster. A projection outage does not acknowledge completion: the durable event remains retryable and an owner-visible exception is preserved.

The current local webhook suite contains 21 cases and passes within the confirmed 108/108 integration result, including invalid signatures, replay, cross-mode rejection, impossible direct D1 lifecycle states, out-of-order events, automatic payout binding, positive pending-payout destination-payment binding, keyset traversal beyond 500 unreconciled ledgers, failed-payout replacement, immutable destination-variance approval, CRM terminal gating, safe roster projection, projection-outage retry, stale-lease recovery, processing beyond five minutes, and delayed-worker fencing. The protected dashboard separately exposes failed webhook events through stable newest-first continuation with an exact global total; a 260-event local regression proves three duplicate-free pages and terminal continuation. This is deterministic local evidence, not a Stripe event-destination or deployed-runtime claim.

## Live read-only finding

The only connector-visible live webhook is enabled for six events but includes no account, payout, or transfer events. It is therefore not evidence for this subsystem and must not be modified or repurposed without a separately approved plan.

Separate Sandbox destinations and secrets must be proven before any live event configuration is authorized.
