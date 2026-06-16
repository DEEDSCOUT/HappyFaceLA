# Current Commercial Booking Status

Date: 2026-06-16
Release state: GO

## Current / Next Action

`P0 DEPLOYMENT SOURCE REGRESSION FIX PASSED — GALLERY V0.3 RESTORED AND QUOTE-REQUEST PROOF PRESERVED — RELEASE STATE GO`

The post-PR11 P0 endpoint hotfix deployment `94d10a52-52c2-45e2-b593-1a9e9dcfb0d2` from source label `47b789a` preserved quote-request delivery but regressed the homepage gallery because it did not include the accepted PR #11 v0.3 gallery baseline. A clean reconciled branch `p0-main-reconcile-quote-request-and-gallery-v03-20260616` was created from latest `origin/main` and made to contain both PR #11 gallery v0.3 and the durable quote-request/exact child-count hotfix.

Controlled Cloudflare Pages Production deployment `e8f11ebc-f9c1-48ca-a953-b78b32a08780` from source label `8339378` restored the v0.3 gallery and preserved quote-request proof. Live custom-domain visual proof passed against `homepage-visual-baseline-v0.3-owner-gallery-20260616`: homepage, `/plan-my-party/`, and `/soccer-fan-face-painting-los-angeles/` return 200; Plan My Party CTAs are live; old `Get Quote -> /contact/` sticky CTA is absent; GALLERY-01 through GALLERY-06 appear live; GALLERY-07 and GALLERY-08 are not homepage-featured; old forbidden gallery paths and Google Drive hotlinks are absent; all six gallery image URLs return 200 as WebP.

One persisted synthetic non-customer proof lead `HFLA-P0-MAINRECONCILE-20260616T171704` returned `ok=true`, `received=true`, `persisted=true`, and lead ID `lead_789c0656c43d48ca86d89dd26641`. Scoped D1 proof in `hfla-availability-production` found one matching row, exact child count `18`, child count confidence `exact`, canonical payload token coverage, and delivery flags true. Gmail arrived at `info@happyfacesla.com`; the approved Google Sheets row was found in `Happy Faces LA Leads / Leads`. Raw Gmail body, private Sheet URL, Make webhook URL, secret values, broad D1/Sheets records, and PII were not recorded.

`BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001 = CLOSED by P0 deployment source regression fix restoring gallery v0.3 and preserving quote-request proof`.

No card/payment proof was run. No Stripe access, production slot creation, availability seeding, broad D1/KV export, raw Stripe object exposure, DNS/SEO/Ads/GBP action, cache purge, Make webhook exposure, secret exposure, raw Gmail body in evidence, private Sheet URL, or PII dump occurred.

Previous preserved status:

`P0 QUOTE-REQUEST ENDPOINT RECONCILIATION + EXACT CHILD COUNT DEPLOY PASSED — REAL LEAD DELIVERY PROVEN — RELEASE STATE GO`

Production `/api/quote-request` was reconciled to the accepted durable handler by controlled Cloudflare Pages Production deployment `94d10a52-52c2-45e2-b593-1a9e9dcfb0d2` from local P0 hotfix branch `p0-quote-request-endpointfix-20260616` / source label `47b789a`. The prior production deployment `ba0824b5-c317-49ae-9456-27f842005994` (`main` / `31b3ea0`) was serving a stale/thin quote-request handler that could return non-durable success.

One synthetic non-customer proof lead `HFLA-P0-ENDPOINTFIX-20260616-092836` returned `ok=true`, `received=true`, `persisted=true`, and lead ID `lead_9ab40aac964c41f18f42c5168c39`. Scoped D1 proof in `hfla-availability-production` found one matching row by proof token/lead ID, exact child count `18`, child count confidence `exact`, and canonical payload coverage. Make delivery was proven by endpoint delivery flags plus final owner Gmail and Google Sheets destinations. Gmail proof showed recipient `info@happyfacesla.com`; Sheets proof found the approved `Happy Faces LA Leads / Leads` row. Raw Gmail body, private Sheet URL, Make webhook URL, secret values, broad D1/Sheets records, and PII were not recorded.

