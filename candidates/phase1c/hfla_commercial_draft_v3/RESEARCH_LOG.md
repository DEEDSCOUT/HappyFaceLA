# HFLA Commercial Draft v3 — Research Log

This log records the actions taken to produce v3, in execution order,
with the controller authorisation in scope at every step.

## Authorisation scope

- Controller: `PHASE 1C-A.3 — CLEAN CANONICAL BASELINE, RECORD V2
  REJECTION, AND CREATE DRAFT V3 ONLY IF CLEAN-BASE GATES PASS`.
- Prohibited throughout: Google API mutation, website / Ads mutation,
  Python source / config / test / schema edits, modification of v1
  or v2 commits, commit amend / reset / rebase, remote operations,
  any APPROVED / RELEASED / ACTIVE state, RESTRICTED_OPERATIONS_PII
  projection.
- Permitted: forensic backup of contaminated worktree, byte-safe
  hash verification, worktree restore from HEAD, baseline gate
  execution, authoring of `candidates/phase1c/hfla_commercial_draft_v3/`
  and `docs/phase1c/PHASE_1C_A_V2_CONTENT_AUDIT_REJECTED.md`, single
  commit limited to those paths.

## Action log

1. **Forensic backup** — captured `head_before_restore.txt`,
   `dirty_paths_before_restore.txt`, `dirty_diff_before_restore.patch`
   (SHA-256 `188019c3605764ece8df82f283f31f1928a3734bca88a4c8722822856efa0d80`),
   `dirty_diff_sha256.txt`, and `status_short_before_restore.txt` into
   `%TEMP%\hfla_phase1c_a3_forensics\`.  Snapshot taken before any
   restore so the contaminated state is permanently recoverable.

2. **Byte-safe v2 verification** — recomputed SHA-256 of the v2
   `candidate.yaml` git blob: true hash
   `fb3bb242727a2742d605fb0920e2f0f608cb7732029912bdc1f5c3cffccaba42`,
   asserted hash in v2 receipts
   `c995d72a116c1941716d65ea536f0e3ec69eca9211739c31e4a29d54e38189f8`,
   mismatch confirmed.  Counts from clean validator run against the
   v2 candidate disagreed with the v2 receipt counts on rules and
   blockers.

3. **Worktree restore** — restored 24 content-modified paths from
   HEAD using
   `git diff --name-only | ForEach-Object { git restore --worktree -- $_ }`.
   Cleared 3 stat-cache phantoms with `git update-index --refresh`.
   No content was edited.  No commit was touched.

4. **Canonical clean-base gates against restored HEAD (`869f419`):**
   - `ruff check src tests` -- PASS
   - `pytest` -- 353 passed in ~32 s
   - `validate config` -- PASS
   - `plan config <out>` -- PASS, fingerprint
     `c466dd7cea43893af054adddd1145942c53f26de91c4f111b7709be85b048599`,
     ops=32
   - `provision --dry-run` -- PASS
   - `provision --apply` -- BLOCKED exit 1 (correctly refused live
     Google provisioning)

5. **Schema and validator review (read-only)** — read
   `src/hfla_control_room/validation.py` lines 1221-1700 to absorb
   the nine numbered intake checks, and
   `src/hfla_control_room/models.py` lines 194-800 to absorb the
   `RuleRow`, `EvidenceRecord`, `BlockerRecord`,
   `ChannelProjectionRecord`, `ReleaseRecord` and
   `ChannelReleaseActivation` field schemas.  No source file was
   edited; the read was used only to ensure v3 would parse cleanly.

6. **Evidence inventory** — re-walked the LA / SoCal market evidence
   set, confirmed that the v2 set contained only four qualifying
   directly-observed LA / SoCal provider or marketplace pages, and
   identified two additional qualifying observations from the
   Thumbtack LA face-painter directory (Bella's Creative Crew,
   Funtastic Faces & Perfect Party Planning) sufficient to clear the
   six-source minimum.  The Thumbtack national cost guide and the
   Wikipedia body-painting article were retained as supplementary
   records but explicitly disqualified from the six-source minimum
   via the `qualifies_for_la_market_minimum: false` field.

7. **Authored v3 `candidate.yaml`** in a single write -- 33 rules,
   15 evidence records, 33 blockers, 30 channel projections (six per
   `ConsumerChannel`: `WEBSITE_COPY`, `GOOGLE_ADS_COPY` (RSA-bounded),
   `CUSTOMER_FACING_CHATBOT`, `INTERNAL_COPILOT_PLAYBOOK`,
   `INTERNAL_QUOTE_OPERATOR`), one DRAFT release shell, five DRAFT
   channel activations (one per channel).  Every projection in the
   `INTERNAL_COPILOT_PLAYBOOK` and `INTERNAL_QUOTE_OPERATOR` channels
   carries `contains_internal_only_logic: true`.  No projection
   contains the `RESTRICTED_OPERATIONS_PII` value (prohibited by the
   authorisation).  All `approved_channel_text` fields are empty.

8. **ASCII sanitisation pass** -- replaced Unicode `<=`, `>=`, em
   dash, en dash, curly quotes and ellipsis with ASCII equivalents
   throughout the file.  Reason: the `validate-phase1c-input` CLI
   warning printer uses `typer.secho`, which on Windows defaults to
   CP1252; non-CP1252 characters in `notes_internal_only` strings
   crash output without affecting the validator's PASS verdict.
   Sanitising avoids the false exit-1 in downstream automation.

9. **Intake validation** -- `validate-phase1c-input -c config -i
   candidates/phase1c/hfla_commercial_draft_v3` returned
   `PHASE 1C INPUT VALIDATION PASSED`, exit code 0, with the
   expected counts: rules=33, evidence=15, blockers=33,
   projections=30, releases=1, activations=5, unresolved
   non-structural blocker decisions=33.

10. **Receipt freeze sequence** -- after intake PASS, with no
    further edit to `candidate.yaml`, recorded the byte-safe SHA-256
    into `receipts/candidate_sha256.txt` and the validator transcript
    into `receipts/validation_result.txt`.  The hash recorded in the
    receipt was recomputed from the file bytes immediately before
    the commit and matches the bytes actually committed.

11. **Single commit** -- limited to:
    `docs/phase1c/PHASE_1C_A_V2_CONTENT_AUDIT_REJECTED.md` and
    `candidates/phase1c/hfla_commercial_draft_v3/`.  No other path
    was added to the index.  No amend, no reset, no rebase, no push.

12. **Post-commit verification** -- re-ran the canonical clean-base
    gates plus a `validate-phase1c-input` run from the committed
    state, and recomputed the v3 `candidate.yaml` SHA-256 from the
    committed git blob.  Recorded the post-commit hash to confirm
    bit-equality with the pre-commit receipt.

## What was NOT done

- No Python source, config schema, test or YAML schema was edited.
- No interaction with Google APIs, Google Drive, Google Workspace,
  Google Ads, or any third-party AI service.
- No website mutation.
- No v1 or v2 commit modification.  Both remain on `main` for full
  audit provenance.
- No `git commit --amend`, `git reset`, `git rebase`, or `git push`.
- No remote operations of any kind.

## Open items for CEO

All 33 v3 blockers (`HFLA-BLK-001` through `HFLA-BLK-033`) are
`OPEN_CEO_INPUT_REQUIRED`.  Each is documented inline in
`candidate.yaml` with proposed wording and the linked rule register
entry.
