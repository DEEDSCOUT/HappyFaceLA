# Artist payout launch and operations runbook

Status: procedure only. No production action is authorized.

## Nonproduction verification

1. Provision a dedicated Stripe Sandbox, `PAYOUTS_D1`, Access application, and nonproduction CRM copy/adapter, including the separately signed `artist_roster_list_v1` route for the complete active-artist onboarding queue.
2. Apply `migrations/artist-payouts/sandbox/0000_environment_identity.sql`, then `migrations/artist-payouts/0001_artist_payout_system.sql`, in that exact order and only to a fresh dedicated sandbox D1. Run the manifest verifier first. Replay and any pre-existing payout table are hard failures.
3. Configure sandbox secrets and keep live values absent.
4. Run dependency install, scoped typecheck, unit/integration/security suites, build, owner baseline guard, secret guard, and release verification.
5. Verify in the Sandbox Dashboard that Instant Payouts are disabled. Then run three synthetic artists: ready, requirements-pending, and payout-failure/recovery. Prove separate portal-link/code delivery, five-attempt lockout, single consumption, and owner-only immutable payee-identity verification using only an opaque evidence reference.
6. Traverse the complete signed roster within the 120-character ID, 100-row/page, 100-page, 10,000-artist, and roster-list-only 192 KiB limits. Exercise drift, duplicate, reorder, continuation, count, page, byte, reserved-`START`, and queue-unavailable failures. Prove a missing payout projection is signed JSON `null`, not `{}`.
7. Verify the Artist Payout Profile's exact artist-only aggregates, account status, unpaid assignments, complete payment history, and open exceptions, including cursor isolation and continuation. Verify global totals and failed-webhook totals/pages remain global.
8. Capture redacted object IDs, event IDs, state transitions, and CRM readback revisions in evidence; never capture identity/bank/tax data.
9. Obtain independent security, QA, and release-diff reviews.

## Monday/Wednesday operation

The implementation conservatively assigns eligibility to the next processing date strictly after the control-clear date. Shawn must approve a same-day cutoff if a different policy is intended.

1. Admin verifies closeout and compensation source revisions.
2. System refreshes Stripe recipient readiness and calculates the next eligible date.
3. System prepares candidates for the date; blocked items remain in exceptions.
4. Owner reviews every artist, Booking ID, Assignment ID, event/service, component amount, destination Account, status, and exception plus the balance/reserve summary.
5. Owner approves the exact digest and revision.
6. Owner deliberately starts execution as a separate action.
7. System retrieves available balance, preserves reserve, acquires the environment lease, and creates one Transfer per claimed assignment.
8. Operator monitors exceptions; ambiguous outcomes are reconciled, never blindly retried.
9. Webhooks and retrieval reconcile automatic payouts.
10. CRM safe fields independently read back before cross-system reconciliation completes.

## Safe status meanings

- `Ready`: controls complete; no owner approval yet.
- `Owner Approved`: exact revision approved; no money moved.
- `Transfer Queued`: durable claim exists; creation may be in progress.
- `Transfer Created`: Stripe Transfer exists and readback matches.
- `Payout Pending`: Stripe is moving connected-account funds; arrival is not guaranteed.
- `Paid`: Stripe paid/reconciliation evidence proves membership in the automatic payout.
- `Reconciled`: Paid evidence and Booking Control Center projection agree.
- `Failed` / `Manual Review`: owner action is required; no blind retry.

## Exception response

- Insufficient balance/reserve: do not execute; owner funds/adjusts policy outside the application, then obtains a fresh balance.
- Requirements/restriction: refresh Account, direct artist to Stripe-hosted remediation, and do not request sensitive data.
- Ambiguous Transfer response: retain the same fingerprint; retrieve known Stripe object if present; after the safe key window, escalate rather than recreate.
- Payout failed: retrieve the current Payout/Account, keep Paid false, preserve Transfer identity, and use Stripe-hosted remediation before evaluating an exact replacement Payout.
- Payout destination changed: keep Paid false, preserve the immutable pre-Transfer destination, and follow the exact owner-only variance procedure below after Stripe-hosted remediation.
- CRM unavailable/conflict: keep Stripe status, leave reconciled false, preserve exception, and independently read before retry.
- Transfer reversed: reopen reconciliation and follow the owner-approved recovery procedure.

### Payout destination changed after Transfer creation

The pre-Transfer `approved_payout_destination_id` and approval timestamp on the assignment ledger are historical financial evidence. Never edit, replace, or delete that original bank snapshot to match a later Payout.

