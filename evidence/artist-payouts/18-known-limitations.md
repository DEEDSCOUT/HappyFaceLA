# 18 — Known limitations

Status: **NOT LAUNCH READY**

## External blockers

1. Stripe connector access exposes only the Happy Faces LA live account `acct_1TcGsVFEQspruzB8`; no Sandbox context is accessible.
2. Live inventory has zero v1 connected accounts and zero v2 core accounts; the one existing enabled webhook remains unchanged and lacks the required Connect account/payout/transfer events.
3. The owner-only Booking Control Center copy remains revision `4` with the exact additive 54/43/44-column schema, strict validations, checkbox defaults, full key/link preservation, and representative legacy formula/validation preservation. Protected-range behavior and synthetic business-row flows have not been exercised through a deployed adapter.
4. The seven-operation Apps Script server and all Cloudflare signed clients—including the bounded summary-only active-roster list used by the onboarding queue—are implemented and synthetically tested, but the server has not been deployed and no real signed copy integration exists.
5. Production Booking Control Center revision advanced from `1592` to `1595` through unrelated operational row activity. Final read-only audit found the same relevant sheet IDs/dimensions and exact original 30 headers on tabs 11/12/13: no schema drift and no project mutation. Production still has no payout projection fields and retains the owner-review findings requiring an approved correction map.
6. The current implementation passed full `npm run verify:release`: owner baseline, migration, formatting, lint, typecheck, zero-vulnerability dependency audit, payout tests (unit 91/91, integration 108/108 plus sandbox/live migration checks, HTTP/portal E2E 29/29 plus real Chromium desktop/mobile), existing lead 23/23, outcome 15/15, controlled customer Checkout, 33-page build, and post-build QA. Independent security is APPROVED at Critical/High/Medium/Low `0/0/0/0`, and final release regression is PASS. The exact-evidence-byte release rerun remains pending; none of these local results replaces external acceptance or grants launch approval.
7. No Stripe Sandbox recipient onboarding, Transfer, automatic Payout schedule/membership, webhook, failure, recovery, concurrency, or closed-loop reconciliation evidence exists. Replacement-Payout destination-payment membership is therefore still a provider acceptance question, not proven production behavior.
8. Local readiness fails closed when any external account advertises Instant Payouts, but this workflow has not verified that Instant Payouts are disabled at the Stripe Dashboard/platform level in Sandbox or live.
9. Production Access/secrets, least-privilege Stripe credentials, expected platform bindings, and separate account/payout event destinations are not provisioned or evidenced.

## Current local remediation status

- Apps Script and Cloudflare now share the 120-character business/active-roster ID bound. Only `artist_roster_list_v1` has a named 192 KiB response cap; all other operations retain the 64 KiB default/bound. Current local tests cover worst-case UTF-8/JSON bytes and one-byte-over rejection, reserved `START`, drift, duplicates, reordering, continuation, count/page bounds, and explicit queue-unavailable propagation.
- The selected Artist Payout Profile now includes current account/onboarding/requirements status, exact artist-only aggregates, and independently paginated unpaid assignments, complete payment history, and open exceptions with exact totals and artist-bound cursors. Global dashboard totals remain global.
- Current local tests cover default HTML/API profile cursor wiring, webhook payout traversal beyond 500 unreconciled ledgers, renewable lease/stale-worker fencing, rotated batch-execution claim fencing, webhook lifecycle constraints, spreadsheet-formula prefix rejection before mutation, OTP lock/single consumption, immutable payee-identity activation, and signed JSON `null` for a missing payout projection.

These resolved local gaps are implementation/test evidence only. They do not remove the external blockers above.

## Policy and operating blockers

- Owner confirmation of the business model, platform responsibilities, reserve/funding, country/currency scope, cutoff, pilot, exception, reversal, and negative-balance rules is outstanding.
- CPA/legal decisions on worker classification, payer entity, W-9/1099 treatment, thresholds, reimbursements, state obligations, and any Stripe tax-form service are outstanding.
- Current SOP and recent artist-message language conflict about whether Stripe onboarding is available.
- Before an artist accepts a prospective assignment, the communication must state the exact compensation, payout rail, Monday/Wednesday processing timing, closeout conditions, and that bank delivery is not guaranteed. Duplicate approval/processing/paid confirmations must be prevented.
- This project created no Gmail draft, sent no message, and contacted no artist. Read-only search observed two unrelated historical artist-assignment sends, so this is not a global Gmail no-activity claim. No authoritative current recipient/compensation source existed for a compliant Stage 10 draft.

These are launch blockers, not post-launch cleanup items.
