# Phase 1B Acceptance Audit

**Audit type:** Read-only forensic acceptance audit of Phase 1B work.  
**Audit subject commit:** `b00fec093c5a4a40edd69017e9570f8ee7028e7a`  
**Audit predecessor:** `1b95eec525edd0f0b06b2e8b5ac65f5ddfb5b629` (Phase 1A acceptance commit)  
**Audit phase:** PHASE_1_DRY_RUN  
**Live Google API calls during audit:** **FALSE**  
**OAuth performed:** **FALSE**  
**Verdict:** **NOT ACCEPTED — PHASE 1B.1 REMEDIATION REQUIRED**

> **Note on audit-side mutation.**  The act of running
> `python -m hfla_control_room.cli plan` during the audit unintentionally
> modified the two tracked plan artifacts
> (`artifacts/dry_run/control_room_build_plan.json` and `.md`) because they
> embedded a wall-clock `generated_at_utc` timestamp.  The mutation was
> diff-confirmed to be timestamp-only and the working tree was restored
> with `git restore` before any source modification.  This phenomenon is
> itself classified as Blocker BLK-1 below and is closed in Phase 1B.1.

---

## 1. Scope

This audit verified:

1. Channel-safe export controls introduced in Phase 1B
   (`channel_visibility`, `public_safe_review_status`,
   `ai_response_review_status`, `ads_claim_review_status`,
   `approved_export_text`, `contains_pii`, `contains_internal_only_logic`,
   `requires_human_quote`).
2. Evidence record schema, validation, and seed data
   (`config/seed_data/source_evidence.yaml`).
3. Channel-safe export gate (`release_exporter.export_approved_rules`).
4. Dry-run plan generation determinism.
5. Quality gates (ruff, pytest, validate, plan, provision --dry-run,
   provision --apply).
6. Governance documentation consistency with the actual code paths and
   the authorized phase sequence.
7. Idempotency manifest fields and contract.

No live Google action was taken at any point.  No remote was contacted.
No OAuth credentials were exchanged.

---

## 2. Blockers (must be closed before acceptance)

### BLK-1 — Tracked plan artifacts contain a wall-clock timestamp

- **Location:** `src/hfla_control_room/plan_builder.py` (writes
  `generated_at_utc` into `plan_metadata` and into the markdown header).
- **Effect:** Every invocation of `cli plan` produces a non-empty
  `git status` for `artifacts/dry_run/control_room_build_plan.{json,md}`,
  even when the configuration is unchanged.  The audit itself reproduced
  this churn.
- **Required fix:** Remove `generated_at_utc` from tracked plan output.
  Add a deterministic SHA-256 `spec_fingerprint`.  Route timestamps to a
  separate run-time receipt under `.runtime/audit/last_plan_run.json`.
- **Status:** Closed in Phase 1B.1.

### BLK-2 — `docs/PHASE_1_BUILD_REPORT.md` Section 15 authorizes wrong phase

- **Location:** `docs/PHASE_1_BUILD_REPORT.md`, Section 15.
- **Defect:** The "Exact Next Recommended Authorization" string was
  `"AUTHORIZED PHASE 2 — CONNECT GOOGLE OAUTH AND EXECUTE LIVE DRIVE
  PROVISIONING ONLY."` and listed an APPROVED-rule gate.  This skips
  Phase 1C (controlled draft content load) and Phase 1D (idempotency
  contract validation), and the APPROVED-rule gate contradicts the
  draft-only directive for current seed content.
