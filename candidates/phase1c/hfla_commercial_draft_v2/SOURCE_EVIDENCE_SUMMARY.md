# Phase 1C-A.1 — Source / Evidence Summary

**Candidate:** `candidates/phase1c/hfla_commercial_draft_v2/candidate.yaml`
**Date:** 2026-05-24
**Total evidence records:** 13
  - VERIFIED_CURRENT_FACT (live HFLA website): 3
  - MARKET_REFERENCE (independent LA / national comparators): 6
  - OFFICIAL_POLICY (FDA + Google Ads policy + Google Ads spec): 4

All `access_or_extraction_date` values are `2026-05-24`.

---

## Evidence matrix

| ID            | Type                   | Source                                                                                  | Access date | Used by                                                                       |
| ------------- | ---------------------- | --------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| HFLA-EVD-001  | VERIFIED_CURRENT_FACT  | happyfacesla.com (homepage)                                                             | 2026-05-24  | PP-001, PP-007, PP-008, BP-001, projections                                   |
| HFLA-EVD-002  | VERIFIED_CURRENT_FACT  | happyfacesla.com/booking-policy                                                         | 2026-05-24  | PP-002, PP-009, BP-001..004, QT-001, SC-001, SC-004, VS-001, VS-002           |
| HFLA-EVD-003  | VERIFIED_CURRENT_FACT  | happyfacesla.com/pricing                                                                | 2026-05-24  | PP-001, PP-004, PP-005, PP-006, PP-007, PP-008, QT-001                        |
| HFLA-EVD-004  | OFFICIAL_POLICY        | support.google.com/adspolicy/answer/6020955 (Misrepresentation)                         | 2026-05-24  | CI-001, AR-001, SC-003, VS-003, AR-002                                        |
| HFLA-EVD-005  | OFFICIAL_POLICY        | support.google.com/adspolicy/answer/1316548 (Policy overview)                           | 2026-05-24  | CI-001, AR-002, AR-003, CI-003                                                |
| HFLA-EVD-006  | MARKET_REFERENCE       | bubblemaniaca.com (BubbleMania, LA face/balloon competitor)                             | 2026-05-24  | PP-001, PP-004, QT-002                                                        |
| HFLA-EVD-007  | MARKET_REFERENCE       | paintonyourface.com (LA per-hour face/balloon comparator)                               | 2026-05-24  | PP-001, PP-004, PP-006, PP-007, PP-008, QT-002, BP-001                        |
| HFLA-EVD-008  | MARKET_REFERENCE       | thumbtack.com (national face-painter cost guide)                                        | 2026-05-24  | PP-001, PP-005, PP-006, PP-008                                                |
| HFLA-EVD-009  | MARKET_REFERENCE       | thumbtack.com (LA face-painter directory)                                               | 2026-05-24  | PP-001, QT-002, BLK-028                                                       |
| HFLA-EVD-010  | OFFICIAL_POLICY        | fda.gov/cosmetics/cosmetics-labeling-claims/hypoallergenic-cosmetics                    | 2026-05-24  | SC-002, SC-003, CI-001                                                        |
| HFLA-EVD-011  | OFFICIAL_POLICY        | support.google.com/google-ads/answer/7684791 (RSA character spec)                       | 2026-05-24  | CI-002, projections HFLA-PROJ-ADS-001 / 002, BLK-016                          |
| HFLA-EVD-012  | MARKET_REFERENCE       | facepaintingla.com (premium-tier LA corporate operator)                                 | 2026-05-24  | VS-002, BLK-009, BLK-021                                                      |
| HFLA-EVD-013  | MARKET_REFERENCE       | en.wikipedia.org/wiki/Body_painting (category context)                                  | 2026-05-24  | SC-001, SC-002                                                                |

### Market-reference distribution

- LA direct competitors: HFLA-EVD-006 (BubbleMania), HFLA-EVD-007
  (Paint On Your Face), HFLA-EVD-012 (Face Painting LA).
- LA-segment directory + national cost guide: HFLA-EVD-008 (Thumbtack
  national), HFLA-EVD-009 (Thumbtack LA directory).
- Category-context reference: HFLA-EVD-013 (Wikipedia body painting).

Minimum-six MARKET_REFERENCE requirement satisfied
(6 distinct sources, no placeholder records).

### Official-policy distribution

- Google Ads policy (live publisher rules): HFLA-EVD-004, HFLA-EVD-005,
  HFLA-EVD-011.
- US federal safety guidance (cosmetics labelling): HFLA-EVD-010 (FDA).

---

## Integrity notes

- No placeholder URLs.  Every `source_locator` is a fetchable
  third-party or HFLA URL.
- Every evidence record is referenced by at least one rule, blocker, or
  projection.
- No evidence record is marked `status: APPROVED` (Phase 1 has no
  approved evidence).
- Failed-fetch sources (sites that returned HTTP errors during research)
  are NOT recorded as evidence and are listed only in `RESEARCH_LOG.md`
  as research limitations.