`BLK-PUBLIC-P0-REAL-PLAN-MY-PARTY-LEAD-DELIVERY-UNPROVEN-001 = CLOSED by P0 quote-request endpoint reconciliation and exact child count deploy proof`.

No card/payment proof was run. No Stripe access, slot creation, availability seeding, DNS/SEO/Ads/GBP action, Make webhook exposure, secret exposure, raw Stripe object exposure, broad production export, or PII dump occurred.

`PR #11 MERGED — HOMEPAGE GALLERY V0.3 LIVE VISUAL PROOF PASSED — HOMEPAGE VISUAL/IMAGE BLOCKER CLOSED — RELEASE STATE GO`

`FINAL GOVERNANCE UPDATED — HOMEPAGE VISUAL/IMAGE BLOCKER CLOSED — RELEASE STATE GO — REAL CARD/PAYMENT PROOF NOT RUN`

PR #11 merged into `main` and live proof passed. Merge commit: `31b3ea03940ec49f905a770674c20b342cb99e81`. Cloudflare Production deployment: `ba0824b5-c317-49ae-9456-27f842005994`. Source: `main` / `31b3ea0`.

Live proof confirmed:

- homepage returns 200
- `/plan-my-party/` returns 200
- `/soccer-fan-face-painting-los-angeles/` returns 200
- Plan My Party CTAs are live
- old `Get Quote -> /contact/` sticky CTA is absent
- GALLERY-01 through GALLERY-06 appear live
- GALLERY-07 and GALLERY-08 are not homepage-featured
- old forbidden gallery paths are absent
- Google Drive hotlinks are absent
- all six gallery image URLs return 200 as WebP
- live visual lock passes against `homepage-visual-baseline-v0.3-owner-gallery-20260616`

`BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001 = CLOSED by PR #11 homepage gallery v0.3 live visual proof`. Preserved closed: `BLK-PUBLIC-POST-DEPLOY-INSTANT-QUOTE-COPY-OVERPROMISE-001`, `BLK-PUBLIC-POST-DEPLOY-P1-LIVE-GMAIL-SHEETS-FIELD-VERIFICATION-001`, `BLK-PUBLIC-POST-DEPLOY-AVAILABILITY-SLOTS-NOT-SEEDED-001`, `BLK-PUBLIC-PLAN-MY-PARTY-LEAD-DATA-ENDPOINT-AMBIGUITY-001`, and `BLK-PUBLIC-CANONICAL-HOMEPAGE-NAV-IMAGE-BASELINE-MISMATCH-001`.

Real card/payment proof was not run. No Stripe access, slot creation, availability seeding, D1/KV mutation, Make/Gmail/Sheets action, DNS/SEO/Ads/GBP action, cache purge, secret exposure, or PII dump occurred.

`PUBLIC BOOKING POST-DEPLOY P1 CONTROLLED DEPLOY VERIFICATION RESUME NON-PAYMENT CHECKS = PASS — RELEASE STATE GO`

The skipped non-payment checks from the controlled deploy verification are complete. Live deterministic birthday-party Availability Hold reachability works without a pre-seeded D1 slot; a Stripe-hosted Checkout URL was returned with `pending_artist_confirmation` and a 20% retainer, but the URL value/session ID was not recorded, no card was entered, and no payment authorization/capture/refund occurred. Live customer copy on `/plan-my-party/` and the synthetic confirmation page says Availability Hold / Not confirmed yet / booking confirmed only after Happy Faces LA confirmation, and forbidden reserved/guaranteed/non-refundable wording is absent. Admin booking and slot endpoints fail closed with missing/wrong tokens. `BLK-PUBLIC-POST-DEPLOY-INSTANT-QUOTE-COPY-OVERPROMISE-001 = CLOSED by live non-payment customer-copy verification`. `BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001 = CLOSED by PR #11 homepage gallery v0.3 live visual proof`. No source-code edit, D1 migration, production slot creation, availability seeding, card entry, payment authorization, payment capture, refund, Stripe Dashboard access, DNS/SEO/Ads/GBP action, Make webhook exposure, secret exposure, raw Stripe object exposure, broad production export, or PII dump occurred.

