# Happy Faces LA Website

Production-ready Sprint 1 implementation for a static-first local service website:

For full project roadmap, current status, deployment gates, and handoff instructions, see [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md).

Commercial booking/gallery governance status:

P0 DEPLOYMENT SOURCE REGRESSION FIX PASSED — GALLERY V0.3 RESTORED AND QUOTE-REQUEST PROOF PRESERVED — RELEASE STATE GO

Controlled Cloudflare Pages Production deployment `e8f11ebc-f9c1-48ca-a953-b78b32a08780` from reconciled source label `8339378` restored the PR #11 homepage gallery v0.3 baseline after hotfix deployment `94d10a52-52c2-45e2-b593-1a9e9dcfb0d2` regressed the homepage gallery source. Live proof passed: homepage, `/plan-my-party/`, and `/soccer-fan-face-painting-los-angeles/` return 200; Plan My Party CTAs are live; old `Get Quote -> /contact/` sticky CTA is absent; GALLERY-01 through GALLERY-06 appear live; GALLERY-07/GALLERY-08 are not homepage-featured; forbidden old gallery paths and Google Drive hotlinks are absent; all six gallery images return 200 as WebP; and live visual lock passes against `homepage-visual-baseline-v0.3-owner-gallery-20260616`.

The same reconciled deployment preserved quote-request proof. Synthetic proof `HFLA-P0-MAINRECONCILE-20260616T171704` returned `ok=true`, `received=true`, `persisted=true`, lead ID `lead_789c0656c43d48ca86d89dd26641`, scoped D1 exact count `18` with confidence `exact`, Gmail to `info@happyfacesla.com`, and the approved `Happy Faces LA Leads / Leads` Sheets row. `BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001 = CLOSED by P0 deployment source regression fix restoring gallery v0.3 and preserving quote-request proof`.

No card/payment proof was run. No Stripe access, production slot creation, availability seeding, broad D1/KV export, raw Gmail body in evidence, private Sheet URL, Make webhook exposure, secret exposure, DNS/SEO/Ads/GBP action, cache purge, or PII dump occurred.

Previous preserved status:

P0 QUOTE-REQUEST ENDPOINT RECONCILIATION + EXACT CHILD COUNT DEPLOY PASSED — REAL LEAD DELIVERY PROVEN — RELEASE STATE GO

Controlled Cloudflare Pages Production deployment `94d10a52-52c2-45e2-b593-1a9e9dcfb0d2` reconciled live `/api/quote-request` to the accepted durable handler and deployed the exact child-count UX fix. Synthetic proof `HFLA-P0-ENDPOINTFIX-20260616-092836` returned `ok=true`, `received=true`, `persisted=true`, and lead ID `lead_9ab40aac964c41f18f42c5168c39`; scoped D1 proof found exact child count `18` with confidence `exact`; Gmail arrived at `info@happyfacesla.com`; and the approved Google Sheets row was found. `BLK-PUBLIC-P0-REAL-PLAN-MY-PARTY-LEAD-DELIVERY-UNPROVEN-001 = CLOSED by P0 quote-request endpoint reconciliation and exact child count deploy proof`.

No card/payment proof was run. No Stripe access, slot creation, availability seeding, DNS/SEO/Ads/GBP action, Make webhook exposure, secret exposure, raw Gmail body, private Sheet URL, broad production export, or PII dump occurred.

PR #11 MERGED — HOMEPAGE GALLERY V0.3 LIVE VISUAL PROOF PASSED — HOMEPAGE VISUAL/IMAGE BLOCKER CLOSED — RELEASE STATE GO

FINAL GOVERNANCE UPDATED — HOMEPAGE VISUAL/IMAGE BLOCKER CLOSED — RELEASE STATE GO — REAL CARD/PAYMENT PROOF NOT RUN

PR #11 merged into `main` and live proof passed. Merge commit: `31b3ea03940ec49f905a770674c20b342cb99e81`. Cloudflare Production deployment: `ba0824b5-c317-49ae-9456-27f842005994`. Source: `main` / `31b3ea0`. Live proof confirmed the homepage, `/plan-my-party/`, and `/soccer-fan-face-painting-los-angeles/` return 200; Plan My Party CTAs are live; old `Get Quote -> /contact/` sticky CTA is absent; GALLERY-01 through GALLERY-06 appear live; GALLERY-07 and GALLERY-08 are not homepage-featured; old forbidden gallery paths are absent; Google Drive hotlinks are absent; all six gallery image URLs return 200 as WebP; and the live visual lock passes against `homepage-visual-baseline-v0.3-owner-gallery-20260616`.

`BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001 = CLOSED by PR #11 homepage gallery v0.3 live visual proof`. Preserved closed: `BLK-PUBLIC-POST-DEPLOY-INSTANT-QUOTE-COPY-OVERPROMISE-001`, `BLK-PUBLIC-POST-DEPLOY-P1-LIVE-GMAIL-SHEETS-FIELD-VERIFICATION-001`, `BLK-PUBLIC-POST-DEPLOY-AVAILABILITY-SLOTS-NOT-SEEDED-001`, `BLK-PUBLIC-PLAN-MY-PARTY-LEAD-DATA-ENDPOINT-AMBIGUITY-001`, and `BLK-PUBLIC-CANONICAL-HOMEPAGE-NAV-IMAGE-BASELINE-MISMATCH-001`.

Real card/payment proof was not run. No Stripe access, slot creation, availability seeding, D1/KV mutation, Make/Gmail/Sheets action, DNS/SEO/Ads/GBP action, cache purge, secret exposure, or PII dump occurred.

PUBLIC BOOKING POST-DEPLOY P1 CONTROLLED DEPLOY VERIFICATION RESUME NON-PAYMENT CHECKS = PASS — RELEASE STATE GO

The skipped non-payment checks from the controlled deploy verification are now complete. Live deterministic birthday-party Availability Hold reachability works without a pre-seeded D1 slot; the live API returned a Stripe-hosted Checkout URL with `pending_artist_confirmation` and a 20% retainer, but the URL value/session ID was not recorded, no card was entered, and no payment authorization/capture/refund occurred. Live customer copy on `/plan-my-party/` and the synthetic confirmation page says Availability Hold / Not confirmed yet / booking confirmed only after Happy Faces LA confirmation, and forbidden reserved/guaranteed/non-refundable wording is absent. Admin booking and slot endpoints fail closed with missing/wrong tokens. `BLK-PUBLIC-POST-DEPLOY-INSTANT-QUOTE-COPY-OVERPROMISE-001 = CLOSED by live non-payment customer-copy verification`. `BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001 = CLOSED by PR #11 homepage gallery v0.3 live visual proof`. No source-code edit, D1 migration, production slot creation, availability seeding, card entry, payment authorization, payment capture, refund, Stripe Dashboard access, DNS/SEO/Ads/GBP action, Make webhook exposure, secret exposure, raw Stripe object exposure, broad production export, or PII dump occurred.

PUBLIC BOOKING POST-DEPLOY P1 MAKE/GMAIL/SHEETS MAPPING REPAIR V2 = PASS / final-destination field proof passed — RELEASE STATE GO

Make final-destination mapping repair V2 completed in manual/API safe mode only. The `Integration Webhooks` scenario was repaired so Gmail and Google Sheets use the canonical top-level Plan My Party payload fields instead of stale legacy/nested mappings. One synthetic non-customer Plan My Party lead (`HFLA-P1-FINALDEST-20260615-204623`) proved final owner Gmail and Google Sheets field-level delivery with complete canonical fields. `BLK-PUBLIC-POST-DEPLOY-P1-LIVE-GMAIL-SHEETS-FIELD-VERIFICATION-001 = CLOSED by Make/Gmail/Sheets mapping repair V2 final-destination proof`. The later live non-payment verification closed `BLK-PUBLIC-POST-DEPLOY-INSTANT-QUOTE-COPY-OVERPROMISE-001`; PR #11 live proof closed `BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001`. No website deploy, PR, source-code edit, D1 migration, checkout reachability, payment, Stripe access, slot creation, availability seeding, DNS/SEO/Ads/GBP action, homepage/image/visual-guard change, Make webhook exposure, secret exposure, raw Gmail body, private Sheet URL, broad export, customer PII dump, card data, or raw Stripe object exposure occurred in the V2 mapping phase.

PUBLIC WEBSITE HOMEPAGE + SERVICES IMAGE UPDATE = PASS / accepted in source — RELEASE STATE GO

