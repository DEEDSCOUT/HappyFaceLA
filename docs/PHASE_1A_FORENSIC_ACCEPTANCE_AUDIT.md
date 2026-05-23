# HAPPY FACES LA — PHASE 1A FORENSIC ACCEPTANCE AUDIT

**Audit type:** Forensic post-build acceptance audit  
**Audit scope:** Phase 1 local provisioner build — security, governance, and idempotency  
**Audit outcome:** PASS WITH REMEDIATION  
**Date:** 2026-05-23  
**Status:** COMPLETE (remediation delivered as Phase 1B)  

---

## 1. Purpose

This document records the findings of the forensic acceptance audit conducted immediately after the
Phase 1 build was committed. The audit was performed before any Phase 2 authorization was granted,
before any Google OAuth credentials were created, and before any live Google API call was made.

The audit run itself exposed defect C-1 (dirty tree on dry-run) by demonstrating that
`provision --dry-run` wrote `artifacts/dry_run/audit_report.json` into the tracked git tree,
producing an unexpected dirty working-tree state after an ostensibly read-only operation.

---

## 2. Critical Defects Confirmed

### C-1 — Dirty tree on dry-run

**Evidence:** Running `provision --dry-run` wrote `artifacts/dry_run/audit_report.json` into the
tracked git tree. `git status --short` showed `M artifacts/dry_run/audit_report.json` after
every dry-run execution.

**Root cause:** `cli.py` hard-coded the audit report output path to
`artifacts/dry_run/audit_report.json` — a tracked directory.

**Remediation (Phase 1B):**
- `AUDIT_REPORT_PATH` constant added to `constants.py` pointing to `.runtime/audit/audit_report.json`
- `cli.py` `provision` command now uses `AUDIT_REPORT_PATH`
- `artifacts/dry_run/audit_report.json` removed from git index (`git rm --cached`)
- `.gitignore` already covered `.runtime/`; the file now writes there
- `test_dirty_tree_guard.py` added to enforce this permanently

### C-2 — Secret path inconsistency

**Evidence:** `google_auth.py` comment said `Persist token.json to .secrets/`. The canonical
design intent was `.runtime/` for token (runtime state) and `.secrets/` for credentials only.

**Root cause:** Initial implementation conflated credential storage (`.secrets/`) and runtime
state storage (`.runtime/`). `token.json` is runtime state produced by OAuth, not a credential
file placed by the operator.

**Remediation (Phase 1B):**
- `google_auth.py` comment corrected: `Persist token.json to .runtime/` 
- `TOKEN_PATH` constant in `constants.py` points to `.runtime/token.json`
- `GOOGLE_OAUTH_SCOPE_DECISION_PENDING.md` updated to reflect the correct path
- `SECURITY_AND_DATA_BOUNDARIES.md` canonical path model table added

### C-3 — Secret tests would fail after credential install

**Evidence:** `test_no_secrets_tracked.py` used `os.walk(WORKSPACE_ROOT)` to scan for credential
files. This means that as soon as `.secrets/client_secret.json` was legitimately installed
(the intended Phase 2 workflow), the tests would begin failing. The tests could not distinguish
between a correctly git-ignored credential and an erroneously tracked one.

**Root cause:** Test incorrectly scanned the filesystem rather than the git index. A file in a
git-ignored directory is legitimate; the same file tracked in the index is a security incident.

**Remediation (Phase 1B):**
- `test_no_secrets_tracked.py` fully rewritten into three test classes:
  - `TestTrackedFileSecurityCheck` — uses `git ls-files` (index only)
  - `TestGitIgnoreRules` — uses `git check-ignore` to verify `.gitignore` effectiveness
  - `TestRuntimeCredentialExistence` — uses `tmp_path` fixtures to test `check_no_secrets_in_tree`
- `check_no_secrets_in_tree()` in `validation.py` updated to skip `.secrets`, `.runtime`, `.exports`

### C-4 — Manifest not persisted after dry-run

**Evidence:** `cli.py` `provision` command created a `Manifest()` object in memory but never
called `manifest.save()`. The manifest file was not written after dry-run execution.

**Root cause:** `manifest.save(path)` call was omitted. The `Manifest` class had `save()` and
`load()` methods but they were never wired into the CLI.

**Remediation (Phase 1B):**
- `cli.py` `provision` command now calls `Manifest.load(MANIFEST_PATH)` (resumes if exists)
- After `generate_audit_report`, `manifest.save(MANIFEST_PATH)` is called
- `MANIFEST_PATH` constant in `constants.py` points to `.runtime/manifests/manifest.json`
- `test_idempotency_contract.py` added to enforce manifest roundtrip and `ASSET_KEYS` contract

---

## 3. Non-Critical Deficiencies Addressed

### NC-3 — `source_evidence.yaml` disconnected from spec loader

**Finding:** `source_evidence.yaml` existed in `config/seed_data/` but was silently skipped by
`spec_loader.py` because it had no `rules:` key. Evidence records were loaded into no model.

