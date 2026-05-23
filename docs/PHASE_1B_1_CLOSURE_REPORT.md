# PHASE 1B.1 CLOSURE REPORT

**Authorization executed:** `AUTHORIZED PHASE 1B.1 — CLOSE ACCEPTANCE GAPS ONLY`  
**Closure commit:** the HEAD of `main` titled `fix(control-room): close phase-1b acceptance gaps`  
**Predecessor commits preserved:** `b00fec0`, `1b95eec`  
**Branch:** `main`  
**Remote push:** NONE  
**Live Google calls during remediation:** **FALSE**  
**OAuth performed:** **FALSE**

---

## 1. Workspace, Branch, HEAD, Initial Worktree Status

- Workspace: `C:\Dev\happyfacesla-commercial-control-room`
- Branch: `main`
- HEAD before Phase 1B.1: `b00fec093c5a4a40edd69017e9570f8ee7028e7a`
- HEAD after Phase 1B.1: `ba82668` (single new commit)
- Initial `git status --short`: dirty — `artifacts/dry_run/control_room_build_plan.{json,md}` modified by the act of running `cli plan` during the Phase 1B audit.

---

## 2. Audit-Generated Timestamp Diff and Cleanup Evidence

The Phase 1B audit ran `cli plan`, which in the pre-remediation code embedded a wall-clock `generated_at_utc` into the tracked plan artifacts.  The diff was confirmed to be timestamp-only (no structural change), then restored:

```
git restore artifacts/dry_run/control_room_build_plan.json
git restore artifacts/dry_run/control_room_build_plan.md
```

After restore, `git status --short` was empty; the Phase 1B.1 remediation began from a clean tree at `b00fec0`.

---

## 3. Files Modified / Added / Removed

**Added (4):**

- [docs/PHASE_1B_ACCEPTANCE_AUDIT.md](docs/PHASE_1B_ACCEPTANCE_AUDIT.md)
- [tests/test_channel_safety_branches.py](tests/test_channel_safety_branches.py)
- [tests/test_mapping_contract.py](tests/test_mapping_contract.py)
- [tests/test_plan_determinism.py](tests/test_plan_determinism.py)

**Modified (13):**

- [artifacts/dry_run/control_room_build_plan.json](artifacts/dry_run/control_room_build_plan.json)
- [artifacts/dry_run/control_room_build_plan.md](artifacts/dry_run/control_room_build_plan.md)
- [config/seed_data/source_evidence.yaml](config/seed_data/source_evidence.yaml)
- [docs/PHASE_1A_FORENSIC_ACCEPTANCE_AUDIT.md](docs/PHASE_1A_FORENSIC_ACCEPTANCE_AUDIT.md)
- [docs/PHASE_1_BUILD_REPORT.md](docs/PHASE_1_BUILD_REPORT.md)
- [docs/RELEASE_GOVERNANCE.md](docs/RELEASE_GOVERNANCE.md)
- [src/hfla_control_room/cli.py](src/hfla_control_room/cli.py)
- [src/hfla_control_room/constants.py](src/hfla_control_room/constants.py)
- [src/hfla_control_room/manifest.py](src/hfla_control_room/manifest.py)
- [src/hfla_control_room/plan_builder.py](src/hfla_control_room/plan_builder.py)
- [src/hfla_control_room/validation.py](src/hfla_control_room/validation.py)
- [tests/test_dry_run_plan.py](tests/test_dry_run_plan.py)
- [tests/test_idempotency_contract.py](tests/test_idempotency_contract.py)

**Removed:** none.

Net diff: `17 files changed, 1564 insertions(+), 196 deletions(-)`.

---

## 4. Deterministic Tracked Plan Snapshot Remediation

Closes **BLK-1**.