Owner-approved source-only image update accepted: face painting and glitter tattoos service images remain unchanged; Balloon Twisting now uses the owner-selected local WebP asset at `/images/services/happy-faces-la-balloon-twisting-pink-yellow-balloon-animals-outdoor-party-01.webp` with no Google Drive hotlink; Face Gems content remains unchanged and service-card rendering is normalized to the same 4:5 frame on the homepage and `/services/`. `npm run astro -- check`, `npm run build`, `npm run qa:postbuild`, `HFLA_HOMEPAGE_VISUAL_LOCK_MODE=review node tests/post-release/homepage-visual-image-lock.mjs`, and no-secret/release-boundary scan passed. The later PR #11 owner-selected gallery v0.3 live proof closed `BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001`. No deploy, rollback, cache purge, production mutation, Stripe access, checkout/payment action, DNS/SEO/Ads/GitHub action, Make webhook exposure, secret exposure, customer-data export, or PII dump occurred in the source-only image update phase.

PUBLIC WEBSITE HOMEPAGE VISUAL / IMAGE BASELINE GUARD + MOBILE CTA PATCH = PASSED / OWNER IMAGE BASELINE APPROVAL REQUIRED — RELEASE STATE GO

Owner-authorized source-only patch completed: mobile sticky booking CTA now uses `Plan My Party -> /plan-my-party/`; homepage baseline meta marker and `dist/build-manifest.json` generation are installed; build-time and live homepage visual guard scripts are present; and the image manifest inventories every current built homepage image. PR #11 later supplied the owner-selected gallery v0.3 baseline and live proof, so `BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001 = CLOSED by PR #11 homepage gallery v0.3 live visual proof`. `npm run astro -- check`, `npm run build`, `npm run qa:postbuild`, the new guard in explicit review mode, and no-leak/release-boundary scan passed. No deploy, rollback, cache purge, image replacement, production mutation, Stripe access, DNS/SEO/Ads/GitHub action, Make webhook exposure, secret exposure, raw customer data, or PII dump occurred in the source-only guard patch phase.

PUBLIC WEBSITE LIVE HOMEPAGE VISUAL / IMAGE REGRESSION DIAGNOSIS + PERMANENT GUARD PLAN = PASSED / OWNER PATCH OR ROLLBACK DECISION REQUIRED — RELEASE STATE GO

Emergency read-only diagnosis found the live custom domain was serving Cloudflare Pages Production deployment `e598a7a9-835f-4aee-848c-0008e3960023`; no newer Production deployment was observed after it. Cache-busting fetch returned 200 with Cloudflare cache status `DYNAMIC`, and live static homepage image hashes matched local build/public files. Root cause was classified as incomplete homepage visual/image baseline and too-narrow prior verification: the accepted homepage patch locked Plan My Party nav/hero CTA and butterfly hero, but not the full homepage image inventory. PR #11 later merged the owner-selected gallery v0.3 baseline and live visual proof passed, closing `BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001`. No rollback, source/image change during diagnosis, cache purge, DNS/SEO/Ads/GitHub action, Stripe access, production D1/KV mutation, Make webhook exposure, secret exposure, raw customer data, or PII dump occurred.

PUBLIC BOOKING POST-DEPLOY P1 CONTROLLED DEPLOY EXECUTION = PASS / live non-payment verification complete — RELEASE STATE GO

Controlled deploy rerun reached production deployment `e598a7a9-835f-4aee-848c-0008e3960023` and applied D1 migration `0004` to `hfla-availability-production`. Pre-deploy validation, environment gate, migration, deployment, homepage/nav/CTA verification, scoped D1 lead persistence, final Gmail/Google Sheets proof, non-seeded no-card Availability Hold reachability, live customer-copy verification, and admin endpoint guard verification passed. The live copy blocker is CLOSED. This does not authorize or claim real card/payment completion. Public release remains authorized by owner and `RELEASE STATE = GO`.

PUBLIC BOOKING POST-DEPLOY P1 LIVE GMAIL/SHEETS FINAL-DESTINATION PROOF RECONCILIATION = BLOCKED — RELEASE STATE GO

Historical reconciliation of the already-submitted synthetic lead confirmed the split: D1 scoped predicates passed and the deployed endpoint recorded Make-derived success flags, but final owner Gmail/Google Sheets field-level delivery was not independently proven. V2 mapping repair superseded this blocked proof by submitting exactly one new synthetic proof lead and proving complete final-destination fields in Gmail and Sheets.

