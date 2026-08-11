# RECEIVER-01 — Downstream Idempotency and Strict Acknowledgement

Status: proposal only. No Make, Gmail, Google Sheets, webhook, secret, or live
lead change is authorized by this packet.

## Admission gate

A fresh read-only export of the **actually deployed** active Make scenario was
captured on 2026-08-10 at 22:42:58 PT. Scenario `5090554`, `Integration
Webhooks`, exported raw SHA-256:
`b1baa6a1967f47c816cadf3c28928867f5bb1202560180b33463468c8b428a68`.
Only a sanitized structural derivative is admitted to the external evidence
folder; connection and destination identifiers are excluded. No run, save,
customer-row view, webhook, Gmail, or Sheet action occurred.

Current deployed flow:

```text
Custom webhook -> Router
  route 1 -> Gmail / Send an email
  route 2 -> Google Sheets / Search Rows -> Google Sheets / Add a Row
```

Current deployed settings and mappings:

- scenario active; instant webhook; blueprint version 1;
- `Process data in order = false`;
- `Store incomplete executions = false`;
- `Commit after each module = true`;
- `Commit trigger last = true`;
- `Keep data confidential = false`;
- `Enable data loss = false`;
- Gmail route has no filter and maps canonical `lead_id` into the message;
- Sheet Search Rows tests column B equal to `{{1.lead_id}}`;
- Sheet Add a Row runs when search result length is zero and `lead_id` exists;
- the blueprint contains five `lead_id` references and zero `leadId` references;
- no `x-idempotency-key` reference or equality check exists;
- no receipt Data Store, atomic claim, separate effect-state ledger, retry/error
  handler, or Webhook Response module exists.

The June evidence is no longer being used as a substitute. The fresh export
proves the current receiver does **not** meet the strict acknowledgement and
idempotency contract, so this packet is required before normal unsupervised
production traffic can rely on automatic receiver retry.

## Current-state inspection result

The fresh sanitized blueprint/settings evidence establishes:

- scenario ID/name/active state: proved;
- deployed `lead_id` body mapping: proved;
- `x-idempotency-key` consumption/equality: absent;
- signed-request validation: absent from the blueprint;
- Sheet uniqueness: search-then-add only, not an atomic claim;
- Gmail duplicate guard: absent;
- concurrency: possible because ordered processing is off;
- strict response: absent because there is no Webhook Response module;
- partial-success representation/recovery: absent;
- exact new/duplicate/partial response bodies: unavailable because the
  receiver has no branch-specific response contract.

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
