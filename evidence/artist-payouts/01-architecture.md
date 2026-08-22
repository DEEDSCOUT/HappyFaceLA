# 01 — Architecture evidence

Status: **IMPLEMENTATION EVIDENCE COMPLETE; EXTERNAL ACCEPTANCE BLOCKED — NOT LAUNCH READY**

## Verified boundary

The branch implements an internal artist-compensation control plane. Happy Faces LA remains the customer-facing principal; artists are modeled as compensation recipients. Customer quotes, Checkout, retainers, booking availability, SEO, public navigation, and customer communications are outside this feature boundary.

The intended flow is:

1. Read an authoritative assignment and closeout revision from an environment-specific signed source adapter.
2. Store the obligation in a dedicated `PAYOUTS_D1` ledger using integer USD cents.
3. Retrieve the exact mapped Stripe recipient and current readiness.
4. Prepare a Monday/Wednesday batch; bind every material field into ledger and batch digests.
5. Require exact owner approval, then a separate execution action.
6. Re-read available platform funds and preserve `PAYOUT_MIN_RESERVE_CENTS`.
7. Create one standalone Stripe Transfer per claimed assignment using a deterministic idempotency key.
8. Reconcile the Transfer's destination payment into an automatic standard connected-account Payout.
9. Write only a safe CRM projection, independently read it back, and then mark the ledger reconciled.

The protected operational surface also resolves the complete active-artist onboarding queue through the separately signed, summary-only `artist_roster_list_v1` route. It does not infer the queue from the paged D1 account table. A partial, drifting, over-bound, or unavailable roster is shown as unavailable rather than as zero. Growing D1 collections use exact global counts and stable continuation cursors. A selected Artist Payout Profile contains exact artist-only unpaid/assignment/paid/exception aggregates, current account status, and separately paginated unpaid assignments, complete payment history, and open exceptions; every detail page has an exact total, returned count, `hasMore`, and an artist-bound keyset cursor. Failed/reversed payout totals remain global, and failed webhook events have their own exact-total page stream.

## Verified isolation and gates

- Dedicated Pages Function routes protect internal admin, onboarding, and two Stripe webhook surfaces.
- Dedicated D1 identity sentinels prevent sandbox/live database relabeling.
- Master, intake, onboarding, and Transfer flags are independently fail-closed and default to `false` in templates.
- Sandbox and live Stripe, roster, source, CRM, and claim settings are distinct; there is no generic fallback.
- The existing customer Stripe secret and webhook secret are deliberately not accepted by this subsystem.
- Connected-account readiness fails closed unless Stripe Balance Settings reports payouts enabled on an automatic `daily`, `weekly`, or `monthly` schedule; `manual`, disabled, absent, or unknown settings are not payout-ready.
- Readiness also fails closed when any external account advertises Instant Payouts. The Stripe Dashboard-level disablement is not verified by this local source/test fact and remains an external acceptance gate.

## Authority boundaries

- Browser input is untrusted; Cloudflare Access identity and server-side roles govern access.
- Owner-created onboarding returns an authenticated HFL portal link and a separate high-entropy one-time code. Preview GET is non-mutating; the authoritative email and code are required on same-origin POST; five failures lock the claim; a valid challenge consumes it exactly once. The link and code must be delivered separately.
- Owner activation re-resolves the current signed roster, exact Account, readiness, and payout destination, then atomically records an immutable owner-attested payee-identity verification with an opaque evidence reference. It does not claim Stripe itself performed HFL's independent identity review.
- CRM input may establish source facts but cannot authorize money movement.
- A Stripe return URL is not readiness evidence; the current Account must be retrieved.
- A Stripe event payload is not final object-state evidence; handlers retrieve current objects.
- A CRM write acknowledgement is not persistence evidence; a separately signed readback is required.
- `Paid` requires Stripe payout and destination-payment membership evidence. `Reconciled` additionally requires exact CRM readback.

This file describes verified branch design and the current implementation gates recorded in `07-test-matrix.md`. The full release command passed on the current implementation before this final Markdown refresh; an exact-evidence-byte rerun remains pending. This is not evidence of a deployed service, a Stripe Sandbox execution, a deployed signed CRM integration, or production authorization. The product remains **NOT LAUNCH READY**.
