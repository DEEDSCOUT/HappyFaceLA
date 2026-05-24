# Architecture Decision Record
## Happy Faces LA — Commercial Control Room

**ADR-001**
**Date:** 2026-05-23
**Status:** ACCEPTED — Phase 1 Local Dry-Run

---

## Context

Happy Faces LA requires a structured, governed system to create and manage a Commercial Control Room in Google Drive. The system must:

- Create a specific folder hierarchy in Google Drive.
- Create two Google Sheets (governance workbook with 15 tabs after Phase 1B.2; restricted operations workbook with 9 tabs) with full formatting, validation, conditional formatting, protected ranges, and banners.
- Create two Google Docs (policy manual and release brief template) with structured heading sections.
- Produce sanitized, machine-readable rule exports for website, Google Ads, Copilot, and chatbot channels.
- Enforce governance constraints: no draft rule exported, no PII in channel-safe outputs, no CEO-unapproved pricing or policy published.

---

## Decision 1: Python 3.12+ with Direct Google API Clients

**Decision:** Use Python 3.12+ with `google-api-python-client`, `google-auth-oauthlib`, and `google-auth-httplib2` to drive Google Drive, Sheets, and Docs API directly.

**Rationale:**
- MCP capability preflight established that MCP does not expose the full set of Google Sheets and Docs construction controls required (batchUpdate for tab management, column formatting, data validation rules, conditional formatting, protected ranges, frozen headers).
- Direct API clients provide complete batchUpdate control over spreadsheet and document structure.
- Python 3.12+ type annotations and Pydantic v2 enable rigorous compile-time and runtime schema validation.

**Rejected alternatives:**
- MCP-only approach: Insufficient API surface for Sheets/Docs structural operations.
- Google Apps Script: Not version-controllable in the same repository; harder to test locally.
- Workspace SDK wrappers: No mature Python wrapper covers the full Sheets batchUpdate surface.

---

## Decision 2: Pydantic v2 for Specification Models

**Decision:** Use Pydantic v2 (`pydantic>=2.7`) for all specification models representing workbooks, tabs, rules, documents, and exports.

**Rationale:**
- Strict field validation at load time catches spec integrity errors before any API call.
- `model_validator` enables cross-field invariants (e.g., no overlap between editable and protected columns; tab title uniqueness; required tab count enforcement).
- Pydantic v2 serialization supports clean JSON output for dry-run plans and audit reports.

---

## Decision 3: YAML for Configuration Input

**Decision:** Use PyYAML (`PyYAML>=6.0`) with `yaml.safe_load` exclusively for all configuration files.

**Rationale:**
- YAML provides human-readable, reviewable governance specifications.
- `safe_load` prevents arbitrary Python object deserialization (security requirement).
- YAML files are version-controllable and diff-friendly for audit purposes.
- No `yaml.load` with arbitrary Loader is ever used.

---

## Decision 4: Typer CLI

**Decision:** Use Typer (`typer>=0.12`) for the CLI entry point.

**Rationale:**
- Typer provides clean, self-documenting CLI commands with type-annotated parameters.
- Phase 1 commands are fully testable without live Google API access.
- The `--apply` guard pattern is expressible cleanly as a Typer option.

---

## Decision 5: Idempotency via Deterministic Manifest

**Decision:** The provisioner maintains a manifest of created asset IDs keyed by deterministic `asset_type:normalized_name` keys.

**Rationale:**
- Prevents duplicate asset creation on rerun.
- Enables partial reruns after failure.
- Supports dry-run preview before any apply operation.
- Does not support deletion in the initial release (safety constraint).

---

## Decision 6: Phase Gate — `--apply` BLOCKED in Phase 1

**Decision:** The `provision --apply` command raises a `RuntimeError` and exits with code 1 in Phase 1. It is not merely deprecated or warned — it is hard-blocked.

**Rationale:**
- No Google authentication, OAuth consent, or Drive mutation is authorized in Phase 1.
- The block must be enforced in code, not only in documentation.
- Future authorization of `--apply` requires a separate explicit controller authorization.

---

## Decision 7: Seed Data Constraint — DRAFT Only, No CEO-Approved Values

**Decision:** All seed data YAML files contain only DRAFT placeholders with `CEO_INPUT_REQUIRED` or `COMPLIANCE_REVIEW_REQUIRED` blockers. No pricing, policy, or rule value is invented, assumed, or loaded from prior chat context.