- `plan_builder.build_plan` no longer writes `generated_at_utc` into `plan_metadata`.
- A new deterministic `spec_fingerprint` (SHA-256 hex of `json.dumps(plan_body, sort_keys=True, separators=(",",":"))`) is computed *after* all other metadata is populated and serves as the canonical identity of the plan.
- `write_plan` serializes JSON with `json.dumps(..., indent=2, sort_keys=True) + "\n"` and the Markdown variant sorts operation keys — both outputs are byte-identical across replays.
- Timestamped runtime data was moved to `write_plan_runtime_receipt`, which writes `.runtime/audit/last_plan_run.json` (git-ignored) containing `phase`, `spec_fingerprint`, `operation_count`, `generated_at_utc`, `live_google_calls`.
- `constants.LAST_PLAN_RUN_PATH = RUNTIME_DIR / "audit" / "last_plan_run.json"`.
- The CLI now echoes `Spec fingerprint: <hex>` and the receipt path.
- Current `spec_fingerprint`: `0bd0c69d7f29faf06f4f25ee6941d3db0152acbdcddf45e674d6dc5ad845c6ac`.

---

## 5. Governance Documentation and Phase-Sequence Corrections

Closes **BLK-2**, **DOC-NC1**, **DOC-NC2**.

- [docs/PHASE_1_BUILD_REPORT.md](docs/PHASE_1_BUILD_REPORT.md) — Section 15 rewritten with a Phase 1B.1 amendment block; supersedes the prior "AUTHORIZED PHASE 2" gate and the APPROVED-rule gate; documents the authoritative sequence `1 → 1B.1 → 1C → 1D → 2 → 3 → 4`; footer carries the "Amended (Phase 1B.1)" line.
- [docs/RELEASE_GOVERNANCE.md](docs/RELEASE_GOVERNANCE.md) — Section 2 release-gates table now lists `approved_export_text` as the separately-reviewed channel-safe payload alongside `final_effective_rule` (internal, not exported).  Section 3 clarifies the approval step occurs after Phase 1C and uses `approved_export_text`.  Section 4 enumerates the per-channel gates (`APPROVED_PUBLIC_SAFE`, `APPROVED_FOR_ADS`, `APPROVED_FOR_AI`).  Section 6 ("Authoritative Phase Sequence") lists all six phases with Phase 2 prerequisites called out separately.
- [docs/PHASE_1A_FORENSIC_ACCEPTANCE_AUDIT.md](docs/PHASE_1A_FORENSIC_ACCEPTANCE_AUDIT.md) — Section 7 appended summarizing the four Phase 1B follow-on findings.
- [docs/PHASE_1B_ACCEPTANCE_AUDIT.md](docs/PHASE_1B_ACCEPTANCE_AUDIT.md) — new audit record with verdict **NOT ACCEPTED — PHASE 1B.1 REMEDIATION REQUIRED**, enumerating BLK-1/2/3 + DOC-NC1/2 + YAML-I1 + TEST-I1/2 + the audit-side mutation disclosure.

---

## 6. Rule / Evidence / Blocker Data-to-Sheet Mapping Contract

Closes **BLK-3**.

- [src/hfla_control_room/constants.py](src/hfla_control_room/constants.py) — new `GOVERNANCE_DESTINATION_TABS` frozenset of the 14 actual workbook tab titles.
- [src/hfla_control_room/plan_builder.py](src/hfla_control_room/plan_builder.py) — new module-level vocabulary `PLAN_OPERATION_TYPES` (11 operations) split into `_POPULATE_OPS` and `_DERIVE_OPS`.  Six new operations are emitted after `CONFIGURE_DOCUMENT`:
  1. `POPULATE_RULE_REGISTER` → `03_RULE_REGISTER_MASTER` (rule_ids sorted)
  2. `POPULATE_SOURCE_EVIDENCE` → `11_SOURCE_EVIDENCE` (evidence_ids sorted)
  3. `DERIVE_OPEN_BLOCKERS` → `02_OPEN_BLOCKERS` (source `03_RULE_REGISTER_MASTER`)
  4. `DERIVE_ACTIVE_RULES_EXPORT` → `04_ACTIVE_RULES_EXPORT`
  5. `DERIVE_PUBLIC_PRICING_PACKAGES` → `05_PUBLIC_PRICING_PACKAGES`
  6. `DERIVE_AI_RESPONSE_MATRIX` → `10_AI_CUSTOMER_RESPONSE_MATRIX`
