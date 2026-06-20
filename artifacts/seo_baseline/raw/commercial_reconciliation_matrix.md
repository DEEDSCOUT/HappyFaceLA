# COMMERCIAL RECONCILIATION MATRIX
## SEO Baseline — happyfacesla.com
## Audit Date: 2026-05-28
## Purpose: Map commercial page claims (source) → governance authorization state (control-room workbook) → actual GSC indexing state → gap classification

---

## Data Sources

| Source | Location | Status |
|---|---|---|
| Astro source pages | `c:\HappyFaceLA\src\pages\` | Read 2026-05-28 |
| Commercial control room workbook spec | `c:\Dev\happyfacesla-commercial-control-room\config\governance_workbook.yaml` | Phase 1 spec only — no live sheet |
| Control room documents spec | `c:\Dev\happyfacesla-commercial-control-room\config\documents.yaml` | Phase 1 spec only — no live documents |
| Seed data: current_live_facts.yaml | `config/seed_data/current_live_facts.yaml` | ALL DRAFT — CEO_INPUT_REQUIRED |
| Seed data: draft_pricing_recommendations.yaml | `config/seed_data/draft_pricing_recommendations.yaml` | ALL DRAFT — CEO_INPUT_REQUIRED |
| Seed data: source_evidence.yaml | `config/seed_data/source_evidence.yaml` | ALL PLACEHOLDER — no real evidence loaded |
| GSC URL Inspection API | `artifacts/seo_baseline/raw/gsc/url_inspection/*.json` | Fetched 2026-05-28 |
| Runtime HTML | `artifacts/seo_baseline/raw/runtime_html_evidence.md` | 12 pages, fetched 2026-05-28 |

---

## Governance Framework State

The commercial control room (`c:\Dev\happyfacesla-commercial-control-room\`) is a **Phase 1 specification only**. No live Google Sheet has been created. No CEO approvals have been recorded. All seed data rows carry `status: DRAFT` with `blockers: [CEO_INPUT_REQUIRED, DATA_MISSING]`.

**Implication for reconciliation:** No commercial claim on the live website has a formal authorization trail in the governance framework. The matrix below records this structural gap uniformly across all commercial pages.

---

## Reconciliation Matrix

| # | URL Path | Source `noindex` | Commercial Claims in Source HTML | Governance Authorization State | GSC Indexing State | Gap / Conflict Classification |
|---|---|---|---|---|---|---|
| 1 | `/` | `false` (indexable) | Services listed (face painting, balloons, glitter, face gems), 6× Offer/Service pairs, phone (310) 800-2860, CTAs to /contact/ and /booking-policy/ | No CEO-approved service descriptions on record (governance workbook 04: DRAFT SHELL) | PASS — indexed | **GAP-COM-001:** Live indexed page contains service descriptions with no formal governance authorization trail |
| 2 | `/services/` | `false` (indexable) | Full service hub — face painting, balloon twisting, glitter tattoos, face gems; geographic claim "Los Angeles, Orange County, and Ventura County"; 6× Offer/Service JSON-LD pairs; BreadcrumbList | No CEO-approved service descriptions on record | NEUTRAL — URL unknown to Google | **GAP-COM-002:** Page is indexable per source (no noindex) but URL is unknown to Google; service and geographic claims unpublished to search index |
| 3 | `/pricing/` | `false` (indexable) | Explicit starting price "Bookings start at $150"; FAQ: "Bookings start at $150"; Service JSON-LD present; geographic coverage implied | RULE-PRICE-001 through RULE-PRICE-004 all DRAFT, CEO_INPUT_REQUIRED; no approved public pricing | PASS — indexed | **GAP-COM-003 (HIGH):** Live indexed page publishes a specific price point ("$150") with no formal CEO approval in governance framework; governance workbook `05_PUBLIC_PRICING_PACKAGES` is DRAFT SHELL |
| 4 | `/corporate-event-face-painting-los-angeles/` | `true` (noindex in source, `noindex={true}` in BaseLayout prop) | Corporate event service claims; 6× Offer/Service JSON-LD; BreadcrumbList; description: "company picnics, grand openings, and family-friendly corporate activations" | No CEO-approved corporate event service descriptions; governance workbook 08_VENDOR_SCHOOL_CORPORATE_RULES: DRAFT SHELL | **ANOMALY:** PASS — Google reports INDEXING_ALLOWED despite noindex in HTML (see ISS-002) | **GAP-COM-004 + ANOMALY-001:** Source intentionally suppresses page (noindex={true}); commercial claims are not authorized for publication per governance; yet Google reports the URL as indexed — content effectively published contrary to source intent |
| 5 | `/kids-birthday-party-entertainment-los-angeles/` | `true` (noindex in source) | Kids birthday party service claims; 6× Offer/Service JSON-LD; BreadcrumbList; description: "face painting, balloon twisting, glitter tattoos, and face gems for kids birthday parties" | No CEO-approved service descriptions for this event type | NEUTRAL — URL unknown to Google | **GAP-COM-005:** Source intentionally suppresses page (noindex={true}); GSC consistent with noindex intent |
| 6 | `/school-festival-face-painting-los-angeles/` | `true` (noindex in source) | School/festival service claims; 6× Offer/Service JSON-LD; BreadcrumbList; description: "carnivals, fundraisers, camps, and festivals with flexible artist staffing" | No CEO-approved service descriptions for schools/festivals; governance workbook 08: DRAFT SHELL | NEUTRAL — URL unknown to Google | **GAP-COM-006:** Source intentionally suppresses page (noindex={true}); GSC consistent with noindex intent |
| 7 | `/service-areas/` | `true` (noindex in source) | Hub listing all service area cities | No CEO-approved geographic coverage claims | NEUTRAL — URL unknown to Google | **GAP-COM-007:** Source intentionally suppresses geographic hub; GSC consistent with noindex intent |
| 8 | `/service-areas/los-angeles/` | `true` (noindex in source) | Location-specific service claims for Los Angeles; 6× Offer/Service JSON-LD; BreadcrumbList | No CEO-approved location-specific claims | NEUTRAL — URL unknown to Google | **GAP-COM-008:** Source intentionally suppresses location page; GSC consistent with noindex intent |
| 9 | `/service-areas/burbank/` | `true` (noindex in source) | Location-specific claims for Burbank | No CEO-approved location-specific claims | NEUTRAL — URL unknown to Google | **GAP-COM-009:** Source intentionally suppresses; GSC consistent |
| 10 | `/share-your-experience/` | `true` (noindex in source) | Review/feedback collection form; PII intake (name, event details) | No governance framework coverage (not a commercial claim page) | NEUTRAL — URL unknown to Google | **GAP-COM-010:** Source intentionally suppresses; data collection page not indexed — consistent with privacy intent |

---

## Source `noindex` Audit — Complete Page List

Pages with `noindex={true}` in source (as of 2026-05-28):

| Source File | URL | GSC State | noindex Honored |
|---|---|---|---|
| `corporate-event-face-painting-los-angeles.astro` | `/corporate-event-face-painting-los-angeles/` | **PASS** (Google shows INDEXING_ALLOWED) | **NO** — anomaly, see ISS-002 |
| `kids-birthday-party-entertainment-los-angeles.astro` | `/kids-birthday-party-entertainment-los-angeles/` | NEUTRAL | YES |
| `school-festival-face-painting-los-angeles.astro` | `/school-festival-face-painting-los-angeles/` | NEUTRAL | YES |
| `share-your-experience.astro` | `/share-your-experience/` | NEUTRAL | YES |
| `service-areas/index.astro` | `/service-areas/` | NEUTRAL | YES |
| `service-areas/los-angeles.astro` | `/service-areas/los-angeles/` | NEUTRAL | YES |
| `service-areas/burbank.astro` | `/service-areas/burbank/` | NEUTRAL | YES |
| `service-areas/glendale.astro` | `/service-areas/glendale/` | Not inspected | Assumed YES |
| `service-areas/pasadena.astro` | `/service-areas/pasadena/` | Not inspected | Assumed YES |
| `service-areas/encino.astro` | `/service-areas/encino/` | Not inspected | Assumed YES |
| `service-areas/sherman-oaks.astro` | `/service-areas/sherman-oaks/` | Not inspected | Assumed YES |
| `service-areas/studio-city.astro` | `/service-areas/studio-city/` | Not inspected | Assumed YES |

Pages **without** noindex (indexable by design):

| Source File | URL | GSC State |
|---|---|---|
| `index.astro` | `/` | PASS ✅ |
| `face-painting-los-angeles.astro` | `/face-painting-los-angeles/` | PASS ✅ |
| `balloon-twisting-los-angeles.astro` | `/balloon-twisting-los-angeles/` | PASS ✅ |
| `glitter-tattoos-los-angeles.astro` | `/glitter-tattoos-los-angeles/` | PASS ✅ |
| `face-gems-face-jewelry-los-angeles.astro` | `/face-gems-face-jewelry-los-angeles/` | PASS ✅ |
| `gallery.astro` | `/gallery/` | PASS ✅ |
| `pricing.astro` | `/pricing/` | PASS ✅ |
| `contact.astro` | `/contact/` | PASS ✅ |
| `faq.astro` | `/faq/` | PASS ✅ |
| `booking-policy.astro` | `/booking-policy/` | PASS ✅ |
| `privacy-policy.astro` | `/privacy-policy/` | PASS ✅ |
| `services.astro` | `/services/` | **NEUTRAL** ⚠️ (indexable but unknown to Google) |

---

## Gap Summary by Category

| Category | Count | Description |
|---|---|---|
| GAP-COM (governance authorization) | 10 | All commercial pages lack a formal CEO-approval trail — governance workbook is Phase 1 DRAFT SHELL with no approved data |
| ANOMALY (noindex not honored) | 1 | `/corporate-event-face-painting-los-angeles/` — noindex in source, but Google reports INDEXING_ALLOWED (ISS-002) |
| INDEXABLE BUT UNKNOWN | 1 | `/services/` — no noindex in source, but Google cannot find the URL |

---

## Critical Finding: Pricing Disclosure Without Governance Authorization

`/pricing/` (PASS, indexed) publishes `"Bookings start at $150"` in both page copy and FAQ JSON-LD. The governance framework (RULE-PRICE-001 through RULE-PRICE-004) is in DRAFT status with no approved pricing value. This is the only live-indexed page that contains a specific price point.

**This finding is OBSERVATION ONLY. No website change has been made. No action has been taken.**

---

## Pricing-Control Source Conflict Reconciliation (Item 6)

| Item | Required Evidence |
|---|---|
| **Live `/pricing/` price claim** | Exact public text: `"Bookings start at $150"`. Source line: `src/pages/pricing.astro` page hero copy + `faqJsonLd` answer text. Runtime confirmation: present in initial HTML of `https://happyfacesla.com/pricing/` (fetched 2026-05-28, status 200, robots `index,follow`). GSC URL Inspection: PASS / indexed. |
| **Latest authoritative pricing-rule workbook/version** | Filename: `c:\Dev\happyfacesla-commercial-control-room\candidates\phase1c\hfla_commercial_draft_v4\candidate.yaml`. Version: `DRAFT v4`. Research access date: `2026-05-24`. Status: `DRAFT_ONLY` (header line 3). Replaces: rejected v3 commit `c94970df19c2fc60606f5c96f79921ea1263f4eb`. SHA-256 of candidate file: `8b017698faa357e8078e814b230ee52df5e83b92933702dedbbfba0d818e6641` (per `receipts/validation_result.txt`). Approval totals: 0 CEO approvals; 12 OPEN blockers (`HFLA-BLK-001` through `HFLA-BLK-012`), all `OPEN_CEO_INPUT_REQUIRED`. |
| **Rule authorizing or rejecting `$150` language** | Rule ID: `HFLA-RULE-PP-001` ("Starting-price anchor language for public channels"). Rule status: `DRAFT`. Channel visibility: `INTERNAL_ONLY`. Draft recommendation text (verbatim): `"Public wording should use a starting-price anchor, not a price floor. Approved draft wording target: Face Painting Parties from $150. Avoid terms such as price floor, minimum floor, or public floor."` Decision pending in blocker: `HFLA-BLK-001` ("Approve public starting-price anchor language Face Painting Parties from $150 and prohibit floor terminology"). Blocker status: `OPEN_CEO_INPUT_REQUIRED`, priority `HIGH`. |
| **Conflict result** | **CONFLICT / CANNOT DETERMINE.** Latest authoritative workbook (DRAFT v4) contains a *draft target* for $150 anchor language, but (a) the rule is in DRAFT status, not approved, (b) blocker HFLA-BLK-001 explicitly remains `OPEN_CEO_INPUT_REQUIRED`, (c) channel visibility is `INTERNAL_ONLY` not `PUBLIC`, and (d) the draft target wording is "Face Painting Parties from $150" — different from the live wording "Bookings start at $150" (anchor noun differs; live wording does not specify the service). The $150 numeric figure is consistent with the draft target, but no CEO-approved rule authorizes its current public publication on `/pricing/`. |
| **SEO action state** | **BLOCKED until decision.** No SEO action (indexing request, removal, sitemap modification, GBP update, source-copy change) is authorized until HFLA-BLK-001 is closed with a CEO decision and an approved-rule snapshot is exported. |

**Note on prior characterization:** The live `$150` claim is NOT classified as "unapproved" or "approved" — it is `UNDETERMINED_PENDING_CEO_DECISION`. The draft v4 candidate establishes draft target wording but does not constitute approval. The live page's specific wording differs from the draft target wording, which is an additional unresolved variance independent of the dollar figure itself.

---

## Corporate-Event Reclassification (Item 5)

The corporate-event finding (GAP-COM-004 + previously ANOMALY-001) is reclassified as `STALE_OR_CONFLICTING_INDEX_STATE`:

> The currently served `/corporate-event-face-painting-los-angeles/` page contains `noindex,nofollow` in initial HTML (confirmed via direct fetch 2026-05-28). Google's URL Inspection API for the indexed version reports the URL as `PASS` / `INDEXING_ALLOWED` / `Submitted and indexed`, with last crawl 2026-05-19 and referring URL `https://happyfacesla.com/sitemap-0.xml`. This is a stale or conflicting index state, not a confirmed Google defect. Business intent and approved public claims must be resolved before any action intended to retain or remove indexability. **No Search Console action is authorized.**

---

## Limitations of This Matrix

```text
GOVERNANCE_WORKBOOK_LIVE_DATA: NOT AVAILABLE — Phase 1 spec only, no live Google Sheet
CEO_APPROVAL_RECORDS: NOT AVAILABLE — No approvals recorded in Phase 1 (12 OPEN blockers in latest v4 candidate)
PRIOR_WEBSITE_CONTENT_VERSIONS: NOT AVAILABLE — no historical diff performed
LEGAL_REVIEW_STATUS: NOT AVAILABLE
```
