# Phase 1B.2 — Final Acceptance Audit

**Audited commit:** `7779834`
**Audit date:** 2026-05-23
**Verdict:** **FAIL** — superseded by Phase 1B.3 closure.

This audit re-reviewed commit `7779834` ("phase 1B.2 closure") against the
governance contract.  Seven defects were identified that each independently
violate the architectural invariants stated in the Phase 1B.2 closure
report.  The defects are mechanical / structural — none required relaxing
the no-live-Google-call boundary or modifying preserved commits.

## Defects

### D1. `release_exporter` bypasses `ChannelProjectionRecord`

The exporter shipped in `7779834` operated on `RuleRow.approved_export_text`
and `RuleRow.export_channels`, treating the rule as the source of channel
text.  This contradicts the documented governance contract that
`ChannelProjectionRecord` is the per-channel source of truth and
`ReleaseRecord` is the gate.  Approving a rule was therefore sufficient to
publish text on a channel — no release authority was required.

### D2. `spec_fingerprint` does not cover the column-mapping contract

`COLUMN_MAPPING_CONTRACTS` lived in `constants.py` as a Python constant.
Mutating the contract did not flip the fingerprint and therefore did not
surface as plan drift.

### D3. `tests/test_release_gate.py` constructed bare `RuleRow` objects

The release-gate test relied on `RuleRow` carrying channel text and an
"approved for export" status — fields that the closure report itself
declared deprecated.

### D4. `validation_lists.yaml` and `rule_schema.yaml` reference legacy fields

Both YAML files still listed `export_channels` and adjacent fields,
contradicting the documented `RuleRow` shape.

### D5. Strict-schema enforcement was partial

Several top-level controlled models (notably `FullConfigSpec`) accepted
unknown fields, weakening the misspelled-field defense advertised in the
1B.2 closure report.

### D6. Closure report §8 (governance tab inventory) lists wrong tab titles

The inventory in §8 was a hand-written list that diverged from the frozen
15-tab inventory in `config/governance_workbook.yaml`.

### D7. Closure report §12 (post-commit verification) is aspirational

§12 was written in the future tense ("To be executed") and did not record
the actual `provision --apply` exit code or the verbatim Phase 1 block
message, nor the side-effect statement.

## Disposition

All defects D1–D7 are resolved in the Phase 1B.3 closure commit:

> `fix(control-room): enforce projection exports and release gating`

See `docs/PHASE_1B_3_CLOSURE_REPORT.md` for the per-defect resolution
record and post-commit gate evidence.
