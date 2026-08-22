# Artist communications and policy migration

Status: reusable drafts only; owner approval remains pending. This project created no Gmail draft, sent no message, and contacted no artist. A read-only search did observe two unrelated historical artist-assignment sends, so this is not a global no-activity claim. Every template remains blocked until the corresponding system state, owner approval, policy version, and recipient are authoritative.

## Current assignment-language audit

The newest reviewed synthetic assignment message contains this exact current payment paragraph:

> Paid after the event and closeout is confirmed. Same day payment is our goal when closeout is on time and there are no unresolved issues. This internal assignment shows artist compensation only; customer pricing and margins are intentionally excluded.

Its confirmation checklist also asks for:

> Your preferred payment method and exact handle or name.

That language conflicts with the intended prospective Stripe rail and can imply same-day receipt. Recent read-only Gmail review also found an artist who did not know the rail before acceptance, a one-time legacy-method exception, and a duplicate confirmation request. Historical messages and accepted terms remain evidence and must not be rewritten.

## Proposed assignment payment section

Use only after owner approval and prospective rollout activation:

```text
Artist Pay

Service pay: $[SERVICE PAY]
Travel pay: $[TRAVEL PAY]
Approved bonus/adjustment: $[BONUS OR ADJUSTMENT]
Approved deduction: $[DEDUCTION]
Total artist pay: $[TOTAL ARTIST PAY]

Payout method: Stripe-hosted artist payout.

Happy Faces LA processes approved artist payouts every Monday and Wednesday after required event closeout is completed and verified. Bank delivery timing is determined by Stripe and the receiving financial institution.

Required closeout includes your completion confirmation, actual end time, and resolution of any extra time, service change, travel pay, adjustment, complaint, refund, damage, or supply issue affecting pay. Monday and Wednesday are processing days, not guaranteed bank-arrival dates.
```

Replace the current confirmation item requesting a payment method/handle with:

```text
Confirm that you have read and accept the total artist pay, Stripe payout method, closeout conditions, and Monday/Wednesday processing policy stated above.
```

## Exact changed fields

| Assignment field/section | Current behavior | Prospective behavior |
|---|---|---|
| Service pay | Total may be shown without component structure | Explicit service-pay amount |
| Travel pay | Not consistently separated in the message | Explicit amount, including zero |
| Bonus/adjustment/deduction | Not consistently enumerated | Explicit components and exact total equation |
| Payment rail | Artist is asked for a method and handle | Stripe-hosted payout stated before acceptance |
| Timing | Same-day payment described as a goal | Monday/Wednesday HFL processing after verified closeout |
| Bank delivery | Not distinguished from HFL processing | Explicitly controlled by Stripe/financial institution and not guaranteed |
| Closeout | General closeout reference | Exact required closeout categories |
| Acceptance | Confirms assignment plus payment handle | Confirms compensation, rail, closeout, and policy version |
| Policy version | Not present | Store and display the approved assignment-policy version |

Backward compatibility: retain every historical Zelle, Venmo, cash, Cash App, check, or other accepted record exactly. A previously accepted assignment keeps its agreed terms unless the artist and owner prospectively agree to a documented change. Post-cutover non-Stripe payment is only `MANUAL_PAYMENT_EXCEPTION` with owner approval and reconciliation.

Rollout recommendation: use the new language only for assignments first offered on or after a separately owner-approved effective date that is later than production Connect activation and template approval. Do not infer or hard-code that date. Before the first offer, verify that the artist can access the authenticated HFL onboarding portal and that the assignment displays the exact component amounts and policy version.

## Shared controls for every template

- Send only from an authorized Happy Faces LA workflow after the state named in the template is authoritatively verified.
- Never include a raw single-use Stripe Account Link. Use the authenticated HFL portal link.
- Never place the authenticated portal link and its one-time verification code in the same message. Deliver the code separately and only to the exact authoritative roster mailbox; do not retain the code in drafts, logs, or evidence.
- Never request banking, routing, debit-card, SSN, tax-ID, identity-document, or Stripe verification data by email or text.
- Never include customer pricing, margin, private address, or unrelated artist information.
- Suppress duplicates by message type, ledger revision, and recipient; an already-recorded delivery requires an explicit owner-reviewed resend.
- Monday/Wednesday means HFL processing, not bank arrival.

## 1. Stripe onboarding invitation

Subject: `Action required: set up your Happy Faces LA artist payout account`

```text
Hi [ARTIST PREFERRED NAME],

Happy Faces LA is preparing your Stripe-hosted artist payout account for future approved assignments.

Open the secure Happy Faces LA portal below to continue:
[SECURE HFL PORTAL LINK]

Your one-time verification code will be delivered separately to the authoritative email address on the Happy Faces LA artist roster. For your security, do not forward either message or combine the portal link and code.

Stripe will collect and protect the identity, tax, and bank details it requires. Please do not email or text those details to Happy Faces LA.

This invitation does not create a payment, approve an assignment, or guarantee payout readiness. After Stripe reports the required information complete, an authorized owner must independently verify the payee identity, re-resolve the signed roster and exact current Account, readiness, and payout destination, and record only an opaque evidence reference before activating that exact account.

Portal invitation expires: [EXPIRATION DATE AND TIME, AMERICA/LOS_ANGELES]
Artist ID: [ARTIST ID]

If the portal reports that the invitation expired, contact Happy Faces LA at (310) 800-2860 so an authorized owner can review and issue a replacement.

Happy Faces LA
info@happyfacesla.com
```