`PUBLIC BOOKING POST-DEPLOY P1 MAKE/GMAIL/SHEETS MAPPING REPAIR V2 = PASS / final-destination field proof passed — RELEASE STATE GO`

Make final-destination mapping repair V2 completed in manual/API safe mode only. The `Integration Webhooks` scenario now maps Gmail and Google Sheets from canonical top-level Plan My Party payload fields. One synthetic non-customer Plan My Party lead (`HFLA-P1-FINALDEST-20260615-204623`) proved final owner Gmail and Google Sheets field-level delivery with complete canonical fields. `BLK-PUBLIC-POST-DEPLOY-P1-LIVE-GMAIL-SHEETS-FIELD-VERIFICATION-001 = CLOSED by Make/Gmail/Sheets mapping repair V2 final-destination proof`. The later live non-payment verification closed `BLK-PUBLIC-POST-DEPLOY-INSTANT-QUOTE-COPY-OVERPROMISE-001`; PR #11 live proof closed `BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001`.

`PUBLIC WEBSITE HOMEPAGE + SERVICES IMAGE UPDATE = PASS / accepted in source — RELEASE STATE GO`

Owner-approved source-only image update accepted: face painting and glitter tattoos service images remain unchanged; Balloon Twisting now uses the owner-selected local WebP asset at `/images/services/happy-faces-la-balloon-twisting-pink-yellow-balloon-animals-outdoor-party-01.webp` with no Google Drive hotlink; Face Gems content remains unchanged and service-card rendering is normalized to the same 4:5 frame on the homepage and `/services/`. `npm run astro -- check`, `npm run build`, `npm run qa:postbuild`, `HFLA_HOMEPAGE_VISUAL_LOCK_MODE=review node tests/post-release/homepage-visual-image-lock.mjs`, and no-secret/release-boundary scan passed. The later PR #11 owner-selected gallery v0.3 live proof closed `BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001`.

`PUBLIC WEBSITE HOMEPAGE VISUAL / IMAGE BASELINE GUARD + MOBILE CTA PATCH = PASSED / Owner Image Baseline Approval Required — RELEASE STATE GO`

Owner-authorized source-only patch completed: the mobile sticky booking CTA now uses `Plan My Party -> /plan-my-party/`; a draft homepage visual baseline marker was added; `dist/build-manifest.json` generation was added to the local build; build-time and live custom-domain homepage visual lock scripts were installed; and the homepage image manifest now inventories all current built homepage image paths. `npm run astro -- check`, `npm run build`, `npm run qa:postbuild`, the new homepage visual/image lock in explicit review mode, and the no-secret/release-boundary scan passed. PR #11 later supplied the owner-selected gallery v0.3 baseline and live proof, so `BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001 = CLOSED by PR #11 homepage gallery v0.3 live visual proof`.

`PUBLIC WEBSITE LIVE HOMEPAGE VISUAL / IMAGE REGRESSION DIAGNOSIS + PERMANENT GUARD PLAN = PASSED / Owner Patch or Rollback Decision Required — RELEASE STATE GO`

Emergency read-only diagnosis found the active Production deployment was `e598a7a9-835f-4aee-848c-0008e3960023`; no newer Production deployment was observed. Cache-busting live custom-domain fetch returned `200` with `cf-cache-status: DYNAMIC`, and live homepage static image hashes matched the current local build/public image files. Root cause was classified as `HOMEPAGE_CHECKS_TOO_NARROW_AND_SOURCE_VISUAL_BASELINE_INCOMPLETE`: the prior accepted homepage lock protected Plan My Party nav/hero CTA and the butterfly hero only, not the full homepage visual/image inventory. PR #11 later merged the owner-selected gallery v0.3 baseline and live visual proof passed, closing `BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001`. See `PUBLIC_WEBSITE_LIVE_HOMEPAGE_VISUAL_IMAGE_REGRESSION_DIAGNOSIS_REPORT.md`.

