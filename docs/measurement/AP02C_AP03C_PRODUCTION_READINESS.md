# AP-02C / AP-03C Production-Readiness Packet

Status: branch engineering and decision packet only. This document authorizes
no migration, Worker deployment, Pages deployment, production form, webhook,
Cloudflare secret change, Google Ads action, GA4/GTM change, or customer-data
upload.

## Current conclusion

**NOT READY — BLOCKERS REMAIN.**

The feature branch now contains deterministic recovery and rollback engineering,
but production shadow approval still requires owner choices and external
receiver proof listed below.

## A1 — Notification recovery candidate

The branch provides:

- one outbox record for each configured destination (`crm`, `sheet`, `make`);
- a one-minute cron Worker candidate, with batches limited to 20 rows;
- deterministic retry delays of 1 minute, 5 minutes, 15 minutes, 1 hour, and 6
  hours;
- six total attempts by default (one initial attempt plus five retries) and an
  immutable code ceiling of ten;
- five-minute leases, per-claim random fencing tokens, and finalization that
  succeeds only for the current token;
- expired-lease handling: unverified receivers go to review without a resend;
  only separately proved receivers may be reclaimed automatically;
- poison/corrupt payload quarantine and maximum-attempt dead-letter review;
- durable Worker-run records, failed/stale-run evidence, queue health, and
  fenced closure of runs still marked `running` after five minutes;
- alerts for due age over five minutes, expired leases, review rows, and stale
  or failed runs; a successfully transported failed-run alert is durably marked,
  while a failed alert remains eligible for the next run; alert payloads contain
  counts and codes only, never contact data or lead IDs;
- authenticated operator health and recovery endpoints; retry,
  verified-delivered, and abandon actions require a downstream check, reason,
  unique action ID, and durable audit record;
- duplicate-safe scheduler run IDs and per-destination unique constraints;
- a dedicated `NOTIFICATION_D1` binding with no fallback to a Pages database;
  missing storage and failed drain promises reject the Cron invocation after
  recording/logging the failure, so the platform cannot report it as healthy.

The engineering template deliberately has no production database ID, webhook
secret, alert URL, or operator token. Automatic retry is empty by default.

Operator recovery procedure for a later approved deployment:

1. Authenticate to `GET /operator/health`; use only aggregate counts/codes for
   monitoring. Alert on `oldest_due_over_5m`, `expired_lease_present`,
   `needs_review_present`, `stale_worker_run_present`, or
   `failed_worker_run_present`.
2. Through a separately approved, scoped D1 read, retrieve only `lead_id`,
   destination, status, attempt count, error/ack code, and timestamps for the
   affected row. Do not export customer payloads.
3. Search the actual destination by exact `lead_id`. For composite Make delivery,
   inspect both the Gmail and Sheet effects.
4. If every expected side effect exists, POST `mark_delivered`. If none exists,
   POST one `retry`. If only some Make effects exist, repair the missing effect
   manually and then `mark_delivered`; do not replay the composite webhook.
5. Each POST requires a new 8–80 character `action_id`, a non-PII `reason_code`,
   and `confirmed_downstream_checked=true`. Replaying an action ID returns 409
   and makes no second mutation.
6. Use `abandon` only when the notification is definitively invalid or no longer
   deliverable. Preserve its terminal row and audit history.
7. Verify the outbox state, compatibility flags, and one audit row. Never retry
   past ten total delivery attempts, and escalate repeated failures instead of
   raising the ceiling.

## A2 — Downstream idempotency result

`x-idempotency-key: <lead_id>` is **not proved end-to-end**.

The only exported Make blueprint bytes preserved in this repository are the
June 10 snapshots. They use body `leadId`, not the header. Their Sheets branch
searches column B for `leadId` before adding a row, but the scenario is not
sequential and the search-then-add sequence is not an atomic uniqueness claim.
Their Gmail branch is independent and unfiltered, so replaying the webhook can
send another owner email.

The later June 15 V2 final-destination narratives state that the deployed
mapping was repaired to canonical top-level fields and that Sheets Search Rows
used canonical `lead_id`. Those records supersede the June 10 mapping shape for
the final-destination proof, but no post-V2 exported blueprint bytes or hash are
present in this repository. They therefore cannot prove the exact currently
deployed scenario, header handling, atomic/concurrent uniqueness, Gmail replay
behavior, or strict acknowledgement contract. A repository Apps Script template
also unconditionally appends and emails; it is not proof of the deployed
receiver.

