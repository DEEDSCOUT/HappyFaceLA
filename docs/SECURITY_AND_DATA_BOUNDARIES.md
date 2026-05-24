# Security and Data Boundaries

## Happy Faces LA — Commercial Control Room

**Version:** 1.1 — Phase 1B Remediation
**Date:** 2026-05-23
**Status:** ACTIVE

---

## 1. Repository Security Requirements

The following rules are enforced at all times in this repository:

1. The repository must never contain OAuth secrets, tokens, or customer PII.
2. `.gitignore` was created as the first file before any secret or runtime state location.
3. The following directories are permanently git-ignored:
   - `.secrets/` — OAuth credentials, token files
   - `secrets/` — alternative spelling, also blocked
   - `.runtime/` — Runtime state, temporary API responses
   - `.exports/private/` — Private export outputs containing PII or internal data
4. The following file names are permanently git-ignored regardless of location:
   - `client_secret.json`, `client_secrets.json`
   - `token.json`, `token.pickle`
   - `credentials.json`, `service_account.json`
   - `*.p12`, `*.pem`, `*.key`

---

## 1A. Canonical Path Model (Phase 1B Addition)

| Path | Purpose | Git tracked? |
|---|---|---|
| `.secrets/client_secret.json` | OAuth client credentials | No (.gitignore) |
| `.runtime/token.json` | OAuth refresh token | No (.gitignore) |
| `.runtime/manifests/manifest.json` | Execution receipt / idempotency cache | No (.gitignore) |
| `.runtime/audit/audit_report.json` | Dynamic audit receipt | No (.gitignore) |
| `.exports/private/` | Private export outputs | No (.gitignore) |
| `secrets/` | Alternative spelling — also blocked | No (.gitignore) |

All path constants are defined in `constants.py` (`SECRETS_DIR`, `CLIENT_SECRET_PATH`, `RUNTIME_DIR`, `TOKEN_PATH`, `MANIFEST_PATH`, `AUDIT_REPORT_PATH`, `PRIVATE_EXPORT_DIR`).
Running `provision --dry-run` writes only to `.runtime/` and does not dirty the tracked git tree.

---

## 2. Data Classification Definitions

| Classification | Description | Permitted Exposure |
|---|---|---|
| `INTERNAL_CONTROLLED` | Internal staff use only; no public distribution | Internal staff with need-to-know |
| `RESTRICTED_PII` | Contains customer or financial PII; strictly need-to-know | Authorized staff only; never to AI or public channels |
| `CHANNEL_SAFE_AFTER_RELEASE` | Machine-readable export; safe for channel use after CEO release approval | Website, Google Ads, AI, Chatbot — only after explicit CEO release |

---

## 3. PII Boundary

The following data types are classified as PII and must never appear in:
- Any governance workbook tab (Sheet A)
- Any channel-safe export
- Any AI or chatbot input
- Any tracked file in this repository

PII types:
- Customer names
- Customer email addresses
- Customer phone numbers
- Event street addresses
- Billing addresses

PII is permitted only in:
- Sheet B (Restricted Operations Workbook) — `RESTRICTED_PII` classification
- Encrypted local files in `.secrets/` or `.runtime/` (git-ignored)

---

## 4. Internal-Only Field Boundary

The following field types are internal-only and must never appear in channel-safe exports or AI inputs:

- `ceo_notes`
- `internal_profitability_input` / `internal_cost`
- `dispatch_origin` (private performer/staff dispatch address)
- `margin` (gross margin)
- `vendor_rate` / `performer_cost`
- `draft_policy` (unapproved draft text)
- `unapproved_price` (price not yet CEO-approved)

---

## 5. Rule Export Boundary

A rule may only appear in a channel-safe export when ALL of the following are true:

1. CEO decision is `APPROVED_AS_RECOMMENDED` or `APPROVED_WITH_CONDITIONS`
2. `final_effective_rule` is non-empty
3. `release_version` is non-empty
4. `effective_date` is non-empty
5. `policy_version` is non-empty
6. No active blockers (all blockers resolved or absent)
7. Rule status is not `DRAFT`, `REJECTED`, or `SUPERSEDED`

Failure on any criterion = rule excluded from export. No silent inclusion.

---

## 6. Restricted Operations Boundary

Sheet B (`HF-LA Leads, Quotes, Bookings & Profitability Control`) data:

- Must never be merged into any Sheet A tab
- Must never appear in any channel-safe or AI export
- Must never be passed to any public AI system, chatbot, or external service
- Is protected by the banner: "RESTRICTED BUSINESS DATA — CUSTOMER AND FINANCIAL INFORMATION — DO NOT SHARE WITH PUBLIC AI SYSTEMS OR UNAUTHORIZED AGENTS"

---

## 7. AI / Chatbot Export Boundary

