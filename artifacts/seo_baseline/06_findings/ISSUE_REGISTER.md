# ISSUE REGISTER
## Happy Faces LA — Technical SEO Baseline
## Audit Date: 2026-05-28
## All findings are read-only observations. No source code was modified.

---

## Priority Scale

- **P0 — Critical:** Indexation breach, canonical conflict, or active compliance violation requiring immediate attention
- **P1 — High:** Directly limiting organic traffic or click-through potential
- **P2 — Medium:** Structural gaps that will compound as the site ages without intervention
- **P3 — Low / Informational:** Polish items or long-horizon improvements

---

## P0 — CRITICAL

### ISS-001: noindex Page Indexed — `/corporate-event-face-painting-los-angeles/`

**Severity:** P0
**Status:** Open
**Evidence:** GSC URL Inspection, 2026-05-28
**Finding:**
`/corporate-event-face-painting-los-angeles/` is declared `noindex={true}` in its Astro source
file, rendering `<meta name="robots" content="noindex,nofollow">` in production. It is excluded
from the sitemap via the Astro sitemap filter. Despite this, GSC URL Inspection returns:
- Verdict: PASS
- Coverage: "Submitted and indexed"
- Last crawled: 2026-05-19
- Referring URL: `https://happyfacesla.com/sitemap-0.xml`

The page is receiving 12 GSC impressions at avg position 3.7 and is the 9th-most-seen page by
impression count. Google has it indexed and is serving it in SERPs.

**Root cause:** The page was included in a previous sitemap build before the exclusion filter was
applied. Google crawled it on May 19 via that old sitemap and indexed it. Google has not yet
re-crawled the page since the noindex directive became active.

**Business risk:** The noindex-but-indexed state creates inconsistent intent signaling to Google.
Google will de-index the page on its next crawl once it processes the `noindex,nofollow` directive.
Until then, users searching for corporate event face painting may land on a page whose content
was designed as a thin/support page not intended for organic ranking.

**Resolution — DECISION REQUIRED:**
This URL (`/corporate-event-face-painting-los-angeles/`) must remain under review pending
reconciliation with the commercial-control workbook. No GSC action (including URL inspection
request, URL removal, or "Request Indexing") is to be taken without explicit written
authorization from the site owner.

The page will self-resolve: on Google's next crawl, Googlebot will read the `noindex,nofollow`
meta directive and remove the page from the index.
Monitor through URL Inspection and Page Indexing evidence. No recrawl or indexing
timeline is guaranteed, and no Search Console mutation is authorized during baseline review.

**No indexing request, URL removal, or GSC mutation is authorized at this time.**

---

## P1 — HIGH

### ISS-002: Zero Organic Click Traffic — No Commercial Keywords in Top 20

**Severity:** P1
**Status:** Open
**Evidence:** GSC search analytics, 365-day window ending 2026-05-28
**Finding:**
The site has 1 total organic click in its lifetime of GSC data (12 days). The primary commercial
keyword "face painting los angeles" is ranking at position 49 (page 5). "balloon twisters los
angeles" ranks at position 42.6. No service keyword appears in the top 20 positions.

The only query approaching click range is "balloon twisters near me" at position 12, but with
only 1 impression this is statistically irrelevant.

**Business risk:** The site is not yet generating any organic leads from search. All inquiries
must be coming via direct traffic, social media, or paid channels.

**Context:** The site is very new (GSC data starts May 17, 2026; only 12 days of signal). Early
low rankings are expected. This finding establishes the baseline — not a failure state.

**Resolution:** No immediate action required. This is the baseline measurement. Monitor monthly.
Contributing factors to address: ISS-003 (services/ not indexed), ISS-005 (zero external links),
ISS-006 (thin title on FAQ page).

---

### ISS-003: `/services/` Page Discovered but Not Indexed

**Severity:** P1
**Status:** Open
**Evidence:** GSC URL Inspection — verdict NEUTRAL, coverage "URL is unknown to Google" (CORRECTED — fresh inspection 2026-05-28)
**Finding:**
`/services/` is in the sitemap, has correct canonical, no noindex directive, and no robots.txt
restriction. Fresh GSC URL Inspection (2026-05-28 re-run) returns `coverage_state: "URL is
unknown to Google"` — this supersedes the earlier record of "Discovered — currently not
indexed". The page has never been crawled and has no referring URLs in GSC.

The `/services/` page is likely a high-intent conversion support page. Not having it indexed
means it cannot contribute to organic rankings or provide a rich result surface.

**Probable cause:** No external or strong internal links point to the page. Despite being in
the sitemap, Google has not yet allocated crawl budget to fetch it.

**Resolution — EVIDENCE REQUIRED:**
This URL must remain under review pending reconciliation with the commercial-control workbook.
The following evidence steps must be completed before any GSC action:

1. Review `services.astro` source — confirm the page's public claims are approved and its
   content is not thin or duplicate relative to the individual service pages.
2. Confirm the intended indexation status against the commercial-control workbook.
3. If approved for indexing: add at least 1 internal contextual link from an indexed page,
   then separately request authorization before any GSC indexing action.

**No indexing request or GSC mutation is authorized at this time.**

---

## P2 — MEDIUM

### ISS-004: Homepage Missing FAQ Schema

**Severity:** P2
**Status:** Open
**Evidence:** GSC URL Inspection rich_results: null; SeoHead.astro review
**Finding:**
The homepage renders a `FAQAccordion` component with `commonFaqs` data, but does not pass
`faqJsonLd(commonFaqs)` to the layout's `jsonLd` prop. As a result, the FAQ answers are
visible on the page but Google does not detect any FAQ schema, and no FAQ rich result is
eligible for the homepage in SERPs.

All four service pages successfully use FAQ schema and have GSC-confirmed rich results.
The homepage FAQ is a missed rich result opportunity for the highest-impression page.

**Resolution:**
In `src/pages/index.astro`, add `faqJsonLd(commonFaqs)` to the `jsonLd` array:

```astro
import { organizationJsonLd, localBusinessJsonLd, websiteJsonLd, faqJsonLd } from "../utils/schema";
import { commonFaqs } from "../data/faqs";
...
jsonLd={[organizationJsonLd(), localBusinessJsonLd(), websiteJsonLd(), faqJsonLd(commonFaqs)]}
```

---

### ISS-005: Zero External Backlinks from Legitimate Domains

**Severity:** P2
**Status:** Open
**Evidence:** GSC URL Inspection referring_urls across all indexed pages
**Finding:**
All indexed pages show zero external referring URLs from legitimate domains. The only external
referrer detected is `best-backlink-provider.com.in` (spam, disavowed). The site's link equity
is entirely internal.

A site with no external links has minimal domain authority signals and will struggle to rank
for competitive local terms regardless of on-page optimization.

**Resolution:** Link building is out of scope for this audit. See `backlinks.md` for a
prioritized category list of link targets (local citations, event directories, GBP, etc.).

---

### ISS-006: FAQ Page Title Too Short and Generic

**Severity:** P2
**Status:** Open
**Evidence:** `src/pages/faq.astro` — title: "FAQ | Happy Faces LA"
**Finding:**
"FAQ | Happy Faces LA" is a 19-character title with minimal keyword signal. Users searching
for specific FAQ-type queries ("face painting cost los angeles", "is face paint safe for kids")
would not receive a strong topical match signal from this title.

**Resolution:**
Update the title to a keyword-qualified version, e.g.:
"Face Painting & Party Entertainment FAQ | Happy Faces LA"
or
"FAQ: Face Painting, Balloons & Glitter Tattoos in LA | Happy Faces LA"

---

### ISS-007: `/gallery/` and `/contact/` Have No Schema

**Severity:** P2
**Status:** Open
**Evidence:** `src/pages/gallery.astro`, `src/pages/contact.astro` — no jsonLd prop passed
**Finding:**
`/gallery/` has no schema of any type. A `LocalBusiness` schema reinforcement and optionally
an `ImageGallery` or `CollectionPage` schema would strengthen entity association.

`/contact/` has no schema. A `ContactPoint` on LocalBusiness or a standalone LocalBusiness
schema would reinforce NAP signals on this page, which is a conversion destination.

Both pages rank in the top 10 positions for some queries (gallery ~6, contact ~10.3) despite
having no structured data.

**Resolution:**
Add LocalBusiness schema to both pages. Add Breadcrumb schema to both pages.
Consider `ContactPage` schema type for `/contact/`.

---

### ISS-008: `LocalBusiness` Schema Missing Key Fields

**Severity:** P2
**Status:** Open
**Evidence:** `src/utils/schema.ts` — `localBusinessJsonLd()` function
**Finding:**
The `localBusinessJsonLd()` function emits `LocalBusiness` schema without:
- `address` (empty in business.ts — service-area business, so an omission is defensible, but
  GBP and citation signals are stronger with a consistent service area definition)
- `geo` (no coordinates — cannot confirm precise service area to Google)
- `priceRange` (missing — "$$$" or "$$" is a useful local signal)
- `openingHoursSpecification` (missing)
- `image` (missing — no primary business photo URL in schema)
- `@id` URI (missing — no unique URI identifier for the entity, reducing Knowledge Graph association)

Note: `legalName: "TBD_BY_OWNER"` in business.ts is a placeholder and should be resolved by
the business owner. It is not emitted in schema currently.

