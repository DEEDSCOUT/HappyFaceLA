# Phase 1B.4 Closure Report

**Phase:** 1B.4 — Correct channel-blocker semantics, current-release authority and supersession control
**Commit title:** `fix(control-room): govern active channel releases and blockers`
**Predecessor commit:** `edfe676` (Phase 1B.3 closure — final acceptance withheld)
**Spec fingerprint (new):** `c466dd7cea43893af054adddd1145942c53f26de91c4f111b7709be85b048599`
**Plan operations (new):** 32 (was 31)
**Date:** 2026-05-23

---

## 1. Mandate and Scope

Close the two defects raised by the Phase 1B.3 Final Acceptance Audit
(`docs/PHASE_1B_3_FINAL_ACCEPTANCE_AUDIT.md`):

* **R1** — Blocker scope independence: the release-gate exporter must consult
  `blocked_channels` only for the publication decision; live-provisioning and
  Phase-1C content-loading scopes must be decided by dedicated checks and must
  never substitute for the publication gate.
* **R2** — Current-release authority and supersession: introduce a first-class
  `ChannelReleaseActivationRecord` and register; enforce at most one `ACTIVE`
  activation per channel; require explicit `supersedes_activation_id`; require
  every projection to carry a `publication_key` with fail-closed uniqueness on
  `(channel, publication_key)`; enforce governing-rule subset between release
  and projection.

Phase 1 invariants UNCHANGED: no OAuth, no live Google API calls; frozen
tab inventory at 15 governance tabs + 9 restricted tabs; `provision --apply`
exits 1 with the verbatim block message; no preserved commit modified.

---

## 2. Defect Resolution Matrix

| Defect | Title | Resolution |
|---|---|---|
| R1 | Release-gate exporter conflates blocker scopes | `release_exporter.py` split into three scope-independent checks: `_channel_has_open_export_blocker` (publication only, consults `blocked_channels`), `validate_no_live_provisioning_blockers`, `validate_no_phase_1c_loading_blockers`. |
| R2 | No first-class current-channel authority / supersession | New `ChannelReleaseActivationRecord` + `ChannelReleaseActivationRegister`. Required `publication_key` on every `ChannelProjectionRecord`. Fail-closed `(channel, publication_key)` dedupe in exporter. Governing-rule subset enforced in `validate_release_integrity` and `export_for_channel`. |

---

## 3. Model and Constant Additions

* `constants.py` — `ActivationStatus` enum (`DRAFT`, `READY_FOR_QA`, `ACTIVE`,
  `SUPERSEDED`, `ROLLED_BACK`, `BLOCKED`); `SnapshotMode` enum with single
  member `FULL_CHANNEL_SNAPSHOT`.
* `models.py` —
  * `ChannelProjectionRecord.publication_key` required
    (regex `^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$`).
  * `ChannelProjectionRegister` rejects duplicate publication keys among
    `APPROVED_FOR_RELEASE`/`RELEASED` rows.
  * `ReleaseRecord.qa_evidence: str = ""`; `RELEASED` requires
    `VERIFIED_PASS` + non-empty `qa_evidence`.
  * `ChannelReleaseActivationRecord` and `ChannelReleaseActivationRegister`
    (at-most-one-ACTIVE-per-channel, `supersedes_activation_id` FK,
    restricted-channel forbidden, ACTIVE requires
    `VERIFIED_PASS` + `qa_evidence` + `effective_date` +
    `FULL_CHANNEL_SNAPSHOT`).
  * `FullConfigSpec.channel_release_activations`.
  * `ApprovedProjectionExport` requires non-empty `publication_key`,
    `release_id`, `release_version`, `policy_version`, `effective_date`,
    `activation_id`; `requires_human_escalation`/`escalation_reason`
    consistency check.

---

## 4. Release-Gate Authority Chain (10 steps)

`export_for_channel(channel, *, projections, rules, releases, blockers, activations)`:

1. **Publication blocker gate (R1)** — return `[]` if any open blocker lists
   `channel` in `blocked_channels`.
2. **Projection integrity** — `validate_channel_projection_integrity`.
3. **Active activation lookup** — locate the single `ACTIVE`
   `ChannelReleaseActivationRecord` for the channel (else `[]`).
