# Phase 1B.5A Closure Report — Phase 1C Candidate Intake Gate Remediation

**Mandate:** `AUTHORIZED PHASE 1B.5A — CORRECT THE PHASE-1C CANDIDATE-INPUT GATE AND AUDIT RECORD ONLY.`

**Parent commit (unchanged):** `f1a770d` (Phase 1B.5 closure).
**Predecessor preserved:** `bf9fc72` (Phase 1B.4) — unamended.
**Phase 1B.5A commit (this work):** single commit, `fix(control-room): implement candidate phase-1c intake validation`.

---

## 1. Purpose

Phase 1B.5 introduced `check-phase1c-gate`, a CLI that validates the
*currently loaded scaffold* on disk. The Phase 1B.5A mandate identifies
four defects in the post-1B.5 record that this remediation closes:

1. The Phase 1C intake path had no non-mutating gate capable of
   validating an **external candidate Phase 1C dataset**. The scaffold
   gate cannot serve that role.
2. The controlled candidate-replacement path could be permanently
   suppressed by scaffold placeholder blockers (which are correctly
   present on baseline) — the intake gate must judge a candidate by
   the candidate's own blockers, not by the workspace baseline.
3. Publication-blocking had not been independently proven on all
   five exportable consumer channels with the full four-condition
   matrix.
4. The Phase 1B.4 audit artifact filed a PASS verdict in violation of
   its read-only charter and is invalid; it must be marked rejected.

This report records the corrections in scope, behaviour, tests, gates,
and documentation. The remediation is the smallest set of changes
required to close the four defects; no other behaviour is modified.

## 2. Defects → corrections

| # | Defect | Correction |
|---|---|---|
| 1 | No non-mutating Phase 1C **intake** gate for an external candidate dataset | New CLI `validate-phase1c-input` backed by `validate_phase1c_candidate_input` in `validation.py`; loader `load_phase1c_candidate_records` accepts a single YAML or a directory of YAML files |
| 2 | Scaffold placeholder blockers could permanently block candidate intake | Intake gate evaluates the candidate's **own** blockers; baseline scaffold is never imported into the intake decision |
| 3 | Publication-blocking not proven on all five exportable channels with the four-condition matrix | New `TestCrossChannelPublicationIsolation` class parametrised over all five exportable channels with conditions (a) complete chain authorises export, (b) open blocker on this channel blocks export, (c) blocker on another channel does not suppress this channel, (d) `RESTRICTED_OPERATIONS_PII` raises `ValueError` |
| 4 | Phase 1B.4 PASS audit filed in violation of its read-only charter | File `docs/PHASE_1B_4_FINAL_ACCEPTANCE_AUDIT.md` renamed to `docs/PHASE_1B_4_ACCEPTANCE_ATTEMPT_REJECTED.md` and its contents fully rewritten to record the rejection |

## 3. Scope of code change

| File | Change |
|---|---|
| `src/hfla_control_room/validation.py` | New constants `_CANDIDATE_RECORD_KEYS`, `_RESTRICTED_VISIBILITY_FOR_INTAKE`; new `load_phase1c_candidate_records`; new `validate_phase1c_candidate_input` |
| `src/hfla_control_room/cli.py` | New `validate-phase1c-input` command with exact PASS/FAIL banners; `check-phase1c-gate` docstring updated to mark it scaffold/baseline diagnostic only; module docstring updated |
| `tests/test_phase1c_candidate_input.py` | NEW — 25 tests in 8 classes |
| `tests/test_blocker_scope_independence.py` | NEW `TestCrossChannelPublicationIsolation` class (16 parametrised tests + 1 RESTRICTED_PII test) |
| `tests/fixtures/phase1c_candidate_safe_draft/candidate.yaml` | NEW synthetic DRAFT fixture (PASS) |
| `tests/fixtures/phase1c_candidate_blocked_structural/candidate.yaml` | NEW synthetic structural-blocker fixture (FAIL) |
| `tests/fixtures/phase1c_candidate_invalid_approved/candidate.yaml` | NEW synthetic FAIL fixture (approved text on DRAFT projection) |
| `tests/fixtures/phase1c_candidate_invalid_reference/candidate.yaml` | NEW synthetic FAIL fixture (FK to nonexistent rule) |
| `docs/PHASE_1B_4_ACCEPTANCE_ATTEMPT_REJECTED.md` | RENAMED + REWRITTEN (was `PHASE_1B_4_FINAL_ACCEPTANCE_AUDIT.md`) |
| `docs/PHASE_1B_5_CLOSURE_REPORT.md` | Updated references to the renamed audit artifact |
| `docs/ARCHITECTURE_DECISION_RECORD.md` | New decision section: intake-gate distinction (scaffold vs candidate) |
| `docs/RELEASE_GOVERNANCE.md` | Phase 1C bullet updated to document the intake gate |
| `docs/PHASE_1B_5A_CLOSURE_REPORT.md` | NEW — this document |

