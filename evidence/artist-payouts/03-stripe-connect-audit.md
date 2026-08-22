# 03 — Stripe Connect audit

Status: **READ-ONLY LIVE INVENTORY ONLY — NO SANDBOX ACCESS — NOT LAUNCH READY**

## Connector-observed account scope

The available Stripe connector exposed only the **Happy Faces LA live account**, `acct_1TcGsVFEQspruzB8`. No Stripe Sandbox context was accessible, so no Sandbox recipient, Account Link, Transfer, Payout, webhook, or failure-recovery exercise could be performed.

Read-only live inventory returned:

- v1 connected accounts: **0**;
- v2 core accounts: **0**;
- existing enabled webhook destinations: **1**;
- events enabled on that existing webhook: **6**;
- account, payout, or transfer events on that webhook: **none**.

The existing webhook remained unchanged and still lacks the required Connect payout events. No Stripe object was created, updated, disabled, or deleted. No onboarding link was created. No Transfer or Payout was initiated.

## Selected nonproduction architecture

For a future separately authorized Sandbox, source code targets Accounts v2 recipient configuration with Express Dashboard, application fee/loss responsibility, Stripe-balance transfer capability, standalone Transfers, and automatic standard Payouts. It does not request merchant/card-payment capabilities, destination charges, direct charges, `on_behalf_of`, `source_transaction`, or application fees on the artist obligation.

Local gateway controls bind every payout operation to the configured expected platform Account before proceeding. Existing-recipient discovery auto-paginates the complete Accounts v2 inventory up to a reviewed 10,000-account bound, retains same-artist records as reconciliation candidates, creates no account when provenance is ambiguous or mismatched, and automatically maps only one exact current-secret/current-provenance match. Connected-account readiness separately retrieves Balance Settings and admits only enabled automatic `daily`, `weekly`, or `monthly` payouts; `manual`, disabled, missing, and unknown schedules fail closed. Readiness also fails closed if any external account advertises Instant Payouts. These are source/test findings, not provider execution evidence; this workflow did not verify the platform-level Instant Payouts setting in either the Sandbox or live Stripe Dashboard.

## Pricing evidence boundary

The current read-only account context did not expose HFL's applicable Connect contract or account-specific rates. Pricing is **not verified**, and this evidence set intentionally states no percentage or fixed fee. Owner/finance must retrieve the current HFL-specific Connect pricing from the Stripe Dashboard or Stripe account team, preserve the dated source, and validate actual Sandbox and controlled-pilot fees before live expansion. This remains an owner-input and launch gate; approved artist compensation is not silently netted for fees.

## Consequence

The existing live webhook does not cover the event topology required by this design. Separate account and payout/transfer event destinations and secrets must be proven in Sandbox first and separately authorized for live. The absence of an accessible Sandbox is a hard blocker to launch certification, including proof that replacement automatic Payout inventory preserves the original Transfer destination-payment membership required by the reconciliation design.