- Every `DERIVE_*` op carries `is_derived_view=True` and a `source_tab`; populate ops do not.
- New `validate_plan_destination_tabs(plan)` rejects any `target_tab`/`source_tab` not in `GOVERNANCE_DESTINATION_TABS`; the CLI exits 1 on violations.
- `plan_metadata` now exposes `populate_operation_count`, `derive_operation_count`, and `data_population = {rule_record_count, evidence_record_count}` derived from `len(spec.seed_rules)` and `len(spec.evidence_records)`.
- Coverage: [tests/test_mapping_contract.py](tests/test_mapping_contract.py) — 13 tests assert the above invariants and that no derive op overwrites a populate target.

Final operation count: **28** (folders=14, spreadsheet_files=2, spreadsheet_configs=2, document_files=2, document_configs=2, populate=2, derive=4).

---

## 7. Channel-Safe Export Test Coverage and Controls

Closes **TEST-I2**.

[tests/test_channel_safety_branches.py](tests/test_channel_safety_branches.py) adds 12 numbered branches plus a PII-scanner doc test, all driven from a single `_make_eligible_rule()` helper:

1. DRAFT status rejected at the export gate.
2. Missing `approved_export_text` rejected.
3. Website channel without `APPROVED_PUBLIC_SAFE` rejected.
4. Ads channel without `APPROVED_FOR_ADS` rejected.
5. AI/chatbot channels without `APPROVED_FOR_AI` rejected (parametrized).
6. `contains_pii=True` rejected from any public-facing channel (parametrized).
7. `contains_internal_only_logic=True` rejected from any public-facing channel (parametrized).
8. `RESTRICTED_PII` channel visibility rejected (parametrized).
9. `dispatch_origin` is in `INTERNAL_ONLY_FIELD_NAMES` and absent from `ApprovedRuleExport`.
10. Internal cost fields are absent from `ApprovedRuleExport.model_dump()` keys.
11. `final_effective_rule` is never serialized — sentinel `"INTERNAL CEO TEXT"` does not appear in the exported payload.
12. `ceo_notes`, `internal_notes`, `draft_recommendation`, `blockers`, `source_evidence_ref` never appear in the exported payload (sentinels).

[src/hfla_control_room/validation.py](src/hfla_control_room/validation.py) `validate_channel_export_safety` now applies the `APPROVED_FOR_AI` check to **both** `AI_COPILOT` and `CHATBOT` channels.  The visibility-eligibility check (`CHANNEL_SAFE` | `INTERNAL_APPROVED`) remains restricted to `AI_COPILOT`.

---

## 8. Manifest / Google-Side Idempotency Contract and Test Fix

Closes **TEST-I1**.

- [src/hfla_control_room/manifest.py](src/hfla_control_room/manifest.py) — module docstring now documents the Phase 1D idempotency contract in six numbered rules: (1) deterministic logical keys, (2) search-before-create, (3) reuse single match, (4) fail-closed on multiple matches, (5) never-delete, (6) canonical field name `google_id` (NOT `drive_id`).
- [tests/test_idempotency_contract.py](tests/test_idempotency_contract.py) — `test_manifest_upsert_updates_existing_entry` now passes `google_id="id_123"` (the real field name); the test additionally roundtrips through save/load and asserts `loaded_entry.google_id == "id_123"`.  New `test_manifest_entry_rejects_unknown_drive_id_field` asserts `"drive_id" not in type(entry).model_fields`.

---

## 9. Source Evidence Comment Corrections

Closes **YAML-I1**.

[config/seed_data/source_evidence.yaml](config/seed_data/source_evidence.yaml) top comments rewritten to state:

- `.secrets/` is credentials-only (OAuth `client_secret.json`, `token.json`).
- Private artifacts go to `.exports/private/` (git-ignored).
- Controlled `evidence_records:` entries are intentionally **loaded** by the spec loader and populate the `11_SOURCE_EVIDENCE` governance tab via `POPULATE_SOURCE_EVIDENCE`.