Until the receiver can atomically claim `lead_id` and return a strict durable
acknowledgement, the Happy Faces LA safeguard is:

1. keep D1 `lead_id` as the sole business identity;
2. send it in both body and `x-idempotency-key`;
3. persist and retry the original accepted canonical payload only;
4. accept a strict acknowledgement only when `ok`, `leadId`, `destination`,
   `persisted`, and `duplicate` agree;
5. treat timeouts, connection loss, malformed/mismatched acknowledgement, and
   post-send crash as ambiguous;
6. do not retry ambiguity automatically; an operator searches the destination
   by `lead_id` and then records delivered or authorizes one fenced retry.

This prevents silent application-side duplication. True exactly-once external
effects require receiver cooperation and cannot be claimed from the current
evidence.

Preserved evidence reviewed without invoking a receiver:

| Evidence | SHA-256 | Finding |
| --- | --- | --- |
| `evidence/lead_capture_20260610/integration_webhooks_addrow_leadid_guard_blueprint.json` | `b64a3965a7ad862e763066562a574694544469236a9ed5b022ba0c3120b8112e` | Make router has an independent Gmail branch; Sheets Filter Rows compares column B to body `leadId`, followed by Add Row only when result length is zero. This is search-then-add, not an atomic claim. |
| `evidence/lead_capture_20260610/integration_webhooks_final_verified_blueprint_after_leadid_guard.json` | `e2c45e3c17fa3ca58ec05240c166b721b349f3585bbc64bccf0a155d7c9e44a8` | Preserved final blueprint evidence; no durable header-level acknowledgement contract is present. |
| `evidence/lead_capture_20260610/integration_webhooks_persisted_verified_blueprint_after_reload.json` | `35d228012eb0deb4110b101b8d3bc9a157d5e7368dc7ed76eb86ba9013233338` | Preserved reload evidence; it does not prove concurrent atomic uniqueness. |
| `README.md` | `e5dc9e65bc2ae44129773b9f0f50a5cf2ed850288f3a1c0705c030c87256cd1f` | June 15 V2 narrative says final destinations were repaired to canonical top-level fields and proved with one synthetic non-customer Plan My Party lead; it is outcome evidence, not deployed-blueprint bytes. |
| `docs/commercial-booking/COMMERCIAL_BOOKING_PHASE_TRACKER.md` | `25605638743cc57de4bfb9b4d5ba01ef6359a8b2b0ecdc4c7704d5685545b9b3` | June 15 V2 tracker says Sheets Search Rows used canonical `lead_id`, Add Row mapped A:AP, and the filter passed; it does not expose the post-V2 scenario graph or response contract. |
| `docs/commercial-booking/COMMERCIAL_BOOKING_DEFECT_REGISTER.md` | `a47076d92f8dccfdd944bb3526d3749b64c33ecdf9c20365c7a5adb7bbe78ace` | June 15 V2 defect closure repeats the canonical `lead_id` final-destination result, but its referenced repair report is not present in this repository. |
| `scripts/lead-webhook-apps-script.js` | `1e5d3cf041abc797daa1ad35566974f1f1f7d227446d219098eaa8acc9b4be29` | Template calls `appendRow` and `GmailApp.sendEmail` unconditionally and replies only with `ok`/`leadId`; it has no lock, atomic lead-ID claim, or strict destination acknowledgement. |

No live Make scenario, Gmail, Sheet, Apps Script, or webhook was called. The
classification is therefore **downstream idempotency not proved**; it is not a
claim that the preserved template is the currently deployed receiver. Before
automatic retry can be enabled for Make, obtain a fresh sanitized export of the
deployed V2 blueprint, preserve its SHA-256, and inspect its exact branch
sequencing, atomic lead-ID claim, Gmail replay filter, header mapping, and strict
durable acknowledgement response.

## A3 — Production migration procedure

Frozen production identity:

