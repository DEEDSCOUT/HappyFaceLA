# 11 — Concurrency evidence

Status: **DATABASE/WORKER DEFENSES IMPLEMENTED; DISTRIBUTED RUNTIME PROOF PENDING**

## Batch execution

- One environment execution lease prevents two batches from moving money concurrently in the same environment.
- Claim-token compare-and-swap binds the approved batch digest/revision and current processing date. A stale recovery must present the exact prior token and rotate to a new token.
- Each ledger item is separately claimed with its immutable snapshot before Stripe create.
- Uniqueness constraints prevent a second permanent Transfer attempt for the same obligation/revision.
- A stale execution lease has a bounded, owner-audited recovery path; ordinary browser retries do not take it over. A delayed former worker re-reads the batch and is fenced if its token was rotated before it can handle the provider outcome or persist Transfer success/failure.
- Recovery reuses the same deterministic Stripe idempotency identity. The concurrency regression proves two provider calls converge on one provider object, one durable Transfer result, and one success audit without a false persistence-failure exception.
- Batch preparation admits at most ten reviewed candidates per batch. The candidate query returns the exact remaining count for a later batch, and the transaction keeps every generated D1 statement within the enforced 100-bind test ceiling while atomically inserting the batch/items, claiming ledgers, binding blocked exceptions, and appending audits.

## Onboarding and activation

- A claim's durable failed-attempt and lock state prevents concurrent wrong/correct submissions from bypassing the five-attempt ceiling; successful consumption is a single compare-and-swap transition.
- Owner activation re-resolves the current signed roster, exact connected Account, readiness, and payout destination, then atomically inserts the immutable payee-identity verification and activates that exact mapping. Repeated activation or an intervening roster/Account/destination change fails closed.

## Webhook processing

- Durable receipt precedes processing.
- Each worker must hold the exact event processing token and an unexpired lease.
- The lease is renewed before and after guarded repository/provider operations and before completion.
- Renewal requires the current token and a still-live prior lease, preventing an old worker from reviving ownership.
- A replacement worker may recover an expired lease with a new token; the prior worker is fenced after a delayed provider response and before state mutation.

Declared tests cover onboarding lock/single consumption and activation immutability, two-tab/double-click behavior, environment execution-lease exclusion/recovery, rotated-claim fencing during a delayed Stripe create, the ten-item/remaining-candidate batch partition, event replay, lease renewal beyond five minutes, and worker takeover during delayed Stripe retrieval. These are local deterministic cases, not a Cloudflare/D1 load or failure-injection run.

Required acceptance: concurrent preview/approve/execute requests, delayed provider responses, webhook retries, D1 contention, and worker termination must be exercised against the actual nonproduction deployment and Sandbox before launch certification.
