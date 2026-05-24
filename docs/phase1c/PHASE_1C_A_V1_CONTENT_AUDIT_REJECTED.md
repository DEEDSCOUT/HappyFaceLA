# Phase 1C-A.1 — V1 COMMERCIAL DRAFT CANDIDATE: CONTENT AUDIT (REJECTED)

**Status:** REJECTED FOR CEO REVIEW.
**Rejected candidate:** `candidates/phase1c/hfla_commercial_draft_v1/`
(committed at `14c3d1b`, retained UNCHANGED for audit history).
**Replacement candidate:** `candidates/phase1c/hfla_commercial_draft_v2/`
(also DRAFT — pending controller review, NOT YET CEO-ready).
**Audit date:** 2026-05-24.

---

## Lifecycle framing (verbatim)

> The v1 Phase 1C commercial draft candidate remains in DRAFT lifecycle
> state but is **NOT approved for CEO review**.  It MUST NEVER be loaded
> into the active governance configuration.  It is retained on disk as an
> audit-history artifact only.  Candidate v2 replaces v1 **only as a
> proposed candidate** for future controller review.  Nothing in this
> rejection record, and nothing in v2, marks any record as approved,
> released, or active.

---

## Why v1 was rejected (controller-cited defects)

### Defect 1 — Inaccurate access-or-extraction dates

Every v1 `EvidenceRecord.access_or_extraction_date` field was set to
`2025-07-21`, including evidence records describing Happy Faces LA's
current 2026 website state.  Phase 1C-A.1 is being executed on
**2026-05-24**; the v1 dates therefore mis-attribute live observations
to a date approximately ten months earlier and are not auditable.

### Defect 2 — Missing minimum-six source-traceable market references

The controller's Phase 1C-A.1 authorization requires **at least six
distinct source-traceable MARKET_REFERENCE evidence records**.  V1
provides exactly one market-research record, `HFLA-EVD-006`, whose
`source_locator` is a placeholder string
(`"PLACEHOLDER — competitor sites returned HTTP errors during research"`),
explicitly self-marked as `OPEN_EVIDENCE_REQUIRED`.  This is a single
unverified record, not six source-traceable records.

### Defect 3 — $150 framed as a universal floor instead of a public entry anchor