- Pages project: `happyfacesla`
- Production branch: `main`
- Production D1 name: `hfla-availability-production`
- Production D1 ID: `3ea0bd28-abba-4630-99d1-f30ab17c0c36`
- Current production application SHA at packet preparation:
  `4bd6d29d4ec119e120d860d4697c3e9777d25bd2`
- Feature-branch checkpoint before this AP-02C wave:
  `6874a14533b45dbda67e4ae51e7c14febee47bcc`
- Final candidate application commit SHA: **PENDING LOCAL OWNER REVIEW AND
  CHECKPOINT**. A commit cannot contain its own SHA, so the operator must freeze
  it in external change evidence and substitute that exact value before any
  production command. A pending value is a stop condition.
- Exact migration file:
  `migrations/d1/20260810_ap02a_ap03a_canonical_form_identity.sql`
- Exact migration SHA-256 for these reviewed bytes:
  `e9b620ee79ce586ce0c971128003072bc9e8f6d384111b47a244279f1f7cc65c`
- Admitted production-schema fixture SHA-256:
  `c2bd72c904305b3c0cfea99d76937a62dbf5fe45e432e71bf79026b614ff508c`

Before state expected from a fresh read-only export:

- `quote_requests`: 100 columns, nine explicit indexes, zero foreign keys;
- legacy `qrq_*`, `source='plan-my-party'`, and delivery-status constraints;
- the AP identity, canonical, notification, Worker-run, and operator-audit
  tables absent;
- the production migration ledger includes admitted 0004 and 0005 history;
- because the repository lacks the authoritative 0004 source, a general
  repository migration apply is prohibited.

Expected after state, before application cutover:

- `quote_requests` remains byte-for-byte structurally unchanged;
- exactly five additive empty tables exist: `lead_submission_identity`,
  `canonical_lead_outbox`, `lead_notification_outbox`,
  `notification_worker_runs`, and `notification_operator_audit`;
- exactly six additive indexes exist: two identity indexes and one each for
  canonical outcome, notification queue, Worker runs, and operator audit;
- all additive foreign keys pass and all five tables contain zero rows;
- exactly one approved migration-ledger entry was added.

Pre-approval dry run:

1. Freeze the exact tested candidate commit in external evidence and verify the
   migration SHA-256 above. Require an empty `git status --porcelain`.
2. Export the remote schema without customer data and retain its hash. D1 export
   can briefly block requests, so use an approved low-traffic window.
3. Retrieve and retain the current Time Travel bookmark and timestamp.
4. Reconcile the fresh schema semantically to the admitted fixture; stop on any
   drift.
5. Create a one-purpose Wrangler configuration naming the exact production ID
   and a migration directory containing only the one approved SQL file.
6. Apply the exported schema and exact migration to a fresh local database.
7. Run schema constraints, all routes, notification recovery, lost-response,
   duplicate, and rollback-mode tests plus `PRAGMA foreign_key_check`.
8. Read the remote migration list. It must identify exactly one unapplied file:
   the approved migration. Wrangler has no remote dry-run switch.

Read-only remote evidence commands for the later approved window are:

```text
npx wrangler d1 time-travel info hfla-availability-production --config=<one-purpose-production-config> --json
npx wrangler d1 export hfla-availability-production --remote --no-data --output=<timestamped-schema-only.sql> --config=<one-purpose-production-config>
npx wrangler d1 migrations list hfla-availability-production --remote --config=<one-purpose-production-config>
```

The one-purpose configuration must resolve
`hfla-availability-production` to database ID
`3ea0bd28-abba-4630-99d1-f30ab17c0c36` and its migration directory must contain
only the one hash-verified file. It must not contain Worker routes, Pages deploy
configuration, secrets, or any other migration.

Local rehearsal gates, against a fresh database only:

```text
npm run test:migration
npm run test:production-schema
npm run test:notification-recovery
npm test
npm run guard:owner-baseline
npm run verify:release
npm run qa:postbuild
npm run qa:ap02-ap03-postbuild
npm run qa:analytics-host-policy
```

The rehearsal must retain the schema export hash, migration hash, command exit
codes, `PRAGMA foreign_key_check` result, and row/table/index manifests.

Only a later approval may execute:

```text
npx wrangler d1 migrations apply hfla-availability-production --remote --config=<one-purpose-production-config>
```

