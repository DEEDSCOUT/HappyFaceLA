# Happy Faces LA Project Roadmap

This file is the canonical project source of truth. Every developer, Copilot agent, and new ChatGPT session must read this file before making changes and update it after completing meaningful work.

Do not store secrets, API tokens, CRM webhook secrets, private owner data, private addresses, or unpublished customer details in this file.

## Mandatory Update Rule

After every completed task, update this file with:

- what changed
- files changed
- commands run
- validation result
- remaining blockers
- next required action
- whether production status changed

## Latest Session Log

- Cloudflare Pages first deployment succeeded.
- Preview URL: <https://happyfacesla.pages.dev>
- Repository: <https://github.com/DEEDSCOUT/HappyFaceLA>
- Local Pages Functions test passed: 7 passed, 0 failed.
- happyfacesla.com and happyfacela.com are active/protected in Cloudflare.
- Production launch remains blocked by:
  - environment variables
  - CRM_WEBHOOK_URL / lead destination
  - custom domain binding
  - redirect rules
  - preview /api/lead test
  - production /api/lead test
  - real lead delivery verification

## Project Facts

| Field | Value |
| --- | --- |
| Brand | Happy Faces LA |
| Canonical domain | <https://happyfacesla.com> |
| Redirect domain | `happyfacela.com` -> <https://happyfacesla.com/> |
| GitHub repository | <https://github.com/DEEDSCOUT/HappyFaceLA> |
| Cloudflare Pages preview | <https://happyfacesla.pages.dev> |
| Phone | 818-619-5506 |
| Instagram | <https://www.instagram.com/happyfacesla> |
| Core services | Face painting, balloon twisting, glitter tattoos, face jewelry / face gems |
| Target geography | Los Angeles and surrounding LA-area cities/neighborhoods |
| Revenue goal | $20k-$30k/month or more |
| Hosting target | Cloudflare Pages |
| DNS target | Cloudflare DNS for both domains |
| Production branch | main |
| Build command | npm run build |
| Output directory | dist |

## Current Deployment Status

Cloudflare Pages first deployment has succeeded for the GitHub repository.

Current status:

- Repository pushed to GitHub: complete.
- Cloudflare Pages project: deployed from dashboard.
- Preview URL: <https://happyfacesla.pages.dev>
- happyfacesla.com: active/protected in Cloudflare.
- happyfacela.com: active/protected in Cloudflare.
- Production deployment: not complete.

Production is not complete until all of these are verified:

- custom domains attached in Cloudflare Pages
- HTTPS active on production custom domains
- redirects pass with 301 status
- required environment variables configured
- /api/lead works on preview URL
- /api/lead works on production domain
- real lead delivery is configured and verified, not local/dev stub mode

Do not mark the site production-live until the full production launch gate passes.

## Current Blockers

- Confirm whether Cloudflare Pages environment variables are configured.
- Configure real CRM_WEBHOOK_URL or another approved lead destination.
- Bind happyfacesla.com to Cloudflare Pages and verify HTTPS.
- Bind happyfacela.com to Cloudflare Pages or configure zone-level redirect to canonical.
- Configure Cloudflare dashboard Redirect Rules for hostname canonicalization.
- Test preview URL homepage and core pages.
- Test /api/lead on Cloudflare preview URL.
- Test /api/lead on production domain after custom domain binding.
- Verify real lead delivery reaches CRM, owner notification inbox, or approved temporary destination.
- Replace or intentionally defer customer-facing TBD_BY_OWNER placeholders before final launch.

## Owner Inputs Needed

Owner must provide or approve:

- legal business name
- public address or service-area-only status
- owner notification email
- CRM choice: HighLevel, HoneyBook, HubSpot, Airtable, Make/Zapier webhook, or temporary email-only capture
- production CRM_WEBHOOK_URL or approved lead destination
- CRM webhook secret if required by selected provider
- real gallery photo/video folder
- verified reviews and testimonial links
- pricing/package rules
- deposit, cancellation, rescheduling, travel, overtime, and weather policies
- insurance / COI status
- exact cities/neighborhoods served
- product/safety details: paint brands, glitter type, hygiene rules
- Google review link when available

