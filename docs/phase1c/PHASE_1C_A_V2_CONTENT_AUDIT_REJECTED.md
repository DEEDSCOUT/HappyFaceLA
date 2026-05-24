# Phase 1C-A v2 Content Audit — REJECTED

**Audit phase:** Phase 1C-A.2 (forensic distrust audit) → Phase 1C-A.3
(clean-base recovery + v3 build).

**Disposition:** v2 commit is **FROZEN — REJECTED**.  Not amended, not
reset, not rebased, not modified.  Retained on `main` for full audit
provenance.

---

## V2 commit identity

- **Commit SHA:** `869f419a7adf5e9bfdf69653bb5ef5d3955d67ef`
- **Branch:** `main`
- **Parent commit:** `14c3d1b` (Phase 1C-A.1 v1 — also frozen / rejected)
- **Path:** `candidates/phase1c/hfla_commercial_draft_v2/`

---

## Recovery preflight — restored worktree against contaminated v2

Before any v3 work began, the worktree was restored from `HEAD` (v2)
and an external forensic backup was taken into
`%TEMP%\hfla_phase1c_a3_forensics\`:

| Artifact | Bytes | SHA-256 |
| -------- | ----- | ------- |
| `head_before_restore.txt` | 42 | n/a (HEAD hash file) |
| `dirty_paths_before_restore.txt` | 916 | n/a (paths list) |
| `dirty_diff_before_restore.patch` | 31641 | `188019c3605764ece8df82f283f31f1928a3734bca88a4c8722822856efa0d80` |
| `dirty_diff_sha256.txt` | n/a | (recording file above) |
| `status_short_before_restore.txt` | 1049 | n/a (status snapshot) |

`git status --short` initially reported **27 modified paths** against
HEAD.  `git diff --name-only` against HEAD reported **24
content-modified paths**.  The 3 path difference resolved as stat-cache
phantoms — `git diff` showed 0 content change for
`docs/PHASE_1B_3_CLOSURE_REPORT.md`,
`docs/PHASE_1B_5B_CLOSURE_REPORT.md`, and
`tests/test_strict_schema.py`; `git update-index --refresh` cleared
all three with no content edit.  The remaining 24 content-modified
paths were restored with
`git diff --name-only | ForEach-Object { git restore --worktree -- $_ }`
(no `git checkout`, no `git reset`).  Post-restore worktree was
fully clean.

The v2 commit itself was not touched.  All four canonical clean-base
gates pass against the worktree restored to HEAD = `869f419`:

| Gate | Result |
| ---- | ------ |
| `ruff check src tests` | PASS |
| `pytest` | 353 passed in ~32 s |
| `python -m hfla_control_room.cli validate config` | PASS |
| `python -m hfla_control_room.cli plan config <out>` | PASS, fingerprint `c466dd7cea43893af054adddd1145942c53f26de91c4f111b7709be85b048599`, ops=32 (folders=14, spreadsheet_files=2, spreadsheet_configs=2, document_files=2, document_configs=2, populate=6, derive=4) |
| `provision --dry-run` | PASS |
| `provision --apply` | BLOCKED exit 1 ('BLOCKED — LIVE GOOGLE PROVISIONING NOT AUTHORIZED IN PHASE 1') |

Worktree remained clean throughout the gate run.

---

## Byte-safe v2 receipt verification — receipts are STALE

True SHA-256 of the v2 `candidate.yaml` blob committed at `869f419`,
computed from the git blob bytes:

```
fb3bb242727a2742d605fb0920e2f0f608cb7732029912bdc1f5c3cffccaba42
```

V2 `receipts/candidate_sha256.txt` asserts:

```
c995d72a116c1941716d65ea536f0e3ec69eca9211739c31e4a29d54e38189f8
```

**Mismatch.**  V2 `receipts/validation_result.txt` further asserts:

```
rules=22 evidence=13 blockers=20 projections=10 releases=1 activations=5
```

True post-commit count from a clean validator run against the v2
candidate is **rules=29, evidence=13, blockers=29, projections=10,
releases=1, activations=5**.  Counts disagree on rules (22 vs 29) and
on blockers (20 vs 29).

**Root cause:** during the v2 build cycle the rule register and blocker
register were expanded from the original 22/20 pre-rebuild state to
the final 29/29 state, but the receipts were not regenerated against
the post-expansion bytes.  The receipts were captured pre-expansion
and then committed alongside the post-expansion candidate, producing
the simultaneous hash mismatch and count mismatch above.

---

## Content defects in v2 (not exhaustive)

1. **Receipt staleness** — `receipts/candidate_sha256.txt` and
   `receipts/validation_result.txt` do not describe the bytes /
   counts actually committed.  Any downstream automation that trusts
   v2 receipts will operate on the wrong assumptions.
2. **Market-evidence floor unmet** — v2 contained 13 evidence
   records, of which only four were directly observed LA / nearby
   Southern California provider or marketplace pages
   (Paint On Your Face, BubbleMania & Co., Face Painting LA,
   Thumbtack LA face-painter directory).  The Thumbtack national
   cost guide is a national aggregator (not LA-specific) and the
   Wikipedia body-painting entry is an encyclopedia article; per the
   v3 controller's qualification criteria neither counts toward the
   six-source LA-market-reference minimum.  V2 therefore had fewer
   than six qualifying LA / SoCal market-evidence records.
3. **Miscited evidence inside rule narratives** — several v2 rule
   narratives cited `HFLA-EVD-005` (a Google Ads policy page in v2)
   when the intended citation was an LA market reference.  The
   miscitation propagates into the CEO review summary and into the
   research log.
4. **Projection register over-compressed** — v2 collapsed thirty
   independent CEO publication decisions into ten projection
   records.  Each v2 projection commingled multiple
   independently-approvable statements; CEO cannot approve a single
   headline without also approving the package descriptions and
   travel intake bundled into the same projection row.  This breaks
   the per-projection release authority model.
5. **Missing 30-minute overtime increment rule** — v2 carried
   the existing 'overtime requested and approved before scheduled
   end' policy from `HFLA-EVD-002` but did not propose an
   incremental billing rule.  Operators with no incremental
   guidance default to inconsistent overtime billing.
6. **Missing photo / video / privacy consent rule and blocker** —
   v2 contained no governance rule for HFLA artist, partner or
   sponsor-side photography or video capture of face-painted
   guests, despite HFLA's primary service producing identifiable
   depictions of children.  No corresponding CEO blocker existed.
7. **Missing travel-fee × two-hour minimum interaction rule** — v2
   carried a travel-fee rule (`HFLA-RULE-QT-003`) and an
   under-decided per-hour stance (`HFLA-RULE-PP-007`) but did not
   make the interaction explicit.  Operators quoting OC / Ventura
   bookings have no rule governing whether the two-hour minimum
   waives, augments, or extends when a travel fee applies.
8. **No explicit quote-operator no-unapproved-promises rule** —
   v2 implied a script-discipline expectation but did not encode
   a first-class rule.  Operator off-script promises remain
   legally binding to the customer; an explicit prohibition is the
   only defensible control.

---

## Disposition statement

V2 is **frozen and rejected**.  Per the Phase 1C-A.3 controller
authorisation, the v2 commit is NOT amended, NOT reset, NOT rebased,
NOT modified in any way.  It remains on `main` at commit `869f419`
for full audit provenance.

The defects above are addressed in **v3**, a clean candidate package
authored under
`candidates/phase1c/hfla_commercial_draft_v3/` in this same commit.
V3 receipts are generated AFTER the v3 `candidate.yaml` is byte-
frozen and AFTER the intake validator returns PASS, so the v3
receipts describe the bytes and counts actually committed.

This document is the v2 rejection record.  It is itself a
non-`candidate.yaml` artifact and may be amended only by appending a
new dated supersession note below this paragraph if and when v4 is
authorised.
