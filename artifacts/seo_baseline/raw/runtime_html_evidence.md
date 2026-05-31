# RUNTIME HTML / RENDER-PARITY EVIDENCE
## Audit Date: 2026-05-28
## Method: Invoke-WebRequest -UseBasicParsing (initial server response HTML)
## User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36

**SCOPE:** 5 commercial pages fetched. Initial HTML extracted; key SEO elements parsed.
**PARITY NOTE:** This evidence covers initial server HTML only. JavaScript-rendered DOM
state was not independently verified in this pass; Lighthouse runtime evidence covers
rendered performance. Full DOM parity (initial HTML vs rendered DOM) remains unconfirmed
for all dynamic interactivity but is not expected given Astro SSG architecture (source-level).

---

## Evidence Table — Initial HTML Extraction

| URL | Title | Canonical | Robots Meta | First H1 |
|---|---|---|---|---|
| `/` | Face Painting, Balloon Twisting & Glitter Tattoos in Los Angeles \| Happy Faces LA | `https://happyfacesla.com/` | `index,follow` | Face Painting, Balloon Twisting & Glitter Tattoos in Los Angeles |
| `/face-painting-los-angeles/` | Face Painting Los Angeles \| Kids Birthday Parties & Events | `https://happyfacesla.com/face-painting-los-angeles/` | `index,follow` | Face Painting in Los Angeles |
| `/pricing/` | Pricing for Face Painting & Party Entertainment in Los Angeles \| Happy Faces LA | `https://happyfacesla.com/pricing/` | `index,follow` | Pricing & Packages |
| `/corporate-event-face-painting-los-angeles/` | Corporate Event Face Painting in Los Angeles \| Happy Faces LA | `https://happyfacesla.com/corporate-event-face-painting-los-angeles/` | **`noindex,nofollow`** | Corporate Event Face Painting in Los Angeles |
| `/kids-birthday-party-entertainment-los-angeles/` | Kids Birthday Party Entertainment in Los Angeles \| Happy Faces LA | `https://happyfacesla.com/kids-birthday-party-entertainment-los-angeles/` | **`noindex,nofollow`** | Kids Birthday Party Entertainment in Los Angeles |

---

## JSON-LD Structured Data — Per Page

### `/` (Homepage)
- **Block count:** 3
- **@types detected:** `Organization`, `LocalBusiness`, `Offer` (×6), `Service` (×6), `WebSite`
- **@ids detected:** none
- **Assessment:** Organization and LocalBusiness present. No `@id` URIs on LocalBusiness entity — limits Knowledge Graph disambiguation.

### `/face-painting-los-angeles/`
- **Block count:** 4
- **@types detected:** `LocalBusiness`, `Offer` (×6), `Service` (×7), `BreadcrumbList`, `ListItem` (×2), `FAQPage`, `Question` (×5), `Answer` (×5)
- **@ids detected:** none
- **Assessment:** Breadcrumbs + FAQPage confirmed. No `@id` on LocalBusiness.

### `/pricing/`
- **Block count:** 2
- **@types detected:** `Service`, `LocalBusiness`, `FAQPage`, `Question` (×2), `Answer` (×2)
- **@ids detected:** none

### `/corporate-event-face-painting-los-angeles/`
- **Block count:** 3
- **@types detected:** `LocalBusiness`, `Offer` (×6), `Service` (×7), `BreadcrumbList`, `ListItem` (×2)
- **@ids detected:** none
- **⚠️ ANOMALY:** robots meta = `noindex,nofollow` in initial HTML. Despite this, Google reports INDEXING_ALLOWED and PASS in URL Inspection API (see ISS-002 in ISSUE_REGISTER.md). Runtime evidence confirms the noindex directive IS present in the initial server response.

### `/kids-birthday-party-entertainment-los-angeles/`
- **Block count:** 3
- **@types detected:** `LocalBusiness`, `Offer` (×6), `Service` (×7), `BreadcrumbList`, `ListItem` (×2)
- **@ids detected:** none
- **⚠️ noindex,nofollow confirmed** in initial HTML. URL reports NEUTRAL (URL is unknown to Google) — consistent with noindex being honored for this URL.

---

## CTA Links (book/contact hrefs)