## 4. `validate-phase1c-input` CLI contract

**Command:** `hfla-control-room validate-phase1c-input --config <config-dir> --input <candidate-path>`

**Input:** Either a single `*.yaml`/`*.yml` file or a directory containing
one or more `*.yaml`/`*.yml` files. Permitted top-level keys are:
`rules`, `evidence_records`, `blocker_records`,
`channel_projection_records`, `release_records`,
`channel_release_activations`. Any unknown key is a hard failure.

**Behaviour:**

- Per-record strict Pydantic validation (`extra="forbid"`).
- Register-level uniqueness enforcement.
- DRAFT-only state checks: rules must be `DRAFT`; releases must be
  `release_status=DRAFT`; activations must be `activation_status=DRAFT`;
  projections must be `release_status=DRAFT` with empty
  `approved_channel_text`.
- Foreign-key integrity within the candidate (projection → rule and
  release → projection).
- Structural blocker gate applied to the candidate's own
  `blocker_records` via `validate_no_phase_1c_loading_blockers`.
- Ordinary OPEN blockers (`blocks_phase_1c_content_loading=False`) are
  surfaced as **warnings**, not failures.
- `RESTRICTED_OPERATIONS_PII` rules are rejected outright.
- Performs **no writes** anywhere. Performs **no** OAuth, Google API,
  or network activity.

**Exit codes and banners:**

- PASS → exit 0:
  `PHASE 1C INPUT VALIDATION PASSED — DRAFT CONTENT MAY BE LOADED ONLY AFTER SEPARATE CONTROLLER AUTHORIZATION.`
- FAIL → exit 1:
  `BLOCKED — PHASE 1C INPUT VALIDATION FAILED`

**A passing run authorises nothing on its own.** It establishes
eligibility for separate controller authorisation to proceed with the
content-loading step. The loading step itself is not part of Phase
1B.5A and is not implemented here.

## 5. `check-phase1c-gate` is scaffold/baseline diagnostic only

`check-phase1c-gate` continues to exist for diagnostic use against the
currently-loaded YAML scaffold in the workspace `config/` directory.
Its docstring and the module docstring have been updated to state
explicitly that it does **not** validate any external candidate Phase
1C dataset and must not be used as the intake gate for new content.
The seed scaffold legitimately fails this gate today because three
structural placeholder blockers are OPEN, which is the correct and
intended baseline state.

## 6. Test coverage — `tests/test_phase1c_candidate_input.py`

Eight test classes, 25 tests, all passing:

| Class | Tests | Verifies |
|---|---|---|
| `TestSafeAndBlockedCandidates` | 2 | Safe DRAFT fixture → PASS; structural-blocker fixture → FAIL with banner |
| `TestBaselineScaffoldIsolation` | 1 | Workspace scaffold's OPEN structural blockers do not affect intake decision on candidate |
| `TestDraftOnlyStateChecks` | 4 | Approved rule / released release / active activation / approved projection text are each rejected |
| `TestForeignKeysAndUniqueness` | 4 | FK integrity (projection→rule, release→projection); duplicate IDs rejected |
| `TestSchemaAndRestrictedPII` | 3 | Unknown top-level key rejected; unknown record field rejected (extra forbid); `RESTRICTED_OPERATIONS_PII` rejected |
| `TestNonMutatingContract` | 2 | No mutation of `config/` (sha256 snapshot before/after); no `hfla_control_room.google_auth` import path triggered |
| `TestCLIInterface` | 6 | Exact PASS/FAIL banners; non-zero exit on FAIL; zero exit on PASS; counts and warnings reported; directory of YAML files accepted; missing input path rejected |
| `TestLoader` | 3 | Loader accepts single YAML, accepts directory of YAML, rejects unknown top-level key |

## 7. Test coverage — `TestCrossChannelPublicationIsolation`