Unknown owner-specific facts must remain marked as TBD_BY_OWNER. Do not invent prices, testimonials, addresses, review counts, insurance claims, or awards.

## Developer Next Actions

Next actions are deployment validation only. Do not add new features.

1. Test the Cloudflare Pages preview URL: <https://happyfacesla.pages.dev>
2. Test /api/lead on preview with valid payload, invalid payload, honeypot, malformed JSON, and non-POST method.
3. Confirm whether Cloudflare Pages env vars are configured.
4. Attach custom domains in Cloudflare Pages.
5. Configure Cloudflare dashboard Redirect Rules for hostname canonicalization.
6. Verify happyfacesla.com loads production site over HTTPS.
7. Verify `happyfacela.com`, `www.happyfacela.com`, and `www.happyfacesla.com` redirect to <https://happyfacesla.com/> with 301 status.
8. Test /api/lead on <https://happyfacesla.com/api/lead> after custom domain binding.
9. Verify real lead delivery, not stub mode.
10. Update this file with commands run, validation results, blockers, and production status.

## Cloudflare Status

Cloudflare state known as of 2026-05-16:

- happyfacesla.com is active/protected in Cloudflare.
- happyfacela.com is active/protected in Cloudflare.
- Cloudflare Pages first deployment succeeded.
- Preview URL is <https://happyfacesla.pages.dev>.
- Cloudflare dashboard deployment is the active deployment path.
- Wrangler CLI deploy from local machine is not required.
- Do not run wrangler login unless explicitly requested.

Cloudflare Pages settings:

- Repository: DEEDSCOUT/HappyFaceLA
- Framework preset: Astro
- Build command: npm run build
- Output directory: dist
- Production branch: main

Redirect strategy:

- Cloudflare Pages _redirects does not support absolute source hostnames.
- Hostname canonicalization must be configured with Cloudflare dashboard Redirect Rules at the zone level.
- Required canonical target: <https://happyfacesla.com>
- Required source hostnames:
  - `www.happyfacesla.com`
  - `happyfacela.com`
  - `www.happyfacela.com`

## Lead Capture / CRM Status

Current implementation:

