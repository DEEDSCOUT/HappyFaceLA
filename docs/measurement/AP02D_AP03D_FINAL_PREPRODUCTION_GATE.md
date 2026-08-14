# AP-02D / AP-03D Final Pre-Production Gate Packet

Status: **NOT READY — BLOCKERS REMAIN**

Scope: engineering, deterministic tests, read-only metadata, and approval
packets only. No migration, Worker deployment, Pages deployment, form
submission, production webhook, Make/Gmail/Sheets change, Google Ads action,
GA4/GTM change, persistent-attribution activation, or customer-data upload is
authorized.

The exact final application commit is frozen in the external implementation
evidence after the commit is created. The accepted starting checkpoint was
`a34bb6edaee50c07c4674612c0692be681c5457a`; production remains
`4bd6d29d4ec119e120d860d4697c3e9777d25bd2`.

## A — Privacy Policy v1 implementation

- `PRIVACY_ATTRIBUTION_POLICY_V1.md` records the owner-approved policy.
- Browser marketing attribution remains memory-only before applicable consent.
- Post-consent runtime configuration cannot exceed the exact 30-day coherent
  envelope TTL.
- Latest qualifying touch, first touch, and submit touch remain three distinct
  attribution roles.
- The additive D1 contract records classification, retention anchors, legal
  hold, deletion request/approval/completion, and redaction milestones without
  granting a generic operations-steward role.
- No production runtime currently supplies persistent attribution consent
  configuration. No Consent Mode, GA4/GTM, Data Manager, Enhanced Conversions,
  hashing, or upload is activated.

Implementation status: **local engineering PASS; production activation not
authorized**.

## B — Purge job and evidence

The branch contains a dedicated privacy-retention Worker candidate and one
idempotent purge engine with:

- dry-run and apply modes; apply is disabled by default;
- exact 30-day diagnostic, 180-day click-ID/audit, 24-month genuine-PII, and
  13-month shadow-outcome boundaries;
- genuine-lead PII deletion only after the later-business-event anchor is
  explicitly finalized;
- legal-hold and active-notification blocks;
- click-ID scrubbing from flat columns, coherent attribution JSON, canonical
  JSON, and any admitted offline outbox;
- PII redaction, opaque tombstones, and deletion-completion markers;
- historical-row discovery in dry-run before the controlled privacy-state
  backfill occurs;
- aggregate/non-PII durable run evidence with the exact initiating actor;
- bounded batches, fail-closed JSON validation, and duplicate run IDs;
- deterministic one-millisecond boundary, dry-run, idempotency, malformed-data,
  actor, missing-binding, and apply-gate fixtures.

Heuristic conversion suppression is not treated as final spam classification.
Those records remain `pending_business_classification` and are not eligible for
30-day destructive redaction until a separately governed owner classification
records `spam_bot_invalid`. That explicit reclassification write path remains
an AP-05/production-operations gate.

The AP notification outbox stores no separate notification payload; delivery
reconstructs from the governed canonical lead. Attempt/operator metadata is
purged at 180 days. External Gmail, Sheet, Make, export, or cache deletion is a
documented propagation gate and is not implemented or exercised here.

## C — Exact 72-hour legacy cutover

The server accepts legacy compatibility only when both values are valid RFC3339
UTC timestamps and `UNTIL - STARTED = 72 hours` exactly:

```text
LEGACY_FORM_COMPAT_STARTED_AT_UTC=<T0 exact UTC>
LEGACY_FORM_COMPAT_UNTIL_UTC=<T0 plus exactly 72 hours>
```

The start is inclusive; the end is exclusive. A 72-hour-plus-one-millisecond
window fails closed. No default or automatic extension exists. Exact T0 and end
remain deployment-window values and must be frozen before any deployment.

All legacy outcomes are suppressed. Old Plan My Party stable IDs remain
idempotent. Packages/Contact legacy requests have no durable original client ID,
so near-match duplicate monitoring is mandatory. End early for one confirmed
legacy-caused duplicate business record/notification, two suspected near-match
pairs in rolling 24 hours, or any notification-reliability incident. At the end,
remove both values, prove expired legacy payloads fail closed, and reconcile all
legacy rows.

## D/E — Fresh receiver proof and RECEIVER-01

