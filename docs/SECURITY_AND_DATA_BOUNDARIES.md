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