## 2. Onboarding reminder

Subject: `Reminder: complete your Happy Faces LA Stripe payout setup`

```text
Hi [ARTIST PREFERRED NAME],

Your Happy Faces LA Stripe payout setup is still incomplete. Please use the authenticated Happy Faces LA portal:
[SECURE HFL PORTAL LINK]

Use only the separately delivered one-time verification code for this invitation. Happy Faces LA will never send the portal link and code in the same message.

Complete the steps directly with Stripe. Do not send bank, tax, identity, or verification documents to Happy Faces LA by email or text.

This reminder does not change any assignment or payment status. If Stripe shows an issue or the portal invitation has expired, contact us at (310) 800-2860.

Artist ID: [ARTIST ID]

Happy Faces LA
```

## 3. Onboarding incomplete notice

Subject: `Your Stripe payout setup is not yet ready`

```text
Hi [ARTIST PREFERRED NAME],

Stripe currently reports that your Happy Faces LA artist payout setup is not complete. Until the required items are resolved and an authorized owner completes the independent identity review and exact-account activation, assignments cannot be marked payout-ready through Stripe.

Use the authenticated portal to review the current Stripe-hosted steps:
[SECURE HFL PORTAL LINK]

For your privacy, submit all identity, tax, and bank information only inside Stripe. Do not reply with sensitive documents or numbers.

Safe status: [REQUIREMENTS PENDING OR RESTRICTED]
Last checked: [DATE AND TIME]
Artist ID: [ARTIST ID]

Happy Faces LA
```

## 4. Payout approved notice

Subject: `Approved for a Happy Faces LA payout batch — [BOOKING ID]`

```text
Hi [ARTIST PREFERRED NAME],

Happy Faces LA approved the following artist compensation for the [BATCH DATE] processing batch:

Booking ID: [BOOKING ID]
Assignment ID: [ASSIGNMENT ID]
Event date: [EVENT DATE]
Service: [SERVICE]
Approved total: $[AMOUNT]

Approved means the exact assignment revision passed review. No funds have moved yet, and this is not a paid confirmation. Happy Faces LA processes approved artist payouts every Monday and Wednesday after required event closeout is completed and verified. Bank delivery timing is determined by Stripe and the receiving financial institution.

If any listed detail is wrong, contact us before processing at (310) 800-2860.

Happy Faces LA
```

## 5. Payout processing notice

Subject: `Happy Faces LA payout processing started — [BOOKING ID]`

```text
Hi [ARTIST PREFERRED NAME],

Happy Faces LA has begun Stripe transfer processing for this approved assignment:

Booking ID: [BOOKING ID]
Assignment ID: [ASSIGNMENT ID]
Event date: [EVENT DATE]
Service: [SERVICE]
Amount: $[AMOUNT]

Processing started does not mean the bank payout has arrived. Stripe and the receiving financial institution control payout and bank-delivery timing. We will use authoritative Stripe evidence before marking the assignment paid.

Safe status: Transfer processing

Happy Faces LA
```

## 6. Payout failed notice

Subject: `Action needed for your Happy Faces LA payout — [BOOKING ID]`

```text
Hi [ARTIST PREFERRED NAME],

Stripe has not completed the payout for the assignment below:

Booking ID: [BOOKING ID]
Assignment ID: [ASSIGNMENT ID]
Amount: $[AMOUNT]
Safe status: [FAILED OR RESTRICTED]

Your approved compensation record remains on file. Do not send bank, card, tax, or identity information by email or text. Use the authenticated Happy Faces LA portal for any Stripe-hosted action:
[SECURE HFL PORTAL LINK]

Safe next step: [OWNER-APPROVED ACTION]

For questions, contact Happy Faces LA at (310) 800-2860.
```

## 7. Stripe information-required notice

Subject: `Stripe needs information for your Happy Faces LA payout account`

```text
Hi [ARTIST PREFERRED NAME],

Stripe reports that information is required for your Happy Faces LA artist payout account. Happy Faces LA does not receive or collect the sensitive verification details.

Review the request only through the authenticated Happy Faces LA portal and Stripe-hosted flow:
[SECURE HFL PORTAL LINK]

Do not email or text bank account numbers, routing numbers, debit-card numbers, SSNs, tax IDs, or identity documents.

Safe status: [REQUIREMENTS PENDING OR RESTRICTED]
Last checked: [DATE AND TIME]
Artist ID: [ARTIST ID]

Contact us at (310) 800-2860 if the portal is unavailable. Happy Faces LA cannot bypass Stripe's verification requirements.
```

## Paid message boundary

No generic eighth “paid” draft is approved here. A paid notice may be generated only after the system proves the automatic Payout is paid and reconciliation-completed, the exact destination payment is a member of that Payout, and the safe Booking Control Center projection reads back. Until then, use only Approved or Processing language.