V1 `HFLA-RULE-PP-001` ("Minimum booking price floor — single service,
single artist") presents $150 as the universal price floor across all
public channels and the chatbot.  The Happy Faces LA homepage and
pricing page actually frame $150 as the **entry-tier starting price**
for the Birthday Party Package (one service, one artist, kid-friendly
designs), explicitly contingent on event location, guest count, services
requested, event duration, and number of artists.  Treating $150 as a
universal floor is a content shift, not a faithful representation of
the existing public anchor.

### Defect 4 — Missing public package ladder

The controller's Phase 1C-A.1 authorization requires the candidate to
publish a defensible public-package ladder anchored on the two HFLA
package archetypes:

- **"Color Pop Face Painting"** — entry-tier — 1 artist, 1 hour, up to
  10 children, starting at **$150**.
- **"Birthday Favorite"** — mid-tier — 1 artist, 2 hours, up to 18
  children, starting at **$275**.

V1 does not propose this two-tier package ladder.  V1 contains only the
single $150 floor and five quote-only options, leaving HFLA without a
mid-tier public package to anchor against LA per-hour competitor norms
(Paint On Your Face: $120/hour face, $130/hour balloon, with a 2-hour
minimum).

### Defect 5 — Missing CEO-decision blockers

V1 contains 18 blockers but omits CEO decisions on:

1. **Dispatch / artist scheduling** — which artist takes which booking.
2. **Capacity** — same-day / same-weekend max concurrent bookings.
3. **Tax / 1099 treatment** — sales tax + contractor reporting.
4. **Privacy / PII handling** — what fields the chatbot/operator may
   keep; what is restricted-PII.
5. **Insurance** — general-liability cover and certificate-of-insurance
   issuance.
6. **Vendor pilot program** — sponsored designs, HFLA-only-provider,
   sponsorship identification, paid services continuation, family
   attendance, case-by-case approval (controller-specified pilot).
7. **$100 paid-ad-spend gate** — minimum spend authorisation
   threshold before any Google Ads campaign goes live.
8. **Copilot-internal PII boundary** — explicit rule that internal
   Copilot decision-support content MUST NOT receive customer PII.

### Defect 6 — Invalid Google Ads asset character lengths

V1 `HFLA-PROJ-ADS-001` headline draft is **63 characters** ("Face
Painting Los Angeles | Bookings from $150 | Fast Quote Response").
Google Ads responsive search ads cap headlines at **30 characters**
(verified 2026-05-24 against
`support.google.com/google-ads/answer/7684791`).  The v1 ad headline
would be rejected at the Ads platform layer and could not be served.

V1 `HFLA-PROJ-ADS-002` description draft is **172 characters**;
Google Ads caps RSA descriptions at **90 characters each**.  The v1
description likewise could not be served.

### Defect 7 — Internal contradiction on $150 floor

V1 `HFLA-RULE-PP-001` `internal_notes` reads "CEO decision required:
confirm $150 floor is authorised for all public channels…" while the
same rule's `draft_recommendation` asserts the $150 floor is "the
current homepage and booking-policy stated price" and the candidate's
overall stance is that the $150 floor IS the CEO-confirmed minimum.
The blocker register (HFLA-BLK-001) carries the same internal
inconsistency: the rule treats $150 as both already-CEO-confirmed and
as pending CEO confirmation.  V2 resolves this by clearly framing $150
as the live-website starting price (verified observation) and the CEO
decision as "authorise the existing live-website figure as the
governed minimum across all channels."

### Defect 8 — Safety-claim risk (FDA "hypoallergenic")

V1 `HFLA-RULE-SC-002` ("Product safety and hypoallergenic standards
for face paint") names "hypoallergenic" as a candidate public-channel
safety claim.  The FDA has stated (page last updated 2022-02-25, URL
`fda.gov/cosmetics/cosmetics-labeling-claims/hypoallergenic-cosmetics`,
re-verified 2026-05-24): "There are no Federal standards or
definitions that govern the use of the term 'hypoallergenic.' The
term means whatever a particular company wants it to mean.
Manufacturers of cosmetics labeled as hypoallergenic are not required
to submit substantiation of their hypoallergenicity claims to FDA."
Publishing an unqualified "hypoallergenic" claim therefore creates
both an FTC misleading-cosmetics-claim risk and a Google Ads
Misrepresentation policy risk (HFLA-EVD-004 prohibits unreliable
claims).  V1 did not flag this; v2 adds `HFLA-RULE-SC-003` and
`HFLA-BLK-020` to ban the unqualified claim and substitute
"cosmetic-grade, FDA color-additive compliant" language.

---

## Disposition

- V1 directory `candidates/phase1c/hfla_commercial_draft_v1/` remains
  on disk at commit `14c3d1b`, untouched, as audit history.
- V1 MUST NOT be loaded into `config/seed_data/` or any active workbook
  destination.
- V2 directory `candidates/phase1c/hfla_commercial_draft_v2/` is
  proposed as the corrected DRAFT candidate.  V2 is also NOT yet
  CEO-ready and remains DRAFT pending separate controller review.
- This rejection record may be cited in future controller logs as the
  authoritative reason v1 was not promoted to CEO review.

---

## Linked artifacts

- Replacement candidate: `candidates/phase1c/hfla_commercial_draft_v2/candidate.yaml`
  SHA-256: `c995d72a116c1941716d65ea536f0e3ec69eca9211739c31e4a29d54e38189f8`
- Replacement candidate manifest:
  `candidates/phase1c/hfla_commercial_draft_v2/CANDIDATE_MANIFEST.md`
- Replacement research log:
  `candidates/phase1c/hfla_commercial_draft_v2/RESEARCH_LOG.md`
- Replacement evidence summary:
  `candidates/phase1c/hfla_commercial_draft_v2/SOURCE_EVIDENCE_SUMMARY.md`
- Replacement CEO summary (DRAFT — not CEO-ready):
  `candidates/phase1c/hfla_commercial_draft_v2/CEO_REVIEW_SUMMARY.md`