**Remediation:**
- `EvidenceRecord(BaseModel)` and `EvidenceRegister(BaseModel)` added to `models.py`
- `spec_loader.py` now reads `evidence_records` from any seed YAML with that key
- `validate_evidence_integrity()` added to `validation.py`
- `test_evidence_loader.py` added

### NC-4 — Plan metadata incomplete

**Finding:** `plan_metadata` had `sheet_count` and `doc_count` which did not distinguish between
Drive file creation operations and API configuration operations.

**Remediation:** Five-field metadata breakdown: `folder_count`, `spreadsheet_asset_count`,
`document_asset_count`, `sheet_configuration_count`, `document_configuration_count`.

### NC-5 — Plan operation semantics ambiguous

**Finding:** `CREATE_ASSET` and `CREATE_SHEET`/`CREATE_DOC` operation names did not clearly
distinguish between Drive file placement (Drive API) and API configuration (Sheets/Docs API).

**Remediation:** New operation type names:
- `CREATE_SPREADSHEET_FILE` — Drive file creation
- `CREATE_DOCUMENT_FILE` — Drive file creation
- `CONFIGURE_SPREADSHEET` — Sheets API configuration
- `CONFIGURE_DOCUMENT` — Docs API configuration

---

## 4. Corrected Phase Sequence

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Local provisioner build — dry-run specification | Complete |
| Phase 1A | Forensic acceptance audit | Complete (this document) |
| Phase 1B | Security and governance remediation | Complete |
| Phase 2 | Google OAuth connection + live Drive provisioning | Not authorized |

The Phase 1A audit was not a separate build phase in the original plan; it was conducted inline
as a quality gate before Phase 2 authorization was considered. The findings required remediation
before any Phase 2 work could proceed.

---

## 5. Google OAuth and Drive Confirmation

No Google OAuth or live Drive action occurred during or as a result of this audit. Confirmed:

- No `client_secret.json` created or read
- No `token.json` created or read
- No OAuth consent flow initiated
- No Google Drive folder, sheet, or doc created
- No Google Sheets API or Docs API called
- `provision --apply` exits with code 1 and `PHASE_1_BLOCK_MESSAGE` — confirmed

---

## 6. References

| Reference | Path |
|---|---|
| Phase 1 Build Report (amended) | `docs/PHASE_1_BUILD_REPORT.md` |
| Security and Data Boundaries (amended) | `docs/SECURITY_AND_DATA_BOUNDARIES.md` |
| OAuth Scope Decision (amended) | `docs/GOOGLE_OAUTH_SCOPE_DECISION_PENDING.md` |
| Dirty tree guard tests | `tests/test_dirty_tree_guard.py` |
| Evidence loader tests | `tests/test_evidence_loader.py` |
| Idempotency contract tests | `tests/test_idempotency_contract.py` |
| Secret tracking tests | `tests/test_no_secrets_tracked.py` |

---

*Audit date: 2026-05-23*  
*Commit at audit: `1b95eec525edd0f0b06b2e8b5ac65f5ddfb5b629`*  
*Phase 1B remediation commit: pending (Phase 1B commit to follow)*  
*Live Google calls: FALSE*


---

## 7. Phase 1B Follow-on Findings (recorded retrospectively in Phase 1B.1)

The Phase 1B acceptance audit (commit `b00fec093c5a4a40edd69017e9570f8ee7028e7a`)
discovered four follow-on issues that the Phase 1A scope did not detect:

1. **Tracked plan artifact churn from wall-clock timestamps.**  The dry-run
   plan files under `artifacts/dry_run/` embedded `generated_at_utc`
   on each invocation, producing a dirty worktree on every audit run.
   Closed in Phase 1B.1 by removing the timestamp from tracked snapshots,
   introducing a SHA-256 `spec_fingerprint`, and routing receipts to
   `.runtime/audit/last_plan_run.json`.
2. **Stale governance documentation.**  `docs/PHASE_1_BUILD_REPORT.md`
   Section 15 and `docs/RELEASE_GOVERNANCE.md` Sections 3, 4, and 6
   referenced a Phase 1 -> Phase 2 sequence that skipped Phase 1C and
   Phase 1D, and referenced the raw `final_effective_rule` as the
   channel-safe payload.  Closed in Phase 1B.1.
3. **Missing channel-safe export branch tests.**  The release-gate test
   suite covered the happy paths but did not include explicit per-branch
   rejection tests for each channel-safety failure mode.  Closed in
   Phase 1B.1 (`tests/test_channel_safety_branches.py`).
4. **Incomplete data-to-sheet mapping.**  The dry-run plan did not
   encode where seed rules / evidence records / blockers are written
   inside the governance workbook, nor distinguish derived views from
   single-source-of-truth populations.  Closed in Phase 1B.1 by adding
   the `POPULATE_*` and `DERIVE_*` plan operations and a controlled
   destination-tab vocabulary.

See `docs/PHASE_1B_ACCEPTANCE_AUDIT.md` for the full Phase 1B audit
verdict and `docs/PHASE_1B_1_CLOSURE_REPORT.md` for the closure record.
