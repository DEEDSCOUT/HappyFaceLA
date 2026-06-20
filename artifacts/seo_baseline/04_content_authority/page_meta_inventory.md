# PAGE META INVENTORY
## Source: Astro source files read 2026-05-28
## Audit Date: 2026-05-28

All pages use BaseLayout.astro which delegates to SeoHead.astro.
SeoHead.astro renders: title, meta description, meta robots, canonical link, OG tags, Twitter Card tags, and JSON-LD.
The canonical URL is constructed as: `new URL(canonicalPath, business.url).toString()`
where `business.url = "https://happyfacesla.com"`.

---

## Indexable Pages

### `/` — Homepage

- **Title:** Face Painting, Balloon Twisting & Glitter Tattoos in Los Angeles | Happy Faces LA
- **Description:** Book Happy Faces LA for professional face painting, balloon twisting, glitter tattoos, and face gems in Los Angeles. Call/text (310) 800-2860 for availability and pricing.
- **Canonical:** https://happyfacesla.com/
- **noindex:** false → robots: `index,follow`
- **OG Image:** /images/services/happy-faces-la-face-painting-service.webp (default)
- **Schema:** Organization, LocalBusiness, WebSite

**Assessment:**
- Title length: ~83 chars — slightly long; Google truncates at ~60 chars in SERPs. The pipe-separated brand suffix is good but may be cut.
- Description length: ~161 chars — within 155-165 range; good
- Phone number in description is a strong local signal

---

### `/face-painting-los-angeles/`

- **Title:** Face Painting Los Angeles | Kids Birthday Parties & Events
- **Description:** Professional face painting for birthdays, school events, festivals, and private celebrations in Los Angeles. Bundle with balloon twisting, glitter tattoos, and face gems.
- **Canonical:** https://happyfacesla.com/face-painting-los-angeles/
- **noindex:** false → robots: `index,follow`
- **Schema:** LocalBusiness, Service, BreadcrumbList, FAQPage

**Assessment:**
- Title: ~60 chars — good length
- Description: ~171 chars — slightly over; may be truncated

---

### `/balloon-twisting-los-angeles/`

- **Title:** Balloon Twisting Los Angeles | Birthday Party Balloon Artist
- **Description:** Book Happy Faces LA for balloon twisting at birthdays, school events, festivals, and corporate family days in Los Angeles. Pairs with face painting, glitter tattoos, and face gems.
- **Canonical:** https://happyfacesla.com/balloon-twisting-los-angeles/
- **noindex:** false → robots: `index,follow`
- **Schema:** LocalBusiness, Service, BreadcrumbList, FAQPage

**Assessment:**
- Title: ~61 chars — good
- Description: ~182 chars — over target; may be truncated

---

### `/glitter-tattoos-los-angeles/`

- **Title:** Glitter Tattoos Los Angeles | Kids Party Glitter Tattoos
- **Description:** Temporary glitter tattoo designs for kids parties, school carnivals, and festivals in Los Angeles. Pairs with face painting, face gems, and balloon twisting. Book through Happy Faces LA.
- **Canonical:** https://happyfacesla.com/glitter-tattoos-los-angeles/
- **noindex:** false → robots: `index,follow`
- **Schema:** LocalBusiness, Service, BreadcrumbList, FAQPage

**Assessment:**
- Title: ~56 chars — good
- Description: ~188 chars — over target; may be truncated

---

### `/face-gems-face-jewelry-los-angeles/`

- **Title:** (not captured — file not read this pass; estimated from pattern)
- **Description:** (not captured)
- **Canonical:** https://happyfacesla.com/face-gems-face-jewelry-los-angeles/
- **noindex:** false → robots: `index,follow`
- **Schema:** LocalBusiness, Service, BreadcrumbList, FAQPage (confirmed by GSC)

---

### `/gallery/`