Apply the additive schema while the old application remains live. Verify before
any application deployment:

- original `quote_requests` table and nine indexes unchanged;
- its row count never decreased;
- only the exact additive tables/indexes appeared;
- all new tables have zero rows before application cutover;
- exactly one new migration-ledger row exists;
- no foreign-key violations;
- before and after Time Travel bookmarks are preserved.

Required verification queries (run separately and preserve results without
customer rows) are:

```sql
SELECT name, type, sql FROM sqlite_schema
WHERE name = 'quote_requests' OR name LIKE 'idx_quote_requests_%'
ORDER BY type, name;
PRAGMA table_info(quote_requests);
PRAGMA index_list(quote_requests);
PRAGMA foreign_key_list(quote_requests);
SELECT name, type, sql FROM sqlite_schema
WHERE name IN (
  'lead_submission_identity', 'canonical_lead_outbox',
  'lead_notification_outbox', 'notification_worker_runs',
  'notification_operator_audit'
) OR name LIKE 'idx_lead_submission_identity_%'
  OR name IN (
    'idx_canonical_lead_outbox_status',
    'idx_lead_notification_outbox_status',
    'idx_notification_worker_runs_status',
    'idx_notification_operator_audit_lead'
  )
ORDER BY type, name;
SELECT
  (SELECT COUNT(*) FROM lead_submission_identity) AS identity_rows,
  (SELECT COUNT(*) FROM canonical_lead_outbox) AS canonical_rows,
  (SELECT COUNT(*) FROM lead_notification_outbox) AS notification_rows,
  (SELECT COUNT(*) FROM notification_worker_runs) AS worker_run_rows,
  (SELECT COUNT(*) FROM notification_operator_audit) AS operator_audit_rows;
PRAGMA foreign_key_check;
SELECT * FROM d1_migrations ORDER BY id;
```

Capture `quote_requests` count and maximum received timestamp immediately before
and after. The count must never decrease; any increase while the old application
remains live must reconcile to leads received during the window. Do not export
customer rows for this proof.

Stop on database identity mismatch, unavailable bookmark, schema/ledger drift,
dirty or unreviewed commit, hash mismatch, a pre-existing AP table, unexpected
migration, non-additive SQL, failed local fixture, row loss, foreign-key error,
production incident, or any unrelated change.

Rollback order (no destructive rollback SQL is included or preauthorized):

1. Prefer leaving empty backward-compatible additive tables dormant.
2. If application code was served, deploy only the tested forward-contract
   rollback build described below; never deploy raw pre-AP-02 code.
3. A `DROP` script may be generated and hash-reviewed only under a new
   destructive approval and only after fresh verification proves all five
   additive tables are empty. No drop script is an approved artifact in this
   packet. If any row exists in any additive table, `DROP` is prohibited pending
   complete reconciliation and a new owner decision.
4. A Time Travel restore is an emergency last resort requiring a new destructive
   approval because it replaces the whole database and can erase legitimate
   later leads. Preserving a bookmark is not authorization to restore it.

## A4 — Forward-contract rollback candidate

The same tested codebase supports a gated
`FORWARD_CONTRACT_ROLLBACK_MODE=true` candidate. It keeps accepting the new
`submission_id` and atomic attribution payload, stores one durable lead, returns
the new `accepted/persisted/created` response shape to already-open clients, and
keeps customer notification delivery available. It forces the canonical outcome
to `suppressed` with reason `forward_contract_rollback`, so browser conversion
events remain ineligible.

This is intentionally a forward-compatible bridge, not a checkout of the old
production SHA. It remains undeployed and must be built and rehearsed from the
exact future approved candidate.

Deterministic fixtures cover Plan My Party, Packages, and Contact; retry of the
same rollback-mode `submission_id` returns the same `lead_id`, creates no second
lead or notification row, emits no browser technical event, and leaves the
canonical outcome suppressed. This bridge deliberately retains the safer fenced
notification contract; it does not re-enable ambiguous blind webhook retries.

## A5 — Privacy, retention, deletion, and consent decisions

Every row below is an owner/privacy decision; none is silently activated:

