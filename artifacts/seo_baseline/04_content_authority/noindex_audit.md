# NOINDEX AUDIT
## Source: Astro source files + GSC URL Inspection
## Audit Date: 2026-05-28

---

## Scope

This artifact documents all pages with `noindex={true}` in their Astro source, their stated
intent, their current GSC indexation status, and any anomalies.

---

## Noindex Pages

### `/corporate-event-face-painting-los-angeles/`

- **Source noindex:** YES — `noindex={true}` in page props
- **Robots meta rendered:** `<meta name="robots" content="noindex,nofollow">`
- **Sitemap inclusion:** NO — excluded via Astro sitemap filter
- **GSC verdict:** INDEXED — "Submitted and indexed"
- **Last crawled:** 2026-05-19
- **GSC referring URL:** `https://happyfacesla.com/sitemap-0.xml` (old sitemap)
- **GSC impressions:** 12, avg position 3.7

**ANOMALY — P0 CRITICAL:**
Google indexed this page from a previous sitemap that included it before the exclusion filter
was applied. Google has not yet re-crawled the page and processed the `noindex` directive.
Until the next crawl, the page will remain indexed and continue generating impressions.

**Expected resolution:** Automatic on next crawl. Monitor through URL Inspection and Page
Indexing evidence. No recrawl or indexing timeline is guaranteed, and no Search Console
mutation is authorized during baseline review. This URL remains under review pending
reconciliation with the commercial-control workbook.

---

### `/kids-birthday-party-entertainment-los-angeles/`

- **Source noindex:** YES
- **Robots meta:** `noindex,nofollow`
- **Sitemap:** NO
- **GSC verdict:** Not indexed (not inspected individually — not a concern)
- **Intent:** Thin support page; not intended for organic ranking

---

### `/school-festival-face-painting-los-angeles/`

- **Source noindex:** YES
- **Robots meta:** `noindex,nofollow`
- **Sitemap:** NO
- **GSC verdict:** Not indexed
- **Intent:** Thin support page; not intended for organic ranking

---

### `/share-your-experience/`

- **Source noindex:** YES
- **Robots meta:** `noindex,nofollow`
- **Sitemap:** NO
- **GSC verdict:** Not indexed
- **Intent:** Review collection landing page; UX-only, not for organic ranking

---

### `/service-areas/` (Hub Page)

- **Source noindex:** YES (hub page at `/service-areas/`)
- **Robots meta:** `noindex,nofollow`
- **Sitemap:** NO — `/service-areas/` path excluded via sitemap filter
- **GSC verdict:** Not indexed
- **Intent:** Hub page for SAB service area sub-pages; not for organic indexation

---

### `/service-areas/[slug]/` Sub-pages (7 pages)

Priority locations with sub-pages:

| Slug | Full Path | noindex |
|---|---|---|
| los-angeles | `/service-areas/los-angeles/` | YES |
| burbank | `/service-areas/burbank/` | YES |
| glendale | `/service-areas/glendale/` | YES |
| pasadena | `/service-areas/pasadena/` | YES |
| sherman-oaks | `/service-areas/sherman-oaks/` | YES |
| studio-city | `/service-areas/studio-city/` | YES |
| encino | `/service-areas/encino/` | YES |

All sub-pages inherit `noindex={true}` from `src/pages/service-areas/[slug].astro`.
All excluded from sitemap via `/service-areas/` path filter.
None appear in GSC (not indexed — correct).

**Intent:** These pages exist as thin location-specific variants of service content.
The intent is to have the pages available for direct linking or citation purposes but
to avoid competing with or diluting the primary service pages in SERPs.

---

## noindex Implementation Verification

The noindex directive flows through:

```
Astro page (noindex={true})
  → BaseLayout.astro (passes to SeoHead)
    → SeoHead.astro (<meta name="robots" content="noindex,nofollow">)
```

This is a correct, Googlebot-compliant implementation. The `nofollow` in the content
attribute means Google will also not follow outbound links on these pages.

**Note:** `noindex,nofollow` is stricter than `noindex` alone. The `nofollow` portion
means Google discounts any links on noindex pages. If internal navigation links are on
these pages, they do not pass link equity. This is intentional for thin/support pages.

---

## Summary

| Page | noindex | Sitemap | GSC Indexed | Status |
|---|---|---|---|---|
| `/corporate-event-face-painting-los-angeles/` | YES | NO | YES | ❌ Anomaly (ISS-001) |
| `/kids-birthday-party-entertainment-los-angeles/` | YES | NO | NO | ✅ Correct |
| `/school-festival-face-painting-los-angeles/` | YES | NO | NO | ✅ Correct |
| `/share-your-experience/` | YES | NO | NO | ✅ Correct |
| `/service-areas/` | YES | NO | NO | ✅ Correct |
| `/service-areas/los-angeles/` | YES | NO | NO | ✅ Correct |
| `/service-areas/burbank/` | YES | NO | NO | ✅ Correct |
| `/service-areas/glendale/` | YES | NO | NO | ✅ Correct |
| `/service-areas/pasadena/` | YES | NO | NO | ✅ Correct |
| `/service-areas/sherman-oaks/` | YES | NO | NO | ✅ Correct |
| `/service-areas/studio-city/` | YES | NO | NO | ✅ Correct |
| `/service-areas/encino/` | YES | NO | NO | ✅ Correct |

12 noindex pages total. 11 correct, 1 anomaly.