Any AI system, Copilot, or chatbot consuming Happy Faces LA commercial rules must:

1. Source rules only from the `04_ACTIVE_RULES_EXPORT` tab (Sheet A) or the `release_exporter.py` output.
2. Never access or cache Sheet B (Restricted Operations) data.
3. Never expose fields: `customer_name`, `customer_email`, `customer_phone`, `event_address`, `ceo_notes`, `internal_cost`, `margin`, `dispatch_origin`, `draft_policy`.
4. Never quote pricing that is not in an active, CEO-approved release.
5. Escalate any inquiry outside approved response boundaries per `10_AI_CUSTOMER_RESPONSE_MATRIX`.

---

## 8. Phase 1 Security Confirmation

The following operations DID NOT occur in Phase 1:

- No Google authentication
- No OAuth consent
- No Google Drive file creation, modification, or deletion
- No Google Sheets or Docs creation
- No customer PII read or written
- No live ad campaign data accessed
- No pricing or policy marked as CEO-approved

---

## 9. Incident Response

If any of the following are discovered, treat as a security incident:

1. A `token.json` or `client_secret.json` file committed to git history
2. Customer PII appearing in any non-restricted tracked file
3. An unapproved pricing rule appearing in a channel-safe export
4. CEO notes or internal cost data appearing in any public file
5. The `--apply` command executing without explicit Phase 2+ authorization

Immediate response: revoke credentials, rotate secrets, audit git history, notify CEO.

---

## Phase 1B.2 Addendum (2026-05-23)

The Phase 1B.1 final acceptance audit identified two security-relevant
defects that Phase 1B.2 closes:

- **Channel-approval conflation.** The single `AIReviewStatus` value
  `APPROVED_FOR_AI` previously gated both `CHATBOT` and `AI_COPILOT`
  export channels. A rule reviewed for one consumer surface was therefore
  silently treated as approved for the other. The export validator now
  uses a `ConsumerChannel` enum with per-channel review-status fields
  (`customer_chatbot_review_status`, `copilot_internal_review_status`,
  `quote_operator_review_status`). Approval on one channel does **not**
  grant approval on another.
- **Restricted operations channel.** The `RESTRICTED_OPERATIONS_PII`
  channel is rejected outright by `validate_consumer_channel_export_safety`;
  no automated path is permitted today, even with all other gates passing.

PII handling rules are unchanged: `contains_pii=True` on any rule remains
fatal for every public channel and is also enforced on every
`ChannelProjectionRecord` whose `channel` is in
`PUBLIC_CONSUMER_CHANNELS`.

The 15-tab governance workbook continues to mark draft, blocker, and
projection tabs `INTERNAL_CONTROLLED`; only `approved_channel_text`
on a `RELEASED` projection is classified `CHANNEL_SAFE_AFTER_RELEASE`.


---

## Phase 1B.3 Addendum — Projection-Based Exports and Release Gating

The `release_exporter` module no longer consumes any field on
`RuleRow` as channel text.  Per-channel approved text lives exclusively
on `ChannelProjectionRecord`.  Publication on a consumer channel
requires a `ReleaseRecord` with `status=RELEASED` that authorizes
both the channel and the projection ID.  The `RESTRICTED_OPERATIONS_PII`
channel has no automated export path in Phase 1 and is rejected at the
top of `export_for_channel`.

The column-mapping contract has moved from a Python constant into
`config/column_mappings.yaml`.  Any change to a column-to-tab mapping
now flips the deterministic `spec_fingerprint` and surfaces as plan
drift, closing a previously silent governance hole.


---

## Addendum — Phase 1B.4 (2026-05-23)

* The release-gate exporter no longer reads `blocks_live_provisioning` for the
  publication decision. Channel publication is blocked **only** by an open
  blocker that lists the channel in `blocked_channels`. The live-provisioning
  and Phase-1C content-loading scopes are decided by dedicated checks
  (`validate_no_live_provisioning_blockers`,
  `validate_no_phase_1c_loading_blockers`) and never substitute for the
  publication gate.
* Channel output authority is now established by an explicit
  `ChannelReleaseActivationRecord` (at most one `ACTIVE` per channel,
  `supersedes_activation_id` for explicit supersession, restricted channels
  forbidden). `RELEASED` status alone no longer authorises a channel export.
* Every `ChannelProjectionRecord` carries a required `publication_key`. The
  register and the exporter are both fail-closed against duplicate
  `(channel, publication_key)`. Two RELEASED projections can no longer occupy
  the same publication slot on the same channel.
* `ApprovedProjectionExport` records now carry `publication_key`, `release_id`,
  `release_version`, `policy_version`, `effective_date`, and `activation_id`
  as required fields; PII / internal-only signals remain mandatory.
* No Phase 1 boundary changes: live Google API calls remain blocked;
  `provision --apply` still exits 1 with the verbatim block message.
