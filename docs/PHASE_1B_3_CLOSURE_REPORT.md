# Phase 1B.3 Closure Report

**Phase:** 1B.3 — Enforce projection-based exports and release gating
**Commit title:** `fix(control-room): enforce projection exports and release gating`
**Predecessor commit:** `7779834` (Phase 1B.2 closure — audit verdict FAIL)
**Spec fingerprint (new):** `76a5eff8e00f316edfbc3eadcdedbce3e05611cea458bc259a9d40c3a3621056`
**Plan operations (new):** 31 (was 30)
**Date:** 2026-05-23

---

## 1. Mandate and Scope

Close defects D1–D7 from the Phase 1B.2 Final Acceptance Audit by:

- Removing all rule-level channel-text / channel-list fields.
- Introducing `ReleaseRecord` as the sole channel-publish authority.
- Rewriting `release_exporter` to gate on the
  (projection, rule, release, blocker) tuple per ADR-003.
- Moving the column-mapping contract from a Python constant into YAML so
  `spec_fingerprint` covers it.
- Enforcing `extra="forbid"` on every top-level controlled model.
- Fixing the Phase 1B.2 closure report inaccuracies in §8 and §12 and
  publishing the missing audit document.
- Producing this 17-section closure report.

Phase 1 invariants UNCHANGED: no live Google API calls; `provision --apply`
exits 1 with the verbatim block message; no preserved commit modified.

---

## 2. Defect Resolution Matrix

| Defect | Title | Resolution |
|---|---|---|
| D1 | release_exporter bypasses ChannelProjectionRecord | `release_exporter.py` rewritten; 6-gate check on projection+rule+release+blocker. |
| D2 | spec_fingerprint missing column-mapping contract | `COLUMN_MAPPING_CONTRACTS` removed from `constants.py`; `config/column_mappings.yaml` (72 records) added; `FullConfigSpec.column_mappings` participates in fingerprint. |
| D3 | test_release_gate.py uses deprecated RuleRow fields | Test file rewritten; uses `ConsumerChannel`, real ChannelProjectionRecord/ReleaseRecord/BlockerRecord fields. |
| D4 | validation_lists / rule_schema reference legacy fields | Removed `export_channel` list and `export_channels` schema field; added `release_status`, `ceo_release_decision`, `projection_release_status`, `consumer_channel`, `qa_status` lists. |
| D5 | Strict-schema enforcement partial | `WorkbookSpec`, `TabSpec`, `DocumentSpec`, `DocSection`, `FullConfigSpec`, `ReleaseRecord`, `ColumnMappingRecord` all inherit `StrictControlledModel` (`extra="forbid"`); new contract tests added. |
| D6 | Closure report §8 lists wrong tab titles | Section rewritten to match the frozen 15-tab inventory in `config/governance_workbook.yaml`. |
| D7 | Closure report §12 is aspirational | Section rewritten with real `provision --apply` exit-1 evidence and verbatim block message. |

---

## 3. Architecture Change Summary (ADR-003)

`RuleRow` governs *policy approval only*.  `ChannelProjectionRecord`
owns *per-channel approved text*.  `ReleaseRecord` is the *only* artifact
that can promote one or more projections to `RELEASED` on a consumer
channel.  The release exporter checks six gates.  See
`docs/ARCHITECTURE_DECISION_RECORD.md` → ADR-003.

---

## 4. Model Changes

- **Removed from `RuleRow`:** `export_channels`, `approved_export_text`,
  `ai_response_review_status`.
- **Removed from `constants.py`:** `ExportChannel`, `AIReviewStatus`,
  `COLUMN_MAPPING_CONTRACTS`.
- **Added to `constants.py`:** `ReleaseStatus`, `CEOReleaseDecision`,
  `ImplementationStatus`, `QAStatus`.
- **Added to `models.py`:** `ReleaseRecord`, `ReleaseRegister`,
  `ColumnMappingRecord`, `ColumnMappingRegister`,
  `ApprovedProjectionExport`.
- `FullConfigSpec` now carries `release_records: list[ReleaseRecord]` and
  `column_mappings: list[ColumnMappingRecord]`.

---

## 5. Exporter Rewrite

`src/hfla_control_room/release_exporter.py` reduced to a single public
entry point:

```python
def export_for_channel(
    channel: ConsumerChannel,
    *,
    projections: list[ChannelProjectionRecord],
    rules: list[RuleRow],
    releases: list[ReleaseRecord],
    blockers: list[BlockerRecord],
) -> list[ApprovedProjectionExport]: ...
```

