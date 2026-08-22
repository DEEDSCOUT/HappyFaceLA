# 10 — Idempotency evidence

Status: **IMPLEMENTED IN SOURCE/SCHEMA; PROVIDER RETRY PROOF PENDING SANDBOX**

## Permanent obligation identity

Each environment admits one ledger obligation per Assignment ID. Each approved source revision derives a deterministic Stripe key:

`hfl-artist-transfer:{assignment_id}:{approved_revision}`

The same financial facts also produce a persisted idempotency fingerprint. D1 enforces unique environment/fingerprint, unique ledger/batch attempt, and unique ledger/environment/source revision.

Onboarding has its own one-time identities. A high-entropy code is normalized and HMAC-bound to environment, artist, Account, claim nonce, and roster revision. The portal preview and refresh GETs do not consume it. A same-origin confirmation POST must also match the authoritative roster email; wrong codes durably count toward a five-attempt lock, while one correct challenge consumes the claim exactly once and creates one retained onboarding session.

## Control sequence

1. Material source facts are digested and snapped into the batch.
2. Owner approval binds the exact batch digest and revision.
3. D1 atomically claims the batch and assignment before a Stripe write.
4. One permanent Transfer-attempt row retains amount, destination, source revision, key/fingerprint, retry count, and outcome.
5. After create, Stripe readback must match amount, currency, destination, transfer group, metadata, and mode before `TRANSFER_CREATED` is persisted.

## Ambiguity recovery

An ambiguous create response remains claimed and opens an exception; a browser retry cannot create a second obligation. Recovery paginates destination Transfers and accepts only one exact fingerprint match. Zero, multiple, mismatched, or wrong-mode candidates fail closed for owner review.

The exceptional manual-payment rail also persists the exact owner-confirmed intent before the signed CRM write. If CRM committed but D1 finalization failed, retry is admitted only for the sole exact `EXISTING_PAYOUT_PROJECTION_PRESENT` condition with the matching durable manual intent, and only after a separately signed CRM readback equals the expected persisted projection. It then reclaims/finalizes the same intent rather than recording another payment.

Declared tests cover onboarding challenge binding/lock/single consumption, double execution, D1 failure after Stripe, same-key recovery, complete inventory pagination, ambiguous duplicate candidates, and committed-CRM/D1-finalization-failure recovery for the manual rail. Actual Stripe retry-window behavior and provider object recovery remain unproven until Sandbox acceptance is run.
