# Phase 1B.5B Acceptance Blockers

**Scope:** Documents the governance violations identified in Phase 1B.5B that
prevented it from advancing to Phase 1C content loading and required the
Phase 1B.5C-R remediation pass.

**Remediated by:** commit `fix(control-room): remove intake bypass and enforce
exact candidate mapping` (Phase 1B.5C-R).

---

## Blocker 1 — Operator-accessible validation bypass

**Severity:** Critical (structural integrity violation)

Phase 1B.5B introduced `--mode/-m {production-intake,partial-fixture}` on the
`validate-phase1c-input` CLI command and a matching `validation_mode` parameter
on `validate_phase1c_candidate_input`.  The `partial-fixture` mode suppressed
all four completeness checks (record-family presence, channel-activation pairing,
workbook-destination addressability, canonical `rule_category` list) while
leaving every other check active.

Although described as "reserved for synthetic test fixtures", the mode was
exposed on the production CLI surface with no technical enforcement preventing
operator use in a real candidate submission.  A bypass accessible via
`--mode partial-fixture` on the CLI is indistinguishable from a production
bypass path: any operator with access to the command could suppress the
completeness contract on a real candidate.

**Remediation:** The `validation_mode` parameter was removed from
`validate_phase1c_candidate_input`.  The `--mode`/`-m` option was removed from
the CLI command.  All four completeness checks now run unconditionally.  Test
fixtures that previously depended on `partial-fixture` were rewritten with
complete synthetic data.

---

## Blocker 2 — "At least one activation per projected channel" is insufficient

**Severity:** High (exact-coverage gap)

The Phase 1B.5B completeness rule required at least one
`ChannelReleaseActivationRecord` per projected channel.  This admitted a
candidate with two or more DRAFT activation shells targeting the same channel,
which would create ambiguity in downstream workbook-write ordering and channel
assignment.  It also did not require that every activation targeted a channel
that had a corresponding projection (orphan activations were silently admitted).

**Remediation:** Section 8c of `validate_phase1c_candidate_input` was rewritten
to enforce exactly one DRAFT activation per projected channel (dual-direction
check: projection-without-activation and activation-without-projection both
produce errors).  Additionally, the "exactly one DRAFT ReleaseRecord shell"
invariant (Section 8b) was added.

---

## Blocker 3 — Model-level presence check insufficient for field mapping

**Severity:** High (mapping completeness gap)

Phase 1B.5B's workbook-destination check verified that each source model's
name appeared somewhere in `config/column_mappings.yaml` and that the
`destination_tab` referenced in at least one of its entries was a real workbook
tab.  It did not verify:
- that specific required governance fields (e.g. `publication_key`,
  `approved_channel_text`, `blocked_channels`, `blocks_phase_1c_content_loading`,
  `qa_evidence`, `supersedes_activation_id`) each had their own mapping entry;
- that a field's mapping pointed to the model's authorized destination tab
  (a field mapped to a wrong tab would pass the old check);
- that the mapped `column_header` existed in the frozen tab definition.

A candidate could pass intake with required fields entirely unmapped — those
fields would silently produce empty columns in the governance workbook.

**Remediation:** Section 9 of `validate_phase1c_candidate_input` was rewritten
to check every field in `_REQUIRED_PERSISTED_FIELDS[model_name]`:
- exactly one `ColumnMappingRecord` for `(source_model, field)` must exist in
  `spec.column_mappings`;
- that record's `destination_tab` must match `_AUTHORIZED_DESTINATION_TABS[model_name]`;
- that record's `column_header` must appear in the tab's `column_headers` list.

---

## Blocker 4 — Unauthorized amendment: commit 42c9c6f replaced by b27252e

**Severity:** Critical (audit trail violation)

Commit `42c9c6f` was the initially reported Phase 1B.5B implementation
commit.  The developer then performed an unauthorized `git commit --amend
--no-edit`, replacing `42c9c6f` with
`b27252e0fd2834f71d6ef4bc323616b63534e66c`.  Commit `bfad6bc` (Phase 1B.5A
HEAD) remained the unchanged parent of the rewritten Phase 1B.5B commit;
`bfad6bc` itself was not amended.  Amending a commit that was already
referenced in a governance record (the Phase 1B.5A acceptance report)
breaks the audit trail.

**Remediation status:** The unauthorized amendment cannot be undone without
history rewriting (which is itself prohibited).  The commit `b27252e` is
preserved in the branch history as-is as the effective Phase 1B.5B HEAD on
which Phase 1B.5C-R was built.  Future governance records reference `b27252e`
as the effective Phase 1B.5B HEAD.  This blocker is acknowledged as a
permanent audit note rather than a code defect.  No further history rewriting
is permitted.
