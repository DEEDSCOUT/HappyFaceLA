# 16 — Launch runbook evidence

Status: **PROCEDURE ONLY — EXECUTION NOT AUTHORIZED — CURRENT VERDICT NOT LAUNCH READY**

## Gate 1: freeze and verify code

1. Freeze exact branch bytes; verify current base, complete diff, draft-PR status, and latest `[AUDITOR]` authority.
2. Run migration manifest verification, formatting check, lint, scoped typecheck, complete repository tests (including the lockfile-pinned real Chromium gate), build, post-build QA, owner-baseline guard, secret scan/self-test, and dependency audit.
3. Record exact command, commit/tree, timestamp, exit code, PASS/FAIL counts, and any accepted limitation.
4. Obtain independent final-byte security, QA, and release-diff reviews.

## Gate 2: complete nonproduction dependencies

1. Obtain a dedicated Stripe Sandbox context and least-privilege key.
2. Provision a fresh sandbox `PAYOUTS_D1`; verify the manifest, then apply `sandbox/0000_environment_identity.sql` followed by `0001_artist_payout_system.sql` exactly once.
3. Re-verify the exact additive Booking Control Center schema already applied to Drive copy `1FfqtINg0a5nBp1esTOnE8dW1CwawIoaX36LQ6QN9pPc`; separately approve the unresolved row-correction map.
4. Deploy the implemented signed nonproduction Apps Script server and configure all seven exact routes: roster identity read, summary-only active-roster list, roster-projection read/write, assignment-payout source read, and payout-projection read/write. Set every initial allowed origin exactly to `https://script.google.com`; prove the signed `afterArtistId=START` continuation reaches the exact complete roster count without revision drift.
5. Configure protected preview Access plus separate Sandbox account and payout/transfer event destinations.
6. Verify in the Sandbox Stripe Dashboard that Instant Payouts are disabled. Run three synthetic artists and failure/recovery/concurrency/replay cases. Prove separate link/code delivery, five-attempt lockout, exact single claim consumption, and owner-only immutable payee-identity verification using an opaque evidence reference.
7. Exercise the signed roster's 120-character ID, reserved-`START`, 100-row/page, 100-page, 10,000-artist, list-only 192 KiB, drift, duplicate, reorder, count, byte, continuation, and unavailable-queue boundaries. Prove an absent payout projection is signed JSON `null`, not `{}`.
8. Verify the selected-artist account panel, exact aggregates and isolated unpaid/history/exception pages; exact global failed/reversed totals; failed-webhook global total and stable continuation; payout traversal beyond 500 unreconciled ledgers; and stale-worker fencing.
9. Reconcile policy and communication templates before any artist accepts a new assignment: explicitly state the payout rail, Monday/Wednesday processing timing, closeout conditions, amount, and non-guaranteed bank delivery. Never combine the authenticated HFL portal link and one-time code in one message. Avoid duplicate confirmations.

## Gate 3: owner and professional approvals

Approve business model, recipient/Express architecture, platform fee/loss responsibility, USD/US scope, legal entity source, reserve/funding, cutoff, automatic standard payouts, Dashboard-level Instant Payouts disablement, separate link/code delivery, owner-only immutable payee-identity review/evidence-reference procedure, reversals/negative balances, communications, pilot artists, and CPA/legal tax/classification decisions.

## Gate 4: separately authorized production preparation

1. Back up production Drive and apply only the approved map in a scheduled window with revision guards/readback.
2. Provision a fresh production D1; verify manifest, apply `live/0000_environment_identity.sql`, then `0001_artist_payout_system.sql`, and verify exact sentinel/ledger.
3. Configure production Access, secret manager, restricted Stripe key, and separate live webhooks; keep all payout flags false.
4. Merge and Cloudflare git auto-deploy from `main` only after explicit owner authorization; manual `dist` upload is forbidden.
5. Run nonfinancial smoke checks with all four payout flags false. After a separate owner instruction, enable only the master flag and verify the protected read-only dashboard, expected platform Account binding, funding preview, webhook health, exact selected-artist profile/global totals and isolated pages, failed-webhook global total/pages, and complete authoritative onboarding queue; reset the master flag if any check fails.
6. Verify and record that Instant Payouts are disabled in the live Stripe Dashboard. Enable the onboarding subgate only for three owner-selected pilots; deliver each portal link and code separately, prove the claim controls, perform the independent owner identity review, activate only the exact re-resolved Account/destination, and then reset onboarding false. Enable intake only for the exact pilot assignments, then reset it false. Finally enable Transfers only for one explicitly approved small batch, execute it, and immediately reset Transfers false. A broader subgate or persistent enablement is not implied.
7. Monitor and close two Monday/Wednesday cycles before expansion.
8. On any stop or rollback, keep onboarding, intake, and Transfers false. Set the master flag false immediately only when no onboarding claim/session, Transfer, Payout, CRM readback, webhook, or exception is in flight. Otherwise keep it true solely for the protected reconciliation surface until the durable ledger proves nothing remains in flight/unreconciled and the owner accepts loss of that surface; webhook receipt remains independent. Preserve every immutable identity, financial, destination, event, exception, and audit record as specified in `17-rollback-plan.md`.

Gate 1's current implementation release command, independent security disposition, and release-regression audit passed; the final exact-evidence-byte rerun remains pending. Gate 2's deterministic copy migration and local adapter implementation are complete, but its external Stripe Sandbox, Apps Script deployment, protected-preview, protected-range, and end-to-end exercises are not. Gates 3–4 are not complete. Do not launch.
