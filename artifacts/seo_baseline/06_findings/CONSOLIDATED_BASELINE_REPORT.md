# CONSOLIDATED BASELINE REPORT
# Happy Faces LA — Technical SEO, Local Search & Organic Retrieval Baseline
# Audit Date: 2026-05-28

---

## Audit Scope

| Item | Value |
|---|---|
| Site | happyfacesla.com |
| GSC Property | sc-domain:happyfacesla.com (siteOwner) |
| GSC Data Window | 2025-05-28 to 2026-05-28 (365-day) — data starts 2026-05-17 |
| Audit Type | Read-only technical evidence collection |
| Source Code Base | Astro v6.3.3 SSG, Cloudflare Pages, Tailwind CSS v4 |
| GBP API Status | Blocked (quota=0) — not included in this pass |
| PSI/CWV Status | Lighthouse CLI 13.3.0 batch COMPLETE — 72/72 runs; PSI API not retrieved (rate limited) |
| Auditor | GitHub Copilot AI Agent (automated read-only audit) |

---

## Executive Summary

Happy Faces LA is a newly launched service-area business website (Los Angeles face painting,
balloon twisting, glitter tattoos, face gems) operating on an Astro SSG / Cloudflare Pages
stack. The site is technically sound but is in the very early stages of organic visibility.

**Key facts:**
- 12 days of GSC impression data (site first appeared in GSC 2026-05-17)
- 1 total organic click across 365 days
- 11 of 12 target (indexable) pages are indexed by Google
- 1 stale-or-conflicting index state: `/corporate-event-face-painting-los-angeles/` is declared
  noindex in source but Google reports the URL as indexed (likely from an earlier sitemap version);
  classification is `STALE_OR_CONFLICTING_INDEX_STATE`, not a confirmed Google defect
- 0 external backlinks from legitimate domains
- Rich results (FAQ + Breadcrumbs) working correctly on all 4 service pages, pricing, and FAQ
- Homepage FAQ schema is missing despite FAQ content being present on the page
- GBP data not accessible due to API quota limitation
- Pricing claim ($150) on `/pricing/` does not match the latest authoritative pricing-rule
  workbook (Phase 1C DRAFT v4): rule HFLA-RULE-PP-001 is `DRAFT`, blocker HFLA-BLK-001 is
  `OPEN_CEO_INPUT_REQUIRED`. Conflict result: `CANNOT DETERMINE / BLOCKED until decision`.

The site is well-structured for future growth. The primary barrier to organic traffic is
lack of link equity and brand authority signals — structural issues that are normal for a
new domain and resolve over time with content and link building.

---

## GSC Performance Summary — 365-Day

| Metric | Value |
|---|---|
| Total Clicks | 1 |
| Total Impressions | 97 |
| Average CTR | 1.03% |
| Average Position | 13.6 |
| Active Data Days | 12 (May 17-28, 2026) |
| Unique Queries | 8 |
| Primary Keyword Position | "face painting los angeles" — position 49 |
| Best Positioned Query | "balloon twisters near me" — position 12 |

---

## GSC Coverage Summary

| URL | Indexed | Last Crawled | Notes |
|---|---|---|---|
| `/` | YES | 2026-05-22 | ✅ |
| `/face-painting-los-angeles/` | YES | 2026-05-22 | ✅ |
| `/balloon-twisting-los-angeles/` | YES | 2026-05-22 | ✅ |
| `/glitter-tattoos-los-angeles/` | YES | 2026-05-22 | ✅ |
| `/face-gems-face-jewelry-los-angeles/` | YES | 2026-05-22 | ✅ |
| `/gallery/` | YES | 2026-05-22 | ✅ |
| `/pricing/` | YES | 2026-05-22 | ✅ |
| `/contact/` | YES | 2026-05-22 | ✅ |
| `/faq/` | YES | 2026-05-22 | ✅ |
| `/booking-policy/` | YES | 2026-05-21 | ✅ |
| `/privacy-policy/` | YES | 2026-05-21 | ✅ |
| `/services/` | NO | Not crawled | ⚠️ Unknown to Google (fresh inspection 2026-05-28) |
| `/corporate-event-face-painting-los-angeles/` | YES | 2026-05-19 | ❌ Should be noindex |
| `/kids-birthday-party-entertainment-los-angeles/` | NO | (not checked) | noindex — correct |
| `/school-festival-face-painting-los-angeles/` | NO | (not checked) | noindex — correct |
| `/share-your-experience/` | NO | (not checked) | noindex — correct |
| `/service-areas/` + sub-pages | NO | (not checked) | noindex — correct |

---

## Schema & Rich Results Summary

| Page | Schema Types | Rich Results | Status |
|---|---|---|---|
| `/` | Organization, LocalBusiness, WebSite | none | ⚠️ FAQ gap |
| `/face-painting-los-angeles/` | LB, Service, Breadcrumb, FAQ | Breadcrumbs + FAQ | ✅ |
| `/balloon-twisting-los-angeles/` | LB, Service, Breadcrumb, FAQ | Breadcrumbs + FAQ | ✅ |
| `/glitter-tattoos-los-angeles/` | LB, Service, Breadcrumb, FAQ | Breadcrumbs + FAQ | ✅ |
| `/face-gems-face-jewelry-los-angeles/` | LB, Service, Breadcrumb, FAQ | Breadcrumbs + FAQ | ✅ |
| `/pricing/` | Service, FAQ | FAQ | ✅ |
| `/faq/` | FAQ | FAQ | ✅ |
| `/gallery/` | none | none | ⚠️ No schema |
| `/contact/` | none | none | ⚠️ No schema |

