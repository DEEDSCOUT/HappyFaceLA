# Artist payout rollback plan

Rollback must preserve financial evidence. Never delete ledger, Transfer, Payout, webhook, exception, or audit rows.

## Immediate stop and master-gate posture

1. Set `STRIPE_ARTIST_TRANSFERS_ENABLED=false`.
2. Set `STRIPE_ARTIST_INTAKE_ENABLED=false` and `STRIPE_ARTIST_ONBOARDING_ENABLED=false`.
3. Keep `STRIPE_ARTIST_PAYOUTS_ENABLED=true` while any onboarding claim/session, claimed Transfer, payout, CRM readback, webhook, or exception remains in flight; this preserves the protected dashboard and owner reconciliation actions. The transfer gate remains independently false.
4. Leave both webhook verification/inboxes available so already-created objects continue to reconcile. Webhook receipt does not depend on the master application gate.
5. Revert application code only through a separately reviewed Git change on `main`; Cloudflare deploys from Git.
6. Set `STRIPE_ARTIST_PAYOUTS_ENABLED=false` only after the durable ledger proves there are no in-flight or unreconciled objects and the owner has accepted loss of the internal read/reconciliation surface.

## After any Transfer may exist

1. Disable new execution immediately; do not delete or rewrite the batch.
2. Retrieve every claimed attempt using stored Stripe IDs and fingerprints.
3. Classify each as no object found within safe retry window, Transfer exists, reversed, payout pending, paid, or ambiguous.
4. Continue webhook and CRM reconciliation for existing objects even while creation is disabled.
5. Open owner-visible exceptions for every unresolved item.
6. Reverse a Transfer only under an owner-approved recovery decision and after checking available connected balance; reversal is not an automatic rollback mechanism.
7. Preserve append-only audit and export a redacted incident record.

## Database rollback

The initial migration is additive in a dedicated D1. Application rollback does not drop tables. Preserve onboarding claims, retained onboarding sessions, immutable payee-identity verifications, ledgers, batches, transfer attempts, original destination snapshots, destination-variance approvals, webhook events, exceptions, and audit rows. Restore from the owner-approved prelaunch backup only for corruption/disaster recovery, then reconcile all Stripe events after the backup point before resuming. An environment-identity mismatch is a hard stop, not a reason to rewrite the sentinel.

## CRM rollback

Stop adapter writes, retain the last verified application state, and use the pre-migration native workbook backup plus the approved field map. Never bulk-restore entire formula columns over manual overrides. Preserve the owner-approved protected-range inventory, formulas, validations, identifiers, reciprocal links, and external-automation inventory. Any production correction requires revision guards, readback, and an audit entry.

## Exit criteria

- new onboarding/Transfers are impossible;
- every previously claimed assignment has an authoritative disposition;
- no Paid or reconciled label exceeds its evidence;
- CRM and D1 disagreements are visible exceptions;
- owner receives a redacted incident/reconciliation report.