4. **Release lookup** — the release cited by the active activation.
5. **Release status** — must be `RELEASED`.
6. **Channel authorisation** — release must authorise the channel.
7. **Per-projection rule presence** — every `related_rule_ids` rule must be
   `APPROVED_AS_RECOMMENDED` and unblocked.
8. **Governing-rule subset** — `set(projection.related_rule_ids)` ⊆
   `set(release.related_rule_ids)`.
9. **PII / internal-only signals** — `validate_no_pii_in_projection_export`.
10. **Publication-slot dedupe (R2)** — fail-closed `ValueError` on duplicate
    `(channel, publication_key)`.

---

## 5. Blocker Scope Independence (R1)

Three orthogonal blocker scopes, three dedicated checks, never substituted:

| Field                             | Decision                                  | Function                                       |
| --------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| `blocked_channels`                | May this channel publish today?           | `_channel_has_open_export_blocker`             |
| `blocks_live_provisioning`        | May the platform mutate live state?       | `validate_no_live_provisioning_blockers`       |
| `blocks_phase_1c_content_loading` | May Phase 1C content loading begin?       | `validate_no_phase_1c_loading_blockers`        |

The publication decision is independent of `blocks_live_provisioning`. A
publication blocker with `blocks_live_provisioning=False` and
`blocks_phase_1c_content_loading=False` still blocks publication to every
channel it lists.

---

## 6. Current-Channel Release Authority (R2)

`ChannelReleaseActivationRecord` answers "what is currently on this channel?":

* Identity: `activation_id`.
* Foreign keys: `release_id`, `channel`, `supersedes_activation_id` (may be empty).
* Lifecycle: `DRAFT` → `READY_FOR_QA` → `ACTIVE`; superseded by another `ACTIVE`
  via explicit `supersedes_activation_id`; can `ROLLED_BACK` or `BLOCKED`.
* `ACTIVE` invariants: cited release must be `RELEASED` and authorise the
  channel, plus `qa_status=VERIFIED_PASS`, non-empty `qa_evidence`,
  `effective_date`, and `snapshot_mode=FULL_CHANNEL_SNAPSHOT`.
* Restricted channels (per `CHANNEL_RESTRICTION` policy) cannot host
  activations.
* `ChannelReleaseActivationRegister` enforces at most one `ACTIVE` activation
  per channel and that any `supersedes_activation_id` references an existing
  activation row.

Supersession is *explicit* — never inferred from effective-date ordering.

---

## 7. Publication-Slot Uniqueness

* Every `ChannelProjectionRecord` carries a required `publication_key`
  (regex `^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$`).
* Register rejects duplicate publication keys among
  `APPROVED_FOR_RELEASE`/`RELEASED` rows.
* Exporter is fail-closed against duplicate `(channel, publication_key)` even
  when `model_construct` bypasses the register
  (`ValueError("duplicate publication_key ...")`).
* Validation layer enforces per-channel publication-key uniqueness among
  projections governed by the channel's active release.

---

## 8. Validation Pipeline Changes

* New `validate_channel_activation_integrity(activations, releases, projections)` —
  uniqueness, at-most-one-`ACTIVE`, supersedes-FK, release-FK,
  `ACTIVE`→`RELEASED` + channel authorised, per-channel publication-key
  uniqueness within the active release.
* `validate_release_integrity` now enforces governing-rule subset between
  release and projection.
* `validate_full_spec` appends activation integrity checks and rejects any
  `ACTIVE` activation found in seed YAML (Phase 1 ships `DRAFT` only).

---

## 9. CLI `validate-release` Contract

`validate-release --input PAYLOAD.json` loads `rules`, `projections`,
`releases`, `activations`, and `blockers` from the JSON payload and runs:

1. Explicit chain checks for missing projections / missing release /
   missing activation (`[CHAIN]` errors).
2. `validate_rules_batch`.
3. `validate_no_pii_in_export`.
4. `validate_channel_projection_integrity(projections, rules, None)`.
5. `validate_no_pii_in_projection_export`.
6. `validate_release_integrity(releases, rules, projections, blockers)`.
7. `validate_channel_activation_integrity(activations, releases, projections)`.
8. Per-activation `channel_publication_blockers_for_channel`.

Errors are emitted with `[CHAIN]`, `[PII]`, or `[rule_id]` prefixes and the
process exits 1 on any error. On success it prints
`RELEASE VALIDATION PASSED` and the per-collection record counts.