1. Keep `Paid` false and retain the `PAYOUT_DESTINATION_MISMATCH` exception.
2. Confirm in Stripe that the exact original Transfer and destination-payment identity still match the immutable ledger and that the specified automatic Payout contains that destination payment.
3. Refresh the connected Account. The replacement bank must be the current Stripe default, the Account must again be payout-ready with automatic standard payouts, and the replacement destination must have a current owner-approval timestamp.
4. The owner opens the exact ledger/Payout exception, enters a safe operational reason of 12–240 characters with no bank, tax, or identity data, and types `APPROVE DESTINATION <ledger_id> <payout_id>` exactly. Admins cannot perform this action, and the destination ID is never accepted from the browser.
5. The system writes a separate immutable variance record binding environment, ledger, Payout, original destination, replacement destination, current recipient approval timestamp, owner, reason, and audit entry. It does not mutate the original ledger snapshot.
6. Replay/retry reconciliation. `Paid` remains blocked unless the exact immutable variance record matches the Payout and its destination-payment membership; do not clear the exception with a generic resolution.

## Production activation sequence

1. Shawn approves the Draft PR, architecture/responsibility decisions, tax advice, reserve, cutoff, recovery policy, and communications.
2. Reconcile the Payout SOP and Stage 10/future assignment language.
3. Approve the exact CRM migration/correction map; export and back up production.
4. Provision a fresh dedicated production payout D1. Verify the migration manifest, then apply `migrations/artist-payouts/live/0000_environment_identity.sql` followed by `migrations/artist-payouts/0001_artist_payout_system.sql`; verify the sealed `live` identity sentinel and exact two-entry migration ledger. Never reuse or relabel sandbox D1.
5. Configure production Access, secret-manager values, and separate v2/v1 event destinations.
6. Keep `STRIPE_ARTIST_PAYOUTS_ENABLED`, `STRIPE_ARTIST_INTAKE_ENABLED`, `STRIPE_ARTIST_ONBOARDING_ENABLED`, and `STRIPE_ARTIST_TRANSFERS_ENABLED` all exactly `false`; merge only with explicit owner authorization.
7. Allow Cloudflare Pages to auto-deploy from `main`; never manually upload `dist`.
8. With every payout flag still false, run general site health and non-financial smoke checks. Do not represent the disabled payout UI as a failed deployment.
9. After a separate owner activation instruction, set only `STRIPE_ARTIST_PAYOUTS_ENABLED=true`; leave the three mutation subgates false. Verify the protected read-only dashboard, environment identity, expected platform Account binding, funding preview, webhook health, exact artist-profile/global aggregates and cursor pages, failed-webhook global totals/pages, and the signed complete active-roster onboarding queue. An unavailable, revision-drifting, incomplete, count-mismatched, or over-bound roster list is not an empty queue. If any check fails, restore the master flag to `false`.
10. Verify and record that Instant Payouts are disabled in the live Stripe Dashboard. For only the three owner-selected pilot artists, set `STRIPE_ARTIST_ONBOARDING_ENABLED=true`; issue the portal link and one-time code through separate approved channels, prove single consumption/lockout, complete hosted onboarding, perform the owner-only independent identity review with an opaque evidence reference, and activate only the exact re-resolved Account/destination. Then immediately restore onboarding to `false`. Keep intake and transfers false throughout.
11. For only the approved pilot assignment records, set `STRIPE_ARTIST_INTAKE_ENABLED=true`, import/recheck the exact source records, then immediately restore it to `false`. Prepare and owner-approve the small batch while transfers remain false.
12. Immediately before executing that exact approved batch, recheck platform Account, available balance/reserve, processing date, approval digest/revision, recipient readiness, and exceptions. Set `STRIPE_ARTIST_TRANSFERS_ENABLED=true`, execute only that batch, then immediately restore it to `false` regardless of success or failure.
13. Keep onboarding, intake, and transfers false while monitoring Transfer, automatic payout, CRM reconciliation, webhook backlog, and exceptions. The master flag may remain true only for the separately authorized monitoring/reconciliation window.
14. At the end of the authorized pilot window—or immediately on a stop/rollback instruction—keep onboarding, intake, and transfers `false`. If no onboarding claim/session, Transfer, Payout, CRM readback, webhook, or exception is in flight, restore the master flag to `false` too. Otherwise keep `STRIPE_ARTIST_PAYOUTS_ENABLED=true` only for the protected reconciliation surface, continue webhook receipt, and set the master flag to `false` only after the durable ledger proves there are no in-flight or unreconciled objects and the owner accepts loss of that surface, exactly as specified in `rollback-plan.md`.
15. Complete two owner-approved Monday/Wednesday pilot cycles before expansion; repeat the same narrow subgate windows for each cycle.
