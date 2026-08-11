# RECEIVER-01 — Downstream Idempotency and Strict Acknowledgement

Status: proposal only. No Make, Gmail, Google Sheets, webhook, secret, or live
lead change is authorized by this packet.

## Admission gate

A fresh sanitized export of the **actually deployed** Make scenario is required
before this packet can be approved. The current Chrome session reached Make's
sign-in screen and did not authenticate automatically. Until the owner signs in
and a fresh export is preserved and hashed, current deployed behavior is
**unproved**.

The preserved June 10 blueprint and June 15 narrative are historical evidence,
not current proof. They indicate a custom webhook feeding Gmail and Google
Sheets, with a Sheet search-before-add guard, but do not prove atomic
concurrency control, header use, duplicate Gmail suppression, a last-position
Webhook Response, or strict acknowledgement.

## Required current-state inspection

The fresh sanitized blueprint/settings evidence must establish:

- exact scenario ID/name and active version/time;
- `Process data in order`, incomplete-execution, commit, confidential-data, and
  automatic rerun settings;
- whether the custom webhook exposes and validates `x-idempotency-key` and the
  signed request;
- whether canonical `lead_id` is the unique key at every branch;
- exact Gmail and Sheet branch order and filters;
- whether the Sheet guard is an atomic claim or only search-then-add;
- whether Gmail is independently replayable;
- whether a Webhook Response is the final module;
- exact response status/body for new, duplicate, partial, and failed runs;
- whether partial Gmail/Sheet success can be represented and resumed without
  replaying the completed effect.

## Required receiver contract

The receiver may acknowledge durable acceptance only with:

```json
{
  "ok": true,
  "leadId": "<exact lead_id>",
  "destination": "make",
  "persisted": true,
  "duplicate": false
}
```

An already completed, byte-identical replay may return the same contract with
`duplicate: true`. A generic 2xx, `Accepted`, `{ "ok": true }`, redirect,
timeout, mismatched ID/destination, malformed response, or acknowledgement sent
before durable state is ambiguous and must not be marked delivered.

## Proposed Make architecture

1. Preserve the deployed scenario by exporting and hashing its blueprint and
   settings before any later change.
2. Enable `Process data in order` so webhook executions cannot overlap. Keep
   data loss disabled. Store incomplete executions, but disable blind automatic
   replay of an ambiguous customer-notification effect.
3. Add a Make Data Store named `HFLA Lead Receipt v1`, keyed exactly by
   `lead_id`, with fields for `payload_hash`, accepted timestamp, Gmail state,
   Sheet state, terminal state, and last error code. Add/Replace must have
   overwrite disabled for a new key.
4. At ingress, require valid canonical `lead_id`, require
   `x-idempotency-key == lead_id`, verify the approved request signature, and
   compute/compare the canonical payload hash. Reject missing or conflicting
   identities before any side effect.
5. For a new identity, atomically claim the key before Gmail or Sheet work. For
   an existing identical terminal identity, skip every side effect and return
   strict `duplicate: true`. For an existing different hash, return a conflict
   and alert; never overwrite the first accepted payload.
6. Replace the unconditional parallel fan-out with effect-specific state:
   `pending -> dispatching -> sent`. Commit the `dispatching` marker before the
   external effect and `sent` only after success. A recovered `dispatching`
   state is ambiguous and requires exact-destination inspection; it is never
   blindly replayed.
7. Gmail and Sheet completion are tracked separately. A partial run resumes
   only the missing effect after the completed effect is proved. It never
   replays the full fan-out.
8. Replace Sheet search-then-add as the uniqueness authority. The Make Data
   Store key is the receipt authority; the Sheet is a projection. Keep the
   Sheet exact-`lead_id` search as defense in depth and surface any existing
   duplicate as an incident.
9. Place one Webhook Response module last, after both effect states are terminal.
   It returns the exact strict JSON contract and `content-type:
   application/json`. Error/partial paths must return non-2xx or a non-strict
   response so the Happy Faces LA outbox records ambiguity.
10. Enable confidential scenario data where operational debugging permits, and
    retain only minimized non-PII receipt state under Privacy / Attribution
    Policy v1.

Make's current documentation says instant webhooks run in parallel by default,
`Process data in order` serializes them, a Data Store key is unique and throws
when overwrite is disabled, and a scenario without a Webhook Response returns a
generic default `200 Accepted`. Those facts support the proposed controls but
do not prove the live scenario currently has them.

## Duplicate and partial-success rules

- New key + identical payload: execute each effect once, then strict
  `duplicate:false` acknowledgement.
- Existing terminal key + identical payload: execute nothing; strict
  `duplicate:true` acknowledgement.
- Existing key + different hash: conflict; no side effect.
- Gmail sent / Sheet not sent: never resend Gmail; repair/execute only Sheet.
- Sheet sent / Gmail not sent: never add another Sheet row; repair/execute only
  Gmail.
- Effect left `dispatching`: manual exact-ID inspection; no automatic resend.
- Response lost after strict completion: replay returns strict duplicate true
  without effects.

## Deterministic acceptance tests

Use only a separately approved non-production receiver and synthetic addresses:

1. first new receipt;
2. identical sequential duplicate;
3. concurrent duplicate pair;
4. same lead ID with changed payload hash;
5. missing/mismatched idempotency header;
6. invalid signature;
7. Gmail failure before dispatch;
8. response loss after Gmail dispatch;
9. Sheet failure before add;
10. response loss after Sheet add;
11. each partial-success direction;
12. strict new and strict duplicate response bodies;
13. generic 2xx and malformed response rejected by the HFLA fixture;
14. proof that one lead ID yields at most one Sheet row and one owner email.

Before/after evidence must include sanitized blueprint exports and SHA-256,
scenario settings, Data Store structure (no customer rows), module/filter map,
strict response fixtures, execution IDs, exact synthetic lead IDs, destination
reconciliation, and rollback evidence.

## Rollback

Before rollback, set Happy Faces LA automatic receiver retry to empty and stop
unsupervised cutover traffic. Preserve the new Data Store and execution evidence.
Reactivate the old receiver only as a temporary supervised path; generic 2xx
remains ambiguous and must not be interpreted as strict persistence. Do not
delete receipt keys or rewrite execution history. A rollback that resumes
unfenced Gmail/Sheet fan-out is not normal production readiness.
