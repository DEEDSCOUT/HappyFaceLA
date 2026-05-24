# PHASE 1B.1 — FINAL ACCEPTANCE AUDIT

**Authorization executed:** `AUTHORIZED PHASE 1B.1 FORENSIC INDEPENDENT ACCEPTANCE AUDIT`
**Audited commit:** `0b1162d50d6730c2cb3aa96d5f71d6323429f6b5` (`fix(control-room): close phase-1b acceptance gaps`)
**Predecessor commits considered:** `b00fec0`, `1b95eec`
**Branch:** `main`
**Auditor stance:** independent, treating the work as untrusted until proven
**Live Google calls during audit:** **FALSE**
**OAuth performed:** **FALSE**

---

## VERDICT

**FAIL** — Phase 1B.1 closed the originally-named gaps from
[PHASE_1B_ACCEPTANCE_AUDIT.md](PHASE_1B_ACCEPTANCE_AUDIT.md), but the
independent re-audit identified a higher-order class of governance defects in
the schema itself that must be closed before any commercial dataset can be
loaded in Phase 1C.

The defects below are architectural — they cannot be remediated by adding
seed rows or comments; they require schema and validator changes. Phase 1B.2
was authorized to perform that remediation.

---

## 1. Scope of Re-Audit

This audit independently re-examined every artifact produced through commit
`0b1162d` against the original Phase 1 charter:

- governance workbook schema (`config/governance_workbook.yaml`)
- restricted operations workbook schema
- rule schema and validation lists
- Pydantic models (`src/hfla_control_room/models.py`)
- constants and controlled vocabularies (`src/hfla_control_room/constants.py`)
- spec loader, plan builder, validators, manifest
- seed rule and source-evidence registers
- dry-run plan artifacts
- closure documentation set

---

## 2. Passes Re-Confirmed

- No remote configured, no push, no force-push, no amend of historical commits.
- No PII, no live policy text, no real customer data anywhere in the tracked tree.
- `.runtime/`, `.secrets/`, `.exports/private/` git-ignored and clean.
- Dry-run plan determinism: `cli plan` against unchanged config produces a
  byte-identical tracked plan.
- Wall-clock timestamps appear only in the git-ignored runtime receipt.
- All Phase 1B.1 charter test branches (12) pass.

---

## 3. New Architectural Blockers Discovered

### BLK-NEW-1 — Customer chatbot and internal Copilot review approvals are conflated

The `ExportChannel` controlled vocabulary uses the vague tokens `chatbot` and
`ai_copilot`, and a single `RuleRow.ai_response_review_status` field with a
single `AIReviewStatus.APPROVED_FOR_AI` value gates *both* of them. A rule
approved for one consumer surface is therefore silently approved for the other.

These are not the same audience. Public customer chatbot responses must be
reviewed for brand voice, marketing compliance, advertised-claim parity and
customer-facing safety. Internal Copilot guidance is reviewed for quote-desk
correctness and operator-judgement support. Sharing one approval gate is a
release-safety defect.

**Required fix:** split the gate. Introduce a `ConsumerChannel` enum
(`WEBSITE_PUBLIC`, `GOOGLE_ADS_PUBLIC`, `CUSTOMER_CHATBOT_PUBLIC`,
`COPILOT_INTERNAL_DECISION_SUPPORT`, `QUOTE_OPERATOR_INTERNAL`,
`RESTRICTED_OPERATIONS_PII`) and per-channel review-status fields with
per-channel `APPROVED_FOR_…` values. Update validators so approval on one
channel does not grant approval on another.

### BLK-NEW-2 — Open blockers have no first-class record schema

`02_OPEN_BLOCKERS` is implemented today as a derived FILTER view of the rule
register, with `RuleRow.blockers: list[BlockerType]` carrying four enum tags
and no structured context (decision required, why it matters, risk if missing,
priority, owner, blocked channels, blocks-Phase-1C flag, resolution evidence).
A blocker register without that structure cannot be CEO-reviewed and cannot
be safely closed.

**Required fix:** introduce a first-class `BlockerRecord` model with the full
governance schema, a dedicated YAML loader, a `POPULATE_OPEN_BLOCKERS` plan
operation that targets `02_OPEN_BLOCKERS` directly, and a validator that
enforces uniqueness, linkage integrity, and the CRITICAL-OPEN → blocks-Phase-1C
invariant.

### BLK-NEW-3 — No channel projection register

There is no register in which the per-channel approved text for a rule lives.
The downstream derived views (e.g. `10_AI_CUSTOMER_RESPONSE_MATRIX`) read
directly from the rule register, conflating the policy (single normative rule)
with its many channel surfaces (per-channel approved text, escalation flags,
policy version, effective date). This makes it impossible to track per-channel
review status, per-channel release status, or per-channel evidence of approval.