PUBLIC-BOOKING POST-DEPLOY P1 CONDITIONAL RETAINER HOLD NON-SEEDED MODEL REMEDIATION = PASS / accepted — RELEASE STATE GO

Public release remains authorized by owner and `RELEASE STATE = GO`. P0 field-mapping, UI-regression, and Stripe webhook metadata remain accepted and closed; the P1 source-baseline blocker remains CLOSED. The earlier P1 conditional retainer hold source was NOT accepted because it still required seeded D1 availability. The owner-authorized non-seeded model remediation is accepted in source and was included in the controlled deploy rerun: deterministic birthday-party requests can place a manual-capture 20% Availability Hold without a pre-seeded slot, while matching unsafe seeded slots still fail closed and seeded open slots still preserve D1 conflict protection. The old `$150/$30` proof-only live policy was replaced with a deterministic birthday-party hold policy. Source proofs pass: non-seeded/seeded/manual-review/live-policy checkout contract 18/18, manual-capture 10/10, artist-confirmed 8/8, artist-unavailable 9/9, pricing matrix 6/6, exclusion 7/7, copy 13/13, canonical model 26/26, canonical endpoints 17/17, delivery 12/12, metadata 12/12, `npm run astro -- check`, `npm run build`, `npm run qa:postbuild`, no-leak/release-boundary, and homepage/nav/image lock. Live non-payment verification now proves no-card reachability and safe customer copy. `BLK-PUBLIC-POST-DEPLOY-AVAILABILITY-SLOTS-NOT-SEEDED-001 = CLOSED as hard checkout prerequisite by accepted non-seeded conditional hold model; optional seeded slots may still be used later for capacity optimization and conflict protection.` `BLK-PUBLIC-POST-DEPLOY-INSTANT-QUOTE-COPY-OVERPROMISE-001 = CLOSED by live non-payment customer-copy verification`.

Plan My Party lead-data completeness remediation is `PASS / accepted` (auditor accepted 2026-06-15 after the `preferredContactMethod` type-contract fix). `/api/quote-request` and `/api/lead` feed one canonical Plan My Party lead model; child count, design style, duration, travel, contact preference, attribution, and system recommendations are preserved; customer budget is separated from system-calculated pricing. `BLK-PUBLIC-PLAN-MY-PARTY-LEAD-DATA-ENDPOINT-AMBIGUITY-001 = CLOSED by canonical Plan My Party lead model unification`. The source and D1 migration `0004` were deployed in the controlled rerun; final Gmail/Google Sheets field-level delivery is now proven by V2 mapping repair.

The P1 controlled deploy has completed the remaining non-payment live verification sequence. Final Gmail/Google Sheets field-level proof is passed by Make/Gmail/Sheets mapping repair V2, non-seeded Availability Hold reachability is proven without card entry, live customer copy is verified, and admin endpoints fail closed with missing/wrong tokens. No rollback, slot creation, availability seeding, card entry, payment authorization, payment capture, refund, Stripe Dashboard access, DNS/custom-domain change, SEO/indexing work, Ads/social/GBP action, GitHub/remote Git action, Make webhook exposure, secret exposure, card-data exposure, raw Stripe object exposure, broad production customer-record export, or PII dump occurred after the deploy stop condition.

Homepage baseline (2026-06-15): `PUBLIC WEBSITE CANONICAL HOMEPAGE / NAV / IMAGE BASELINE MINIMAL RECONSTRUCTION PATCH ACCEPTED — RELEASE STATE GO` (auditor accepted 2026-06-15). The homepage now surfaces "Plan My Party" as its primary hero CTA and as a desktop+mobile nav item (→ `/plan-my-party/`), matching the accepted live presentation. Minimal change: only `src/data/navigation.ts` + `src/pages/index.astro`; butterfly hero, global styles, and images preserved. The controlled deploy rerun verified the live homepage/nav/CTA baseline on the custom domain. `BLK-PUBLIC-CANONICAL-HOMEPAGE-NAV-IMAGE-BASELINE-MISMATCH-001 = CLOSED by canonical homepage/nav minimal reconstruction patch`.

- Canonical domain: <https://happyfacesla.com>
- Redirect domain: <https://happyfacela.com>
- Phone: (310) 800-2860
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