- Quote form posts JSON to /api/lead.
- Production lead endpoint is functions/api/lead.ts.
- Astro src/pages/api/* files are non-production stubs only.
- Cloudflare Pages Functions local runtime test passed: 7 passed, 0 failed.
- Local/dev can run in stub mode without CRM_WEBHOOK_URL.
- Production must not fake successful delivery without CRM_WEBHOOK_URL or another configured delivery provider.
- Server responses must not expose environment secrets.

Validated local runtime test output:

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

Pending lead delivery gate:

- Select and configure real lead destination.
- Configure Cloudflare Pages env vars.
- Submit test lead through preview URL.
- Submit test lead through production domain.
- Confirm lead arrives in real destination.
- Confirm production response is not stubbed.

## SEO / Content Status

Implemented foundation:

- Astro static-first site.
- Tailwind CSS v4.
- @astrojs/sitemap configured.
- robots.txt exists.
- sitemap generated during build.
- canonical domain set to <https://happyfacesla.com>.
- schema utilities and SEO components exist.
- core service pages exist.
- event-type pages exist.
- pricing, gallery, reviews, FAQ, contact, privacy policy, booking policy, and 404 pages exist.
- service-area hub and initial city pages exist.
- phone and SMS CTAs exist.
- tracking hooks and attribution persistence exist.

Current content risk:

- TBD_BY_OWNER appears in built HTML as an intentional placeholder policy.
- Placeholder images and testimonial placeholders must be replaced or intentionally deferred before final production launch.
- Do not add fake local claims, fake reviews, fake address, fake ratings, fake aggregateRating, fake awards, or fake insurance/licensing claims.

Initial required routes:

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

## Non-Negotiables

- Do not split authority across both domains.
- Do not create authentication, accounts, dashboards, or user profile functionality.
- Do not fake reviews.
- Do not create fake local addresses.
- Do not create fake testimonials.
- Do not create mass thin city pages.
- Do not launch ads without conversion tracking.
- Do not publish child photos without guardian permission.
- Do not hide all pricing context.
- Do not bury the phone number.
- Do not rely only on Instagram.
- Do not treat SEO as a one-time task.
- Do not store secrets in code, README, or this roadmap.
- Do not mark production complete until domains, redirects, env vars, /api/lead, and real delivery are verified.

## Architecture Snapshot

Stack:

- Astro + TypeScript
- Tailwind CSS v4
- Cloudflare Pages
- Cloudflare Pages Functions
- Wrangler for local Pages runtime tests
- GA4 / Google Ads / Meta tracking hooks ready for configuration

Important files:

- README.md
- PROJECT_ROADMAP.md
- package.json
- astro.config.mjs
- wrangler.toml
- public/robots.txt
- public/_redirects
- functions/api/lead.ts
- functions/api/meta-capi.ts
- scripts/qa-postbuild.mjs
- tests/api/lead.sh
- tests/api/lead.mjs
- src/data/business.ts
- src/data/services.ts
- src/data/locations.ts
- src/data/packages.ts
- src/data/faqs.ts
- src/data/navigation.ts
- src/data/tracking.ts
- src/layouts/BaseLayout.astro
- src/components/conversion/QuoteForm.astro
- src/utils/schema.ts
- src/utils/tracking.ts

Validated commands:

```bash
npm run build
npm run qa:postbuild
npm run pages:dev
./tests/api/lead.sh
```

Windows test execution detail:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' ./tests/api/lead.sh
```

## Build And Validation History

Latest known successful validation:

- npm run build: passed.
- npm run qa:postbuild: passed.
- npm run pages:dev: started local Cloudflare Pages runtime successfully.
- ./tests/api/lead.sh: 7 passed, 0 failed.
- GitHub push: complete.
- Cloudflare Pages first deployment: succeeded.

Known warnings:

- qa:postbuild reports TBD_BY_OWNER in built HTML pages. This is expected until owner content is provided or placeholders are intentionally approved for launch.

## Change Log / Session Log

### 2026-05-16 - Production custom domain validation and /api/lead matrix

What changed:

- Validated production custom domains happyfacesla.com and www.happyfacesla.com.
- Ran full 7-case /api/lead matrix against https://happyfacesla.com/api/lead.
- Confirmed Make/Sheets/Gmail pipeline live on production domain (valid POST lead sent).
- Note: `consent_to_contact: true` is required in production payloads; updated test matrix to include it.

Files changed:

- PROJECT_ROADMAP.md

Commands run:

```powershell
curl -sI https://happyfacesla.com | Select-String -Pattern "HTTP/|location:"
curl -sI https://www.happyfacesla.com | Select-String -Pattern "HTTP/|location:"
node -e "fetch() 7-case matrix against https://happyfacesla.com/api/lead"
```

Validation result:

- https://happyfacesla.com: HTTP/1.1 200 OK (no redirect, serves site directly)
- https://www.happyfacesla.com: HTTP/1.1 200 OK (no redirect, serves site directly — www currently independent, NOT redirecting to apex)
- /api/lead results on https://happyfacesla.com/api/lead:
  - GET -> 405 {"ok":false,"error":"Method not allowed"}
  - PUT -> 405 {"ok":false,"error":"Method not allowed"}
  - valid POST -> 200 {"ok":true,"leadId":"f22c48cf-d47f-4023-b238-d8133a2f2831"}
  - missing required fields -> 400 with safe field-level errors
  - honeypot -> 200 silent trap with leadId
  - malformed JSON -> 400 {"ok":false,"error":"Invalid JSON payload"}
  - wrong content-type -> 415 {"ok":false,"error":"Unsupported media type"}
- Production domain /api/lead: 7/7 PASS
- Make/Sheets/Gmail delivery: pending owner confirmation of lead f22c48cf arriving

Redirect status (action required):

- www.happyfacesla.com currently returns 200 independently (no redirect to apex)
- Cloudflare dashboard Redirect Rules must be configured to enforce canonical:
  - www.happyfacesla.com -> https://happyfacesla.com/ (301)
  - happyfacela.com -> https://happyfacesla.com/ (301)
  - www.happyfacela.com -> https://happyfacesla.com/ (301)

Remaining blockers:

- Configure Cloudflare dashboard Redirect Rules for www.happyfacesla.com, happyfacela.com, www.happyfacela.com -> https://happyfacesla.com/ (301)
- Verify happyfacela.com and www.happyfacela.com currently resolve/redirect correctly
- Owner to confirm lead f22c48cf appears in Make/Sheets/Gmail

Next required action:

- Configure Cloudflare Redirect Rules for the three source hostnames above.
- Verify each returns 301 to https://happyfacesla.com/.
- Update roadmap after redirect verification.

Production status changed:

- no — site is live and /api/lead is working on production domain; canonical redirect rules still required before final go-live

### 2026-05-16 - Fresh production webhook retest and delivery confirmation

What changed:

- Retested full preview /api/lead matrix after Cloudflare Pages redeploy with fresh private production `CRM_WEBHOOK_URL`.
- Confirmed expected endpoint behavior for valid/invalid/honeypot/malformed/content-type/method checks.
- Confirmed production webhook path is active (private URL configured in Cloudflare, not the previously exposed test webhook).
- Confirmed external delivery chain for live website lead flow: Make history, Google Sheets row, and Gmail notification.

Files changed:

- PROJECT_ROADMAP.md

Commands run:

```bash
node -e "fetch() matrix for GET/PUT/valid/invalid/honeypot/malformed/content-type against https://happyfacesla.pages.dev/api/lead"
```

Validation result:

- /api/lead results on preview:
  - GET -> 405 Method not allowed
  - PUT -> 405 Method not allowed
  - valid POST -> 200 {"ok":true,"leadId":"4522d31a-e43a-4bac-b35f-9c1f71cedcaa"}
  - invalid required fields -> 400 with safe field-level errors
  - honeypot -> 200 silent trap with leadId
  - malformed JSON -> 400 Invalid JSON payload
  - unsupported content type -> 415 Unsupported media type
- Production webhook path confirmed: yes.
- Make delivery confirmed: yes.
- Google Sheets delivery confirmed: yes.
- Gmail delivery confirmed: yes.

Remaining blockers:

- custom domains
- redirects
- production-domain /api/lead validation

Next required action:

- Complete custom domain attachment and redirect checks, then run /api/lead matrix on production domain.

Production status changed:

- no

### 2026-05-16 - Make pipeline delivery confirmed (test webhook)

What changed:

- Owner confirmed end-to-end Make pipeline delivery using test webhook payloads.
- Confirmed flow: Webhook -> Google Sheets -> Gmail.
- Confirmed mapped values arrive in Make history, Google Sheets row, and Gmail notification.
- Marked exposed test webhook as non-production and scheduled rotation to a fresh private production webhook URL.

Files changed:

- PROJECT_ROADMAP.md

Commands run:

```powershell
Invoke-RestMethod -Uri $webhookUrl -Method POST -ContentType "application/json" -Body $body
```

Validation result:

- Make delivery path is validated for test pipeline.
- Google Sheets receives real mapped values.
- Gmail sends real mapped values.
- Production webhook value must be replaced with a fresh private URL before final go-live.

Remaining blockers:

- Owner to provide fresh private production Make webhook URL.
- Update Cloudflare `CRM_WEBHOOK_URL` to fresh private value.
- Redeploy Cloudflare Pages after variable update.
- Confirm Make scenario is ON.
- Rerun full preview /api/lead matrix after redeploy.
- Confirm new valid lead appears in Make history, Google Sheets, and Gmail using production webhook.
- Complete production custom-domain, redirects, and production-domain /api/lead checks.

Next required action:

- Wait for owner confirmation that fresh production webhook is configured and deployment redeployed, then rerun preview /api/lead validation immediately.

Production status changed:

- no

### 2026-05-16 - Post-redeploy preview /api/lead validation

What changed:

- Retested preview endpoint after Cloudflare Pages redeploy with production environment variables configured.
- Executed full /api/lead matrix against <https://happyfacesla.pages.dev/api/lead>.

Files changed:

- PROJECT_ROADMAP.md

Commands run:

```bash
node -e "fetch() matrix for GET/PUT/valid/invalid/honeypot/malformed/content-type against https://happyfacesla.pages.dev/api/lead"
```

Cloudflare env vars configured:

- yes (per owner/deployment report)

Redeploy result:

- Cloudflare Pages redeploy succeeded.
- Build passed.
- Functions directory found/uploaded.
- Worker compiled successfully.
- Assets published.
- Site deployed successfully.

/api/lead result:

- GET -> 405 Method not allowed
- PUT -> 405 Method not allowed
- valid POST -> 200 {"ok":true,"leadId":"c82b453c-2136-4a7b-89e5-151208a4d9d1"}
- invalid required fields -> 400 with safe field-level errors
- honeypot -> 200 silent trap with leadId
- malformed JSON -> 400 Invalid JSON payload
- unsupported content type -> 415 Unsupported media type

Make delivery result:

- pending owner confirmation (external system)

Google Sheet result:

- pending owner confirmation (external system)

Gmail result:

- pending owner confirmation (external system)

Validation result:

- Preview endpoint behavior matches expected post-env configuration matrix.
- Valid lead submissions no longer return 500 on preview.

Remaining blockers:

- Confirm Make scenario is ON at test time.
- Confirm tested valid lead reached Make scenario history.
- Confirm Google Sheet row was created with real values.
- Confirm Gmail notification was sent with real values.
- Complete custom domain attachment and redirect verification on production domain.
- Retest /api/lead on production custom domain once domain binding/redirect checks are complete.

Next required action:

- Verify delivery in Make, Google Sheets, and Gmail for leadId `c82b453c-2136-4a7b-89e5-151208a4d9d1`, then run production-domain /api/lead test.

Production status changed:

- no

### 2026-05-16 - Cloudflare Pages preview validation

What changed:

- Ran manual preview validation on <https://happyfacesla.pages.dev>.
- Inspected homepage, navigation, mobile sticky CTA visibility, contact quote form rendering, service page, pricing page, gallery page, and contact page.
- Verified required core preview routes return HTTP 200.
- Ran /api/lead preview validation matrix for GET, PUT, valid payload, invalid required fields, honeypot, malformed JSON, and unsupported content type.

Files changed:

- PROJECT_ROADMAP.md

Commands run:

```bash
# Route matrix
powershell -Command "Invoke-WebRequest route checks against https://happyfacesla.pages.dev"

# /api/lead preview matrix
node -e "fetch() matrix for GET/PUT/valid/invalid/honeypot/malformed/content-type"
```

Validation result:

- Preview homepage and navigation render correctly.
- Contact quote form renders all required fields and submit button.
- Sticky mobile CTA links (Call, Text, Get Quote) are present on preview pages.
- Required core routes all returned 200:
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
  - /faq/
  - /contact/
  - /service-areas/
- /api/lead preview results:
  - GET -> 405 Method not allowed
  - PUT -> 405 Method not allowed
  - valid POST -> 500 {"ok":false,"error":"Lead capture backend is not configured"}
  - invalid required fields -> 400 with safe field-level errors
  - honeypot payload -> 200 with {"ok":true,"leadId":"..."}
  - malformed JSON -> 400 Invalid JSON payload
  - wrong content type -> 415 Unsupported media type
- The valid POST 500 is expected when deployment uses production branch behavior and `CRM_WEBHOOK_URL` is not configured; this is not treated as a code bug at this stage.

Remaining blockers:

- Configure Cloudflare Pages production environment variables.
- Configure real `CRM_WEBHOOK_URL` or approved lead destination.
- Attach and verify custom production domains in Pages.
- Configure and verify zone-level hostname redirect rules.
- Retest /api/lead valid POST after env vars are configured and main is redeployed.
- Verify real lead delivery reaches destination (non-stub) on preview/production checks.

Next required action:

- Configure Cloudflare Pages env vars (`CRM_WEBHOOK_URL` minimally), redeploy main, then retest valid /api/lead expecting 200 with `{ ok: true, leadId }`.

Production status changed:

- No. Production remains not complete.

### 2026-05-16 - Canonical roadmap tracker added

What changed:

- Added PROJECT_ROADMAP.md as the canonical project source of truth and handoff tracker.
- Linked README.md to PROJECT_ROADMAP.md near the top.
- Recorded Cloudflare Pages first deployment status and preview URL.
- Recorded remaining production launch blockers.

Files changed:

- PROJECT_ROADMAP.md
- README.md

Commands run:

- git add PROJECT_ROADMAP.md README.md
- git commit -m "docs: add canonical project roadmap and status tracker"
- git push

Validation result:

- Documentation-only change. No build required for behavior.
- No secrets added.

Remaining blockers:

- Configure production environment variables.
- Configure real lead destination.
- Attach custom domains.
- Configure and test redirects.
- Test /api/lead on preview and production domains.
- Verify real lead delivery.

Next required action:

- Test the Cloudflare Pages preview URL and /api/lead once deployment details/env status are available.

Production status changed:

- No. Production remains not complete.

### 2026-05-16 - Cloudflare local runtime proof and GitHub push

What changed:

- Added Wrangler/local Pages dev support.
- Added Cloudflare Pages Functions API test scripts.
- Validated /api/lead in local Cloudflare Pages runtime.
- Pushed repository to GitHub.

Files changed:

- package.json
- package-lock.json
- wrangler.toml
- .dev.vars.example
- .gitignore
- README.md
- tests/api/lead.sh
- tests/api/lead.mjs
- functions/api/lead.ts
- functions/api/meta-capi.ts
- related site scaffold files

Commands run:

```bash
npm run pages:dev
./tests/api/lead.sh
npm run build
npm run qa:postbuild
git add -A
git commit -m "chore: finalize Cloudflare local runtime proof and deployment prep"
git push
```

Validation result:

- Local Pages Functions test passed: 7 passed, 0 failed.
- Build passed.
- Post-build QA passed.

Remaining blockers:

- Production Cloudflare env vars.
- Real lead destination.
- Custom domain binding.
- Redirect verification.
- Preview and production /api/lead tests.

Production status changed:

- No. Deployment prep completed, but production was not live.

### 2026-05-16 - Sprint 2 baseline accepted

What changed:

- Implemented Cloudflare Pages Functions backend for lead capture and Meta CAPI shell.
- Updated QuoteForm to submit with fetch to /api/lead.
- Added tracking hooks and attribution persistence.
- Added env template and post-build QA.
- Marked Astro API routes as non-production stubs.

Validation result:

- npm run build passed.
- npm run qa:postbuild passed.

Production status changed:

- No. Sprint 2 code was accepted as baseline only.

### 2026-05-16 - Sprint 1 scaffold and Cloudflare hosting prep

What changed:

- Built static-first Astro site scaffold.
- Added required pages, components, data files, SEO helpers, schema helpers, sitemap, robots, and placeholder assets.
- Documented Cloudflare Pages hosting target and canonical domain strategy.

Validation result:

- npm run build passed.

Production status changed:

- No. Hosting prep only.
