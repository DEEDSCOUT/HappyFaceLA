# HFLA Commercial Draft v3 — Candidate Manifest

Package root: `candidates/phase1c/hfla_commercial_draft_v3/`

## File inventory

| Path (relative to package root) | Purpose | Mutability |
| ------------------------------- | ------- | ---------- |
| `candidate.yaml` | Sole machine-loaded source of truth: rules, evidence, blockers, channel projections, release shell, channel activations. | Byte-frozen after intake PASS.  Any subsequent edit invalidates receipts and requires a v4 cycle. |
| `CEO_REVIEW_SUMMARY.md` | Human-facing summary of the decisions the CEO is being asked to make, including the v2 -> v3 changes. | Human-readable; not loaded by the validator. |
| `SOURCE_EVIDENCE_SUMMARY.md` | Evidence-record taxonomy plus the explicit list of LA / SoCal market references qualifying toward the six-source minimum, and the two clearly-labelled supplementary records. | Human-readable; not loaded by the validator. |
| `RESEARCH_LOG.md` | Execution-order log of the v3 build, what was done and what was explicitly NOT done. | Human-readable; not loaded by the validator. |
| `CANDIDATE_MANIFEST.md` | This file. | Human-readable; not loaded by the validator. |
| `receipts/candidate_sha256.txt` | Byte-safe SHA-256 of `candidate.yaml` as it appears on disk at the moment of receipt freeze, computed via `hashlib.sha256` on the raw file bytes (no PowerShell encoding wrappers). | Written once, after intake PASS and before commit. |
| `receipts/validation_result.txt` | Captured transcript of the intake validator run that produced the PASS, including counts and unresolved-blocker tally. | Written once, after intake PASS and before commit. |

## Loaded vs informational

The Phase 1C-A intake validator (`validate-phase1c-input`) reads
**only** `candidate.yaml`.  All `.md` files in this package are
human-readable companions; they are not parsed, validated, or
fingerprinted by any control-room CLI.

The two files under `receipts/` are written by the human builder as
audit artifacts; the validator does NOT consume them.  Downstream
trust in the receipts depends on:

1. The byte-safe SHA-256 in `candidate_sha256.txt` matching the
   filesystem bytes of `candidate.yaml` at the moment of commit, AND
2. The counts in `validation_result.txt` matching the counts
   reported when the validator is re-run against the committed
   bytes.

Both invariants are verified post-commit and reported in the
controller return transcript.

## What this package does NOT publish

- No content is sent to Google Drive, Google Workspace, Google Ads,
  or any third-party AI service.
- No HFLA website page is modified.
- No release record is `APPROVED`, `RELEASED`, or `ACTIVE`.  The
  single release record `HFLA-REL-DRAFT-COMMERCIAL-V3` is `DRAFT`
  with `ceo_decision: PENDING_CEO_REVIEW` and empty
  `authorized_channels`.
- No channel activation is `APPROVED`, `READY_FOR_REVIEW`, or
  `ACTIVE`.  All five channel activations are `DRAFT`.
- No projection contains the `RESTRICTED_OPERATIONS_PII` value.

## Promotion path

Promotion of v3 from DRAFT to ACTIVE requires, in order:

1. Per-blocker CEO decisions on `HFLA-BLK-001` through
   `HFLA-BLK-033`.
2. Per-projection CEO approval of `approved_channel_text` for each
   of the 30 projections.
3. Re-validation against the post-decision candidate.
4. Pre-release evidence re-verification (`HFLA-BLK-026`).
5. Separate controller authorisation for channel activation.

None of those steps is in scope for Phase 1C-A.3.  Phase 1C-A.3 ends
at admitting the v3 package for intake.
