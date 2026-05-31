# URL INVENTORY
## Source: `c:\HappyFaceLA\src\pages\` + Astro sitemap filter + GSC inspections
## Audit Date: 2026-05-28

---

## Legend

| Column | Description |
|---|---|
| Route | Rendered URL path |
| Source | `.astro` file |
| noindex | `noindex={true}` declared in Astro source |
| Sitemap | Included in sitemap per Astro filter |
| GSC State | Verdict from GSC URL Inspection API |
| Rich Results | Schema types confirmed by GSC |

---

## Indexable Pages (sitemap included, no noindex)

| Route | Source File | noindex | Sitemap | GSC State | Rich Results |
|---|---|---|---|---|---|
| `/` | `index.astro` | false | ✅ | **Submitted and indexed** | none |
| `/face-painting-los-angeles/` | `face-painting-los-angeles.astro` | false | ✅ | **Submitted and indexed** | Breadcrumbs, FAQ |
| `/balloon-twisting-los-angeles/` | `balloon-twisting-los-angeles.astro` | false | ✅ | **Submitted and indexed** | Breadcrumbs, FAQ |
| `/glitter-tattoos-los-angeles/` | `glitter-tattoos-los-angeles.astro` | false | ✅ | **Submitted and indexed** | Breadcrumbs, FAQ |
| `/face-gems-face-jewelry-los-angeles/` | `face-gems-face-jewelry-los-angeles.astro` | false | ✅ | **Submitted and indexed** | Breadcrumbs, FAQ |
| `/gallery/` | `gallery.astro` | false | ✅ | **Submitted and indexed** | none |
| `/pricing/` | `pricing.astro` | false | ✅ | **Submitted and indexed** | FAQ |
| `/contact/` | `contact.astro` | false | ✅ | **Submitted and indexed** | none |
| `/faq/` | `faq.astro` | false | ✅ | **Submitted and indexed** | FAQ |
| `/booking-policy/` | `booking-policy.astro` | false | ✅ | **Submitted and indexed** | none |
| `/privacy-policy/` | `privacy-policy.astro` | false | ✅ | **Submitted and indexed** | none |
| `/services/` | `services.astro` | false | ✅ | **URL is unknown to Google** | — |

**Total indexable routes:** 12
**Total indexed (confirmed):** 11
**Unknown to Google (never crawled):** 1 (`/services/`) — fresh inspection 2026-05-28

---

## Intentionally Noindex Pages (excluded from sitemap)

| Route | Source File | noindex | Sitemap | GSC State | Notes |
|---|---|---|---|---|---|
| `/corporate-event-face-painting-los-angeles/` | `corporate-event-face-painting-los-angeles.astro` | **true** | ❌ excluded | ⚠️ **Submitted and indexed** | SEE ANOMALY BELOW |
| `/kids-birthday-party-entertainment-los-angeles/` | `kids-birthday-party-entertainment-los-angeles.astro` | true | ❌ excluded | URL unknown to Google | As intended |
| `/school-festival-face-painting-los-angeles/` | `school-festival-face-painting-los-angeles.astro` | true | ❌ excluded | URL unknown to Google | As intended |
| `/share-your-experience/` | `share-your-experience.astro` | true | ❌ excluded | URL unknown to Google | As intended |
| `/service-areas/` | `service-areas/index.astro` | **true** | ❌ excluded | URL unknown to Google | As intended |
| `/service-areas/los-angeles/` | `service-areas/los-angeles.astro` | true | ❌ excluded | URL unknown to Google | As intended |
| `/service-areas/burbank/` | `service-areas/burbank.astro` | true | ❌ excluded | URL unknown to Google | As intended |
| `/service-areas/glendale/` | `service-areas/glendale.astro` | true | ❌ excluded | Not inspected | Assumed unknown |
| `/service-areas/pasadena/` | `service-areas/pasadena.astro` | true | ❌ excluded | Not inspected | Assumed unknown |
| `/service-areas/sherman-oaks/` | `service-areas/sherman-oaks.astro` | true | ❌ excluded | Not inspected | Assumed unknown |
| `/service-areas/studio-city/` | `service-areas/studio-city.astro` | true | ❌ excluded | Not inspected | Assumed unknown |
| `/service-areas/encino/` | `service-areas/encino.astro` | true | ❌ excluded | Not inspected | Assumed unknown |

---

## API Routes (not indexable)

| Route | Source | Notes |
|---|---|---|
| `/api/google-reviews` | `functions/api/google-reviews.ts` | CF Pages Function |
| `/api/lead` | `functions/api/lead.ts` | CF Pages Function |
| `/api/meta-capi` | `functions/api/meta-capi.ts` | CF Pages Function |
| Additional `/api/*` routes | `functions/api/` | Not inventoried for SEO |

---

## ⚠️ ANOMALY: `/corporate-event-face-painting-los-angeles/` Indexed Despite noindex

**Status:** P0 Critical finding
**GSC Inspection result:**
- Verdict: PASS
- Coverage: "Submitted and indexed"
- Last crawled: 2026-05-19
- Referring URL: `https://happyfacesla.com/sitemap-0.xml`
- Google canonical: `https://happyfacesla.com/corporate-event-face-painting-los-angeles/`

**Source code declares:** `noindex={true}` → renders `<meta name="robots" content="noindex,nofollow">`
**Sitemap:** Excluded by Astro filter (confirmed: not present in `docs/seo/evidence/production/2026-05-22/sitemap-0.xml`)

**Root cause hypothesis:** The page was previously included in the sitemap before the Astro exclusion filter was applied. Google crawled it on 2026-05-19 via the old sitemap. Google has not yet re-crawled the page since the noindex directive was applied (or the directive was not present when the page was originally crawled). The page will be de-indexed on Google's next crawl once the noindex is processed.

**SEO risk:** The page is receiving impressions (12 impressions, avg position 3.7 in GSC) and is appearing in search results with schema markup (Breadcrumbs). The noindex directive intent is being violated by Google's cached index. Not a content-safety violation, but creates brand confusion and dilutes intent-based crawl budget.

---

## Summary Counts

| Category | Count |
|---|---|
| Total `.astro` page routes | 25 (12 root + 8 service-areas + 1 index + 4 API + 404) |
| Indexed (confirmed) | 11 |
| Indexed unintentionally | 1 (corporate-event) |
| Unknown to Google (never crawled) | 1 (services/) |
| Intentionally not indexed + unknown to Google | 11 |
| API routes | ~5 |
