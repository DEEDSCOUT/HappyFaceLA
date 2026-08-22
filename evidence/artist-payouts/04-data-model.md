# 04 — Data model evidence

Status: **IMPLEMENTED IN FRESH-D1 MIGRATION; NOT APPLIED TO A CONNECTED ENVIRONMENT BY THIS WORKFLOW**

## Tables

`0001_artist_payout_system.sql` defines:

| Table                                   | Financial purpose                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `artist_stripe_accounts`                | One artist-to-Stripe recipient mapping per environment, readiness, requirements, and owner activation state.                                                       |
| `artist_onboarding_claims`              | Expiring source-bound invitations with a separate challenge digest, durable failed-attempt count, lock state, and single-consumption identity.                      |
| `artist_onboarding_sessions`            | Retained hosted-onboarding session evidence.                                                                                                                       |
| `artist_payee_identity_verifications`   | Immutable owner-attested payee-identity verification bound to environment, artist, Account, roster revision, payout destination, reviewer, opaque evidence reference, and time. |
| `artist_payment_ledger`                 | One assignment obligation, source revision, compensation components, approvals, provider state, manual exception, and reconciliation state.                        |
| `payout_batches`                        | Immutable owner-reviewed batch total, digest, funding snapshot, and execution claim.                                                                               |
| `payout_batch_items`                    | Immutable per-obligation batch snapshots.                                                                                                                          |
| `payout_transfer_attempts`              | Permanent idempotency fingerprint, request facts, and Stripe outcome.                                                                                              |
| `payout_destination_variance_approvals` | Owner-only, immutable evidence that one exact automatic Payout used a newly approved bank while retaining the ledger's original pre-Transfer destination snapshot. |
| `stripe_webhook_events`                 | Durable event inbox with replay identity and processing leases.                                                                                                    |
| `payout_exceptions`                     | Owner-visible, non-destructive exception lifecycle.                                                                                                                |
| `financial_audit_log`                   | Append-only financial control trail.                                                                                                                               |

## Enforced invariants

- Environment identity is exactly `sandbox` or `live` and is immutable.
- Assignment ID and Stripe Transfer ID are unique per environment.
- Transfer idempotency fingerprint is unique per environment and source revision.
- Compensation must equal service + travel + bonus + adjustment − deduction and be positive.
- Approved material cannot change without atomic approval invalidation.
- Material becomes immutable once a Transfer is claimed.
- Batch item snapshots are immutable and retained.
- The pre-Transfer payout destination snapshot is immutable; a later bank/Payout variance is stored as a separate exact ledger/Payout approval that cannot be updated or deleted.
- Stripe-confirmed `PAID` cannot exist without exact Transfer/Payout membership and any required immutable destination-variance approval. CRM reconciliation is a separate later gate: `PAID` may remain `reconciled=false` until the independently signed write/readback completes.
- Manual-payment reconciliation requires no Stripe objects, an exact amount, retained evidence, a CRM revision, and immutable evidence after completion.
- Onboarding challenges lock after five failed attempts and consume at most once. Retained onboarding sessions and payee-identity verifications cannot be deleted; payee-identity verifications cannot be updated.
- Financial audit rows cannot be updated or deleted.

The D1 model is authoritative for financial workflow. Drive is intentionally only a safe operational projection.

## Migration artifact identity

The checked-in manifest pins the only admitted fresh-database sequences: environment-specific `0000` followed by shared `0001`.

| Artifact                                |  Bytes | SHA-256                                                            |
| --------------------------------------- | -----: | ------------------------------------------------------------------ |
| `sandbox/0000_environment_identity.sql` |  1,179 | `5402c85ae57680000927a1c511569d9237a47bec24ab44c512d5c535a48ed122` |
| `live/0000_environment_identity.sql`    |  1,209 | `635f4d7720bd6256bec5791d3ff239ef9a1a0ff425fb9f8b8a1d9b8210810fc0` |
| `0001_artist_payout_system.sql`         | 36,201 | `d2c84f418ba5307cda221140c1acff29423ec22126675d37828655da4cdcb49c` |

The current main migration defines 12 application tables, 14 indexes, and 50 triggers. It intentionally refuses replay, upgrade over existing payout tables, missing/ambiguous identity, and cross-environment use. These manifest facts are source identity, not proof that either sequence was applied to a connected D1.