A fresh deployed blueprint was exported read-only from active Make scenario
`5090554`, `Integration Webhooks`, on 2026-08-10 at 22:42:58 PT. Its raw
SHA-256 is
`b1baa6a1967f47c816cadf3c28928867f5bb1202560180b33463468c8b428a68`.
Only a sanitized structural derivative is admitted to the external evidence
folder; connection and destination identifiers are excluded. No scenario run,
save, customer-row view, webhook, Gmail, or Sheet action occurred.

The deployed scenario is active and uses:

```text
Custom webhook -> Router
  -> Gmail / Send an email (unconditional)
  -> Google Sheets / Search Rows (column B == lead_id)
     -> Google Sheets / Add a Row (only when result length == 0)
```

It consumes canonical `lead_id` and contains zero legacy `leadId` mappings, but
it does not consume or validate `x-idempotency-key`. `Process data in order` is
off, incomplete-execution storage is off, commit-after-each-module is on, and
confidential-data mode is off. The Sheet search-then-add guard is not an atomic
claim; Gmail has no duplicate filter; the two effects have no durable
partial-success state; and no Webhook Response module exists. Consequently the
live receiver returns no strict post-persistence acknowledgement and cannot
prove exactly-once external effects.

Verdict: **RECEIVER-01 is required.**
`RECEIVER01_DOWNSTREAM_IDEMPOTENCY_STRICT_ACK.md` now records the fresh current
state and exact proposed remediation. Automatic ambiguous retry remains empty.

## F — Notification Worker production-operations packet

Proposed production configuration (not created):

- Worker: `happyfacesla-notification-recovery`
- D1 binding: `NOTIFICATION_D1` -> `hfla-availability-production`, database ID
  `3ea0bd28-abba-4630-99d1-f30ab17c0c36`; no fallback binding
- Cron: `* * * * *`
- batch size: 20, code-bounded to 1–50
- retry schedule for a separately proved receiver: 60, 300, 900, 3,600, and
  21,600 seconds
- attempt ceiling: six total by default; hard maximum ten including audited
  operator retries
- lease: five minutes with a random per-claim fencing token
- stale Worker-run threshold: five minutes
- due-queue alert threshold: five minutes
- alert cooldown after successful delivery: 15 minutes for an unchanged
  fingerprint
- failed-alert retry: five minutes
- automatic retry destination list: empty until strict downstream idempotency is
  proved; then only the exact approved destination may be named
- ambiguous response/timeout/connection loss/expired unverified lease:
  `needs_review`, never blind retry
- invalid persisted payload, permanent error, or attempt exhaustion:
  `needs_review` with a durable dead-letter reason
- `abandoned` is an explicit audited terminal operator action, never an
  automatic state

Proposed protected operator surface (not created):

- `workers_dev=false`
- dedicated non-Pages custom domain
  `notification-ops.happyfacesla.com`
- routes limited to `GET /operator/health` and `POST /operator/recover`
- Cloudflare Access service-token policy named
  `HFLA Notification Operator — Shawn`; no public bypass
- application bearer secret `NOTIFICATION_OPERATOR_TOKEN`
- `NOTIFICATION_OPERATOR_TOKEN` must contain at least 32 characters and is
  rejected fail-closed when absent or shorter
- actor `NOTIFICATION_OPERATOR_ACTOR_ID=owner_shawn`
- every recovery requires a unique action ID, non-PII reason code, and explicit
  downstream-check confirmation; the D1 audit records the actor

Required secrets/configuration (not created): exact approved destination URL,
its shared HMAC secret, `NOTIFICATION_OPERATOR_TOKEN`, and an approved
`NOTIFICATION_ALERT_WEBHOOK_URL`. Access client ID/secret stay in the operator's
approved secret store, not in Worker source.

Recommended monitoring SLA for owner approval: Cron health checked each minute;
queue/run failure detected within five minutes; privacy-safe alert transport
attempted immediately; owner acknowledgement within 30 minutes during the
owner-approved staffed lead-response window and at the start of the next staffed
window otherwise. The exact staffed window and alert destination remain owner
operations choices; without them the Worker is not deployable.

Operator recovery: read aggregate health, retrieve only the affected opaque IDs
and delivery metadata, inspect the exact destination by lead ID, repair only the
missing effect, and then issue one fenced `mark_delivered`, `retry`, or
`abandon`. Never replay a composite Make fan-out after partial success.