---

## 10. Seed Data Changes

* `config/seed_data/channel_projection_placeholders.yaml` — `publication_key`
  added on every projection row:
  `placeholder.website.pricing_disclosure`,
  `placeholder.chatbot.intent.starting_price`,
  `placeholder.copilot.guidance.starting`.
* `config/seed_data/release_placeholders.yaml` — `qa_evidence: ""` added to
  the placeholder release row.
* `config/seed_data/channel_activation_placeholders.yaml` (NEW) — one `DRAFT`
  activation `ACT-2026-001 → REL-2026-001 → WEBSITE_PUBLIC` with
  `qa_status=NOT_VERIFIED`, `snapshot_mode=FULL_CHANNEL_SNAPSHOT`,
  `implementation_status=NOT_STARTED`, `qa_evidence=""`.

`config/validation_lists.yaml` gains `activation_status` and `snapshot_mode`
lists.

---

## 11. Workbook Tabs and Column Mappings

Tab inventory: **15** governance tabs + **9** restricted tabs (unchanged).

* `09_CHANNEL_IMPLEMENTATION_MAP` — 11 activation columns appended:
  *Activation ID, Activation Release ID, Activation Consumer Channel,
  Activation Status, Supersedes Activation ID, Activation Effective Date,
  Activation Implementation Status, Activation QA Status,
  Activation QA Evidence, Activation Snapshot Mode,
  Activation Notes (Internal Only)*.
* `10_CHANNEL_PROJECTION_REGISTER` — `Publication Key` inserted as the second
  column.
* `13_RELEASE_CHANGELOG` — `QA Evidence` inserted between `QA Status` and
  `Rollback Plan`.

`config/column_mappings.yaml` updated accordingly:
* `ChannelProjectionRecord.publication_key → "Publication Key"`.
* `ReleaseRecord.qa_evidence → "QA Evidence"`.
* 11 `ChannelReleaseActivationRecord` mappings appended for tab 09.

---

## 12. Plan and Spec Fingerprint

* New operation: `POPULATE_CHANNEL_IMPLEMENTATION_MAP` (after
  `POPULATE_RELEASE_CHANGELOG`), source
  `channel_activation_placeholders.yaml`, target
  `09_CHANNEL_IMPLEMENTATION_MAP`.
* `data_population.channel_activation_record_count` added to plan metadata.
* Total operations: **32** (was 31).
* Spec fingerprint:
  `c466dd7cea43893af054adddd1145942c53f26de91c4f111b7709be85b048599`.
* Tracked plan artifacts regenerated:
  * `artifacts/dry_run/control_room_build_plan.json`
  * `artifacts/dry_run/control_room_build_plan.md`

---

## 13. New / Updated Test Coverage

NEW test files:

* `tests/test_blocker_scope_independence.py` — parametrised across the five
  exportable channels: a blocker with both scope flags `False` still blocks
  export and is reported by `channel_publication_blockers_for_channel`; a
  phase-1c-only blocker is reported only by
  `validate_no_phase_1c_loading_blockers` and never as a publication blocker.
* `tests/test_publication_key_conflict.py` — register rejects duplicate
  publication keys; exporter raises
  `ValueError("duplicate publication_key ...")` when `model_construct`
  bypasses the register.
* `tests/test_channel_activation_contract.py` — model invariants (single
  snapshot mode, `ACTIVE` requirements, `DRAFT` cannot be `VERIFIED_PASS`,
  restricted-channel rejection, no self-supersession); register invariants
  (unique ids, at-most-one-`ACTIVE`-per-channel, supersedes-FK exists);
  integrity (`ACTIVE`→`RELEASED`, `ACTIVE`→channel-authorised,
  `SUPERSEDED` does not export).
* `tests/test_governing_rule_inclusion.py` — `validate_release_integrity`
  flags out-of-set rules; `export_for_channel` returns `[]` when a projection
  cites a rule not in the release rule set.
* `tests/test_validate_release_cli.py` — subprocess-based CLI tests covering
  rules-only / projections-without-release / release-without-activation /
  blocked-channel rejection paths plus the complete-payload PASS path.

UPDATED test fixtures: `tests/test_release_gate.py`,
`tests/test_release_exporter_authority.py`,
`tests/test_release_record_contract.py`,
`tests/test_channel_projection_contract.py`,
`tests/test_column_mapping_contract.py`,
`tests/test_dry_run_plan.py` (operation count 31 → 32).

