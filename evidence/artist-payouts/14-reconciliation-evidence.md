# 14 — Reconciliation evidence

Status: **CLOSED-LOOP CLIENT/SERVER LOGIC AND LOCAL TESTS PASS; END-TO-END EXTERNAL PROOF ABSENT**

## Required evidence chain

1. D1 contains one approved assignment obligation and permanent Transfer attempt.
2. Stripe Transfer retrieval matches environment, destination, amount, currency, transfer group, metadata/fingerprint, and destination payment.
3. Current connected-account Payout retrieval is in the expected environment and standard automatic payout flow.
4. Stripe reports paid plus reconciliation completion.
5. The Payout's balance-transaction inventory contains the exact Transfer destination-payment ID.
6. The Payout destination equals the immutable pre-Transfer destination snapshot. If it differs, reconciliation remains blocked until the owner types `APPROVE DESTINATION <ledger_id> <payout_id>` and D1 contains the separate immutable variance record that exactly binds the original destination, current owner-approved replacement destination, recipient approval timestamp, and this ledger/Payout pair.
7. D1 records Stripe paid evidence but remains unreconciled.
8. The signed CRM adapter pre-reads the expected record/revision and writes only the safe projection through the exact Apps Script envelope/redirect contract.
9. A separately signed read returns a new revision and exact semantic projection.
10. D1 atomically marks `PAID`, `reconciled=true`, stores the CRM revision, and appends an audit entry.

An acknowledgement, browser return, webhook payload, payout status alone, CRM label alone, Gmail statement, or human assertion cannot satisfy this chain.

## Manual rail

A manually paid obligation is separately represented as `MANUAL_PAYMENT_EXCEPTION` and cannot contain Stripe objects. The amount must equal the ledger, the evidence reference must be unique, the exact CRM projection must read back, and the finalized evidence is immutable.

## Current evidence limit

The source includes a seven-operation Apps Script server plus signed Cloudflare clients for assignment source, payout projection, roster identity, complete active-roster listing, and roster status projection. Business and active-roster IDs share the 120-character bound. `artist_roster_list_v1` uses `afterArtistId=START` only as the initial cursor, rejects `START` as an Artist ID, returns only summary fields, and fails closed on partial, reordered, duplicated, drifting, contradictory, count-mismatched, or over-bound traversal instead of representing the onboarding queue as zero. It alone has a named 192 KiB response cap; every other operation retains the 64 KiB default/bound. Local tests cover exact mutual signatures, strict UTF-8 and JSON byte bounds including a one-byte-over failure, bounded redirects, revision compare-and-swap, response-loss recovery, immutable account identity, formula/validation preservation, signed JSON `null` for an absent payout projection, readback, and terminal CRM gating.

No Stripe Sandbox, deployed Apps Script adapter, or real signed integration run against the owner-only copy was available. The copy's schema/preservation checks are verified independently. The final read-only production audit found unrelated operational row activity through revision 1595, while the relevant sheet IDs and dimensions and the exact original 30 headers on tabs 11, 12, and 13 remained unchanged; there was no payout-schema drift and no project mutation. Therefore no real ledger can presently be certified Paid or reconciled by this package.