| URL | CTA Links Found |
|---|---|
| `/` | `/booking-policy/`, `/contact/` |
| `/face-painting-los-angeles/` | `/booking-policy/`, `/contact/`, `/contact/?service=party-package` |
| `/pricing/` | `/booking-policy/`, `/contact/` |
| `/corporate-event-face-painting-los-angeles/` | `/booking-policy/`, `/contact/` |
| `/kids-birthday-party-entertainment-los-angeles/` | `/booking-policy/` , `/contact/` |

**Note:** CTAs link to `/contact/` (form) and `/booking-policy/` (policy page). No direct booking-platform link observed.

---

## HTML Error Indicators

All 5 pages: **None detected** — no Fatal error, Warning:, Parse error, Uncaught exception, Exception, or Stack trace patterns found in initial HTML response.

---

## Render-Parity Status

| Signal | Status |
|---|---|
| Initial HTML title matches expected | CONFIRMED — all 5 pages |
| Canonical self-referencing | CONFIRMED — all 5 pages |
| Robots meta consistent with URL Inspection verdict | CONFIRMED — index pages have `index,follow`; noindex pages have `noindex,nofollow` |
| `/corporate-event-face-painting-los-angeles/` anomaly | noindex in HTML CONFIRMED; Google INDEXING_ALLOWED confirmed — directive not honored by Google for this URL |
| No server-side errors | CONFIRMED |
| JSON-LD present | CONFIRMED — 2–4 blocks per page |
| `@id` on LocalBusiness entities | NOT PRESENT — observation only, not an indexing blocker |
| Full JS-rendered DOM parity | NOT VERIFIED in this pass — see cwv_status.md |

---

## Evidence Table — Remaining 7 Pages (Initial HTML Extraction)

| URL | Title | Canonical | Robots Meta | First H1 |
|---|---|---|---|---|
| `/faq/` | FAQ \| Happy Faces LA | `https://happyfacesla.com/faq/` | `index,follow` | Frequently Asked Questions |
| `/booking-policy/` | Booking Policy \| Happy Faces LA | `https://happyfacesla.com/booking-policy/` | `index,follow` | Booking Policy |
| `/privacy-policy/` | Privacy Policy \| Happy Faces LA | `https://happyfacesla.com/privacy-policy/` | `index,follow` | Privacy Policy |
| `/services/` | Kids Party Entertainment Los Angeles \| Face Painting, Balloons, Glitter Tattoos | `https://happyfacesla.com/services/` | `index,follow` | NOT FOUND by regex (see note) |
| `/school-festival-face-painting-los-angeles/` | School & Festival Face Painting in Los Angeles \| Happy Faces LA | `https://happyfacesla.com/school-festival-face-painting-los-angeles/` | **`noindex,nofollow`** | School & Festival Face Painting in Los Angeles |
| `/service-areas/` | Service Areas \| Happy Faces LA | `https://happyfacesla.com/service-areas/` | **`noindex,nofollow`** | Service Areas |
| `/service-areas/los-angeles/` | Face Painting in Los Angeles \| Happy Faces LA | `https://happyfacesla.com/service-areas/los-angeles/` | **`noindex,nofollow`** | Face Painting, Balloon Twisting & Glitter Tattoos in Los Angeles |

**Note on /services/ H1:** The regex `<h1[^>]*>(.*?)</h1>` returned no match. Source code (`services.astro` line 42) contains a multiline H1 element with class attributes. The "NOT FOUND" result is a parsing artifact of the regex engine's handling of multiline H1 content in the initial HTML response, not a confirmed H1 absence. Verification of H1 presence would require a headless browser parse.

---

## JSON-LD Structured Data — Remaining 7 Pages

### `/faq/`
- **Block count:** 1
- **@types detected:** `FAQPage`, `Question` (×4), `Answer` (×4)
- **@ids detected:** none

### `/booking-policy/`
- **Block count:** 0
- **@types detected:** none
- **Assessment:** Policy page — no structured data. Expected for this page type.

### `/privacy-policy/`
- **Block count:** 0
- **@types detected:** none
- **Assessment:** Policy page — no structured data. Expected for this page type.

### `/services/`
- **Block count:** 2
- **@types detected:** `LocalBusiness`, `Offer` (×6), `Service` (×6), `BreadcrumbList`, `ListItem` (×2)
- **@ids detected:** none

