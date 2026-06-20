# SCHEMA INVENTORY
## Source: Astro source files + GSC URL Inspection rich result validation
## Audit Date: 2026-05-28

---

## Schema Architecture

Schema is generated server-side in `src/utils/schema.ts` and injected via `SeoHead.astro` as
inline JSON-LD `<script type="application/ld+json">` tags. All schema renders in the initial
HTML response (SSG). There is no client-side schema injection.

### Schema Functions Available

| Function | Type | Fields Emitted |
|---|---|---|
| `organizationJsonLd()` | Organization | name, url, telephone, sameAs (Instagram) |
| `localBusinessJsonLd()` | LocalBusiness | name, url, telephone, areaServed, sameAs, makesOffer |
| `websiteJsonLd()` | WebSite | name, url |
| `breadcrumbJsonLd(items)` | BreadcrumbList | itemListElement with position/name/url |
| `serviceJsonLd(name, url)` | Service | name, provider (LocalBusiness), areaServed, serviceType, url |
| `faqJsonLd(faqs)` | FAQPage | mainEntity with Question/Answer pairs |

### Notable Schema Gaps

- **No `@id` URIs** on Organization or LocalBusiness — limits Knowledge Panel entity association
- **No `address` field** on LocalBusiness — `businessAddress: ""` in business.ts; service-area
  business model makes this optional, but absence may affect local pack eligibility
- **No `geo` coordinates** on LocalBusiness
- **No `priceRange`** on LocalBusiness
- **No `openingHoursSpecification`** on LocalBusiness
- **No `image` property** on LocalBusiness or Service
- **`legalName: "TBD_BY_OWNER"`** in business.ts — not emitted in any schema (only `name` used)
- **No `Review` or `AggregateRating` schema** — reviews are fetched dynamically from GBP API
  but not rendered as schema

---

## Per-Page Schema Inventory

### `/` — Homepage

**Schema types declared:** Organization, LocalBusiness, WebSite (all three)

```json
[
  { "@type": "Organization", "name": "Happy Faces LA", "url": "https://happyfacesla.com",
    "telephone": "+13108002860", "sameAs": ["https://www.instagram.com/happy_faces_la/"] },
  { "@type": "LocalBusiness", "name": "Happy Faces LA", "url": "https://happyfacesla.com",
    "telephone": "+13108002860", "areaServed": ["Los Angeles", "Burbank", ...13 cities],
    "sameAs": ["https://www.instagram.com/happy_faces_la/"],
    "makesOffer": [{ "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Face Painting" }}, ...] },
  { "@type": "WebSite", "name": "Happy Faces LA", "url": "https://happyfacesla.com" }
]
```

**GSC Rich Results:** null (not detected)
**Note:** Homepage has an FAQ accordion (reuses `commonFaqs` data), but `faqJsonLd` is NOT passed
to the layout. GSC does not detect FAQ schema on homepage. This is an opportunity gap.

---

### `/face-painting-los-angeles/`

**Schema types:** LocalBusiness, Service, BreadcrumbList, FAQPage

**GSC Rich Results:** PASS — Breadcrumbs, FAQ
**Confirmed working** in production.

---

### `/balloon-twisting-los-angeles/`

**Schema types:** LocalBusiness, Service, BreadcrumbList, FAQPage

**GSC Rich Results:** PASS — Breadcrumbs, FAQ
**Confirmed working** in production.

---

### `/glitter-tattoos-los-angeles/`

**Schema types:** LocalBusiness, Service, BreadcrumbList, FAQPage

**GSC Rich Results:** PASS — Breadcrumbs, FAQ
**Confirmed working** in production.

---

### `/face-gems-face-jewelry-los-angeles/`

**Schema types:** LocalBusiness, Service, BreadcrumbList, FAQPage

**GSC Rich Results:** PASS — Breadcrumbs, FAQ
**Confirmed working** in production.

---

### `/pricing/`

**Schema types:** Service, FAQPage

**GSC Rich Results:** PASS — FAQ
**Confirmed working** in production.
Note: No Breadcrumb schema on pricing page (different pattern than service pages).

---

### `/faq/`

**Schema types:** FAQPage

**GSC Rich Results:** PASS — FAQ
**Confirmed working** in production.

---

### `/gallery/`

**Schema types:** none

**GSC Rich Results:** null
No schema declared. No Breadcrumb, no ImageGallery, no LocalBusiness reinforcement.

---

### `/contact/`

**Schema types:** none

**GSC Rich Results:** null
No schema. Contact page has a quote form but no `ContactPoint`, no LocalBusiness, no schema.

---

### `/booking-policy/`

**Schema types:** none

**GSC Rich Results:** null

---

### `/privacy-policy/`

**Schema types:** none

**GSC Rich Results:** null

---

### `/services/`

**Schema types:** not confirmed (page not crawled by Google yet)

---

### Noindex pages (schema present but pages not indexed)

All noindex pages (`corporate-event`, `kids-birthday`, `school-festival`, `service-areas/*`) include
LocalBusiness + Service + BreadcrumbList schema. Schema is irrelevant since these pages are not
intended for indexation, but the schema will be rendered if Google does crawl them.

---

## LocalBusiness `areaServed` Array

From `src/data/business.ts`:

```
["Los Angeles", "Burbank", "Glendale", "Pasadena", "Sherman Oaks",
 "Studio City", "Encino", "Woodland Hills", "Northridge", "Santa Monica",
 "Beverly Hills", "West Hollywood", "Calabasas"]
```

This is used in every `localBusinessJsonLd()` call. 13 cities. Consistent across all pages.
Does not include Orange County or Ventura County (mentioned in service radius text but not in schema array).

---

## Rich Results Validation Summary

| Page | Schema Types | GSC Rich Result | Verdict |
|---|---|---|---|
| `/` | Organization, LocalBusiness, WebSite | none | FAQ gap |
| `/face-painting-los-angeles/` | LocalBusiness, Service, Breadcrumb, FAQ | Breadcrumbs + FAQ | ✅ PASS |
| `/balloon-twisting-los-angeles/` | LocalBusiness, Service, Breadcrumb, FAQ | Breadcrumbs + FAQ | ✅ PASS |
| `/glitter-tattoos-los-angeles/` | LocalBusiness, Service, Breadcrumb, FAQ | Breadcrumbs + FAQ | ✅ PASS |
| `/face-gems-face-jewelry-los-angeles/` | LocalBusiness, Service, Breadcrumb, FAQ | Breadcrumbs + FAQ | ✅ PASS |
| `/pricing/` | Service, FAQ | FAQ | ✅ PASS |
| `/faq/` | FAQ | FAQ | ✅ PASS |
| `/gallery/` | none | none | ⚠️ No schema |
| `/contact/` | none | none | ⚠️ No schema |
| `/booking-policy/` | none | none | ℹ️ Acceptable |
| `/privacy-policy/` | none | none | ℹ️ Acceptable |