| Control | Needed for first-party internal attribution? | Proposed default for owner decision | Needed only for later Google delivery? |
| --- | --- | --- | --- |
| Browser attribution before consent | No durable storage | Memory for the current page only; discard on navigation/close unless the approved consent policy permits storage | No |
| Attribution retention TTL | Yes, if persistence is approved | 30 days from capture; expire the entire coherent touch envelope, never individual fields | No |
| Genuine-lead PII | Yes, minimized contact/booking operations | 24 months after last interaction or completed event; separately governed accounting/contract records follow their own schedule | Normalized contact fields may be needed later, but not approved for Google here |
| Raw click-ID retention | Useful, not required for lead operations | 180 days after acceptance or 90 days after final measurement event, whichever is later; then delete | Yes, click-ID matching may later use it |
| Spam/bot retention | Only for abuse control | 30 days minimized, then delete PII/click IDs and retain non-PII abuse aggregates only | No; never eligible |
| Internal-test retention | Only for QA evidence | 30 days, clearly labeled, then delete/minimize; always excluded from business and Google outcomes | No; never eligible |
| Notification history | Yes for delivery recovery | 180 days for attempt/audit metadata; payload follows the shorter applicable PII schedule; then aggregate metrics only | No |
| Shadow outcome retention | Yes for reconciliation | 13 months with opaque IDs and definition version, then non-identifying aggregates | Later upload diagnostics may use it, but no upload is approved |
| Access roles | Yes | Raw PII: owner plus named operations steward; runtime services: least privilege; marketing/analysts: opaque or aggregate only; quarterly access review | Separate named uploader role would be required later |
| Export procedure | Yes for data-subject/owner operations | Verify requester and scope; export canonical lead, outcomes, attribution, notification/audit history to an owner-controlled encrypted destination; record approver, time, and delivery | Google exports are excluded |
| Deletion procedure | Yes | Verify request/legal exception; delete or redact D1 PII and click IDs; propagate to named downstreams; retain only justified opaque tombstone/aggregate and an exception log | A later Google gate must add adjustment/deletion handling |
| Consent withdrawal | Yes | Clear browser state; stop future non-essential measurement/sharing; apply deletion schedule; preserve only independently required booking/accounting records | Must block all future customer-data delivery |
| Attribution credit | Yes | Latest qualifying touch drives operational acquisition credit; first touch is informational; submit touch records route/context; never merge envelopes | Later Google credit remains a separate reporting definition |
| `analytics_storage` | No for server-side first-party lead identity | Default denied until the approved analytics-consent policy grants it | Required only for applicable GA4 storage behavior |
| `ad_storage` | No | Default denied until the approved advertising-consent policy grants it | Potentially required for Google advertising storage |
| `ad_user_data` | No | Default denied; general form/contact consent is insufficient | Required before any consent-dependent customer-data delivery |
| `ad_personalization` | No | Default denied; no remarketing/personalization use approved | Only for a separately approved personalization use case |

Export: verify the request, locate by contact/lead ID, export canonical lead,
outcomes, attribution, and audit trail to an owner-controlled encrypted location,
and record scope, approver, and delivery.

Deletion/withdrawal: clear browser state, block future Google delivery, redact or
delete D1 PII and raw click IDs, propagate to configured downstream systems where
technically possible, retain only a justified opaque tombstone/aggregate, and
record exceptions. Do not silently delete separately required contracts,
bookings, tax, or accounting records.

The owner must return an explicit approve/edit decision for the TTLs, roles,
credit rule, export/deletion process, and each Google consent signal. General
contact permission grants none of the Google signals.

Internal attribution requires allowlisted touches, durable identity, outcomes,
and access/retention/deletion controls. It does **not** require Google Data
Manager, hashing, `ad_user_data`, `ad_personalization`, or customer-data upload.
Those are a later ECFL/Data Manager gate with separate terms, consent, identifier
normalization, exclusion, diagnostics, and deletion/adjustment controls.

## A6 — Old Packages/Contact owner decision

Option A — bounded compatibility:

- old tabs submit during an owner-selected exact start/end window (the code
  fails closed and rejects any window longer than 14 days);
- every legacy submission stays conversion-suppressed;
- old Plan My Party tabs retain a stable `qrq_*` key and retry safely;
- old Packages/Contact tabs had no stable ID, so a lost-response retry can
  create a second lead and notification;