New class in `tests/test_blocker_scope_independence.py`. The class
proves all four conditions across every exportable consumer channel
(`WEBSITE_PUBLIC`, `GOOGLE_ADS_PUBLIC`, `CUSTOMER_CHATBOT_PUBLIC`,
`COPILOT_INTERNAL`, `QUOTE_OPERATOR_INTERNAL`):

| Test | Verifies |
|---|---|
| `test_a_complete_chain_authorises_export[<channel>]` | A complete otherwise-valid synthetic export chain succeeds (1 exported record on the requested channel) |
| `test_b_open_blocker_on_this_channel_blocks_export[<channel>]` | An OPEN publication-only blocker listing this channel suppresses export (0 records) |
| `test_c_blocker_on_other_channel_does_not_suppress_this_channel[<channel>]` | A publication-only blocker listing a different channel leaves this channel exportable; `channel_publication_blockers_for_channel` returns `[]` for the unaffected channel |
| `test_d_restricted_operations_pii_channel_cannot_be_emitted` | `export_for_channel(RESTRICTED_OPERATIONS_PII, …)` raises `ValueError` |

## 8. Quality gates

| Gate | Command | Result |
|---|---|---|
| Linter | `ruff check .` | All checks passed |
| Tests (collect) | `pytest --collect-only -q` | 309 tests collected |
| Tests (run) | `pytest -q` | 309 passed |
| Spec validation | `validate -c config` | VALIDATION PASSED |
| Dry-run plan | `plan -c config -o artifacts/dry_run` | Deterministic plan generated |
| Phase 1C scaffold diagnostic | `check-phase1c-gate -c config` | BLOCKED (correct — scaffold placeholder structural blockers are OPEN) |
| Phase 1C intake — safe fixture | `validate-phase1c-input -c config -i tests/fixtures/phase1c_candidate_safe_draft` | PASS banner; exit 0 |
| Phase 1C intake — blocked fixture | `validate-phase1c-input -c config -i tests/fixtures/phase1c_candidate_blocked_structural` | FAIL banner; exit 1 |
| Live provisioning (dry-run) | `provision --dry-run` | OK, no side effects |
| Live provisioning (apply) | `provision --apply` | BLOCKED, exit 1 (unchanged) |
| Git tree (post-commit) | `git status --short` | clean |

## 9. Phase 1 boundaries reaffirmed

- `provision --apply` remains hard-blocked at the CLI level (exit 1).
- No OAuth credentials are present, loaded, or required.
- No live Google API call is made by any command introduced here.
- No real Happy Faces LA business content has been added; all
  fixtures are synthetic and isolated under `tests/fixtures/`.
- All 19 seed rules remain DRAFT; the single seed release placeholder
  remains DRAFT; the single seed activation placeholder remains
  DRAFT; all three seed projections remain DRAFT with empty
  `approved_channel_text`.
- The frozen 15-tab workbook is unchanged.

## 10. Non-mutation invariants of the intake gate

The intake gate is provably non-mutating because:

- `validate_phase1c_candidate_input` is a pure function over Python
  objects; it constructs Pydantic models in memory only.
- `load_phase1c_candidate_records` only reads files via
  `Path.read_text` and YAML parsing; it never opens any path for
  writing.
- The CLI command performs no `open(..., 'w')`, no manifest update,
  no Google client construction, and no OAuth call.
- `TestNonMutatingContract` enforces both invariants in CI:
  a sha256 snapshot of `config/` is identical before and after the
  CLI runs, and `hfla_control_room.google_auth` is not imported.

## 11. Forward path

Phase 1C content loading remains blocked. Before any Phase 1C
loading action is authorised, all of the following must hold:

1. An independent read-only acceptance of Phase 1B.5A (separate
   session, no tracked-file mutation, against the post-1B.5A HEAD)
   has produced a PASS verdict.
2. The candidate dataset has been passed to `validate-phase1c-input`
   and the exact PASS banner has been emitted.
3. A separate controller authorisation explicitly authorises the
   loading step.

None of those are accomplished by this commit. Phase 1B.5A only
delivers the *gate* and the rejected-audit record. The loading
implementation, the OAuth flow, the live Google asset creation, and
the public-channel emission paths remain out of scope.

---

*Author: Implementation agent under Phase 1B.5A mandate.*
*This report does not constitute acceptance.* Acceptance must be
issued by a separate, read-only verification session.
