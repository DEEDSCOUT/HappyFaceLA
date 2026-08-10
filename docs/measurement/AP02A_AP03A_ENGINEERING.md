# AP-02A / AP-03A Engineering Contract

Status: engineering and deterministic tests only. No migration, deployment, live
form submission, analytics configuration, Google Ads action, or customer-data
upload is authorized by this document.

## Canonical flow

```text
/plan-my-party/ -> /api/quote-request --\
/packages/      -> /api/lead ---------+-> shared server acceptance
/contact/       -> /api/lead ---------/       |
/hire-face-painter-los-angeles/ -> /api/quote-request (existing custom-form compatibility)
                                                +-> lead_submission_identity
                                                +-> quote_requests
                                                +-> canonical_lead_outbox (shadow only)
                                                +-> lead_notification_outbox
```

The identity, canonical lead, shadow outcome, and eligible notification-outbox
writes require one D1 `batch`. A repeated
`submission_id` returns the original `lead_id`. A repeated identity with a
different normalized payload hash fails with HTTP 409 and does not overwrite the
first accepted lead.

## Identity and outcome rules

- Browser submission IDs are `sub_` plus 128 cryptographically random bits.
- Lead IDs are opaque `lead_` plus 128 cryptographically random bits.
- A logical retry retains its submission ID through in-flight retry and browser
  back/restore behavior.
- A new form edit after a completed submission rotates to a new submission ID.
- Different submission IDs from the same person remain different leads. Business
  deduplication is a later owner/review decision using
  `business_duplicate_of_lead_id`; history is never deleted.
- `canonical_lead_outbox` is internal shadow plumbing only. It has no uploader
  and does not name or activate a Google Ads conversion action.
- The outbox unique constraints enforce one `genuine_form_lead` candidate row per
  lead/submission. A technically valid intake is held as `shadow_pending` with
  `conversion_eligible=0` until business classification proves it is genuine.
  Internal-test and spam rows are `suppressed`. Nothing is upload-eligible in
  AP-02A/AP-03A.
- Honeypot requests receive a neutral response but create no lead, notification,
  analytics-eligible response, or outbox row.
- Owner notification is at-least-once delivery from a unique durable row. A
  five-minute lease prevents concurrent retries, failures become
  `failed_retryable`, and a duplicate transport retry can redeliver the original
  canonical payload. Each claim has a cryptographic fencing token, so an expired
  worker cannot finalize over a newer worker. The stable `lead_id` is sent as the downstream
  idempotency key. A production queue processor and alert remain separately
  approval-gated.

## Route behavior

| Route | Browser endpoint | Server adapter | Existing browser events |
| --- | --- | --- | --- |
| `/plan-my-party/` | `/api/quote-request` | native Plan My Party payload | `hfla_quote_submit` only for newly created, eligible durable acceptance |
| `/packages/` | `/api/lead` | channel-neutral Packages adapter | `packages_form_submit` and existing `generate_lead`, only for newly created, eligible durable acceptance |
| `/contact/` | `/api/lead` | Contact-family adapter | `quote_form_submit` and existing `generate_lead`, only for newly created, eligible durable acceptance |
| `/hire-face-painter-los-angeles/` | `/api/quote-request` | Existing custom form preserved on the shared Plan acceptance contract | Existing `hire_face_painter_form_submit`, only for newly created, eligible durable acceptance |

No event role is changed. In particular, this branch does not promote
`generate_lead`, create a conversion action, or alter Google Ads/GA4/GTM.
The browser events intentionally do not hardcode MV-5 or a successor version;
the effective Conversion Definition Version must be supplied at the separately
approved production cutover timestamp.

## Atomic attribution

The versioned browser/server contract has three independent envelopes:

- `first_touch`: set once for the journey.
- `latest_qualifying_touch`: replaced as one whole envelope when a recognized
  click ID, UTM envelope, or external referrer arrives.
- `submit_touch`: freshly captured from the actual submission page and never
  backfilled with stale campaign fields.

Each envelope allowlists only `gclid`, `gbraid`, `wbraid`, the five standard UTM
fields, landing path, source path, sanitized referrer, capture timestamp, and
server-recomputed source confidence. Landing/source values are paths, not raw
query strings. Referrers retain only HTTP(S) origin and path. Unknown query
parameters, fragments, credentials, control characters, and unsafe protocols are
discarded.

The old fieldwise `hfla_attribution` browser record is never imported. The new
client removes it best-effort from session and local storage so previously stored
arbitrary query-string data is not carried forward.

Compatibility columns remain projections from one selected envelope; they are
not the attribution source of truth.

## Retention and consent gates

Default browser storage is session-only. Persistent storage is disabled unless
both `persistentStorageAllowed` and `consentGranted` are explicitly configured.
Retention duration is configurable; no production TTL is assumed here. Owner and
privacy approval are still required for:

- persistent retention duration;
- consent-signal mapping and revocation behavior;
- click-ID/referrer retention policy;
- cross-channel credit policy;
- any hashed user-provided data, Enhanced Conversions, Data Manager, or upload.

## Database migration gate

`migrations/d1/20260810_ap02a_ap03a_canonical_form_identity.sql` is a draft. The
repository does not contain the authoritative migration that originally created
the production `quote_requests` table. Before applying this migration, export and
freeze the current production schema read-only, reconcile it to the draft, and
obtain a separate owner approval.

## PR #56 disposition

PR #56 remains intact and unmerged. This branch reworks only its valid intent:
gbraid/wbraid support, landing/source/referrer preservation, package attribution
coverage, and post-build measurement guards. It excludes Header Call/Text work,
pricing/package copy and presentation changes, channel-specific event labels, and
the flat field-merging implementation.

## Next separately approved Secondary-shadow packet

The next packet should be limited to:

1. read-only export/admission of the actual production D1 schema;
2. migration compatibility review and rollback rehearsal;
3. a bounded old-tab/cached-client cutover strategy (old `qrq_*` and no-ID
   `/api/lead` payloads are intentionally rejected by this engineering branch);
4. code plus migration deployment with `canonical_lead_outbox` remaining an
   internal, non-uploaded shadow table;
5. notification-outbox worker/monitor approval, retry policy, and downstream
   `lead_id` idempotency verification;
6. privacy-approved session/persistence configuration;
7. one separately authorized, clearly labeled synthetic form submission per
   route, suppressed from business and Ads outcomes;
8. reconciliation of identity row, canonical lead row, notification, and shadow
   row;
9. rollback on schema, route, notification, or duplicate-control failure.

That packet must not create or activate a Google Ads conversion action, change
current conversion roles, enable an uploader, or upload customer data.