- **Required fix:** Replace the section with the authoritative phase
  sequence (1B.1 → 1C → 1D → 2 → 3 → 4) and the correct next
  authorization string ("AUTHORIZED PHASE 1C — LOAD CONTROLLED DRAFT
  CONTENT ONLY ...").
- **Status:** Closed in Phase 1B.1.

### BLK-3 — Data-to-sheet mapping not encoded in the plan

- **Location:** `src/hfla_control_room/plan_builder.py`.
- **Defect:** The plan operations enumerate folder / spreadsheet /
  document creation but do not specify *which governance tab* receives
  rule records (`03_RULE_REGISTER_MASTER`), evidence records
  (`11_SOURCE_EVIDENCE`), or blockers (`02_OPEN_BLOCKERS`), and do not
  distinguish derived views (`04_ACTIVE_RULES_EXPORT`,
  `05_PUBLIC_PRICING_PACKAGES`, `10_AI_CUSTOMER_RESPONSE_MATRIX`) from
  single-source-of-truth populations.
- **Required fix:** Add `POPULATE_RULE_REGISTER`,
  `POPULATE_SOURCE_EVIDENCE`, and `DERIVE_*` plan operations targeting
  the controlled `GOVERNANCE_DESTINATION_TABS` vocabulary, with
  `is_derived_view` flagged.
- **Status:** Closed in Phase 1B.1.

---

## 3. Non-blocking Defects

### DOC-NC1 — `docs/RELEASE_GOVERNANCE.md` Section 3 references `final_effective_rule`

- The channel-safe export payload uses `approved_export_text`; the
  governance doc still referenced `final_effective_rule`.
- **Status:** Closed in Phase 1B.1.

### DOC-NC2 — `docs/RELEASE_GOVERNANCE.md` Section 6 skips Phase 1C/1D

- Same root cause as BLK-2 but in the release-governance document.
- **Status:** Closed in Phase 1B.1.

### YAML-I1 — `config/seed_data/source_evidence.yaml` comment misroutes evidence to `.secrets/`

- Comment instructed operators to store real evidence under `.secrets/`,
  which is OAuth-credential-only.  The correct location for private
  local evidence artifacts is `.exports/private/` (git-ignored).  The
  comment also stated the spec loader skips this file, which is no
  longer true (`evidence_records:` is intentionally loaded).
- **Status:** Closed in Phase 1B.1.

---

## 4. Informational Findings

### TEST-I1 — `tests/test_idempotency_contract.py` passes `drive_id=` to `ManifestEntry`

- `ManifestEntry` has no `drive_id` field; the canonical name is
  `google_id`.  Pydantic v2 silently ignores unknown kwargs by default,
  so the test asserted nothing about the persisted Google asset id.
- **Status:** Closed in Phase 1B.1 (test now passes `google_id=` and
  asserts the value survives save/load).

### TEST-I2 — No explicit branch-level channel-safety rejection tests

- The release-gate suite covered approve/reject paths, but did not
  isolate each of the 12 rejection branches.
- **Status:** Closed in Phase 1B.1 (see
  `tests/test_channel_safety_branches.py`).

---

## 5. Quality Gate Results at Audit Time

| Gate | Result |
|---|---|
| `ruff check .` | PASS |
| `pytest --collect-only -q` | 107 tests collected |
| `pytest -q` | 107 passed, 0 failed |
| `cli validate --config config` | PASS — 19 DRAFT rules, 14 governance tabs, 9 restricted tabs, 2 documents |
| `cli plan --config config --output artifacts/dry_run` | PASS — 22 operations |
| `cli provision --config config --dry-run` | PASS — 0 live calls |
| `cli provision --config config --apply` | BLOCKED — exit 1, "BLOCKED — LIVE GOOGLE PROVISIONING NOT AUTHORIZED IN PHASE 1." |

The functional gates pass.  The blockers above are governance-level
(timestamp churn, doc consistency, mapping contract, branch test
coverage), not functional regressions.

---

## 6. Confirmation of No Live Action

- No Google OAuth flow was initiated.
- No `client_secret.json` was loaded.
- No Google Drive, Sheets, or Docs API call was made.
- No `--apply` invocation succeeded.
- No remote was contacted (`git fetch` / `git push` were not run).
- The `.secrets/` and `.runtime/` directories remain git-ignored.

---

## 7. Verdict

**NOT ACCEPTED — PHASE 1B.1 REMEDIATION REQUIRED.**

Acceptance of Phase 1B is gated on the closure of BLK-1, BLK-2, and
BLK-3 above, plus the non-blocking corrections and the informational
test fix.  See `docs/PHASE_1B_1_CLOSURE_REPORT.md` for the closure
record.

---

*Audit date: 2026-05-23*  
*Commit at audit: `b00fec093c5a4a40edd69017e9570f8ee7028e7a`*  
*Live Google calls: FALSE*  
*OAuth performed: FALSE*
