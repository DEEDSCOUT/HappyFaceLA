# SEO BASELINE AUDIT — MANIFEST
## Happy Faces LA | happyfacesla.com

**Audit Type:** Technical SEO Baseline — Read-Only Evidence Collection
**Audit Date:** 2026-05-28
**Prepared By:** GitHub Copilot (agent-assisted via VS Code MCP + source read)
**Constraint:** No website source, configuration, deployment, or hosting was modified.

---

## Data Sources & Access

| Surface | Tool / Method | Access Level | Status |
|---|---|---|---|
| Website source code | Direct filesystem read (`c:\HappyFaceLA\src\`) | Full | ✅ |
| Deployment config | `astro.config.mjs`, `wrangler.toml`, `package.json` | Full | ✅ |
| Google Search Console | `mcp_happyfacesla-4_*` MCP tools, property `sc-domain:happyfacesla.com` | siteOwner | ✅ |
| Sitemap XML | GSC API + saved artifact (`docs/seo/evidence/production/2026-05-22/sitemap-0.xml`) | Full | ✅ |
| Google Business Profile | `tools/gbp_mcp/` MCP server (built) | Partial — quota blocked | ⚠️ |
| Google Analytics 4 | GA4 MCP (`analytics-mcp 0.6.0`) | Available | Not queried this pass |
| Lighthouse CLI 13.3.0 (automated batch) | `raw/lighthouse/_run_all.ps1` — 72 runs (12 URL × desktop + mobile × 3) | CLI headless Chrome | ✅ Complete — 72/72 JSON files in `raw/lighthouse/`; hashes in `raw/lighthouse/_hashes.txt` |
| PageSpeed Insights API | Public API (no key) | Unauthenticated | ❌ 429 rate limit |
| CrUX | Not queried (no API key) | — | ❌ |
| Google Ads | `mcp_happyfacesla-_*` MCP tools | Available | Not in scope for this pass |

---

## Site Profile

| Field | Value |
|---|---|
| Domain | happyfacesla.com |
| Business | Happy Faces LA |
| Services | Face Painting, Balloon Twisting, Glitter Tattoos, Face Gems |
| Service Area | Los Angeles County + Orange County + Ventura County |
| Phone | 818-619-5506 |
| Framework | Astro v6.3.3 (SSG — Static Site Generation) |
| Hosting | Cloudflare Pages |
| CDN | Cloudflare |
| CMS | None (all routes are `.astro` files) |
| Build trigger | `astro build` → deployed via `wrangler` |
| GA4 Measurement ID | G-7NH6RY78TK |
| GSC Property | `sc-domain:happyfacesla.com` (siteOwner) |
| Clarity Project ID | wsw4v74jpw |

---

## Artifact Index

```
00_manifest/
  AUDIT_MANIFEST.md               ← This file
01_crawl_rendering/
  url_inventory.md                ← All routes with noindex/sitemap/index status
  robots_and_redirects.md        ← robots.txt + _redirects analysis
  sitemap_analysis.md            ← Sitemap structure, URLs, submission status
02_gsc_diagnostics/
  url_inspections.md             ← GSC URL inspection results for all pages
  search_analytics.md            ← 365-day query + page + device + timeline data
03_local_entity_semantics/
  schema_inventory.md            ← Schema types per page, GSC rich result validation
  gbp_status.md                  ← GBP MCP build status + quota blocker
04_content_authority/
  page_meta_inventory.md         ← Title, description, canonical, noindex per page
  noindex_audit.md               ← All noindex pages + indexation state
  backlinks.md                   ← Known backlink signals + disavow status
05_performance/
  cwv_status.md                  ← CWV + PSI data availability status
06_findings/
  ISSUE_REGISTER.md              ← Prioritized issue register (P0-P3)
  CONSOLIDATED_BASELINE_REPORT.md ← Executive summary + full findings
```

---

## Scope Boundary

This audit covers:
- Crawlability, indexation, and sitemap coverage
- GSC search performance diagnostics
- Structured data / schema audit
- Meta-robots / noindex compliance
- Canonical configuration
- Backlink quality signals
- Local entity configuration gaps

**Out of scope for this pass (data not available):**
- Core Web Vitals / PageSpeed (API rate-limited; no key)
- CrUX historical performance
- Google Ads quality scores (not in SEO scope)
- GA4 traffic breakdown (separate surface; available on request)
- GBP listing content (API quota blocked; see `03_local_entity_semantics/gbp_status.md`)

---

## Formal Missing-Access Declarations

The following data sources were unavailable or unverified during this audit pass.
Each declaration represents a confirmed evidence gap in the baseline.

```
SERVER_LOG_ACCESS: NOT AVAILABLE
GOOGLEBOT_CRAWL_BASELINE: UNPROVEN
GSC_UI_MANUAL_ACTIONS: NOT AVAILABLE
GSC_SECURITY_ISSUES: NOT AVAILABLE
GSC_PAGE_INDEXING_REPORT: NOT AVAILABLE
GSC_HTTPS_REPORT: NOT AVAILABLE
GSC_CWV_REPORT: NOT AVAILABLE
GBP_READ_ACCESS: BLOCKED
CRUX_FIELD_DATA: NOT AVAILABLE OR INSUFFICIENT
SEARCH_APPEARANCE_DIMENSION: NOT AVAILABLE (API 400 when combined with other dimensions; standalone returns no data)
```
