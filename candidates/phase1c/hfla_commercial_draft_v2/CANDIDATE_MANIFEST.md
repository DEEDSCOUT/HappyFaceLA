# Phase 1C-A.1 — Candidate Manifest

**Candidate directory:** `candidates/phase1c/hfla_commercial_draft_v2/`
**Status:** DRAFT — pending controller audit, then CEO review.
**Date:** 2026-05-24.

---

## File inventory

| Path                                        | Purpose                                                  |
| ------------------------------------------- | -------------------------------------------------------- |
| `candidate.yaml`                            | Full DRAFT candidate (rules / evidence / blockers /     |
|                                             | projections / release / activations)                     |
| `CEO_REVIEW_SUMMARY.md`                     | Decision-priority order for CEO review                   |
| `SOURCE_EVIDENCE_SUMMARY.md`                | Evidence matrix + integrity notes                        |
| `RESEARCH_LOG.md`                           | Dated fetches + failed-source disclosure                 |
| `CANDIDATE_MANIFEST.md` (this file)         | Inventory + record counts + intake-gate satisfaction     |
| `receipts/candidate_sha256.txt`             | SHA-256 of `candidate.yaml`                              |
| `receipts/validation_result.txt`            | Full gate-sequence verdict                               |

---

## Record counts (verified by Phase 1C intake validator)

| Family                        | Count | Notes                                                                 |
| ----------------------------- | ----- | --------------------------------------------------------------------- |
| GovernanceRule                | 29    | All `status: DRAFT`                                                   |
| EvidenceRecord                | 13    | All `access_or_extraction_date: 2026-05-24`                           |
|   - VERIFIED_CURRENT_FACT     | 3     | HFLA homepage / booking-policy / pricing                              |
|   - MARKET_REFERENCE          | 6     | BubbleMania, Paint On Your Face, Thumbtack ×2, Face Painting LA, Wikipedia |
|   - OFFICIAL_POLICY           | 4     | Google Ads Misrepresentation, Google Ads overview, FDA hypoallergenic, Google Ads RSA spec |
| BlockerRecord                 | 29    | All `blocks_phase_1c_content_loading: false` (ordinary CEO decisions) |
| ChannelProjection             | 10    | 2 per channel × 5 channels; all `approved_channel_text: ""`           |
| ReleaseRecord                 | 1     | DRAFT, `ceo_decision: PENDING_CEO_REVIEW`                             |
| ActivationRecord              | 5     | DRAFT, FULL_CHANNEL_SNAPSHOT, one per projected channel               |

---

## Rule-category distribution

| Category                    | Count | Rule IDs                                                |
| --------------------------- | ----- | ------------------------------------------------------- |
| PUBLIC_PRICING              | 9     | PP-001..009                                             |
| BOOKING_POLICY              | 4     | BP-001..004                                             |
| QUOTE_TRAVEL                | 3     | QT-001..003                                             |
| VENDOR_SCHOOL_CORPORATE     | 3     | VS-001..003                                             |
| SAFETY_CARE                 | 4     | SC-001..004                                             |
| AI_CUSTOMER_RESPONSE        | 3     | AR-001..003                                             |
| CHANNEL_IMPLEMENTATION      | 3     | CI-001..003                                             |

All seven canonical categories represented.

---

## Channel coverage (projections)

| Channel                                | Projection IDs                            |
| -------------------------------------- | ----------------------------------------- |
| WEBSITE_PUBLIC                         | HFLA-PROJ-WEB-001, HFLA-PROJ-WEB-002      |
| GOOGLE_ADS_PUBLIC                      | HFLA-PROJ-ADS-001, HFLA-PROJ-ADS-002      |
| CUSTOMER_CHATBOT_PUBLIC                | HFLA-PROJ-BOT-001, HFLA-PROJ-BOT-002      |
| COPILOT_INTERNAL_DECISION_SUPPORT      | HFLA-PROJ-COP-001, HFLA-PROJ-COP-002      |
| QUOTE_OPERATOR_INTERNAL                | HFLA-PROJ-QOP-001, HFLA-PROJ-QOP-002      |
| RESTRICTED_OPERATIONS_PII (forbidden)  | none — channel correctly NOT projected    |

All `publication_key` values match the canonical regex
`^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$`.

---

## Intake-gate requirements satisfied

- [x] Pydantic v2 strict schema (`extra="forbid"`) — no unknown fields.
- [x] All required persisted fields present per `_REQUIRED_PERSISTED_FIELDS`.
- [x] Six or more source-traceable MARKET_REFERENCE evidence records.
- [x] Three or more OFFICIAL_POLICY evidence records.
- [x] Three VERIFIED_CURRENT_FACT records from HFLA primary surfaces.
- [x] No projection cites the RESTRICTED_OPERATIONS_PII channel.
- [x] Every projection has a matching activation per channel.
- [x] Every record is `status: DRAFT`.
- [x] Release record has `authorized_channels = []` and
  `qa_evidence = ""`.
- [x] Every projection has `approved_channel_text = ""`.
- [x] Google Ads RSA character limits respected in all draft ad copy
  (30-char headlines, 90-char descriptions, 15-char paths).
- [x] No mutation of `config/`, `src/`, `tests/`, or `seed_data/`.
- [x] No OAuth, no Google API call, no website/ad mutation.

---

## Lifecycle confirmation

This candidate is DRAFT.  It is NOT approved.  It is NOT released.  It
is NOT activated.  It MUST NOT be loaded into `config/seed_data/` or
any active workbook destination until separate controller and CEO
authorisation is granted.