- monitor legacy contract version, route, count, near-match contact/event
  details, duplicate pointer, and operator resolution at least daily during the
  window; stop compatibility early on a duplicate burst or notification issue.

Option B — hard cutover:

- old payloads fail immediately;
- lowest duplicate risk;
- highest risk of losing an active prospect with an open/cached form; the
  customer must refresh to obtain the new contract.

Recommendation, not a selection: **Option A for exactly 72 hours, then hard
cutover**. This is the safest commercial balance: it protects recently opened
forms and keeps every legacy lead conversion-suppressed while limiting the
non-idempotent Packages/Contact exposure to three days. The 72-hour duration is
a proposed operating judgment, not observed traffic evidence. The owner must
choose A with exact UTC start/end timestamps or choose B before deployment.

## A7 — CF-02 Preview Stripe packet

Future approved change: remove only `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` from the Cloudflare **Preview** environment. Cloudflare's
Pages Project Edit API deletes an environment variable by setting its key to
`null` in `deployment_configs.preview.env_vars`.

Repository control-flow evidence for this narrow change:

- `functions/api/create-checkout-session.ts:53-75` accepts only an `sk_test_` or
  `rk_test_` Stripe key and returns 503 when the key is absent or unusable,
  before checking KV, reading the request body, or querying D1.
- A usable Preview test/restricted-test key is not sufficient isolation:
  `functions/api/create-checkout-session.ts:116-196` can query production-bound
  availability, create a D1 slot hold, and write a pending booking to KV before
  it attempts the Stripe API call.
- `functions/api/stripe/webhook.ts:55-97` requires a present `whsec_` secret and
  valid Stripe signature before event dispatch; the first completed-checkout
  path into storage mutation is at lines 102-107, with D1/KV mutations inside
  `handleCheckoutCompleted` at lines 175-220.

Removing both Preview Stripe secrets therefore fails public checkout and Stripe
webhook paths closed before those side effects. It does **not** reclassify the
quarantined preview as safe: other production D1/KV, analytics, notification,
and webhook bindings may remain, and the existing deployment remains **DO NOT
USE**.

Exact later-approved procedure:

1. GET `/accounts/<verified-account-id>/pages/projects/happyfacesla`.
2. Preserve a redacted before manifest containing variable names/types only,
   plus production branch, production deployment enabled state, preview branch
   exclusions, D1/KV binding IDs, and canonical production deployment SHA. Never
   record secret values.
3. Verify both target names are present in **Preview** and separately verify
   Production state. Stop if project/account identity is wrong.
4. PATCH only:

   ```json
   {
     "deployment_configs": {
       "preview": {
         "env_vars": {
           "STRIPE_SECRET_KEY": null,
           "STRIPE_WEBHOOK_SECRET": null
         }
       }
     }
   }
   ```

5. GET the project again and prove the two names are absent from Preview, all
   other Preview names/types are unchanged, Production names/types are
   unchanged, branch deployment policy is unchanged, and production deployment
   SHA is unchanged.
6. List deployments created after the before timestamp and require zero. Do not
   redeploy or browse a preview.

Stop on any API response containing an unrelated diff, either target absent in
the before state, Production mutation, branch-policy mutation, binding mutation,
deployment creation, or inability to verify redacted parity. The quarantined
preview deployment may retain deployment-time bindings and remains **DO NOT USE**
even after a future configuration change. If Preview payments are later needed,
bind verified Stripe test-mode credentials only and add an explicit
non-production runtime guard; never restore live-capable secrets by default.

API basis: <https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/edit/>.

## Remaining approval gates

Production Secondary-shadow approval must wait for:

1. owner choice for A5 retention/consent/access/deletion;
2. owner choice for A6 legacy cutover;
3. atomic receiver idempotency plus strict acknowledgement, or explicit approval
   of manual ambiguity handling with no automatic retry;
4. final candidate SHA and migration hash, fresh schema export/bookmark, and
   complete local migration rehearsal;
5. separate Worker/binding/schedule/secret/monitor approval;
6. a separately approved production test protocol.

No Google conversion action, uploader, Data Manager source, Enhanced
Conversions configuration, or customer-data delivery belongs to that shadow
packet.
