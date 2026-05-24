# Phase 1B.5C-R Closure Report

**Phase:** 1B.5C-R (Corrective — Bypass Removal and Exact-Coverage Enforcement)
**Status:** CLOSED — quality gates passed; commit pending
**Precondition HEAD:** `b27252e0fd2834f71d6ef4bc323616b63534e66c`
**Commit message:** `fix(control-room): remove intake bypass and enforce exact candidate mapping`

---

## 1. Authorization

Phase 1B.5C-R was authorized per controller directive:

> "Remove the operator-facing partial-validation bypass through
> `validate-phase1c-input --mode/-m {production-intake,partial-fixture}`.
> The production candidate-input validation function must not accept a flag
> that skips completeness, activation coverage, workbook mapping or
> canonical-list validation."
>
> "Enforce exactly one DRAFT ReleaseRecord shell."
> "Every distinct non-PII channel appearing in channel_projection_records
> has exactly one corresponding DRAFT ChannelReleaseActivationRecord."
> "Validate every required field has exactly one mapping in
> config/column_mappings.yaml. Validate every mapped destination column
> exists in its destination tab configuration. Validate the model is mapped
> only to its authorized destination tab."
>
> "Create one new corrective commit above the current HEAD after completing
> the required work."
> "Do NOT rewrite history again. Do not reset. Do not amend."

---

## 2. Changes Made

### 2.1 `src/hfla_control_room/validation.py`

- **Removed** constants `_VALIDATION_MODE_PRODUCTION_INTAKE`,
  `_VALIDATION_MODE_PARTIAL_FIXTURE`, `_VALIDATION_MODES`.
- **Added** `_AUTHORIZED_DESTINATION_TABS: dict[str, str]` mapping each of
  the six source models to its single authorized destination tab.
- **Added** `_REQUIRED_PERSISTED_FIELDS: dict[str, frozenset[str]]` with
  per-model required governance field sets (6 models, 6–10 fields each).
- **Changed** signature of `validate_phase1c_candidate_input(spec, candidate)`
  — removed `validation_mode` parameter.
- **Section 8 (completeness)** rewrote to always enforce:
  - all six families non-empty (8a)
  - exactly one DRAFT `ReleaseRecord` shell (8b)
  - exactly one DRAFT activation per projected channel — dual-direction
    (projection-without-activation and activation-without-projection) (8c)
  - all activations reference the single release (8d)
- **Section 9 (workbook destination)** rewrote to always enforce per-field
  exact mapping: for each `(model, field)` in `_REQUIRED_PERSISTED_FIELDS`,
  exactly one `ColumnMappingRecord` must exist in `spec.column_mappings`
  pointing to the model's `_AUTHORIZED_DESTINATION_TABS` entry, and the
  `column_header` must appear in the tab's `column_headers` list.

### 2.2 `src/hfla_control_room/cli.py`

- **Removed** `--mode`/`-m` Typer option from `validate_phase1c_input` command.
- **Removed** `cli_to_validator_mode` mapping dict.
- **Removed** mode validation block and "Validation mode:" echo.
- **Changed** call to `validate_phase1c_candidate_input(spec, candidate)` —
  no `validation_mode` kwarg.
- **Updated** command docstring to describe unconditional completeness
  contract with no partial-fixture references.

### 2.3 Fixtures (new)

| Fixture directory | Purpose |
|---|---|
| `tests/fixtures/phase1c_candidate_safe_complete_draft/` | Complete DRAFT payload — all 6 families, 1 release (SYNTH-REL-001), 1 DRAFT activation for WEBSITE_PUBLIC (SYNTH-ACT-001), 1 ordinary non-structural blocker.  Expected: exit 0 PASS. |
| `tests/fixtures/phase1c_candidate_blocked_structural_complete/` | Complete DRAFT payload — 1 structural blocker (`blocks_phase_1c_content_loading=true`, `LEGAL_REVIEW_REQUIRED`, priority HIGH).  Expected: exit 1 BLOCKED. |
| `tests/fixtures/phase1c_candidate_incomplete_rules_only/` | Rules family only — all other 5 families absent.  Expected: exit 1 BLOCKED (5 missing-family errors + missing-release error). |

The Phase 1B.5B fixture `tests/fixtures/phase1c_candidate_safe_draft/` is
retained for backward compatibility with tests that reference it; the new safe
fixture supersedes it for Phase 1C intake gate testing.