Rollback: remove Cron and operator route, revoke Access/service/bearer secrets,
leave durable outbox/run/audit rows dormant, and keep application automatic
retry empty. Do not delete or rewrite delivery history.

## G — P2 hardening closure

The aggregate-alert race is closed. Health captures exact unalerted failed run
IDs plus a cutoff. Successful alert acknowledgement updates only those exact IDs
at or before that cutoff. A failure created while transport is in flight remains
unacknowledged for the next cycle. Tests also prove unchanged-alert cooldown,
changed-fingerprint immediate eligibility, failed-transport retry, stale-run
closure, lease fencing, and operator audit identity.

Status: **source-code P2 closed**. Production route, Access, secrets, alert
destination, and SLA remain approval/configuration gates.

## H — Migration rehearsal readiness

Production identity:

- database: `hfla-availability-production`
- database ID: `3ea0bd28-abba-4630-99d1-f30ab17c0c36`
- production application SHA:
  `4bd6d29d4ec119e120d860d4697c3e9777d25bd2`
- migration file:
  `migrations/d1/20260810_ap02a_ap03a_canonical_form_identity.sql`
- migration SHA-256:
  `f19515ab8dba0c5d61cefeeae8c1f144c4ff3086461ed60cebd5282b4a16dce3`

Fresh safe metadata read on 2026-08-10 at approximately 22:14 PT confirmed:

- `quote_requests`: 100 columns, nine explicit indexes, zero foreign keys;
- 121 rows; first `2026-06-13T18:19:34.973Z`, latest
  `2026-08-11T00:31:06.380Z`;
- zero AP-02D additive tables present;
- migration ledger row 1:
  `0004_quote_request_lead_completeness_fields.sql`, applied
  `2026-06-15 23:04:44`;
- migration ledger row 2:
  `0005_closed_loop_ads_attribution_outbox.sql`, applied
  `2026-07-07 13:45:34`;
- current Time Travel bookmark retrieved read-only at approximately 22:26 PT:
  `000000bf-00000000-000050c4-81df661cb732e6c73fbec5bbf07f836a`.

The local reconstructed rehearsal uses the admitted schema fixture SHA-256
`c2bd72c904305b3c0cfea99d76937a62dbf5fe45e432e71bf79026b614ff508c`.
It proves the original table/columns/indexes/foreign keys/row count are unchanged,
exactly eight additive empty tables and nine additive indexes appear, foreign-key
violations remain zero, and integrity is `ok`.

The exact one-purpose configuration for a later approved export/apply must be:

```toml
name = "hfla-ap02d-production-migration-operator"
compatibility_date = "2026-08-10"

[[d1_databases]]
binding = "PRODUCTION_D1"
database_name = "hfla-availability-production"
database_id = "3ea0bd28-abba-4630-99d1-f30ab17c0c36"
migrations_dir = "./approved-only"
migrations_table = "d1_migrations"
```

`approved-only` must contain exactly one file whose bytes and SHA-256 match the
final approved migration. It may contain no Worker route, script, secret, second
database, or other migration.

The full current production schema export was deliberately not run. Therefore
the local rehearsal is strong but not yet a final production migration rehearsal.

## I — Exact D1 export micro-approval required

Proposed low-traffic window: 2026-08-12 02:30–02:40 PT
(2026-08-12 09:30–09:40 UTC).

Requested action: one schema-only, no-customer-row export of database ID
`3ea0bd28-abba-4630-99d1-f30ab17c0c36`, using the one-purpose configuration,
followed by hashing and local-only reconciliation. No migration list/apply,
restore, write, deploy, or customer-row export is included. Stop on increased
latency, request failure, database mismatch, or any production incident.

Exact future command:

```text
npx wrangler d1 export hfla-availability-production --remote --no-data --output=<timestamped-schema-only.sql> --config=<approved-one-purpose-config>
```

Exact independent micro-approval still required:

```text
OWNER APPROVAL — D1-EXPORT-01 ONLY

Approve one schema-only, no-customer-row export of Cloudflare D1 database
hfla-availability-production, database ID
3ea0bd28-abba-4630-99d1-f30ab17c0c36, during 2026-08-12 02:30–02:40 PT
(09:30–09:40 UTC), using the one-purpose AP-02D configuration and exactly one
hash-verified migration candidate for local comparison only.

Do not apply a migration, deploy code or a Worker, restore Time Travel, export
customer rows, submit a form, call a webhook, modify Make/Gmail/Sheets, change
Cloudflare bindings, or change Google Ads/GA4/GTM. Stop on identity/hash/schema
mismatch, production latency/error, or any unrelated change. Return the export
hash, before/after local schema diff, quote_requests invariants, foreign-key and
integrity results, and migration-ledger reconciliation. Then stop for the next
owner gate.
```