---

## 10. Test and Quality Gate Results

| Gate | Result |
|---|---|
| `ruff check .` | All checks passed. |
| `pytest --collect-only -q` | 149 tests collected. |
| `pytest -q` | **149 passed, 0 failed** (107 pre-existing + 42 net new across 3 new test files). |
| `cli validate --config config` | PASS — 14 governance tabs, 9 restricted tabs, 2 documents, 19 DRAFT rules, 0 approved. |
| `cli plan --config config --output artifacts/dry_run` | PASS — **28 operations**; `spec_fingerprint=0bd0c69d…d845c6ac`. |
| `cli provision --config config --dry-run` | PASS — 0 live Google calls; audit report written under `.runtime/audit/`. |
| `cli provision --config config --apply` | **BLOCKED — exit 1**, message: `BLOCKED — LIVE GOOGLE PROVISIONING NOT AUTHORIZED IN PHASE 1.` |

---

## 11. Post-Commit Clean-Tree Proof After Plan and Dry-Run Re-Execution

Sequence executed after `git commit`:

```
git status --short                                    # (empty)
pytest -q                                             # 149 passed
cli plan --config config --output artifacts/dry_run   # regenerated, same fingerprint
git status --short                                    # (empty)
cli provision --config config --dry-run               # 0 live calls
git status --short                                    # (empty)
cli provision --config config --apply                 # exit 1, blocked
```

The plan re-execution produces byte-identical artifacts (no diff vs. the committed snapshot), proving the determinism contract.  Both dry-run invocations leave the worktree clean.

---

## 12. OAuth / Google API / Live Asset Confirmation

- **No OAuth flow initiated.**  `.secrets/client_secret.json` not loaded.
- **No Google Drive / Sheets / Docs API call made.**  `apply` blocked.
- **No remote contacted.**  No `git fetch`, no `git push`.
- `.secrets/` and `.runtime/` remain git-ignored; nothing under either was added to the index.
- The repository has no Git remote configured.

---

## 13. Draft Rule Status Confirmation

All **19** seed rules in `config/seed_data/rules.yaml` remain in `DRAFT` status.  No rule was promoted to `APPROVED_AS_RECOMMENDED` or `APPROVED_WITH_CONDITIONS`.  No `approved_export_text` was added.  `cli validate` continues to report `19 (all DRAFT — no approved rules in Phase 1)`.

---

## 14. Remaining Work Before Phase 1C

- **Phase 1C scope (next authorization):** load controlled draft content (rule register population, evidence records) into the dry-run plan execution path with idempotent manifest interaction — still **no live Google action, no approved rules**.
- **Phase 1D scope (after 1C):** full idempotency contract validation against the manifest invariants documented in `manifest.py` (search-before-create, reuse-on-single-match, fail-closed-on-multiple, never-delete).
- **Phase 2 prerequisites (when finally reached):** OAuth client secret provisioned under `.secrets/`, scope decision finalized, `--apply` gate explicitly unlocked.

No source or governance changes are required between Phase 1B.1 acceptance and the Phase 1C authorization.

---

## 15. Acceptance Recommendation

**PASS.**  All Phase 1B blockers (BLK-1, BLK-2, BLK-3) and non-blocking defects (DOC-NC1, DOC-NC2, YAML-I1) and informational findings (TEST-I1, TEST-I2) are closed.  149/149 tests pass.  All quality gates pass.  Worktree is clean after dry-run replay.  No prohibited action was taken.

---

## 16. Exact Next Recommended Authorization

`"AUTHORIZED PHASE 1C — LOAD CONTROLLED DRAFT CONTENT ONLY (NO LIVE GOOGLE ACTION, NO APPROVED RULES)."`

---

*Closure date: 2026-05-23*  
*Closure commit: HEAD of `main` titled `fix(control-room): close phase-1b acceptance gaps`*  
*Predecessors preserved: `b00fec0`, `1b95eec`*  
*Live Google calls: FALSE*  
*OAuth performed: FALSE*  
*Remote push: NONE*