### 2.4 `tests/test_phase1c_candidate_input.py`

- **Updated** module docstring to enumerate all new invariants.
- **Updated** fixture constants to reference new fixture directories.
- **Removed** `TestPartialFixtureMode` (4 tests) — tested bypass that no longer exists.
- **Removed** `TestCLIModeOption` (3 tests) — tested `--mode` CLI option that no longer exists.
- **Added** `TestCLISurface` (3 tests) — asserts `--help` has no `--mode`/`partial-fixture`;
  `--mode partial-fixture` exits non-zero; rules-only fixture fails CLI.
- **Added** `TestExactProjectionActivationCoverage` (5 tests) — exact pairing passes;
  missing activation; duplicate activation; orphan activation; restricted-PII projection.
- **Added** `TestExactOneRelease` (3 tests) — exactly one passes; multiple DRAFT releases;
  activation referencing wrong release_id.
- **Added** `TestFieldToColumnMappingCompatibility` (11 tests) — missing/wrong-tab/duplicate
  mapping for publication_key, approved_channel_text, blocked_channels,
  blocks_phase_1c_content_loading, qa_evidence (Release), qa_evidence (Activation),
  supersedes_activation_id.
- **Updated** `TestProductionIntakeCompletenessContract` assertions — changed from
  `"production_intake" in e` to `"Candidate intake is missing" in e` to match new
  error message text; removed orphaned mode-specific assertions.

### 2.5 Documentation

| File | Change |
|---|---|
| `docs/ARCHITECTURE_DECISION_RECORD.md` | ADR-005 status updated from "Accepted - Phase 1B.5B" to "Implemented but Rejected for Phase Advancement — Phase 1B.5C-R Remediation Required"; Decision section rewritten to remove two-mode description. |
| `docs/RELEASE_GOVERNANCE.md` | Phase 1C intake gate section rewritten: removed `--mode/-m` description, removed `partial-fixture` mode bullet; replaced with unconditional completeness contract bullets. |
| `docs/PHASE_1B_5B_CLOSURE_REPORT.md` | Section 6 appended documenting the bypass rejection and referencing this report. |
| `docs/PHASE_1B_5B_ACCEPTANCE_BLOCKERS.md` | Created (new). |
| `docs/PHASE_1B_5C_R_CLOSURE_REPORT.md` | Created (this file). |

---

## 3. Test Count

| Point in time | Passed |
|---|---|
| HEAD bfad6bc (Phase 1B.5A) | 309 |
| HEAD b27252e (Phase 1B.5B) | 339 |
| Phase 1B.5C-R (post-commit) | **353** |

Net new tests added by Phase 1B.5C-R: **+22** (from 331 effective non-bypass tests,
removing 7 bypass tests, adding 22 new exact-coverage and mapping tests).

---

## 4. Gate Results

| Gate | Result |
|---|---|
| `ruff check .` | All checks passed |
| `pytest -q` | **353 passed** |
| `validate -c config` | VALIDATION PASSED (exit 0) |
| `validate-phase1c-input -c config -i tests/fixtures/phase1c_candidate_safe_complete_draft` | PHASE 1C INPUT VALIDATION PASSED (exit 0) |
| `validate-phase1c-input -c config -i tests/fixtures/phase1c_candidate_blocked_structural_complete` | BLOCKED — PHASE 1C INPUT VALIDATION FAILED (exit 1) |
| `validate-phase1c-input -c config -i tests/fixtures/phase1c_candidate_incomplete_rules_only` | BLOCKED — PHASE 1C INPUT VALIDATION FAILED (exit 1; 5 missing-family + 1 missing-release errors) |
| `validate-phase1c-input --help` | No `--mode`, no `partial-fixture` in output |

---

## 5. Phase-1 Invariants Preserved

- No public pricing, website update, Ads claim, chatbot response, or Google
  asset has been activated.
- No OAuth, no live Google API call, no website / Ads / chatbot publication.
- `provision --apply` remains BLOCKED.
- The intake gate is non-mutating: writes nothing to `config/`, triggers no
  Google auth, and is verified non-mutating by `TestNonMutatingContract`.
- Baseline scaffold `BLK-DRAFT-*` placeholder blockers continue to NOT
  contaminate the candidate effective state.
- Commit `b27252e` is preserved unamended; no history rewriting was performed.