## J — Forward-compatible rollback

The branch retains and tests `FORWARD_CONTRACT_ROLLBACK_MODE=true`. It accepts
new clients' secure submission identity and response contract, preserves one
durable lead and notification path, and suppresses the shadow outcome with
`forward_contract_rollback`. Plan My Party, Packages, Contact, duplicate, and
lost-response fixtures pass. Raw rollback to production SHA `4bd6d29...` remains
unsafe for clients that already loaded the new form contract.

No destructive schema rollback is preauthorized. Empty additive tables may be
left dormant. DROP SQL or Time Travel restore requires a new destructive
approval and complete lead reconciliation.

## K — CF-02

CF-02 is **implemented and verified**. Preview-only `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` are absent. Production Stripe names/bindings, all
unrelated Preview settings, the exact PR #62 branch exclusion, and Production
SHA remain unchanged. No build or deployment was created. The quarantined
preview remains **DO NOT USE** and CF-02 does not make Preview generally safe.

## L — AP-05

**NOT READY.** There is still no durable privacy-safe join proving click ->
accepted lead -> genuine -> qualified -> quote -> commitment -> booking ->
completion -> collected revenue. Required identifiers, milestones, status/loss
definitions, and collection reconciliation remain read-only data-model work.

## M — AP-06

**NOT READY.** Collected revenue, provider/internal labor, actual travel,
materials, processing, compliance, refunds/failure cost, and owner/sales labor
are incomplete. No County x Service x Booking Type contribution or maximum CPA
ceiling may be claimed. Contracted event value is not collected revenue.

## N — GTV-1

No performance conclusion is included. GTV-1 became effective
2026-08-10 17:39:06 PT, so August 10 is a mixed day and no complete post-change
calendar day exists at packet time. The first complete-day safety read is August
12 after August 11 reporting latency; the first complete seven-day window is
August 11–17 and should be read August 18/19. GTV-1 remains frozen.

## O — Remaining actions before a controlled production test

1. Separately approve and implement RECEIVER-01 in an isolated non-production
   receiver, then prove strict acknowledgement, atomic identity claim, and
   effect-specific recovery using synthetic destinations only.
2. After the isolated receiver passes, separately approve the exact live
   receiver cutover/rollback window; do not rely on search-then-add or generic
   `200 Accepted` for normal customer traffic.
3. Select and configure the exact Worker operator route, Access service token,
   secrets, alert destination, and staffed-response SLA.
4. Approve and perform the schema-only D1 export; rerun the local rehearsal
   against those exact bytes and freeze the final migration/application hashes.
5. Freeze exact legacy T0 and T0+72h UTC values plus monitoring operators.
6. Approve the production runtime consent implementation and the downstream
   deletion-propagation runbook; keep Data Manager/ECFL excluded.
7. Approve additive migration and Secondary-shadow deployment separately.
8. Approve one supervised, explicitly labeled synthetic production submission
   per route and exact reconciliation/rollback criteria.

## P — Next owner approval text

```text
OWNER APPROVAL — RECEIVER-01A NON-PRODUCTION ENGINEERING ONLY

Approve construction and deterministic testing of an isolated non-production
Make receiver for Happy Faces LA using only synthetic destinations and synthetic
lead IDs. Implement the strict acknowledgement, lead_id/x-idempotency-key
equality, request-signature verification, atomic receipt key, separate Gmail and
Sheet effect states, partial-success recovery, and last-position Webhook Response
defined in RECEIVER-01.

Do not modify or deactivate live Make scenario 5090554, production Gmail or
Sheets, production webhook URLs/secrets, customer records, Google Ads, GA4/GTM,
Cloudflare Production, D1 Production, PR #62 merge state, or production code.
Do not send a real customer message or lead. Return sanitized before/after
blueprints and hashes, strict-response fixtures, concurrent-duplicate evidence,
partial-success evidence, rollback proof, and the exact separate approval packet
required for a supervised live receiver cutover. Then stop.
```
