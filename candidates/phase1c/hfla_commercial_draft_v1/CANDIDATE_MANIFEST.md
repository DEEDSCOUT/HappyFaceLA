# Candidate Manifest
## Phase 1C Commercial Candidate Package — DRAFT v1

**Package path:** `candidates/phase1c/hfla_commercial_draft_v1/`
**Release shell ID:** `HFLA-REL-DRAFT-COMMERCIAL-V1`
**Intake gate command:** `.\.venv\Scripts\python.exe -m hfla_control_room.cli validate-phase1c-input -c config -i candidates/phase1c/hfla_commercial_draft_v1`
**Status:** DRAFT — pending CEO review
**Authored:** 2025-07-21

---

## File Inventory

| File | Type | Purpose |
| --- | --- | --- |
| `candidate.yaml` | YAML (intake) | Complete governance candidate — all six record families |
| `CEO_REVIEW_SUMMARY.md` | Documentation | 12-section decision-oriented summary for CEO review |
| `SOURCE_EVIDENCE_SUMMARY.md` | Documentation | Evidence crosswalk and source integrity notes |
| `RESEARCH_LOG.md` | Documentation | Research session log with access dates and limitations |
| `CANDIDATE_MANIFEST.md` | Documentation | This file — package inventory and record counts |
| `receipts/candidate_sha256.txt` | Receipt | SHA-256 hash of candidate.yaml at commit time |
| `receipts/validation_result.txt` | Receipt | Exit-0 intake gate validation result |

---

## Record Counts

| Family | YAML key | Count |
| --- | --- | --- |
| Rules | `rules` | 19 |
| Evidence records | `evidence_records` | 6 |
| Blocker records | `blocker_records` | 18 |
| Channel projections | `channel_projection_records` | 10 |
| Release records | `release_records` | 1 |
| Channel activations | `channel_release_activations` | 5 |
| **Total records** | | **59** |

---

## Rule Category Distribution

| Category | Rules |
| --- | --- |
| PUBLIC_PRICING | 5 (HFLA-RULE-PP-001 through PP-005) |
| BOOKING_POLICY | 4 (HFLA-RULE-BP-001 through BP-004) |
| QUOTE_TRAVEL | 3 (HFLA-RULE-QT-001 through QT-003) |
| VENDOR_SCHOOL_CORPORATE | 2 (HFLA-RULE-VS-001, VS-002) |
| SAFETY_CARE | 2 (HFLA-RULE-SC-001, SC-002) |
| AI_CUSTOMER_RESPONSE | 2 (HFLA-RULE-AR-001, AR-002) |
| CHANNEL_IMPLEMENTATION | 1 (HFLA-RULE-CI-001) |

---

## Channel Coverage

| Channel | Projections | Activation |
| --- | --- | --- |
| WEBSITE_PUBLIC | HFLA-PROJ-WEB-001, HFLA-PROJ-WEB-002 | HFLA-ACT-WEB-001 |
| GOOGLE_ADS_PUBLIC | HFLA-PROJ-ADS-001, HFLA-PROJ-ADS-002 | HFLA-ACT-ADS-001 |
| CUSTOMER_CHATBOT_PUBLIC | HFLA-PROJ-BOT-001, HFLA-PROJ-BOT-002 | HFLA-ACT-BOT-001 |
| COPILOT_INTERNAL_DECISION_SUPPORT | HFLA-PROJ-COP-001, HFLA-PROJ-COP-002 | HFLA-ACT-COP-001 |
| QUOTE_OPERATOR_INTERNAL | HFLA-PROJ-QOP-001, HFLA-PROJ-QOP-002 | HFLA-ACT-QOP-001 |
| RESTRICTED_OPERATIONS_PII | — (no projections) | — (no activation) |

---

## Blocker Summary

| Priority | Count | Key decisions |
| --- | --- | --- |
| CRITICAL | 1 | Google Ads campaign authorisation (BLK-016) |
| HIGH | 6 | Price floor, deposit, cancellation window, weather policy, travel method, chatbot authority |
| MEDIUM | 8 | OC/Ventura travel premiums, combined-package price, add-on price, school/corporate minimums, overtime rate, reschedule notice, SLA |
| LOW | 2 | Peak surcharge, last-minute surcharge |
| **Total** | **18** | All status: OPEN_CEO_INPUT_REQUIRED |

All 18 blockers have `blocks_phase_1c_content_loading: false` — ordinary
CEO business decisions that do not block intake.

---

## Intake Gate Requirements Met

| Requirement | Status |
| --- | --- |
| All 6 record families non-empty | YES |
| Exactly one DRAFT release record | YES — HFLA-REL-DRAFT-COMMERCIAL-V1 |
| Exactly one DRAFT activation per projected channel | YES — 5 channels, 5 activations |
| No orphan activations | YES — all 5 activations match projected channels |
| All activations reference single release | YES — all reference HFLA-REL-DRAFT-COMMERCIAL-V1 |
| No RESTRICTED_OPERATIONS_PII projections | YES — not in any projection or activation |
| All rule_category values canonical | YES — 7 canonical categories used |
| No structural blockers (blocks_phase_1c_content_loading=true) OPEN | YES — all 18 blockers are false |
| publication_key format valid | YES — all 10 keys match required pattern |

---

## SHA-256 Integrity

The SHA-256 hash of `candidate.yaml` is recorded in `receipts/candidate_sha256.txt`
immediately after intake gate validation.  Any post-validation modification to
`candidate.yaml` will produce a different hash — the receipt file is the
integrity anchor for this candidate version.