`PUBLIC BOOKING POST-DEPLOY P1 CONTROLLED DEPLOY EXECUTION = PASS / live non-payment verification complete — RELEASE STATE GO`

Controlled deploy rerun reached production deployment `e598a7a9-835f-4aee-848c-0008e3960023` and applied D1 migration `0004` to `hfla-availability-production`. Pre-deploy validation, environment gate, migration, deployment, homepage/nav/CTA verification, scoped D1 lead persistence, final Gmail/Google Sheets proof, non-seeded no-card Availability Hold reachability, live customer-copy verification, and admin endpoint guard verification passed. The live copy blocker is CLOSED. This does not authorize or claim real card/payment completion.

`PUBLIC BOOKING POST-DEPLOY P1 LIVE GMAIL/SHEETS FINAL-DESTINATION PROOF RECONCILIATION = BLOCKED — RELEASE STATE GO`

Historical reconciliation of the already-submitted synthetic lead confirmed the split: D1 scoped predicates passed and the deployed endpoint recorded Make-derived success flags, but final owner Gmail/Google Sheets field-level delivery was not independently proven. V2 mapping repair superseded this blocked proof by submitting exactly one new synthetic proof lead and proving complete final-destination fields in Gmail and Sheets.

`PUBLIC-BOOKING POST-DEPLOY P1 CONDITIONAL RETAINER HOLD NON-SEEDED MODEL REMEDIATION = PASS / accepted — RELEASE STATE GO`

Plan My Party lead-data completeness remediation (auditor accepted 2026-06-15 after type-contract fix): both lead paths (`/api/quote-request` and `/api/lead`) are unified onto one canonical lead model so Gmail/Sheets receive every customer-entered field and every system-recommended value — child count never blank, customer budget vs system pricing kept separate, duration source + computed end time, travel source/zone/note, preferred contact method, and full attribution. D1 migration `0004` was applied during the controlled deploy rerun, scoped D1 persistence passed, and final Gmail/Google Sheets field-level delivery is now proven by V2 mapping repair. See `PUBLIC_BOOKING_POST_DEPLOY_P1_PLAN_MY_PARTY_LEAD_DATA_COMPLETENESS_REMEDIATION_REPORT.md`.

(Also accepted: Plan My Party lead-data completeness remediation; homepage baseline patch accepted 2026-06-15 — see phase tracker.)

The prior P1 conditional retainer hold implementation was blocked by auditor review because it still required seeded D1 availability before checkout. The owner-authorized non-seeded model remediation is accepted in source and was included in the blocked controlled deploy rerun: deterministic birthday-party requests can place a manual-capture 20% Availability Hold without a pre-seeded slot, seeded open slots still use D1 conflict protection, and matching unsafe seeded slots still fail closed. The old `$150/$30` proof-only live policy was replaced by a deterministic birthday-party hold policy. Source proofs: checkout contract 18/18, manual-capture 10/10, artist-confirmed 8/8, artist-unavailable 9/9, deterministic pricing matrix 6/6, manual-review exclusion 7/7, customer copy 13/13; canonical lead model 26/26, endpoints 17/17, quote-request delivery 12/12, Stripe metadata 12/12; `npm run astro -- check`, `npm run build`, `npm run qa:postbuild`, no-leak/release-boundary scan, and homepage/nav/image lock all pass.

Required next action: preserve the completed non-payment deploy verification and do not run real card/payment proof without separate owner authorization. `BLK-PUBLIC-POST-DEPLOY-AVAILABILITY-SLOTS-NOT-SEEDED-001 = CLOSED as hard checkout prerequisite by accepted non-seeded conditional hold model; optional seeded slots may still be used later for capacity optimization and conflict protection.` `BLK-PUBLIC-POST-DEPLOY-INSTANT-QUOTE-COPY-OVERPROMISE-001 = CLOSED by live non-payment customer-copy verification`.