**Required fix:** add a `10_CHANNEL_PROJECTION_REGISTER` tab, a
`ChannelProjectionRecord` model, a populate operation, and an integrity
validator. All public derived views must read from APPROVED_FOR_RELEASE rows
in the projection register, never from the rule register directly.

### BLK-NEW-4 — Controlled models accept unknown fields silently

Pydantic models including `RuleRow`, `EvidenceRecord`, `ManifestEntry`,
`TabSpec`, and `WorkbookSpec` were declared without `extra="forbid"`. A
misspelled YAML key (e.g. `drive_id` instead of `drive_file_id`) is silently
dropped, with the parsed object passing all downstream validation. The Phase
1B audit script in `scripts/audit_phase_1b.py` actually demonstrated this
defect by constructing `ManifestEntry(drive_id=...)` and recording a normal
manifest — the misspelled field was discarded without notice.

**Required fix:** add a `StrictControlledModel` base class with
`model_config = ConfigDict(extra="forbid")` and apply it to every controlled
record.

### BLK-NEW-5 — Plan spec_fingerprint does not cover all spec inputs

The current `_compute_spec_fingerprint(plan_body)` hashes only the plan body
JSON. Mutations to rule text, evidence text, blocker context, or workbook tab
purpose can in principle leave the fingerprint unchanged because they
contribute identically to certain plan operation shapes (record counts and
ID lists, not text). The fingerprint must therefore prove that every input
the plan was built from is identical, not merely that the plan body looks
identical.

**Required fix:** hash the canonical JSON of
`{plan_schema_version, spec: spec.model_dump(mode="json"), plan_body}`. Add
`PLAN_SCHEMA_VERSION` and `SPEC_FINGERPRINT_ALGORITHM` constants and surface
both in `plan_metadata`.

### BLK-NEW-6 — No column-level mapping contract

`PHASE_1B_1_CLOSURE_REPORT.md` documents the mapping contract at the *tab*
level only. There is no machine-checked declaration of which model field
maps to which column header in which destination tab, with which visibility
class, which CEO-editability and which exportability flag. The Phase 1C
content-loading step therefore has no contract to validate against and would
have to be hand-coded.

**Required fix:** add `COLUMN_MAPPING_CONTRACTS` to constants, declaring one
entry per model field with `{source_field, destination_tab, column_header,
required, editable_by_ceo, formula_derived, exportable, visibility}`. Add a
test that asserts every entry's tab is in `GOVERNANCE_DESTINATION_TABS`,
every header exists in that tab's `column_headers`, and every source_field
exists on the corresponding Pydantic model.

### BLK-NEW-7 — `GOVERNANCE_TAB_COUNT` is a constant but Phase 1B.1 closure report locks the count at 14

The Phase 1B.1 closure report stated `required_tab_count: 14` is a contract.
Phase 1B.2 must add `10_CHANNEL_PROJECTION_REGISTER` to fix BLK-NEW-3, which
necessarily moves the count to 15. The closure report and all dependent
validations / tests must be updated to reflect the new count.

**Required fix:** update `GOVERNANCE_TAB_COUNT = 15`, renumber dependent tabs
(`10_AI_CUSTOMER_RESPONSE_MATRIX` → 11, `11_SOURCE_EVIDENCE` → 12,
`12_RELEASE_CHANGELOG` → 13), and update all docs / tests accordingly.

---

## 4. Documentation Defects

- `PHASE_1B_1_CLOSURE_REPORT.md` declares "**Added (4):**" but actually adds
  itself as well — the true count is 5.
- The same report cites a stale SHA-7 (`ba82668`) for the closure commit; the
  real commit on `main` is `0b1162d50d6730c2cb3aa96d5f71d6323429f6b5`.

---

## 5. Informational Findings (not blockers)

- The 02_OPEN_BLOCKERS dropdown lacks the new CRITICAL/HIGH/MEDIUM/LOW
  priority axis; will be added with the BlockerRecord schema.
- The 12_SOURCE_EVIDENCE tab lacked `Status` and `Reliability Tier` columns
  even though the EvidenceRecord model has both fields; Phase 1B.2 adds them.
- The plan builder lacks an explicit `plan_schema_version`; Phase 1B.2 adds
  `PLAN_SCHEMA_VERSION = "1.1.0"`.

---

## 6. Authorization

Phase 1B.2 is authorized to remediate all blockers in §3 and the doc defects
in §4 in a single commit titled exactly:

```text
fix(control-room): harden channel authority and blocker governance
```

Commits `1b95eec`, `b00fec0`, and `0b1162d` must be preserved. No amend, no
remote, no push, no live Google calls. The closure of these blockers must be
documented in `PHASE_1B_2_CLOSURE_REPORT.md` (17 sections).