**Rationale:**
- Prevents unapproved commercial claims from entering the system.
- Ensures the Phase 2 data payload is the single source of truth for business rules.
- Enforces the business governance boundary between "framework" (Phase 1) and "content" (Phase 2+).

---

## Security Architecture

1. `.gitignore` created before any secret or runtime state location.
2. `.secrets/`, `.runtime/`, `.exports/private/` directories are git-ignored.
3. No `client_secret.json`, `token.json`, or service account key may be tracked.
4. All Google API authentication is deferred to post-Phase 1 authorization.
5. No OAuth scope is approved in Phase 1 (see `GOOGLE_OAUTH_SCOPE_DECISION_PENDING.md`).
6. PII fields are never present in governance workbook or channel-safe exports.
7. Restricted Operations workbook data is never merged into any public export.

---

## Consequences

- Phase 1 produces a fully tested local provisioner scaffold with no live Google side effects.
- Phase 2 will require: CEO data payload delivery, OAuth scope authorization, account selection, and explicit `--apply` authorization.
- All commercial rules remain in DRAFT status until a CEO-approved release artifact is delivered.

---

## ADR-002 — Phase 1B.2: Channel Authority and Blocker Governance Hardening

**Date:** 2026-05-23
**Status:** ACCEPTED

### Context

The Phase 1B.1 final acceptance audit identified that the controlled channel
vocabulary conflated public chatbot approval with internal Copilot approval,
that open blockers lacked a first-class structured record, that per-channel
approved text had no register of its own, and that the controlled models
silently accepted unknown fields. The plan `spec_fingerprint` also covered
only the plan body and not the full spec inputs.

### Decision

1. Introduce a `ConsumerChannel` enum with one value per real consumer
   surface (`WEBSITE_PUBLIC`, `GOOGLE_ADS_PUBLIC`,
   `CUSTOMER_CHATBOT_PUBLIC`, `COPILOT_INTERNAL_DECISION_SUPPORT`,
   `QUOTE_OPERATOR_INTERNAL`, `RESTRICTED_OPERATIONS_PII`) and separate
   per-channel review-status enums (`ChatbotResponseReviewStatus`,
   `CopilotInternalReviewStatus`, `QuoteOperatorReviewStatus`). The
   legacy `ExportChannel` and `AIReviewStatus` enums are retained
   solely as backward-compatible migration aliases referenced by
   `RuleRow.export_channels` and the legacy `ai_response_review_status`
   field.
2. Add a first-class `BlockerRecord` Pydantic model with 16 governance
   fields and a dedicated YAML loader. Add `02_OPEN_BLOCKERS` as a
   POPULATE target driven by `BlockerRecord` rows; the prior derived
   FILTER view of the rule register is retired.
3. Add a `10_CHANNEL_PROJECTION_REGISTER` tab and a
   `ChannelProjectionRecord` model. All public derived views read from
   `APPROVED_FOR_RELEASE` rows in this register; downstream tabs are
   renumbered (`11_AI_CUSTOMER_RESPONSE_MATRIX`, `12_SOURCE_EVIDENCE`,
   `13_RELEASE_CHANGELOG`). `GOVERNANCE_TAB_COUNT` becomes 15.
4. Introduce `StrictControlledModel` (`extra="forbid"`) as the base
   for every controlled record; misspelled YAML keys now fail at
   construction time.
5. Add `COLUMN_MAPPING_CONTRACTS` declaring every model-field-to-column
   mapping, with a contract test that walks every entry.
6. Make `plan_metadata.spec_fingerprint` hash the canonical JSON of
   `{plan_schema_version, spec.model_dump(mode="json"), plan_body}` and
   surface `PLAN_SCHEMA_VERSION` and `SPEC_FINGERPRINT_ALGORITHM` in
   the metadata.

### Consequences

- The legacy single-AI approval shortcut is eliminated. A rule must obtain
  the specific consumer-channel approval for each channel it targets.
- Phase 1C content loading can proceed against a stable column-level
  mapping contract and a deterministic spec fingerprint that covers every
  governance input.
- Tab count change is intentional and is reflected in all docs, tests, and
  validations; no compatibility shim is retained for the old 14-tab count.