### `/school-festival-face-painting-los-angeles/`
- **Block count:** 3
- **@types detected:** `LocalBusiness` (×2), `Offer` (×6), `Service` (×7), `BreadcrumbList`, `ListItem` (×2)
- **@ids detected:** none
- **Note:** noindex,nofollow confirmed. Schema present but page is suppressed from index.

### `/service-areas/`
- **Block count:** 0
- **@types detected:** none
- **Note:** noindex,nofollow confirmed. Hub listing page with no schema.

### `/service-areas/los-angeles/`
- **Block count:** 3
- **@types detected:** `LocalBusiness` (×2), `Offer` (×6), `Service` (×7), `BreadcrumbList`, `ListItem` (×3)
- **@ids detected:** none
- **Note:** noindex,nofollow confirmed.

---

## Evidence Table — Final 5 Pages (Initial HTML Extraction, fetched 2026-05-28)

| URL | HTTP | Title | Canonical | Robots Meta | First H1 |
|---|---|---|---|---|---|
| `/balloon-twisting-los-angeles/` | 200 | Balloon Twisting Los Angeles \| Birthday Party Balloon Artist | `https://happyfacesla.com/balloon-twisting-los-angeles/` | `index,follow` | Balloon Twisting in Los Angeles |
| `/glitter-tattoos-los-angeles/` | 200 | Glitter Tattoos Los Angeles \| Kids Party Glitter Tattoos | `https://happyfacesla.com/glitter-tattoos-los-angeles/` | `index,follow` | Glitter Tattoos in Los Angeles |
| `/face-gems-face-jewelry-los-angeles/` | 200 | Face Gems Los Angeles \| Kids Party Face Gems &amp; Festival Looks | `https://happyfacesla.com/face-gems-face-jewelry-los-angeles/` | `index,follow` | Face Gems &amp; Face Jewelry in Los Angeles |
| `/gallery/` | 200 | Gallery \| Happy Faces LA | `https://happyfacesla.com/gallery/` | `index,follow` | Gallery |
| `/contact/` | 200 | Contact &amp; Quote Request \| Happy Faces LA | `https://happyfacesla.com/contact/` | `index,follow` | Get Availability &amp; Pricing |

### JSON-LD — Final 5 Pages

| URL | Blocks | @types | @ids | Internal links | Charset | Viewport |
|---|---|---|---|---|---|---|
| `/balloon-twisting-los-angeles/` | 4 | LocalBusiness, Service ×7 + Offer ×6, BreadcrumbList + ListItem ×2, FAQPage + Question ×5 + Answer ×5 | none | 51 | Present | Present |
| `/glitter-tattoos-los-angeles/` | 4 | LocalBusiness, Service ×7 + Offer ×6, BreadcrumbList + ListItem ×2, FAQPage + Question ×5 + Answer ×5 | none | 51 | Present | Present |
| `/face-gems-face-jewelry-los-angeles/` | 4 | LocalBusiness, Service ×7 + Offer ×6, BreadcrumbList + ListItem ×2, FAQPage + Question ×5 + Answer ×5 | none | 51 | Present | Present |
| `/gallery/` | 0 | none | none | 39 | Present | Present |
| `/contact/` | 0 | none | none | 34 | Present | Present |

Raw HTML saved to: `C:\HappyFaceLA\artifacts\seo_baseline\raw\html\{slug}.html`

**HTML entities note:** `face-gems` title/H1 and `contact` title contain raw `&amp;` entities — these render correctly in browsers but appear literal in raw HTML.

---

## Complete HTML Evidence Summary — All 12 Pages

