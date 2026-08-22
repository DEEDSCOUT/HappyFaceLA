# 17 — Rollback plan evidence

Status: **PRESERVATION-FIRST PROCEDURE; NO LIVE ROLLBACK EVENT EXISTS**

## Immediate stop

1. Set `STRIPE_ARTIST_TRANSFERS_ENABLED=false` to block new money movement.
2. Set intake and onboarding flags false.
3. Keep the master application gate true while any onboarding claim/session, Transfer, Payout, CRM readback, webhook, or exception is in flight, so the protected reconciliation surface remains available.
4. Keep webhook verification/inboxes operating; webhook receipt is independent of the master application gate.
5. Set the master gate false only after the durable ledger proves no in-flight/unreconciled objects and the owner accepts loss of the internal read/reconciliation surface.

## If a Transfer may exist

- Stop new execution; never delete or rewrite the batch.
- Retrieve every claimed attempt using stored Stripe IDs and fingerprints.
- Classify no-object, exists, reversed, payout pending, paid, or ambiguous.
- Continue webhook and CRM reconciliation for existing objects.
- Open owner-visible exceptions for unresolved items.
- Reverse only after explicit owner decision and connected-balance verification; reversal is not automatic rollback.
- Do not close/delete connected Accounts, remove external bank destinations, or change automatic payout schedules as an application rollback. Preserve the expected platform Account ID, recipient Account IDs, original destination snapshots, and any separate immutable destination-variance approvals for reconciliation.

## Data preservation

- Do not drop D1 tables or delete onboarding claims, retained onboarding sessions, immutable payee-identity verifications, ledgers, Transfer/Payout evidence, original destination snapshots, destination-variance approvals, webhook events, exceptions, or audit evidence.
- Do not rewrite an environment identity sentinel.
- Database disaster restoration requires reconciliation of every Stripe event after the backup point.
- CRM rollback uses the native pre-migration backup and exact field map; never overwrite full formula columns or row-level overrides.
- Before any CRM rollback, inventory Apps Script deployments/triggers, protected ranges, workbook revision, and external automations. Afterward, prove the approved inventory and every unaffected formula/validation/identifier link remain unchanged.
- Application rollback must be a separately reviewed Git change on `main`; Cloudflare deploy remains Git-based.

Exit requires authoritative disposition for every claim, no status beyond its evidence, visible D1/CRM disagreements, and an owner-accepted redacted incident/reconciliation report. That report records environment, incident/request/batch/ledger IDs, safe Stripe object/event IDs, first/last timestamps, flags changed and restored, authoritative state reads, owner decisions, recovery actions, remaining exceptions, and the approving reviewer—never secrets, bank data, tax data, or personal onboarding content.
