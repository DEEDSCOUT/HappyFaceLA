# Happy Faces LA — Commercial Control Room
# Phase 1C-A.1 — CEO Review Summary (DRAFT — NOT YET CEO-READY)

**Candidate package:** `candidates/phase1c/hfla_commercial_draft_v2/`
**Candidate state:** DRAFT — pending controller audit, then CEO review.
**Replaces:** `candidates/phase1c/hfla_commercial_draft_v1/` (REJECTED,
audit record at `docs/phase1c/PHASE_1C_A_V1_CONTENT_AUDIT_REJECTED.md`).
**Date prepared:** 2026-05-24.

> This document does NOT approve, release, or activate any rule or
> channel content.  Nothing herein constitutes CEO authorisation.  The
> v2 candidate remains DRAFT until the controller audits it and the CEO
> reviews and accepts the recommendations on a per-rule basis.

---

## 1. What the CEO is being asked to decide (recommended priority order)

Twenty-nine CEO decisions are open.  Recommended review order, grouped
by business impact:

### Tier 1 — Public pricing anchor (decide first; everything else cascades)
1. **HFLA-BLK-021** — Authorise the two named public packages:
   `Color Pop Face Painting` ($150 / 1 hr / 1 artist / up to 10 children)
   and `Birthday Favorite` ($275 / 2 hrs / 1 artist / up to 18 children).
2. **HFLA-BLK-001** — Confirm $150 as the public entry anchor across all
   public channels.
3. **HFLA-BLK-019 / BLK-002** — Choose the pricing model presentation:
   (A) flat starting prices only, (B) explicit per-hour rate with 2-hour
   minimum, or (C) hybrid (block + overage).

### Tier 2 — Capacity, dispatch, travel
4. **HFLA-BLK-027** — Artist dispatch model.
5. **HFLA-BLK-028** — Same-day / same-weekend concurrent-booking caps.
6. **HFLA-BLK-004 / BLK-005** — Travel-fee calculation method and OC /
   Ventura premium amounts.

### Tier 3 — Deposit, payment, cancellation, weather
7. **HFLA-BLK-022** — Tiered deposit ($50 below $300, 30% at or above $300).
8. **HFLA-BLK-003** — Confirm baseline $50 deposit + accepted payment methods.
9. **HFLA-BLK-013 / BLK-014 / BLK-015** — Cancellation notice window, one-
   time deposit transfer rules, weather-cancellation policy.
10. **HFLA-BLK-010 / BLK-011 / BLK-012** — Overtime rate, peak-demand
    surcharge, last-minute-booking surcharge.

### Tier 4 — Safety, privacy, insurance, tax
11. **HFLA-BLK-020** — Approved safety-marketing language; ban the
    unqualified term "hypoallergenic" per FDA guidance (HFLA-EVD-010).
12. **HFLA-BLK-024** — General-liability insurance + COI issuance workflow.
13. **HFLA-BLK-025** — Copilot-internal PII boundary and redaction
    workflow.
14. **HFLA-BLK-029** — Sales tax + 1099-NEC artist reporting.

### Tier 5 — Website / Ads / Chatbot / Copilot channels
15. **HFLA-BLK-016** — Google Ads campaign authorisation (budget,
    keywords, geo-targeting, ad copy, landing page).
16. **HFLA-BLK-026** — $100 cumulative paid-ad spend gate and pause-and-
    re-authorise workflow.
17. **HFLA-BLK-018** — Quote-response SLA on the website.
18. **HFLA-BLK-017** — Chatbot pricing-authority limit and escalation
    message template.

### Tier 6 — Specialised segments
19. **HFLA-BLK-006 / BLK-007** — Multi-service starting price; Glitter +
    Gems add-on starting price.
20. **HFLA-BLK-008** — School / festival booth minimum + per-additional-
    artist rate.
21. **HFLA-BLK-009** — Corporate-client invoice payment terms + retainer
    structure.
22. **HFLA-BLK-023** — Vendor pilot program parameters (sponsored
    designs, exclusivity, disclosure, family attendance, case-by-case
    approval).

---

## 2. What changed from v1 (executive summary)

- Replaced single $150 floor with explicit two-tier package ladder
  (Color Pop $150 / Birthday Favorite $275).
- Replaced flat $50 deposit with proposed tiered deposit
  ($50 below $300, 30% at or above $300).
- Added 9 CEO-decision blockers absent from v1:
  dispatch, capacity, tax / 1099, privacy / PII, insurance,
  vendor pilot, $100 paid-ad spend gate, Color Pop / Birthday Favorite
  authorisation, tiered deposit confirmation.
- Replaced placeholder market research (1 unverified record) with
  6 source-traceable MARKET_REFERENCE records (HFLA-EVD-006..009, 012, 013).
- Added FDA-grounded prohibition on the unqualified term "hypoallergenic"
  (HFLA-RULE-SC-003, HFLA-EVD-010).
- Added Google Ads RSA character-limit compliance rule
  (HFLA-RULE-CI-002, HFLA-EVD-011): 30-char headlines, 90-char
  descriptions, 15-char paths.  All draft ad copy in v2 conforms.
- Added Copilot-internal PII boundary rule (HFLA-RULE-AR-003).
- Added $100 paid-ad spend gate rule (HFLA-RULE-CI-003).
- Added insurance / COI rule (HFLA-RULE-SC-004).
- Added vendor pilot rule (HFLA-RULE-VS-003).
- All access dates corrected from `2025-07-21` to `2026-05-24`.

---

## 3. What is NOT in v2 (intentional)

- No proposed approved release.  The single ReleaseRecord
  (`HFLA-REL-DRAFT-COMMERCIAL-V2`) is DRAFT, `ceo_decision =
  PENDING_CEO_REVIEW`, `authorized_channels = []`, `qa_evidence = ""`.
- No proposed approved channel content.  All 10 ChannelProjection records
  have `approved_channel_text = ""`.
- No live mutation.  No OAuth, no Google API call, no website / ad
  change.

---

## 4. Acceptance recommendation

v2 is **READY FOR CONTROLLER AUDIT**.  It is **NOT yet CEO-ready** — the
controller must verify v2 against the brief before CEO review begins.
