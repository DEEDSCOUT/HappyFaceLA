# Happy Faces LA Website

Production-ready Sprint 1 implementation for a static-first local service website:

For full project roadmap, current status, deployment gates, and handoff instructions, see [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md).

Commercial booking/gallery governance status:

PUBLIC-BOOKING-R13-R8D PREVIEW BOOKINGS_KV BINDING RECHECK / CURRENT-CODE PREVIEW REDEPLOY / CHECKOUT-WEBHOOK PROOF RERUN SUBMITTED — AUDITOR REVIEW REQUIRED — RELEASE STATE NO_GO

R13-R8D continuation created a fresh non-production current-code Preview deployment from commit `2431c8b` on branch `r13-r8d-proof` (`https://c5d78321.happyfacesla.pages.dev`, alias `https://r13-r8d-proof.happyfacesla.pages.dev`) and proved the owner-configured Preview `BOOKINGS_KV` binding is now available. The no-seed checkout gate returned 409 fail-closed with no checkout URL, not the prior 503 `Booking storage is not configured`. Preview `AVAILABILITY_D1`, `ADMIN_SLOT_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `BOOKINGS_KV` were confirmed through redacted metadata/runtime proof only; production `AVAILABILITY_D1` remains absent in Cloudflare Pages metadata. P5-P9 were rerun with synthetic non-PII data only; P8/P9 used live webhook signature fail-closed checks plus approved TEST simulation without reading the webhook secret. Synthetic D1 rows were cleaned to zero and synthetic KV keys were deleted; no pre-existing KV records were listed/read/changed. `EVD-PUBLIC-BOOKING-R13-R8D-001` and `EVD-PUBLIC-BOOKING-R13-R8-001` are Pending Auditor Review / Pending. `BLK-PUBLIC-R13-R8-PREVIEW-KV-BINDING-001` and `BLK-PUBLIC-R13-R8-PREVIEW-FUNCTIONS-CURRENT-CODE-001` are Proposed Closed by R13-R8D. `BLK-R9-001`, `BLK-R9-002`, and `BLK-R9-003` remain OPEN. RELEASE STATE NO_GO.

WEBSITE-GALLERY-R2-R1 remains accepted for non-production preview only. WEBSITE-GALLERY-R3 remains REVISION REQUIRED / No. Gallery live publication remains blocked.

The deployment notes in this README describe technical setup only. They do not authorize happyfacesla.com publication, deploy planning, SEO/indexing work, payment activation, Ads, social publishing, R4 live-publication execution, production D1 mutation, production KV mutation, production slot seeding, R13-R9/R13-R10/R13-R11 execution, or customer-facing release.

- Canonical domain: <https://happyfacesla.com>
- Redirect domain: <https://happyfacela.com>
- Phone: 818-619-5506
- Instagram: <https://www.instagram.com/happyfacesla>

## Stack

- Astro + TypeScript
- Tailwind CSS v4
- @astrojs/sitemap
- Wrangler (local Cloudflare Pages Functions dev)

## Local Setup

1. Install dependencies:

```bash
npm install
```

1. Start development server:

```bash
npm run dev
```

1. Production build:

```bash
npm run build
```

1. Preview production output:

```bash
npm run preview
```

## Core Routes Included

- /
- /face-painting-los-angeles/
- /balloon-twisting-los-angeles/
- /glitter-tattoos-los-angeles/
- /face-gems-face-jewelry-los-angeles/
- /kids-birthday-party-entertainment-los-angeles/
- /corporate-event-face-painting-los-angeles/
- /school-festival-face-painting-los-angeles/
- /pricing/
- /gallery/
- /reviews/
- /faq/
- /contact/
- /service-areas/
- /service-areas/los-angeles/
- /service-areas/burbank/
- /service-areas/glendale/
- /service-areas/pasadena/
- /service-areas/sherman-oaks/
- /service-areas/studio-city/
- /service-areas/encino/
- /privacy-policy/
- /booking-policy/

## Important Files

- Business data: `src/data/business.ts`
- Service data: `src/data/services.ts`
- Location data: `src/data/locations.ts`
- Package data: `src/data/packages.ts`
- FAQ data: `src/data/faqs.ts`
- Navigation data: `src/data/navigation.ts`
- Tracking constants: `src/data/tracking.ts`
- SEO component: `src/components/seo/SeoHead.astro`
- Schema helpers: `src/utils/schema.ts`
- Production lead endpoint: `functions/api/lead.ts`
- Production Meta CAPI endpoint shell: `functions/api/meta-capi.ts`
- Non-production Astro API stubs: `src/pages/api/lead.ts`, `src/pages/api/meta-capi.ts`
- Post-build QA script: `scripts/qa-postbuild.mjs`
- Environment template: `.env.example`

## Environment Variables

Copy `.env.example` to `.env` for local development and set these values in Cloudflare Pages project environment variables for production:

- `OWNER_NOTIFICATION_EMAIL` (TBD_BY_OWNER)
- `CRM_WEBHOOK_URL` (TBD_BY_OWNER)
- `CRM_WEBHOOK_SECRET` (TBD_BY_OWNER)
- `META_PIXEL_ID` (TBD_BY_OWNER)
- `META_ACCESS_TOKEN` (TBD_BY_OWNER)
- `META_TEST_EVENT_CODE` (TBD_BY_OWNER)
- `GA4_MEASUREMENT_ID` (TBD_BY_OWNER)
- `GOOGLE_ADS_CONVERSION_ID` (TBD_BY_OWNER)
- `GOOGLE_ADS_LEAD_CONVERSION_LABEL` (TBD_BY_OWNER)

Important: For static Astro hosting on Cloudflare Pages, production form submissions use Cloudflare Pages Functions under `functions/api/*`.

## Redirect Requirements

Configure permanent 301 redirects so all alternate hostnames point to canonical:

- `http://happyfacesla.com/*` -> `https://happyfacesla.com/$1`
- `https://www.happyfacesla.com/*` -> `https://happyfacesla.com/$1`
- `http://happyfacela.com/*` -> `https://happyfacesla.com/$1`
- `https://happyfacela.com/*` -> `https://happyfacesla.com/$1`
- `https://www.happyfacela.com/*` -> `https://happyfacesla.com/$1`

## Deployment Notes

- Static output is generated by `npm run build`.
- `astro.config.mjs` sets canonical site URL and trailing slash behavior.
- `public/robots.txt` allows crawl and points to sitemap index URL.
- `@astrojs/sitemap` generates sitemap files at build time.

## Cloudflare Hosting (Final)

Hosting and DNS are finalized for this project:

- Hosting: Cloudflare Pages
- DNS: Cloudflare DNS for both domains
  - `happyfacesla.com`
  - `happyfacela.com`
- Production URL: `https://happyfacesla.com`

Do not deploy to shared hosting.
Do not use WordPress hosting.
Do not use Wix, Squarespace, or Webflow for this build.

### Cloudflare Pages Setup

1. Connect the GitHub repository to Cloudflare Pages.
1. Use these build settings:
   - Framework preset: `Astro`
   - Build command: `npm run build`
   - Output directory: `dist`
   - Production branch: `main`
   - Preview branches: enabled
1. Add custom domains in Cloudflare Pages:
   - `happyfacesla.com`
   - `www.happyfacesla.com`
   - `happyfacela.com`
   - `www.happyfacela.com`
1. Ensure Cloudflare SSL/TLS is enabled and HTTPS redirects are active.
1. Configure Pages Functions environment variables from the Environment Variables section above.

### Canonical Redirect Rules

Cloudflare Pages `_redirects` only supports relative source paths and standard 3xx status codes. Host-based canonicalization (alternate hostname to canonical) cannot live in `public/_redirects` and must be configured as **Cloudflare dashboard Redirect Rules** on each zone.

Required Redirect Rules (set up in Cloudflare dashboard → Rules → Redirect Rules):

| Source hostname | Target | Status |
| --- | --- | --- |
| `www.happyfacesla.com` (any path) | `https://happyfacesla.com/${1}` | 301 |
| `happyfacela.com` (any path) | `https://happyfacesla.com/${1}` | 301 |
| `www.happyfacela.com` (any path) | `https://happyfacesla.com/${1}` | 301 |

Example rule expression (Cloudflare Rules language):

```text
(http.host eq "www.happyfacesla.com") or
(http.host eq "happyfacela.com") or
(http.host eq "www.happyfacela.com")
```

Action: Dynamic redirect to `concat("https://happyfacesla.com", http.request.uri.path)` preserving query string, status 301.

HTTP→HTTPS is automatic when Cloudflare SSL/TLS Edge Certificates and "Always Use HTTPS" are enabled.

`public/_redirects` is committed but intentionally empty of rules; use it only for future path-level redirects (e.g., legacy URLs after content moves).

## QA Command

Run this after a build to verify deploy-critical artifacts and route output:

```bash
npm run build
npm run qa:postbuild
```

The QA script verifies:

- `dist/_redirects` exists
- `dist/robots.txt` exists
- `dist/sitemap-index.xml` exists
- required route HTML files exist in `dist`
- `TBD_BY_OWNER` usage report in built HTML (warning report for launch review)

## Local Cloudflare Pages Dev (Functions)

Use `npm run pages:dev` to run the site with Cloudflare Pages Functions active locally.
This is the only way to test `/api/lead` and `/api/meta-capi` locally — `astro dev` does not run Pages Functions.

### Setup

1. Copy `.dev.vars.example` to `.dev.vars` in the project root:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. Edit `.dev.vars` and set any real local values you want to test.
   Leave `CRM_WEBHOOK_URL` empty to test stub mode.
   `.dev.vars` is gitignored and must never be committed.

3. Start the local Pages server:

   ```bash
   npm run pages:dev
   ```

   This builds the Astro site to `dist/`, then starts `wrangler pages dev dist` on port 8788.
   Pages Functions under `functions/` are automatically served at matching paths.

4. The API endpoint is available at:

   ```text
   http://localhost:8788/api/lead
   ```

### Manual curl test examples

Run against `http://localhost:8788` after starting `npm run pages:dev`.

**Valid lead (expect 200 `{ ok: true, leadId: "..." }`):**

```bash
curl -s -X POST http://localhost:8788/api/lead \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Test",
    "last_name": "User",
    "phone": "818-555-0100",
    "email": "test@example.com",
    "event_date": "2026-08-15",
    "event_start_time": "2:00 PM",
    "event_city": "Los Angeles",
    "event_type": "Birthday Party",
    "services_requested": ["Face Painting"],
    "consent_to_contact": true
  }'
```

**Missing required fields (expect 400 `{ ok: false, errors: {...} }`):**

```bash
curl -s -X POST http://localhost:8788/api/lead \
  -H "Content-Type: application/json" \
  -d '{"first_name": ""}'
```

**Honeypot filled (expect 200 — silent bot trap, no real lead saved):**

```bash
curl -s -X POST http://localhost:8788/api/lead \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Bot",
    "phone": "818-000-0000",
    "email": "bot@example.com",
    "event_date": "2026-08-15",
    "event_city": "Los Angeles",
    "event_type": "Birthday",
    "services_requested": ["Face Painting"],
    "consent_to_contact": true,
    "honeypot": "filled"
  }'
```

**GET returns 405:**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8788/api/lead
```

**Malformed JSON returns 400:**

```bash
curl -s -X POST http://localhost:8788/api/lead \
  -H "Content-Type: application/json" \
  -d 'not-valid-json'
```

**Wrong content type returns 415:**

```bash
curl -s -X POST http://localhost:8788/api/lead \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'first_name=Test'
```

For automated test execution run `./tests/api/lead.sh` (requires bash and curl).

### Function environment behavior

| Condition | Behavior |
| --- | --- |
| `CRM_WEBHOOK_URL` not set + non-production branch | Stub mode: returns `{ ok: true, leadId }` and logs to console |
| `CRM_WEBHOOK_URL` not set + `CF_PAGES_BRANCH=main` | Returns 500 — production must not fake successful delivery |
| `CRM_WEBHOOK_URL` set | Forwards lead to CRM webhook; returns 500 if CRM is unreachable |
| No env secrets in response | Guaranteed — no env values are returned in any response body |

### Launch Notes: Local Runtime Proof (2026-05-16)

Command sequence used:

```bash
npm run pages:dev
./tests/api/lead.sh
```

Windows execution detail (same script):

```powershell
& 'C:\Program Files\Git\bin\bash.exe' ./tests/api/lead.sh
```

Full test output:

```text
PASS  [200] valid lead POST returns 200 with ok+leadId
  ok=true confirmed
PASS  [400] missing required fields returns 400
PASS  [200] honeypot filled silently returns 200 (bot trap)
PASS  [405] GET returns 405
PASS  [405] PUT returns 405
PASS  [400] malformed JSON returns 400
PASS  [415] wrong content type returns 415

Results: 7 passed, 0 failed
```

## Known TBD_BY_OWNER Inputs

- Legal business name
- Public address or service-area-only status
- Insurance / COI details
- Approved package durations and pricing
- Final travel radius and service area list
- Final booking/deposit/cancellation policy
- Verified reviews and links
- Approved photo/video library
- Product safety details

## Production Checklist (Critical)

- Replace all placeholder images in `public/images/placeholders/`
- Replace testimonial placeholders with verified customer reviews
- Connect `functions/api/lead.ts` to CRM and owner/customer notifications
- Verify analytics and ad conversion tracking before running campaigns
- Validate structured data and crawlability in Search Console

## Deployment Gate Checklist

Complete every item before marking the site live. Do not announce a live URL until all gates pass.

### Cloudflare Pages project

- [ ] Cloudflare Pages project created in Cloudflare dashboard
- [ ] GitHub repository connected to Cloudflare Pages
- [ ] Build command set to `npm run build`
- [ ] Output directory set to `dist`
- [ ] Production branch set to `main`
- [ ] Preview deployments enabled for feature branches

### Environment variables

- [ ] `OWNER_NOTIFICATION_EMAIL` configured in Cloudflare Pages project settings
- [ ] `CRM_WEBHOOK_URL` configured (required for production lead delivery)
- [ ] `CRM_WEBHOOK_SECRET` configured if CRM requires HMAC signature
- [ ] `META_PIXEL_ID` and `META_ACCESS_TOKEN` configured for Meta CAPI
- [ ] `GA4_MEASUREMENT_ID` configured
- [ ] `GOOGLE_ADS_CONVERSION_ID` and `GOOGLE_ADS_LEAD_CONVERSION_LABEL` configured
- [ ] No secrets committed to repository; all set via Cloudflare dashboard

### Custom domains

- [ ] `happyfacesla.com` added as custom domain in Cloudflare Pages
- [ ] `www.happyfacesla.com` added as custom domain
- [ ] `happyfacela.com` added as custom domain
- [ ] `www.happyfacela.com` added as custom domain
- [ ] Cloudflare DNS records verified for all four domains

### HTTPS and redirects

- [ ] HTTPS active on all custom domains (Cloudflare SSL/TLS enabled)
- [ ] HTTP-to-HTTPS redirect verified
- [ ] `www.happyfacesla.com` → `https://happyfacesla.com` redirect verified (301)
- [ ] `happyfacela.com` → `https://happyfacesla.com` redirect verified (301)
- [ ] `www.happyfacela.com` → `https://happyfacesla.com` redirect verified (301)
- [ ] Cloudflare dashboard redirect rules configured for domain-level redundancy

### Function and form validation

- [ ] `/api/lead` POST tested on production preview URL — returns `{ ok: true, leadId }`
- [ ] Lead appears in CRM or owner email inbox on test submission
- [ ] Quote form on homepage tested end-to-end on production preview
- [ ] No 500 errors in Cloudflare Pages Functions log

### Build and QA

- [ ] `npm run build` passes with no errors
- [ ] `npm run qa:postbuild` passes with no failures
- [ ] All `TBD_BY_OWNER` placeholders reviewed and replaced or deferred intentionally

### Content and SEO

- [ ] All placeholder images replaced with real brand images
- [ ] All testimonials replaced with verified customer reviews
- [ ] Google Search Console property verified for `happyfacesla.com`
- [ ] Sitemap submitted in Search Console
- [ ] Structured data tested in Google Rich Results Test