`RESTRICTED_OPERATIONS_PII` raises `ValueError` at function entry — no
automated export path exists for it in Phase 1.  No projection is emitted
in Phase 1: every seed release is DRAFT.

---

## 6. Column-Mapping Move (D2)

`config/column_mappings.yaml` carries 72 records covering RuleRow,
ChannelProjectionRecord, BlockerRecord, EvidenceRecord, and ReleaseRecord
columns.  `spec_loader.load_full_spec` validates uniqueness across
`(source_model, destination_tab, column_header)` via `ColumnMappingRegister`.
Mutating any mapping flips `spec_fingerprint`
(see `tests/test_fingerprint_coverage.py::test_mutating_column_mapping_flips_fingerprint`).

---

## 7. Configuration Integrity (D4)

- `config/validation_lists.yaml`: removed legacy `export_channel` list;
  added `release_status`, `ceo_release_decision`,
  `projection_release_status`, `consumer_channel`, `qa_status`;
  realigned `implementation_status` values to match
  `ImplementationStatus` enum.
- `config/rule_schema.yaml`: removed `export_channels` field; header
  comment now states that per-channel approved text lives on
  `ChannelProjectionRecord`.
- All seed YAML files: `export_channels:` lines stripped.
- `config/seed_data/release_placeholders.yaml`: 1 DRAFT placeholder
  release `REL-2026-001`.

---

## 8. Governance Tab Inventory (UNCHANGED — 15 tabs)

`00_CONTROL_CENTER`, `01_CEO_APPROVAL_QUEUE`, `02_OPEN_BLOCKERS`,
`03_RULE_REGISTER_MASTER`, `04_ACTIVE_RULES_EXPORT`,
`05_PUBLIC_PRICING_PACKAGES`, `06_INTERNAL_QUOTE_TRAVEL_RULES`,
`07_BOOKING_POLICY_COMPLIANCE`, `08_VENDOR_SCHOOL_CORPORATE_RULES`,
`09_CHANNEL_IMPLEMENTATION_MAP`, `10_CHANNEL_PROJECTION_REGISTER`,
`11_AI_CUSTOMER_RESPONSE_MATRIX`, `12_SOURCE_EVIDENCE`,
`13_RELEASE_CHANGELOG`, `99_VALIDATION_CONFIG`.

`13_RELEASE_CHANGELOG` column headers updated to match `ReleaseRecord`.

---

## 9. Plan Operation Inventory

31 operations (was 30):

- 14 folder ops
- 2 spreadsheet file ops
- 2 spreadsheet config ops
- 2 document file ops
- 2 document config ops
- 5 populate ops (now includes `POPULATE_RELEASE_CHANGELOG`)
- 4 derive ops (DERIVE_ACTIVE_RULES_EXPORT now filters on
  `status in (APPROVED_AS_RECOMMENDED, APPROVED_WITH_CONDITIONS)
  AND ceo_decision is non-empty`)

`plan_metadata.data_population` now reports `release_record_count`.

---

## 10. Strict-Schema Enforcement (D5)

`WorkbookSpec`, `TabSpec`, `DocumentSpec`, `DocSection`, `FullConfigSpec`,
`ReleaseRecord`, `ColumnMappingRecord` all reject unknown fields at
construction.  Coverage tests added in `tests/test_strict_schema.py`
(`TestStrictSchemaAllInputs`).

---

## 11. Test Suite Changes

**Added (4):**
`test_release_record_contract.py` (11),
`test_release_exporter_authority.py` (5),
`test_column_mapping_yaml_contract.py` (5),
`test_validation_lists_canonical.py` (parametrised over 9 enums + 2).

**Modified:**
`test_strict_schema.py` (+7 new strict-schema cases),
`test_fingerprint_coverage.py` (+3 mutation cases:
release/column-mapping/validation-list),
`test_mapping_contract.py` (+1 case for
`POPULATE_RELEASE_CHANGELOG`),
`test_dry_run_plan.py` (op count → 31),
`test_release_gate.py` (rewritten),
`test_column_mapping_contract.py` (rewritten to load YAML),
`test_no_pii_in_governance_export.py`,
`test_consumer_channel_authority.py`,
`test_rule_id_uniqueness.py`.

**Deleted:** `test_channel_safety_branches.py`.

---

## 12. Documentation Changes

- New: `docs/PHASE_1B_2_FINAL_ACCEPTANCE_AUDIT.md` (verdict FAIL on
  `7779834`; defects D1–D7).
- New: `docs/PHASE_1B_3_CLOSURE_REPORT.md` (this document).
- Updated: `docs/PHASE_1B_2_CLOSURE_REPORT.md` §8 (real tab list) and
  §12 (real post-commit evidence with verbatim block message and the
  side-effect statement).
