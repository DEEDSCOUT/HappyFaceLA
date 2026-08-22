# Artist payout system architecture

## Boundary

The feature is an internal compensation control plane. It does not change customer quotes, Checkout, retainers, booking availability, SEO, public navigation, or customer communications. Protected non-webhook application operations require the master gate and operation-specific configuration; intake, onboarding, and Transfer mutations also require their own subgates. Webhook verification/inboxes remain independent of the master gate and use environment-specific D1, Stripe-platform, and webhook-secret configuration. The owner reserve is required only for funding preview and Transfer execution.

## Components

```text
Cloudflare Access
  -> protected Pages Function UI/API
      -> payout application service
          -> dedicated PAYOUTS_D1 ledger and append-only audit
          -> Stripe Accounts v2 + Account Links
          -> Stripe v1 Balance / Transfers / Payouts
          -> signed allowlisted CRM projection adapter

Stripe account thin events -> separate signed account webhook -> current Account retrieval
Stripe payout snapshots    -> separate signed payout webhook  -> current object retrieval
```

The dedicated database holds artist/account mappings, expiring onboarding claims and retained onboarding sessions, immutable owner-attested payee-identity verifications, one ledger item per assignment, immutable approval snapshots, batches/items, permanent transfer attempts, webhook inbox, exceptions, and audit history. It must never reuse the customer booking D1/KV stores.

The protected dashboard obtains its complete active-artist onboarding queue from the separately signed, summary-only `artist_roster_list_v1` route. A roster failure is shown as unavailable, never as zero. A selected Artist Payout Profile exposes exact artist-only totals plus separately paginated unpaid assignments, complete payment history, and open exceptions; each page has an exact total, returned count, artist-bound cursor, and `hasMore`. Current account status includes onboarding, requirements status and check time, transfers/payout readiness, disabled reason, payout destination, and preferred payout type. Global dashboard totals remain unfiltered.

## Trust boundaries

- Browser input is untrusted. Cloudflare Access proves identity; server-side role checks authorize actions; origin, Fetch Metadata, explicit-confirmation, and idempotency headers protect mutations.
- An onboarding portal URL is not sufficient authority. The owner receives a separate high-entropy one-time code, delivers it out of band to the exact authoritative roster mailbox, and never combines it with the portal link. Preview GETs do not consume a claim or create an Account Link. A same-origin POST must present the authoritative email and code; five failed code attempts durably lock the claim, and a valid challenge consumes exactly once.
- CRM input is operational source data, not authorization to move money. Stripe readiness and artist/account ownership are retrieved server-side.
- Owner activation re-resolves the current signed roster, exact connected Account, current readiness, and payout destination, then atomically stores an immutable payee-identity verification with an opaque evidence reference. The reference must not contain identity, tax, or bank data; Stripe onboarding alone is not represented as the owner's independent identity review.
- Owner approval binds the material ledger digest, batch digest, and exact revision. Any material change invalidates approval; material fields become immutable after transfer claim.
- Stripe events are untrusted until raw-body signature verification and environment validation. Thin-event bodies never establish current readiness.
- CRM write acknowledgement is not persistence proof. A separately signed read must return a new revision and exact safe fields.

## Financial sequence

1. Ingest an assignment revision and authoritative closeout controls.
2. Recompute integer-minor-unit compensation and material digest.
3. Retrieve the mapped Stripe recipient; override client-supplied readiness fields with current Stripe state.
4. Determine eligibility and conservative next Monday/Wednesday date.
5. Prepare an immutable batch preview.
6. Owner approves the exact digest/revision.
7. Retrieve HFL's available USD balance and preserve the configured reserve.
8. Acquire the environment execution lease, claim the batch and each assignment atomically.
9. Create one standalone Transfer with permanent internal uniqueness and deterministic Stripe idempotency.
10. Retrieve and compare the Transfer before persisting Transfer Created.
11. Reconcile the eventual automatic standard Payout to the destination payment.
12. Sync the safe CRM projection, independently read it back, then mark cross-system reconciliation.

## Recovery invariants

- A stale or changed approval never executes.
- A second tab, double click, retry, or concurrent worker cannot create a second obligation.
- An ambiguous Stripe response keeps the attempt claimed and opens an owner-visible exception; it is not blindly retried after the safe idempotency window.
- A lost CRM response is recovered through an authoritative read before any retry.
- Out-of-order events may advance only through legal state transitions; older evidence is ignored and logged.
- Webhook workers use renewable claim-token leases; recovered workers fence stale owners. Payout reconciliation keyset-pages through more than 500 unreconciled ledgers, and the failed-webhook dashboard has exact global totals with stable newest-first continuation.
- `Paid` means verified Stripe payout membership. `reconciled` additionally means the CRM agrees.
