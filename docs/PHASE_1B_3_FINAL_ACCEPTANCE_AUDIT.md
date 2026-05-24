# Phase 1B.3 — Final Acceptance Audit

**Audited commit:** `edfe67613945597b0c73a6e2aaebb45e32877f1f`
**Audit verdict:** **FAIL** — withheld; two governance defects required Phase 1B.4 remediation.

This audit was performed against the deliverables of the Phase 1B.3 closure report
(`docs/PHASE_1B_3_CLOSURE_REPORT.md`). Two defects in the **release gate** were
identified that violate the project's published authority chain and risk-control
posture. Final acceptance of Phase 1B.3 was therefore **withheld** pending the
Phase 1B.4 remediation captured in `docs/PHASE_1B_4_CLOSURE_REPORT.md`.

---

## R1 — Blocker scope independence

**Defect.** The release-gate exporter coupled the *publication* decision to the
operational scope flag `blocks_live_provisioning`. An open blocker that named a
channel in `blocked_channels` was not treated as a publication blocker for that
channel unless the same blocker also asserted `blocks_live_provisioning=True`.
This collapsed three independent governance scopes into one.

**Why it matters.** The three scopes have different meanings and different
owners:

| Scope                                  | Question it answers                              |
| -------------------------------------- | ------------------------------------------------ |
| `blocked_channels`                     | May *content* publish to this channel today?     |
| `blocks_live_provisioning`             | May the platform mutate live provider state?    |
| `blocks_phase_1c_content_loading`      | May the content-loading phase begin?            |

Conflating them allowed an open blocker listing a channel to silently *not*
block publication to that channel — a fail-open posture.

**Resolution (Phase 1B.4).** The release-gate exporter now consults
`blocked_channels` **only** for the publication decision (gate A). Live
provisioning and Phase 1C loading have dedicated check functions
(`validate_no_live_provisioning_blockers`,
`validate_no_phase_1c_loading_blockers`) which consult their own scope flags
independently. Test coverage: `tests/test_blocker_scope_independence.py`.

---

## R2 — Current-release authority and supersession

**Defect.** "Which release is currently active for a given channel?" was
inferred from `ReleaseRecord.status == RELEASED` plus channel authorisation.
Two consecutive RELEASED records that both authorised the same channel could
both be considered active, with no first-class supersession link and no
single-current-output invariant. There was also no per-channel uniqueness on
the published *publication slot*, so two RELEASED projections could occupy the
same slot on the same channel.

**Why it matters.** Without a single-current authority record, downstream
exporters cannot answer "what is currently on this channel?" deterministically.
Without a `(channel, publication_key)` uniqueness invariant, two RELEASED
projections can produce a conflicting export for the same publication slot.

**Resolution (Phase 1B.4).** A first-class
`ChannelReleaseActivationRecord` model and register were introduced with the
following invariants:

* At most one `ACTIVE` activation per channel at any time.
* `ACTIVE` requires the cited release to be `RELEASED` and to authorise the
  activation's channel, plus `qa_status=VERIFIED_PASS`, non-empty
  `qa_evidence`, an `effective_date`, and `snapshot_mode=FULL_CHANNEL_SNAPSHOT`.
* Supersession is expressed via a foreign-key `supersedes_activation_id`
  pointing at the prior activation.
* Restricted channels cannot host activations.
* Each `ChannelProjectionRecord` carries a required `publication_key`
  (regex `^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$`); the projection register rejects
  duplicate publication keys among `APPROVED_FOR_RELEASE`/`RELEASED` rows; the
  exporter is fail-closed on duplicate `(channel, publication_key)` even if the
  register is bypassed via `model_construct`.

Test coverage: `tests/test_channel_activation_contract.py`,
`tests/test_publication_key_conflict.py`,
`tests/test_governing_rule_inclusion.py`,
`tests/test_validate_release_cli.py`.

---

## Audit conclusion

Phase 1B.3 closed the bulk of the release-governance work but left the two
defects above unresolved. Final acceptance is therefore deferred to
Phase 1B.4. See `docs/PHASE_1B_4_CLOSURE_REPORT.md` for the remediation.
