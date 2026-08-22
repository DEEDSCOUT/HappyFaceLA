# Stripe Connect recommendation — artist compensation recipients

Status: nonproduction source implementation complete; external Sandbox/deployed acceptance outstanding; live activation is not authorized.

## Business model and source research

Happy Faces LA owns the customer relationship, sells event-entertainment services, and separately approves compensation for each artist assignment. Artists in this workflow receive HFL compensation; they do not take the HFL customer's payment as merchant of record. The public site is quote-first and the artist-pay obligation must remain independent of whether HFL received customer funds through Stripe, cash, check, or another approved channel.

This recommendation depends on Shawn confirming that characterization before live activation. If artists instead become independent sellers that set prices or contract directly with customers, the architecture must be reviewed again.

## Recommended Connect configuration

Create new artist recipients with Accounts v2 and only:

```text
dashboard: express
defaults.currency: usd
defaults.responsibilities.fees_collector: application
defaults.responsibilities.losses_collector: application
configuration.recipient.capabilities.stripe_balance.stripe_transfers.requested: true
```

Supply each artist's real two-letter country and legal entity type (`individual`, `company`, `non_profit`, or `government_entity`) at creation. Do not default or infer those fields. Do not request merchant, card-payment, direct-charge, destination-charge, `on_behalf_of`, or customer capabilities.

Why: a recipient configuration is designed for funds received through standalone Transfers where the connected account is not merchant of record. Express gives artists a Stripe-hosted dashboard while HFL retains operational responsibility for this compensation flow.

## Funds flow

```text
HFL Stripe available balance
  -> one standalone Transfer per owner-approved assignment
artist connected Stripe balance
  -> Stripe automatic standard Payout
artist bank account
```

The Transfer does not use `source_transaction`, `application_fee_amount`, or a customer charge association. `transfer_group` is a reconciliation label only. HFL must fund its available balance and preserve an owner-configured reserve before execution.

## Fees, losses, and negative balances

The application collects Connect fees and is responsible for connected-account losses under this configuration. Phase one never silently reduces approved artist compensation for fees. HFL should absorb fees unless Shawn approves a prospective, legally reviewed compensation-policy change. Transfer reversals and negative-balance recovery require an owner-reviewed runbook and may never be attempted blindly.

Stripe's account-specific Connect pricing, contracted rates, and any applicable per-account, payout, cross-border, or currency-conversion charges were not available through the current read-only Stripe context and are therefore **unverified**. No rate is assumed in the product or this recommendation. Before live activation, the owner/finance reviewer must obtain the current pricing that actually applies to the HFL platform from the Stripe Dashboard or Stripe account team, record its effective date and source, and validate observed fees in an approved Sandbox and then the controlled live pilot. That unresolved pricing evidence is a launch blocker, not permission to reduce artist pay.

## Onboarding and account management

- Use a v2 Stripe-hosted Account Link for the `recipient` configuration.
- Collect `eventually_due` and future requirements up front.
- The owner creates a source-bound HFL invitation consisting of an authenticated portal URL and a separate high-entropy one-time verification code. Deliver the code out of band only to the exact authoritative roster mailbox; never put the link and code in one message or expose the raw Stripe Account Link.
- A portal preview GET is non-mutating. The same-origin confirmation POST must match the authoritative email and one-time code before the claim is consumed and the Account Link is created. Five wrong-code attempts durably lock the claim; a successful challenge consumes exactly once.
- A return URL is not completion evidence. Retrieve the Account and require recipient transfers active, payouts active, no blocking current requirements, matching environment, and matching HFL artist metadata.
- Before activation, an owner independently reviews the exact payee identity, re-resolves the signed roster and current Account/destination, and supplies only an opaque evidence reference. D1 stores that verification immutably; it must not store legal identity, tax, bank, or document data.
- Reuse an existing verified artist mapping. Never create duplicates automatically.

## Transfers, payouts, and reconciliation

Monday and Wednesday are HFL transfer-processing days, not bank-arrival promises. Phase one uses automatic standard payouts. Each Transfer uses the permanent internal unique obligation and the deterministic Stripe idempotency key:

```text
hfl-artist-transfer:{assignment_id}:{approved_revision}
```

Mark `Transfer Created` only after create plus Stripe readback. Mark `Paid` only when an authoritative `payout.paid`/reconciliation-completed state and connected-account balance-transaction query prove the payout contains the Transfer's destination payment. Mark cross-system `reconciled` only after the Booking Control Center safe projection independently reads back exactly.

Recipient readiness retrieves Balance Settings and admits only enabled automatic `daily`, `weekly`, or `monthly` payout schedules. It also fails closed if any external account advertises Instant Payouts. That source/test control is not proof that Instant Payouts are disabled for the HFL platform: the owner must verify and record the Dashboard setting in Sandbox and again before live activation.

## Event topology

Use separate routes, event destinations, and signing secrets:

- Accounts v2 thin events: requirements, future requirements, recipient capability, recipient configuration, Account updates, and optional Account Link returned.
- Connected-account v1 snapshot events: payout created/updated/paid/failed/canceled/reconciliation completed, external payout account changes, and transfer created/updated/reversed.

The v2 handler retrieves current Account state. The v1 handler retrieves current Transfer/Payout state. Both use raw-body signatures, permanent D1 event-ID uniqueness, environment checks, retry-safe state transitions, and safe logging.

## Tax boundary

Stripe identity/onboarding does not decide contractor classification or tax reporting. HFL's CPA/legal adviser must approve classification, payer entity, form/threshold, reportable components, treatment of reimbursements and non-Stripe payments, state obligations, and whether Stripe tax-form services will be used. Stripe Tax for customer sales tax is a separate product.

## Required owner decisions before live activation

1. Confirm HFL is the customer-facing principal and artists are compensation recipients.
2. Approve Accounts v2 recipient accounts with Express Dashboard.
3. Accept application fee/loss responsibility and Stripe's platform-liability acknowledgement.
4. Confirm HFL absorbs fees without reducing approved compensation.
5. Approve US/USD-only phase one or provide the actual country/currency scope.
6. Confirm where each artist's legal entity type comes from.
7. Decide which existing connected accounts, if any, must be verified and reused.
8. Approve hosted onboarding, `eventually_due` collection, separate link/code delivery, five-attempt lockout, and the owner-only immutable payee-identity review/evidence-reference procedure.
9. Confirm automatic standard payouts, verify Instant Payouts are disabled in the Stripe Dashboard, and approve the Monday/Wednesday cutoff/snapshot policy.
10. Set `PAYOUT_MIN_RESERVE_CENTS` and the funding/top-up policy.
11. Approve reversal, erroneous-payment, and negative-balance procedures.
12. Approve customer/artist-facing definitions of Transfer Created, Payout Pending, and Paid.
13. Obtain CPA/legal tax decisions.
14. Reconcile the current Payout SOP and recent Stripe-payment language before any new promise.

## Primary references

- https://docs.stripe.com/connect/accounts-v2
- https://docs.stripe.com/connect/marketplace/tasks/create
- https://docs.stripe.com/connect/marketplace/tasks/onboard
- https://docs.stripe.com/connect/marketplace/tasks/accept-payment/separate-charges-and-transfers
- https://docs.stripe.com/connect/account-balances
- https://docs.stripe.com/connect/payouts-connected-accounts
- https://docs.stripe.com/payouts/reconciliation
- https://docs.stripe.com/connect/tax-reporting