**Resolution:** Coordinate with business owner to confirm:
1. Legal business name
2. Operating hours
3. Whether a service-area-business address configuration is correct
4. Then update schema.ts `localBusinessJsonLd()` with confirmed values

---

### ISS-009: Meta Descriptions Over Target Length on 3 Service Pages

**Severity:** P2
**Status:** Open
**Evidence:** `src/pages/balloon-twisting-los-angeles.astro`, `glitter-tattoos-los-angeles.astro`
**Finding:**
Three service pages have meta descriptions over 165 characters:
- `balloon-twisting-los-angeles/` — ~182 chars
- `glitter-tattoos-los-angeles/` — ~188 chars
- `face-painting-los-angeles/` — ~171 chars

Google may rewrite descriptions it considers too long. The current descriptions include
good keyword signals but may be truncated in mobile SERPs (~120 chars).

**Resolution:** Trim to 155-165 characters. Keep the most distinctive differentiator early
in the description.

---

### ISS-010: Title Over Target Length on Homepage and Pricing Page

**Severity:** P2
**Status:** Open
**Evidence:** `src/pages/index.astro`, `src/pages/pricing.astro`
**Finding:**
- Homepage title: ~83 chars — "Face Painting, Balloon Twisting & Glitter Tattoos in Los Angeles | Happy Faces LA"
- Pricing page title: ~79 chars — "Pricing for Face Painting & Party Entertainment in Los Angeles | Happy Faces LA"

Both exceed the ~60-char Google truncation threshold.

**Resolution:** Shorten. Example for homepage:
"Face Painting & Balloon Twisting in Los Angeles | Happy Faces LA" (~65 chars — borderline)
or
"Happy Faces LA — Face Painting & Party Entertainment LA" (~54 chars)

---

## P3 — LOW / INFORMATIONAL

### ISS-011: Disavow File Created but Submission Status Unverified

**Severity:** P3
**Status:** Open
**Evidence:** `docs/seo/disavow.txt` created 2026-05-27
**Finding:**
A disavow file for `domain:best-backlink-provider.com.in` was created locally, but there is no
confirmation it was submitted to GSC. The GSC Disavow Tool is accessed at:
`https://search.google.com/search-console/disavow-links?resource_id=sc-domain:happyfacesla.com`

**Resolution:** Verify the disavow file has been uploaded via the GSC Disavow Tool UI.

---

### ISS-012: `/services/` Page May Have Thin/Duplicate Content

**Severity:** P3 (depends on content)
**Status:** Open (pending content review — file not read in this pass)
**Finding:**
`/services/` is in the sitemap but not indexed. The page's content quality is unknown in this
pass. If it simply lists the same services available at individual service pages
(`/face-painting-los-angeles/`, etc.), Google may determine it is thin or duplicate and
decline to index it regardless of submission.

**Resolution:** Read `src/pages/services.astro` and assess whether it has unique value or
is a redundant aggregator. If redundant, either enrich the content or add noindex.

---

### ISS-013: No `lastmod` Dates in Sitemap

**Severity:** P3
**Status:** Informational
**Finding:**
Sitemap entries contain only `<loc>` — no `<lastmod>`. Google largely ignores `<priority>` and
`<changefreq>`, but `<lastmod>` can help prioritize recrawl when content is genuinely updated.

**Resolution:** Configure Astro sitemap plugin with `lastmod: true` (available in @astrojs/sitemap
v3+) to auto-populate lastmod from build time. Low priority.

---

### ISS-014: GBP API Quota Blocked — NAP Consistency Unverified

**Severity:** P3
**Status:** Blocked (quota increase required)
**Finding:**
GBP listing data was not retrievable in this audit pass. NAP (Name-Address-Phone) consistency
between website, GBP, and citation sources has not been verified.

**Resolution — ACCESS DEPENDENCY:**
GBP read-only audit cannot be completed until authorized GBP API access or approved
authenticated UI evidence is available. Do not submit quota increase requests without
separate authorization from the account owner. See `03_local_entity_semantics/gbp_status.md`
for build status and quota blocker details.

---

### ISS-015: `/reviews/` Path Active 302 Redirect

**Severity:** P3
**Status:** Informational
**Finding:**
`/reviews/ → /gallery/ (302)` is the only path-level redirect in `_redirects`. The 302
(temporary) is intentional (page will eventually exist). If `/reviews/` remains permanently
absent for more than 12 months, consider upgrading to 301 or removing the redirect.

**Resolution:** Monitor. If reviews page is launched, point `/reviews/` to it directly.

---

## Issue Count Summary

| Priority | Count | Open |
|---|---|---|
| P0 Critical | 1 | 1 |
| P1 High | 2 | 2 |
| P2 Medium | 7 | 7 |
| P3 Low | 5 | 5 |
| **Total** | **15** | **15** |