- **Title:** (not captured — file not read)
- **Canonical:** https://happyfacesla.com/gallery/
- **noindex:** false → robots: `index,follow`
- **Schema:** none

---

### `/pricing/`

- **Title:** Pricing for Face Painting & Party Entertainment in Los Angeles | Happy Faces LA
- **Description:** Pricing depends on event date, location, guest count, and services requested. Request availability and pricing from Happy Faces LA.
- **Canonical:** https://happyfacesla.com/pricing/
- **noindex:** false → robots: `index,follow`
- **Schema:** Service, FAQPage

**Assessment:**
- Title: ~79 chars — may be truncated
- Description: ~141 chars — good length

---

### `/contact/`

- **Title:** Contact & Quote Request | Happy Faces LA
- **Description:** Request availability and pricing from Happy Faces LA for Los Angeles face painting, balloons, glitter tattoos, and face gems.
- **Canonical:** https://happyfacesla.com/contact/
- **noindex:** false → robots: `index,follow`
- **Schema:** none

---

### `/faq/`

- **Title:** FAQ | Happy Faces LA
- **Description:** Answers about face painting, balloon twisting, glitter tattoos, and event booking with Happy Faces LA in Los Angeles.
- **Canonical:** https://happyfacesla.com/faq/
- **noindex:** false → robots: `index,follow`
- **Schema:** FAQPage

**Assessment:**
- Title: ~19 chars — short; "FAQ" alone is low-value as a SERP title for non-branded queries

---

### `/booking-policy/`

- **Title:** (not captured)
- **Canonical:** https://happyfacesla.com/booking-policy/
- **noindex:** false

---

### `/privacy-policy/`

- **Title:** (not captured)
- **Canonical:** https://happyfacesla.com/privacy-policy/
- **noindex:** false

---

### `/services/`

- **Title:** (not captured — not yet indexed)
- **Canonical:** https://happyfacesla.com/services/
- **noindex:** false

---

## Noindex Pages — Meta

All noindex pages render:
```html
<meta name="robots" content="noindex,nofollow">
```

This is implemented in `SeoHead.astro`:

```astro
<meta name="robots" content={noindex ? "noindex,nofollow" : "index,follow"} />
```

Pages with `noindex={true}` in Astro props:
- `/corporate-event-face-painting-los-angeles/`
- `/kids-birthday-party-entertainment-los-angeles/`
- `/school-festival-face-painting-los-angeles/`
- `/share-your-experience/`
- `/service-areas/` (and all sub-pages)

---

## OG / Twitter Card

All pages use a single default OG image:
`/images/services/happy-faces-la-face-painting-service.webp`

No per-page OG image override is used (the `image?` prop in SeoHead is optional and not passed
by any current page). This means all pages share the same social preview image.

---

## Meta Description Length Assessment

| Page | Description Length | Status |
|---|---|---|
| Homepage | ~161 chars | ✅ Good |
| Face painting | ~171 chars | ⚠️ Slightly over |
| Balloon twisting | ~182 chars | ⚠️ Over |
| Glitter tattoos | ~188 chars | ⚠️ Over |
| Pricing | ~141 chars | ✅ Good |
| Contact | ~126 chars | ✅ Good |
| FAQ | ~117 chars | ✅ Good |

Target: 150–165 characters. Google rewrites descriptions freely, but shorter descriptions are less likely to be rewritten.

---

## Title Length Assessment

| Page | Title Length | Status |
|---|---|---|
| Homepage | ~83 chars | ⚠️ May truncate |
| Face painting | ~60 chars | ✅ Good |
| Balloon twisting | ~61 chars | ✅ Good |
| Glitter tattoos | ~56 chars | ✅ Good |
| Pricing | ~79 chars | ⚠️ May truncate |
| Contact | ~41 chars | ✅ Good |
| FAQ | ~19 chars | ⚠️ Too short / low-value |

Target: 50–60 characters. Titles beyond 60 chars may be truncated in desktop SERPs (~580px pixel limit).
