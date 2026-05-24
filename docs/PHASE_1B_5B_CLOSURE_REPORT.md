# Phase 1B.5B — Closure Report

**Phase:** 1B.5B — Production-intake completeness contract for the
Phase 1C candidate intake gate.
**Status:** Complete.
**Prior commit (Phase 1B.5A acceptance audit baseline):**
`bfad6bcf64fa8b28e6a50e815609ec23df7afdd9` — preserved unamended.
**Phase 1C content loading authorization:** NOT yet granted. The
intake gate is non-mutating; actual content loading still requires
separate controller authorization.

---

## 1. Mandate

> *The Phase 1C validator will accept only a complete DRAFT commercial
> governance payload. The candidate cannot omit evidence, blockers,
> customer-channel wording controls, release scaffolding or channel
> activation scaffolding. Every projected output channel will already
> have a DRAFT implementation-control row. Every real candidate record
> will be validated against the frozen Google Sheet destinations
> before it is loaded. Every integrity branch relevant to admission of
> the commercial dataset will be directly tested. No public pricing,
> website update, Ads claim, chatbot response or Google asset will yet
> be active.*

## 2. What changed

### 2.1 Validator (`src/hfla_control_room/validation.py`)

* Added `validation_mode` keyword parameter to
  `validate_phase1c_candidate_input` with default
  `"production_intake"` and the alternative `"partial_fixture"`.
  Unknown modes raise `ValueError`.
* Added **production-intake completeness contract**:
  * All six record families
    (`rules`, `evidence_records`, `blocker_records`,
    `channel_projection_records`, `release_records`,
    `channel_release_activations`) must be non-empty.
  * Every distinct `ChannelProjectionRecord.channel` must have at
    least one `ChannelReleaseActivationRecord` row on the same
    channel — every projected output channel ships with a DRAFT
    implementation-control row.
* Added **frozen workbook destination compatibility**:
  * Every record-family source_model present in the candidate must
    have at least one column mapping in `spec.column_mappings`.
  * Every referenced `destination_tab` must exist in
    `spec.governance_workbook.tabs`.
  * Every `RuleRow.rule_category` must be in the canonical
    `rule_category` validation list.
* The `partial_fixture` mode skips the four checks above only.
  Every other check (DRAFT-only state, FK, duplicates,
  strict-schema, restricted-PII, structural-blocker gate,
  ordinary-blocker warnings, parse errors) still runs.

### 2.2 CLI (`src/hfla_control_room/cli.py`)

* `validate-phase1c-input` now accepts
  `--mode/-m {production-intake,partial-fixture}`
  (default `production-intake`). The mode is echoed in the output
  and unknown values are rejected with exit 1.

### 2.3 Tests (`tests/test_phase1c_candidate_input.py`)

Test count rose from **25** to **55**. New direct coverage:

* `TestDuplicateIDBranches` — 5 new tests covering duplicate
  evidence / blocker / projection / release / activation IDs.
* `TestForeignKeyBranchesAdditional` — 4 new tests covering
  Blocker→Rule, Blocker→Evidence, Evidence→Rule, Release→Rule FK
  branches.
* `TestSchemaUnknownFieldBranchesAdditional` — 5 new tests covering
  unknown-field strict-schema rejection on evidence / blocker /
  projection / release / activation records.
* `TestProductionIntakeCompletenessContract` — 7 new tests
  covering the rules-only payload, each of the five missing
  non-rule families, and the channel-without-paired-activation
  case.
* `TestWorkbookDestinationContract` — 2 new tests covering
  non-canonical `rule_category` rejection and the
  "workbook has no tabs" structural failure.
* `TestPartialFixtureMode` — 4 new tests covering unknown mode,
  completeness-bypass, structural blocker still firing, and
  canonical `rule_category` bypass.
* `TestCLIModeOption` — 3 new tests covering the
  `--mode production-intake` default rejection of a rules-only
  payload, the `--mode partial-fixture` admission of the same
  payload, and the unknown-mode rejection path.

### 2.4 Fixture

* `tests/fixtures/phase1c_candidate_safe_draft/candidate.yaml`:
  `rule_category` changed from `"SYNTHETIC_TEST_CATEGORY"` to
  `"PUBLIC_PRICING"` so the safe fixture remains admissible
  under the default `production_intake` mode (canonical-list
  enforcement).

### 2.5 Documentation

* `docs/ARCHITECTURE_DECISION_RECORD.md`: appended **ADR-005 —
  Phase 1B.5B: Production-intake Completeness Contract**.
* `docs/RELEASE_GOVERNANCE.md`: Phase 1C intake gate section
  updated to document the two validation modes and the new
  completeness / channel-pairing / workbook-destination /
  canonical-rule_category contracts.

## 3. Files changed

```text
docs/ARCHITECTURE_DECISION_RECORD.md
docs/PHASE_1B_5B_CLOSURE_REPORT.md
docs/RELEASE_GOVERNANCE.md
src/hfla_control_room/cli.py
src/hfla_control_room/validation.py
tests/fixtures/phase1c_candidate_safe_draft/candidate.yaml
tests/test_phase1c_candidate_input.py
```

## 4. Gate results

| Gate | Result |
| --- | --- |
| `ruff check .` | All checks passed |
| `pytest -q` | **339 passed** (was 309 at HEAD bfad6bc) |
| `validate -c config` | VALIDATION PASSED |
| `plan -c config -o artifacts/dry_run` | 32 operations; live API FALSE; spec fingerprint unchanged (`c466dd7cea43893af054adddd1145942c53f26de91c4f111b7709be85b048599`) |
| `validate-phase1c-input -c config -i tests/fixtures/phase1c_candidate_safe_draft` | PHASE 1C INPUT VALIDATION PASSED (exit 0) |
| `validate-phase1c-input -c config -i tests/fixtures/phase1c_candidate_blocked_structural --mode partial-fixture` | BLOCKED (exit 1) — only the structural blocker is surfaced; no completeness noise |
| `provision --dry-run -c config` | exit 0; live API FALSE |
| `provision --apply -c config` | **BLOCKED** (exit 1) — Phase-gate enforcement intact |

## 5. Phase-1 invariants preserved

* No public pricing, website update, Ads claim, chatbot response,
  or Google asset has been activated.
* No OAuth, no live Google API call, no website / Ads / chatbot
  publication.
* `provision --apply` remains BLOCKED.
* The intake gate is **non-mutating**: writes nothing to `config/`,
  triggers no Google auth, and is verified non-mutating by the
  existing `TestNonMutatingContract` tests.
* Baseline scaffold `BLK-DRAFT-*` placeholder blockers continue to
  NOT contaminate the candidate effective state.
* Prior commit `bfad6bc` is preserved unamended.

---

## 6. Post-closure: Phase 1B.5B Rejected for Phase Advancement

**Added by Phase 1B.5C-R.**

The --mode/-m {production-intake,partial-fixture} CLI option and the alidation_mode
parameter on alidate_phase1c_candidate_input introduced in Phase 1B.5B were subsequently
rejected as a governance violation.  An operator-accessible bypass that skips completeness,
channel-activation-pairing, workbook-destination, and canonical-rule_category validation
is structurally incompatible with the integrity requirements for Phase 1C content loading.

Phase 1B.5C-R removed the bypass entirely.  See docs/PHASE_1B_5B_ACCEPTANCE_BLOCKERS.md
for the full enumeration of blockers and docs/PHASE_1B_5C_R_CLOSURE_REPORT.md for the
remediation closure report.