`PUBLIC WEBSITE CANONICAL HOMEPAGE / NAV / IMAGE BASELINE MINIMAL RECONSTRUCTION PATCH ACCEPTED — HOMEPAGE BASELINE BLOCKER CLOSED — RELEASE STATE GO` (auditor accepted 2026-06-15). The homepage now surfaces the current "Plan My Party" wizard as its primary hero CTA and as a desktop+mobile nav item (→ `/plan-my-party/`), matching the accepted live presentation. Only two locked files changed (`src/data/navigation.ts`, `src/pages/index.astro`); no redesign, no global-style change, butterfly hero preserved, no images changed; astro check/build/QA + no-leak pass. The controlled deploy rerun verified the live homepage/nav/CTA baseline on the custom domain. See `PUBLIC_WEBSITE_CANONICAL_HOMEPAGE_NAV_IMAGE_BASELINE_MINIMAL_RECONSTRUCTION_PATCH_REPORT.md`. (Prior reconciliation investigation: `PUBLIC_WEBSITE_CANONICAL_HOMEPAGE_NAV_IMAGE_BASELINE_RECONCILIATION_REPORT.md`.)

## Preserved Accepted State

| Item | Status |
| --- | --- |
| PUBLIC RELEASE | AUTHORIZED BY OWNER |
| RELEASE STATE | GO |
| BLK-PUBLIC-POST-DEPLOY-QUOTE-REQUEST-FIELD-MAPPING-001 | CLOSED |
| BLK-PUBLIC-POST-DEPLOY-LIVE-PRODUCTION-UI-REGRESSION-001 | CLOSED |
| BLK-PUBLIC-POST-DEPLOY-STRIPE-WEBHOOK-CHECKOUT-METADATA-INVALID-001 | CLOSED |

## Recently Closed Blocker

| Blocker ID | Status |
| --- | --- |
| BLK-PUBLIC-POST-DEPLOY-P1-CONDITIONAL-RETAINER-HOLD-SOURCE-BASELINE-MISMATCH-001 | CLOSED by P1 source baseline + quote-classification restoration (auditor accepted 2026-06-14) |
| BLK-PUBLIC-POST-DEPLOY-AVAILABILITY-SLOTS-NOT-SEEDED-001 | CLOSED as hard checkout prerequisite by accepted non-seeded conditional hold model; optional seeded slots may still be used later for capacity optimization and conflict protection |
| BLK-PUBLIC-CANONICAL-HOMEPAGE-NAV-IMAGE-BASELINE-MISMATCH-001 | CLOSED by canonical homepage/nav minimal reconstruction patch (auditor accepted 2026-06-15); live homepage/nav verified in blocked controlled deploy rerun |
| BLK-PUBLIC-PLAN-MY-PARTY-LEAD-DATA-ENDPOINT-AMBIGUITY-001 | CLOSED by canonical Plan My Party lead model unification (auditor accepted 2026-06-15); migration `0004` applied and scoped D1 proof passed in blocked controlled deploy rerun |

## Open Blockers

| Blocker ID | Status |
| --- | --- |
| BLK-PUBLIC-POST-DEPLOY-INSTANT-QUOTE-COPY-OVERPROMISE-001 | CLOSED by live non-payment customer-copy verification |
| BLK-PUBLIC-POST-DEPLOY-P1-LIVE-GMAIL-SHEETS-FIELD-VERIFICATION-001 | CLOSED by Make/Gmail/Sheets mapping repair V2 final-destination proof |
| BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001 | CLOSED by PR #11 homepage gallery v0.3 live visual proof |

## Production Boundary

The P1 controlled deploy has completed the remaining non-payment live verification sequence. Final Gmail/Google Sheets field-level proof is passed by Make/Gmail/Sheets mapping repair V2, non-seeded Availability Hold reachability is proven without card entry, live customer copy is verified, and admin endpoints fail closed with missing/wrong tokens. PR #11 later merged the owner-selected homepage gallery v0.3 baseline and Cloudflare Production deployment `ba0824b5-c317-49ae-9456-27f842005994` passed live visual proof, closing the homepage visual/image blocker. Real card/payment proof was not run. No Stripe access, slot creation, availability seeding, D1/KV mutation, Make/Gmail/Sheets action, DNS/SEO/Ads/GBP action, cache purge, secret exposure, or PII dump occurred.