- Added: ADR-003 in `docs/ARCHITECTURE_DECISION_RECORD.md`.
- Addenda appended to `docs/SECURITY_AND_DATA_BOUNDARIES.md`,
  `docs/RELEASE_GOVERNANCE.md`, `docs/PHASE_1_BUILD_REPORT.md`.

---

## 13. Quality Gate Results (Post-Commit)

- `ruff check .` — **All checks passed** (E, F, W, I, UP, B, S;
  line-length 100; no per-file ignores other than `tests/* = ["S101"]`).
- `pytest -q` — **220 passed** post-commit
  (`test_plan_determinism` exercises `git status` against the tracked
  plan artifacts; pre-commit it shows 1 failure by design — the plan
  changed because operations went from 30 → 31).
- `hfla-control-room validate -c config` — VALIDATION PASSED
  (15 governance tabs, 9 restricted tabs, 19 seed rules, 1 DRAFT release,
  72 column mappings).
- `hfla-control-room plan -c config` — 31 operations,
  fingerprint `76a5eff8e00f316edfbc3eadcdedbce3e05611cea458bc259a9d40c3a3621056`,
  re-emission byte-identical.
- `hfla-control-room provision --dry-run -c config` — exit 0, no live calls.
- `hfla-control-room provision --apply -c config` — **exit 1** with
  verbatim message
  `BLOCKED — LIVE GOOGLE PROVISIONING NOT AUTHORIZED IN PHASE 1.`

> No tracked-file changes, commits, OAuth actions or live Google
> mutations occurred during acceptance verification.  Git-ignored
> runtime receipts may have been written by approved local verification
> commands.

---

## 14. What Phase 1B.3 Does NOT Do

- Does **not** authorize any live Google API call.
- Does **not** load real customer content; every seed rule remains DRAFT;
  every seed projection remains DRAFT; every seed release is DRAFT.
- Does **not** introduce any new `APPROVED_FOR_*` status on any seeded
  record.
- Does **not** enable the `RESTRICTED_OPERATIONS_PII` channel.
- Does **not** amend, force-push, or modify any preserved commit
  (`1b95eec`, `b00fec0`, `0b1162d`, `7779834`).
- Does **not** retain any compatibility shim for the removed
  `export_channels` / `approved_export_text` /
  `ai_response_review_status` fields — they are deleted, not deprecated.

---

## 15. Phase 1C Preconditions Now Met

- Single channel-publish authority is `ReleaseRecord`.
- Column-mapping contract is governed YAML and participates in the
  fingerprint.
- Every controlled model is strict.
- Every governance input mutation surfaces as plan drift.
- The 13_RELEASE_CHANGELOG tab schema matches the `ReleaseRecord` model
  1:1.

---

## 16. Known Gaps / Deferred to Phase 1C

- No CEO-approved release exists yet; the exporter therefore emits an
  empty approved set for every channel (expected).
- `ChannelProjectionRecord.draft_channel_text` placeholders carry no
  real customer-facing copy.
- The `RESTRICTED_OPERATIONS_PII` channel has no automated export path
  and will remain rejected until a separate authorization is granted.

---

## 17. Sign-Off

Defects D1–D7 from the Phase 1B.2 Final Acceptance Audit are closed.
The repository is on the projection-based exports + release-gating
architecture documented in ADR-003.  All Phase 1 invariants
(no-live-Google-calls, preserved-commits, strict-schema, deterministic
plan, no PII in any channel-safe output) hold.

Phase 1B.3 is **READY FOR CEO ACCEPTANCE**.

---

## 15. Post-Audit Correction (Phase 1B.4)

This closure report originally claimed completion of release-conflict control.
The Phase 1B.3 final acceptance audit (see `docs/PHASE_1B_3_FINAL_ACCEPTANCE_AUDIT.md`)
identified two governance defects:

- **R1** — Blocker scope independence: the release-gate exporter coupled the
  publication decision to `blocks_live_provisioning`; the three blocker scopes
  are now decided independently.
- **R2** — Current-release authority and supersession: `RELEASED` plus channel
  authorisation was insufficient to identify the active output for a channel;
  a first-class `ChannelReleaseActivationRecord` was introduced with
  at-most-one-ACTIVE-per-channel and explicit `supersedes_activation_id`.

Final acceptance of Phase 1B.3 was therefore withheld pending the Phase 1B.4
remediation. See `docs/PHASE_1B_4_CLOSURE_REPORT.md` for the closure that
actually delivered conflict control. The `5 files added` accounting in this
report is superseded by the file accounting in the Phase 1B.4 report.
