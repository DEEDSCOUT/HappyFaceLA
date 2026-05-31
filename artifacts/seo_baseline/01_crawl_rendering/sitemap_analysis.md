# SITEMAP ANALYSIS
## Audit Date: 2026-05-28

---

## Sitemap Index

**Submitted URL:** `https://happyfacesla.com/sitemap-index.xml`

**GSC API Response:**

```json
{
  "path": "https://happyfacesla.com/sitemap-index.xml",
  "last_submitted": "2026-05-22 14:18",
  "last_downloaded": "2026-05-28 16:29",
  "type": "Index",
  "is_pending": false,
  "url_count": "12",
  "errors": 0,
  "warnings": 0
}
```

**Status:** Valid. No errors, no warnings. 12 URLs reported.

---

## Sitemap Child URLs

**Source:** `docs/seo/evidence/production/2026-05-22/sitemap-0.xml`
**Capture Date:** 2026-05-22 (build artifact from that deployment)

The sitemap-index.xml points to a single child sitemap: `sitemap-0.xml`

URLs listed in sitemap-0.xml (12 total):

| # | URL | Indexed (GSC) |
|---|---|---|
| 1 | `https://happyfacesla.com/` | ✅ Indexed |
| 2 | `https://happyfacesla.com/balloon-twisting-los-angeles/` | ✅ Indexed |
| 3 | `https://happyfacesla.com/booking-policy/` | ✅ Indexed |
| 4 | `https://happyfacesla.com/contact/` | ✅ Indexed |
| 5 | `https://happyfacesla.com/face-gems-face-jewelry-los-angeles/` | ✅ Indexed |
| 6 | `https://happyfacesla.com/face-painting-los-angeles/` | ✅ Indexed |
| 7 | `https://happyfacesla.com/faq/` | ✅ Indexed |
| 8 | `https://happyfacesla.com/gallery/` | ✅ Indexed |
| 9 | `https://happyfacesla.com/glitter-tattoos-los-angeles/` | ✅ Indexed |
| 10 | `https://happyfacesla.com/pricing/` | ✅ Indexed |
| 11 | `https://happyfacesla.com/privacy-policy/` | ✅ Indexed |
| 12 | `https://happyfacesla.com/services/` | ⚠️ Discovered, not indexed |

**Sitemap coverage:** 11/12 URLs confirmed indexed. 1 in sitemap but not yet indexed (`/services/`).

---

## Sitemap Exclusion Filter

**Config source:** `astro.config.mjs`

The Astro sitemap integration applies an exclusion filter to omit the following paths:

```javascript
const excludedPaths = [
  '/share-your-experience/',
  '/kids-birthday-party-entertainment-los-angeles/',
  '/corporate-event-face-painting-los-angeles/',
  '/school-festival-face-painting-los-angeles/',
  '/service-areas/'
];
```

The filter excludes any URL containing these strings (using `page.includes(path)`). This means:
- `/service-areas/` and all sub-paths (e.g., `/service-areas/burbank/`) are excluded
- All 5 event-type noindex pages are excluded

**Verification:** Confirmed — none of these paths appear in `sitemap-0.xml` captured 2026-05-22.

---

## Sitemap Format Assessment

The sitemap uses only `<loc>` elements — no `<lastmod>`, `<priority>`, or `<changefreq>`.

```xml
<url><loc>https://happyfacesla.com/</loc></url>
```

**Assessment:** Google ignores `priority` and `changefreq` entirely. `lastmod` has limited effect but can help prioritize recrawl of recently updated pages. The current format is minimal but functional.

---

## Anomaly: `/corporate-event-face-painting-los-angeles/` Indexed via Old Sitemap

**Finding:** GSC URL inspection for `/corporate-event-face-painting-los-angeles/` lists `referring_urls: ["https://happyfacesla.com/sitemap-0.xml"]`, but this URL is NOT present in the current `sitemap-0.xml` (captured 2026-05-22).

**Explanation:** Google crawled this URL on **2026-05-19**, three days before the 2026-05-22 sitemap snapshot. The exclusion filter was likely added to `astro.config.mjs` between the 2026-05-19 crawl and the 2026-05-22 build. Google's index entry for this page predates the filter being effective. The page remains indexed until Google re-crawls and processes the `noindex,nofollow` meta directive.

---

## Summary

| Check | Status | Notes |
|---|---|---|
| Sitemap submission | ✅ Valid | 0 errors, 0 warnings |
| Sitemap index type | ✅ Index | Points to sitemap-0.xml |
| URL count in sitemap | 12 | All 12 intended indexable routes |
| Indexed from sitemap | 11/12 | `/services/` discovered not yet indexed |
| Exclusion filter working | ✅ Confirmed | All 5 excluded paths absent from sitemap-0.xml |
| Sitemap format | ℹ️ Minimal | `<loc>` only; no lastmod/priority |
| Anomaly | ⚠️ P0 | Corporate-event indexed via pre-filter sitemap |