---

## Crawl & Technical Health Summary

| Check | Status | Notes |
|---|---|---|
| robots.txt | ✅ Open | `User-agent: * Allow: /` |
| Sitemap | ✅ Valid | 12 URLs, submitted to GSC |
| Canonical tags | ✅ Present | All pages include canonical |
| HTTPS | ✅ Enforced | Cloudflare enforces HTTPS |
| www redirect | ✅ Active | CF dashboard — www → apex |
| Typo domain redirect | ✅ Active | happyfacela.com → happyfacesla.com (CF) |
| Internal linking | ✅ Adequate | All core pages linked from homepage nav |
| noindex nofollow rendering | ✅ Correct | Via SeoHead.astro `noindex` prop |
| `/services/` | ⚠️ Not indexed | In sitemap, not crawled |
| `/corporate-event/` | ❌ Indexed despite noindex | Will self-resolve on next crawl |

---

## Issue Register Summary

Full details in `06_findings/ISSUE_REGISTER.md`.

| ID | Priority | Title |
|---|---|---|
| ISS-001 | P0 Critical | Corporate-event page indexed despite noindex declaration |
| ISS-002 | P1 High | Zero organic click traffic / no commercial keywords in top 20 |
| ISS-003 | P1 High | `/services/` discovered but not indexed |
| ISS-004 | P2 Medium | Homepage missing FAQ schema |
| ISS-005 | P2 Medium | Zero external backlinks from legitimate domains |
| ISS-006 | P2 Medium | FAQ page title too short and generic |
| ISS-007 | P2 Medium | `/gallery/` and `/contact/` have no schema |
| ISS-008 | P2 Medium | LocalBusiness schema missing key fields |
| ISS-009 | P2 Medium | Meta descriptions over target length on 3 service pages |
| ISS-010 | P2 Medium | Title over target length on homepage and pricing page |
| ISS-011 | P3 Low | Disavow file created but submission status unverified |
| ISS-012 | P3 Low | `/services/` may have thin content |
| ISS-013 | P3 Low | No `lastmod` dates in sitemap |
| ISS-014 | P3 Low | GBP API quota blocked — NAP consistency unverified |
| ISS-015 | P3 Low | `/reviews/` 302 redirect — monitor for permanent resolution |

---

## Artifact Index

| Artifact | Path | Status |
|---|---|---|
| Audit Manifest | `00_manifest/AUDIT_MANIFEST.md` | ✅ |
| URL Inventory | `01_crawl_rendering/url_inventory.md` | ✅ |
| Robots & Redirects | `01_crawl_rendering/robots_and_redirects.md` | ✅ |
| Sitemap Analysis | `01_crawl_rendering/sitemap_analysis.md` | ✅ |
| URL Inspections | `02_gsc_diagnostics/url_inspections.md` | ✅ |
| Search Analytics | `02_gsc_diagnostics/search_analytics.md` | ✅ |
| Schema Inventory | `03_local_entity_semantics/schema_inventory.md` | ✅ |
| GBP Status | `03_local_entity_semantics/gbp_status.md` | ✅ (blocked) |
| Page Meta Inventory | `04_content_authority/page_meta_inventory.md` | ✅ |
| noindex Audit | `04_content_authority/noindex_audit.md` | ✅ |
| Backlinks | `04_content_authority/backlinks.md` | ✅ |
| CWV Status | `05_performance/cwv_status.md` | ✅ COMPLETE — 72/72 Lighthouse runs |
| Issue Register | `06_findings/ISSUE_REGISTER.md` | ✅ |
| Consolidated Report | `06_findings/CONSOLIDATED_BASELINE_REPORT.md` | ✅ |

---

## Pending Work (Not Blocking Audit Closure)

| Item | Blocker | Next Step |
|---|---|---|
| GBP listing data | GBP API quota=0 | Submit quota increase at GCP Console |
| PSI data | No API key | Obtain PSI API key for field/CrUX data |
| NAP consistency check | GBP API quota | Resolve GBP access first |
| `/services/` content review | Not done this pass | Read services.astro, assess content quality |

---

## Required Actions — Decision-Gated (Authorization Required Before Execution)

1. **ISS-001 — `/corporate-event-face-painting-los-angeles/` indexed despite noindex declaration** —
   URL remains under review pending reconciliation with commercial-control workbook.
   Monitor through URL Inspection and Page Indexing evidence. No recrawl or indexing
   timeline is guaranteed, and no Search Console mutation is authorized during baseline review.
   **No GSC action authorized at this time.**

2. **ISS-003 — `/services/` not crawled by Google** —
   Fresh GSC URL Inspection (2026-05-28) returns `"URL is unknown to Google"`.
   URL remains under review pending commercial-control workbook reconciliation and
   public-claim content review. **No GSC indexing action authorized at this time.**

3. **GBP API access** — GBP API quota is blocked at 0 RPM.
   Do not submit quota increase requests without separate authorization from the account owner.
   `GBP_READ_ACCESS: BLOCKED — ACCESS DEPENDENCY`

4. **ISS-004 — Add FAQ schema to homepage** — Source code change required.
   Not authorized in this read-only audit pass. Must be separately authorized.

5. **PSI API key** — Obtain key, run PageSpeed Insights to complete CWV baseline.
   Read-only data collection only; no site mutation required.
