# HFLA Commercial Draft v3 — CEO Review Summary

**Package:** `candidates/phase1c/hfla_commercial_draft_v3/`
**Status:** DRAFT — pending CEO review. No record is APPROVED, RELEASED or ACTIVE.
**Replaces:** v2 (commit `869f419`, rejected — see
[`docs/phase1c/PHASE_1C_A_V2_CONTENT_AUDIT_REJECTED.md`](../../../docs/phase1c/PHASE_1C_A_V2_CONTENT_AUDIT_REJECTED.md)).

## What the CEO is being asked to decide

Thirty-three open CEO-input blockers (`HFLA-BLK-001` through
`HFLA-BLK-033`) cover the full commercial decision surface for the
Phase 1C channel launch:

- **Public pricing (HFLA-BLK-001, 002, 003, 006, 007, 011, 012, 019, 021, 022)** —
  the two-tier package ladder (`Color Pop $150`, `Birthday Favorite $275`),
  the tiered deposit ($50 / 30% at $300), the per-hour stance, surcharge
  options.
- **Travel and quote intake (HFLA-BLK-004, 005, 018, 032)** — travel-fee
  method, per-county premiums, response SLA, and the explicit
  travel-fee × two-hour-minimum interaction.
- **Booking policy (HFLA-BLK-010, 013, 014, 015, 030)** — overtime hourly
  rate plus the recommended 30-minute increment, cancellation notice
  window, reschedule terms, weather cancellation policy.
- **Vendor / school / corporate (HFLA-BLK-008, 009, 023, 024, 027, 028)** —
  school minimum, corporate invoice terms, sponsored-design pilot
  parameters, COI workflow, dispatch model, concurrent-booking caps.
- **Safety, privacy and tax (HFLA-BLK-020, 029, 031)** — approved
  safety language (banning unqualified `hypoallergenic`), customer-facing
  tax / fee disclosure, photo / video / privacy consent.
- **AI and channel controls (HFLA-BLK-016, 017, 025, 026, 033)** —
  Google Ads campaign authority, chatbot authority limit, Copilot
  PII-redaction workflow, the $100 ad-spend gate, quote-operator
  no-unapproved-promises rule.

None of the open blockers blocks Phase 1C intake; all are CEO business
decisions to be made before any consumer channel activation can
advance from DRAFT to READY_FOR_REVIEW.

## What changed vs v2

| Topic | v2 | v3 |
| ----- | -- | -- |
| Rules | 29 | 33 |
| Evidence records | 13 | 15 |
| Blockers | 29 | 33 |
| Channel projections | 10 | 30 |
| Release shells | 1 | 1 |
| Channel activations | 5 | 5 |
| Qualifying LA / SoCal market refs | 4 | 6 |
| 30-minute overtime increment | absent | `HFLA-RULE-BP-005` |
| Photo / video / consent governance | absent | `HFLA-RULE-SC-005` + `HFLA-BLK-031` |
| Travel-fee × two-hour interaction | absent | `HFLA-RULE-QT-004` + `HFLA-BLK-032` |
| Operator no-unapproved-promises | implied | `HFLA-RULE-CI-004` + `HFLA-BLK-033` |
| Receipt freshness | stale (rules / hash mismatch) | byte-frozen after intake PASS, then SHA-256 + counts recorded |

## How CEO review proceeds

1. Read this summary together with [`CANDIDATE_MANIFEST.md`](CANDIDATE_MANIFEST.md)
   to confirm the package layout.
2. Read [`SOURCE_EVIDENCE_SUMMARY.md`](SOURCE_EVIDENCE_SUMMARY.md) for
   the evidence base, including the six qualifying LA / SoCal
   market-reference records and the two clearly labelled
   supplementary records.
3. Walk the 33 rules and 33 blockers in `candidate.yaml`.  Each rule
   carries a `draft_recommendation` (the proposed answer) and an
   `internal_notes` field referencing the blocker that captures the
   CEO decision.
4. Walk the 30 channel projections.  Each governs exactly one
   independently-approvable publication slot identified by its
   `publication_key`.  `approved_channel_text` is empty for every
   projection until CEO releases approved wording.
5. Reject, modify, or approve each blocker individually.  Approval
   of a blocker authorises operator-facing implementation of the
   related rules and projections through the standard release-export
   path.

No content in this package is published.  Nothing is sent to Google
Drive, Google Workspace, Google Ads, or any third-party AI service
by the act of admitting this candidate for intake.