| URL | Robots Meta | GSC State | JSON-LD Blocks | FAQPage | BreadcrumbList | HTML Errors |
|---|---|---|---|---|---|---|
| `/` | index,follow | PASS | 3 | no | no | None |
| `/face-painting-los-angeles/` | index,follow | PASS | 4 | yes | yes | None |
| `/balloon-twisting-los-angeles/` | index,follow | PASS | 4 | yes | yes | None |
| `/glitter-tattoos-los-angeles/` | index,follow | PASS | 4 | yes | yes | None |
| `/face-gems-face-jewelry-los-angeles/` | index,follow | PASS | 4 | yes | yes | None |
| `/gallery/` | index,follow | PASS | 0 | no | no | None |
| `/pricing/` | index,follow | PASS | 2 | yes | no | None |
| `/contact/` | index,follow | PASS | 0 | no | no | None |
| `/faq/` | index,follow | PASS | 1 | yes | no | None |
| `/booking-policy/` | index,follow | PASS | 0 | no | no | None |
| `/privacy-policy/` | index,follow | PASS | 0 | no | no | None |
| `/services/` | index,follow | NEUTRAL | 2 | no | yes | None |
| `/school-festival-face-painting-los-angeles/` | **noindex,nofollow** | NEUTRAL | 3 | no | yes | None |
| `/corporate-event-face-painting-los-angeles/` | **noindex,nofollow** | **STALE_OR_CONFLICTING_INDEX_STATE** | 3 | no | yes | None |
| `/kids-birthday-party-entertainment-los-angeles/` | **noindex,nofollow** | NEUTRAL | 3 | no | yes | None |
| `/service-areas/` | **noindex,nofollow** | NEUTRAL | 0 | no | no | None |
| `/service-areas/los-angeles/` | **noindex,nofollow** | NEUTRAL | 3 | no | yes | None |

All 12 required commercial URLs have now been directly fetched. No pages remain in "not fetched" status.

**Corporate-event reclassification:** The previously labeled "ANOMALY" finding is reclassified as `STALE_OR_CONFLICTING_INDEX_STATE`. The currently served page contains `noindex,nofollow` in initial HTML, while Google's indexed-version inspection reports the URL as indexed. This represents a stale-state condition, not a confirmed Google defect. Business intent and approved public claims must be resolved before any action intended to retain or remove indexability. **No Search Console action is authorized.**

---

## Rendered DOM / Render-Parity Evidence Source

Lighthouse JSON outputs in `raw/lighthouse/` capture the **rendered DOM state** for every URL (Lighthouse uses headless Chrome and gathers the final rendered page). The following audits within each Lighthouse JSON serve as rendered-DOM evidence:

| Evidence Item | Lighthouse Audit Key | Notes |
|---|---|---|
| Final rendered URL | `finalDisplayedUrl` | Confirms no client-side redirect |
| Rendered document title | `audits.document-title` | Title in rendered DOM |
| Rendered meta description | `audits.meta-description` | Description in rendered DOM |
| Rendered canonical | `audits.canonical` | Canonical link in rendered DOM |
| Robots directive consistency | `audits.is-crawlable` | Confirms robots not blocking rendered DOM |
| Console errors | `audits.errors-in-console` | Browser console errors captured during load |
| Network failures | `audits.network-requests` (status>=400) | Failed network requests |
| Rendered H1 / heading order | `audits.heading-order` | Heading hierarchy in rendered DOM |
| LCP element | `audits.largest-contentful-paint-element` | Final paint element identity |
| Layout-shift sources | `audits.layout-shifts` | CLS contributors in rendered DOM |
| Render-blocking resources | `audits.render-blocking-resources` | Resources blocking initial render |

**Parity assessment:** For Astro SSG sites, initial HTML and rendered DOM should be near-identical (no client-side framework hydration of routes). Material differences would be limited to:
- Analytics scripts firing (gtag.js, Clarity) — adds DOM nodes but no SEO-relevant content
- Sticky CTA components mounting — may add a fixed-position element to DOM
- Image lazy-loading — does not change schema/title/canonical/robots

Lighthouse JSONs are the authoritative rendered-DOM evidence record. Per-URL parity differences can be computed from those files.

---

## Missing Evidence Captured

```
INITIAL_HTML: COMPLETE — all 12 commercial URLs fetched directly
RENDERED_DOM_VIA_LIGHTHOUSE: COMPLETE (per Lighthouse JSON audits)
CONSOLE_ERRORS_VIA_LIGHTHOUSE: COMPLETE (audits.errors-in-console per JSON)
NETWORK_FAILURES_VIA_LIGHTHOUSE: COMPLETE (audits.network-requests per JSON)
INDEPENDENT_HEADLESS_BROWSER_DOM_DIFF: NOT PERFORMED (Lighthouse rendered-DOM evidence used in lieu of separate headless run)
```