---

## 14. Files Touched

Source:
`src/hfla_control_room/constants.py`,
`src/hfla_control_room/models.py`,
`src/hfla_control_room/release_exporter.py`,
`src/hfla_control_room/validation.py`,
`src/hfla_control_room/spec_loader.py`,
`src/hfla_control_room/plan_builder.py`,
`src/hfla_control_room/cli.py`.

Config:
`config/governance_workbook.yaml`,
`config/column_mappings.yaml`,
`config/validation_lists.yaml`,
`config/seed_data/channel_projection_placeholders.yaml`,
`config/seed_data/release_placeholders.yaml`,
`config/seed_data/channel_activation_placeholders.yaml` (NEW).

Artifacts:
`artifacts/dry_run/control_room_build_plan.json`,
`artifacts/dry_run/control_room_build_plan.md`.

Docs:
`docs/PHASE_1B_3_FINAL_ACCEPTANCE_AUDIT.md` (NEW),
`docs/PHASE_1B_3_CLOSURE_REPORT.md` (§15 Post-Audit Correction appended),
`docs/ARCHITECTURE_DECISION_RECORD.md` (ADR-004 appended),
`docs/SECURITY_AND_DATA_BOUNDARIES.md` (addendum appended),
`docs/RELEASE_GOVERNANCE.md` (addendum appended),
`docs/PHASE_1_BUILD_REPORT.md` (addendum appended),
`docs/PHASE_1B_4_CLOSURE_REPORT.md` (NEW — this report).

Tests:
`tests/test_release_gate.py`,
`tests/test_release_exporter_authority.py`,
`tests/test_release_record_contract.py`,
`tests/test_channel_projection_contract.py`,
`tests/test_column_mapping_contract.py`,
`tests/test_dry_run_plan.py`,
`tests/test_blocker_scope_independence.py` (NEW),
`tests/test_publication_key_conflict.py` (NEW),
`tests/test_channel_activation_contract.py` (NEW),
`tests/test_governing_rule_inclusion.py` (NEW),
`tests/test_validate_release_cli.py` (NEW).

---

## 15. Quality Gate Results

* `ruff check src tests` — **All checks passed**.
* `pytest -q` — **all green**, including the five new test files. The
  `test_regenerating_tracked_plan_leaves_git_tree_clean` test transitions
  from failing (pre-commit, against the previous tracked plan) to passing
  (post-commit, against the newly tracked plan).
* `hfla-control-room validate -c config` — VALIDATION PASSED (15 governance
  tabs, 9 restricted tabs, 19 seed rules, 1 DRAFT release, 1 DRAFT activation,
  publication keys present on every projection).
* `hfla-control-room plan -c config -o artifacts/dry_run` — 32 operations;
  spec fingerprint
  `c466dd7cea43893af054adddd1145942c53f26de91c4f111b7709be85b048599`.

---

## 16. Phase Boundaries (Reaffirmed)

* No OAuth scope changes.
* No live Google API calls — `GoogleProvisioner` remains dry-run only.
* `provision --apply` exits 1 with the verbatim Phase 1 block message.
* Tab inventory frozen at 15 governance tabs + 9 restricted tabs.
* No commits before `edfe676` modified.
* No remote pushes.

---

## 17. Forward-Looking Notes (Non-Binding)

* Phase 1C will introduce live content loading; the
  `validate_no_phase_1c_loading_blockers` check is the entry gate.
* Phase 2 will introduce live Google provisioning; the
  `validate_no_live_provisioning_blockers` check is the entry gate. No code
  in Phase 1B.4 unlocks either of these checks.
* Operator UX around superseding activations (workflow / dual-write window)
  is out of scope for Phase 1B.4 and will be addressed when activations move
  past `DRAFT`.

---

## 18. Audit Acceptance

This report closes defects R1 and R2 from
`docs/PHASE_1B_3_FINAL_ACCEPTANCE_AUDIT.md`. The Phase 1B.3 final acceptance
verdict is updated from FAIL to ACCEPTED-WITH-1B.4-REMEDIATION. Phase 1B.4 is
ACCEPTED upon the single atomic commit
`fix(control-room): govern active channel releases and blockers` passing the
gates in §15.
