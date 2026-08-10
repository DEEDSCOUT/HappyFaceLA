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
- Owner notification is designed for at-least-once delivery from a unique durable row. A
  five-minute lease prevents concurrent retries, failures become
  `failed_retryable`, and a duplicate transport retry can redeliver the original
  canonical payload. Each claim has a cryptographic fencing token, so an expired
  worker cannot finalize over a newer worker. The stable `lead_id` is sent as the downstream
  idempotency key. A production queue processor and alert remain separately
  approval-gated; without them, failed rows retry only if the same customer
  request is replayed and the design is not production-ready.
- Packages/Contact notifications retain the admitted production Make envelope
  (`leadId`, `submittedAt`, and nested `lead.*`) alongside the new flat canonical
  fields. The sanitized compatibility projection is persisted inside the
  canonical payload, so a lost-response retry cannot combine the original lead
  with current-request attribution. The existing route-specific
  `x-lead-source` headers are preserved and `x-idempotency-key` is the stable
  `lead_id`.
- Heuristic spam is conversion-suppressed but remains owner-notification
  eligible, because customer prose or multiple inspiration links cannot safely
  prove a bot. Honeypot traffic remains silent. An internal test is silent only
  when `internal_test=true` is paired with a valid owner-controlled
  `x-hfla-internal-test-token`; customer phrases such as “do not book yet” never
  classify a lead as an internal test by themselves.

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

Default browser attribution is memory-only. Session storage is disabled unless
both `transientStorageAllowed` and `consentGranted` are explicitly configured.
Persistent storage additionally requires `persistentStorageAllowed` and a
positive configured retention period. Revocation removes the AP-03 session and
local-storage records best-effort. No production TTL or consent-signal mapping
is assumed here. Owner and privacy approval are still required for:

- persistent retention duration;
- consent-signal mapping and revocation behavior;
- click-ID/referrer retention policy;
- cross-channel credit policy;
- any hashed user-provided data, Enhanced Conversions, Data Manager, or upload.

No production code currently supplies `__HFLA_ATTRIBUTION_CONFIG__`. Therefore
the engineering default loses cross-page attribution after a full navigation
and purges the legacy record. That is privacy-safe but not an approved
production attribution policy. A production release remains blocked until the
owner chooses the storage/consent policy and its expiry/deletion behavior.

This branch also changes Packages/Contact from webhook-only delivery to durable
D1 persistence of customer contact data and atomic attribution. No production
retention purge or data-subject access/deletion workflow exists yet. Those
decisions are separate from, and precede, any future Google customer-data
delivery.

## Database migration gate

`migrations/d1/20260810_ap02a_ap03a_canonical_form_identity.sql` is a draft. The
repository does not contain the authoritative migration that originally created
the production `quote_requests` table. Before applying this migration, export and
freeze the current production schema read-only, reconcile it to the draft, and
obtain a separate owner approval.

The 2026-08-10 read-only production export established that the admitted
`quote_requests` table has 100 columns, nine explicit indexes, and legacy checks
that require `idempotency_key` to be `qrq_*`, `source` to be
`plan-my-party`, and `delivery_status` to use one of two existing values. The
AP-02 code therefore keeps the public identity as `sub_*` in the additive
`lead_submission_identity` table, writes a deterministic `qrq_*` compatibility
key to `quote_requests`, preserves the legacy `source` value, and stores the
authoritative form route in the additive identity row, `source_page`, and the
canonical payload. The draft migration is additive and does not rebuild or
relax the legacy table.

An exact no-customer-data production-schema fixture is exercised by
`tests/db/production-schema-compatibility.mjs`. This is not authorization to
apply the migration. Production migration tooling and rollback still require a
separately admitted execution packet.

## Bounded old-client compatibility

A deployment may explicitly set both `LEGACY_FORM_COMPAT_STARTED_AT_UTC` and
`LEGACY_FORM_COMPAT_UNTIL_UTC`. The server rejects compatibility mode unless the
complete configured window is no longer than 14 days and the current time falls
inside it. Modern-looking but incomplete payloads never fall back to this mode.

- Old Plan My Party clients retain their stable `qrq_*` key. The server maps it
  deterministically to one `sub_*` identity, and a retry returns the same lead.
  A pre-cutover `quote_requests` row is returned without creating a second row.
- Old Packages and Contact clients did not send a durable client identity. They
  remain deliverable during the bounded window, but the server cannot prove a
  transport retry is the same logical submission. Each accepted request gets a
  new opaque identity, remains notification-eligible, and is suppressed from the
  canonical conversion outcome as `legacy_client_compatibility`.
- Compatibility is fail-closed outside the explicit window. Retirement requires
  confirming that cached/open-tab traffic has fallen to zero, removing the two
  compatibility environment values, and monitoring duplicate owner records
  during the window.

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
3. an owner-approved activation and retirement time for the bounded old-tab
   compatibility path, with duplicate monitoring for no-ID `/api/lead` clients;
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

A raw rollback to the pre-AP02 application SHA is not safe after new browser
code has been served: the old APIs do not return the new
`accepted/persisted/created` response contract. The production packet must first
produce and test a forward-contract-compatible rollback build that can suppress
shadow writes without making already-open new clients display failure or retry a
lead that the old server actually accepted.

That packet must not create or activate a Google Ads conversion action, change
current conversion roles, enable an uploader, or upload customer data.
