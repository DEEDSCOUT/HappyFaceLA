# HFLA Commercial Draft v3 — Source Evidence Summary

All evidence records below are in `candidate.yaml` under the
`evidence_records` block.  The list is exhaustive: every evidence
record cited by any rule, blocker or projection in v3 is in this
summary.

## Evidence taxonomy used in v3

- **VERIFIED_CURRENT_FACT** — observed directly on an HFLA-owned
  surface (happyfacesla.com).
- **OFFICIAL_POLICY** — published policy from an authoritative
  regulator or platform vendor (Google, FDA).
- **MARKET_REFERENCE** — directly observed Los Angeles County /
  nearby Southern California provider or marketplace page.  Qualifies
  toward the six-source minimum.
- **SUPPLEMENTARY** — useful context but does NOT qualify toward the
  LA-market-reference minimum.  Flagged explicitly in the record's
  `qualifies_for_la_market_minimum` field and again here.

## HFLA-owned facts (3)

| ID | Source | Notes |
| -- | ------ | ----- |
| HFLA-EVD-001 | happyfacesla.com homepage | Headline price floor (`Face Painting Parties from $150`), tagline, service categories. |
| HFLA-EVD-002 | happyfacesla.com booking policy page | Two-hour minimum, deposit non-refundable, weather, cancellation, overtime-on-approval wording. |
| HFLA-EVD-003 | happyfacesla.com pricing / quote page | Quote-only stance for travel premiums, balloon twisting, enhancements. |

## Official policy (4)

| ID | Source | Notes |
| -- | ------ | ----- |
| HFLA-EVD-004 | Google Ads — Misrepresentation policy | Bans unqualified `hypoallergenic` style claims in ad copy and landing pages. |
| HFLA-EVD-005 | Google Ads — Editorial standards overview | Requires accurate, non-deceptive, landing-parity ad copy. |
| HFLA-EVD-006 | Google Ads — Responsive Search Ads asset specification | 30-character headline / 90-character description limits. |
| HFLA-EVD-007 | U.S. FDA — Cosmetics Q&A: 'Hypoallergenic' Cosmetics | Federal stance that `hypoallergenic` has no agreed regulatory definition. |

## LA / SoCal market references that QUALIFY toward the six-source floor (6)

| ID | Source | Provider type | Notes |
| -- | ------ | ------------- | ----- |
| HFLA-EVD-008 | paintonyourface.com | LA direct provider site | Per-hour rates from $175 for one artist; openly published. |
| HFLA-EVD-009 | bubblemaniaco.com | SoCal direct provider site (serves LA County) | Multi-service menu; site warns face paint is not labelled hypoallergenic. |
| HFLA-EVD-010 | facepaintingla.com | LA direct provider site | Premium quote-only, no published floor. |
| HFLA-EVD-011 | Thumbtack LA face-painter directory — observation: Tammy P. (Face Painting & Balloon Twisting) | LA marketplace listing observation | Marketplace-published hire count and aggregate star rating. |
| HFLA-EVD-012 | Thumbtack LA face-painter directory — observation: Bella's Creative Crew | LA marketplace listing observation | Marketplace-published hire count and aggregate star rating. |
| HFLA-EVD-013 | Thumbtack LA face-painter directory — observation: Funtastic Faces & Perfect Party Planning | LA marketplace listing observation | Marketplace-published hire count and aggregate star rating. |

Six sources clear the six-source minimum.  Three are direct provider
websites; three are independently named providers observed via the
Thumbtack LA face-painter directory page (which is itself a
publicly accessible LA marketplace listing page).

## Supplementary references — explicitly NOT counted (2)

| ID | Source | Why excluded from the six-source minimum |
| -- | ------ | --------------------------------------- |
| HFLA-EVD-S-001 | Thumbtack — national 'How much does face painting cost?' cost guide | National aggregator; not an LA-specific marketplace observation. |
| HFLA-EVD-S-002 | Wikipedia — `Body painting` article | Encyclopedia general-reference article; not a marketplace or provider page. |

Every supplementary record has
`qualifies_for_la_market_minimum: false` in `candidate.yaml`.

## Evidence freshness statement

All `MARKET_REFERENCE` and `SUPPLEMENTARY` records carry a
`reliability_tier` of `TIER_2_SECONDARY` or `TIER_3_INDICATIVE`.  All
`VERIFIED_CURRENT_FACT` HFLA-owned records and all `OFFICIAL_POLICY`
records carry `reliability_tier: TIER_1_PRIMARY`.  Tier values are
the canonical strings enumerated under
`EvidenceReliabilityTier` in `src/hfla_control_room/models.py`.

Every evidence record carries an `access_or_extraction_date` of
`2026-05-24` and an `evidence_status` of `VERIFIED`.  Re-verification
prior to any release of approved channel text is captured under
`HFLA-BLK-026` (final pre-release evidence re-verification gate).

No record cites any non-public, paid, or login-walled source.
