# Commercial Booking Governance

Current status:

`P0 DEPLOYMENT SOURCE REGRESSION FIX PASSED — GALLERY V0.3 RESTORED AND QUOTE-REQUEST PROOF PRESERVED — RELEASE STATE GO`

Controlled Cloudflare Pages Production deployment `e8f11ebc-f9c1-48ca-a953-b78b32a08780` from reconciled source label `8339378` restored the PR #11 homepage gallery v0.3 baseline after hotfix deployment `94d10a52-52c2-45e2-b593-1a9e9dcfb0d2` regressed the homepage gallery source. Live visual proof passed against `homepage-visual-baseline-v0.3-owner-gallery-20260616`; GALLERY-01 through GALLERY-06 are live, GALLERY-07/GALLERY-08 are not homepage-featured, forbidden old gallery paths and Google Drive hotlinks are absent, and Plan My Party CTAs remain live.

The reconciled deployment also preserved the P0 durable quote-request proof. Synthetic proof `HFLA-P0-MAINRECONCILE-20260616T171704` returned `ok=true`, `received=true`, `persisted=true`, lead ID `lead_789c0656c43d48ca86d89dd26641`, scoped D1 exact count `18` with confidence `exact`, Gmail to `info@happyfacesla.com`, and an approved `Happy Faces LA Leads / Leads` Sheets row. `BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001 = CLOSED by P0 deployment source regression fix restoring gallery v0.3 and preserving quote-request proof`.

No card/payment proof was run. No Stripe access, production slot creation, availability seeding, broad D1/KV export, raw Gmail body in evidence, private Sheet URL, Make webhook exposure, secret exposure, DNS/SEO/Ads/GBP action, cache purge, or PII dump occurred.

Previous preserved status:

`P0 QUOTE-REQUEST ENDPOINT RECONCILIATION + EXACT CHILD COUNT DEPLOY PASSED — REAL LEAD DELIVERY PROVEN — RELEASE STATE GO`

Controlled Cloudflare Pages Production deployment `94d10a52-52c2-45e2-b593-1a9e9dcfb0d2` reconciled live `/api/quote-request` to the accepted durable handler and deployed the exact child-count UX fix. Synthetic proof `HFLA-P0-ENDPOINTFIX-20260616-092836` returned `ok=true`, `received=true`, `persisted=true`, and lead ID `lead_9ab40aac964c41f18f42c5168c39`; scoped D1 proof found exact child count `18` with confidence `exact`; Gmail arrived at `info@happyfacesla.com`; and the approved Google Sheets row was found. `BLK-PUBLIC-P0-REAL-PLAN-MY-PARTY-LEAD-DELIVERY-UNPROVEN-001 = CLOSED by P0 quote-request endpoint reconciliation and exact child count deploy proof`.

No card/payment proof was run. No Stripe access, slot creation, availability seeding, DNS/SEO/Ads/GBP action, Make webhook exposure, secret exposure, raw Gmail body, private Sheet URL, broad production export, or PII dump occurred.

`PR #11 MERGED — HOMEPAGE GALLERY V0.3 LIVE VISUAL PROOF PASSED — HOMEPAGE VISUAL/IMAGE BLOCKER CLOSED — RELEASE STATE GO`

`FINAL GOVERNANCE UPDATED — HOMEPAGE VISUAL/IMAGE BLOCKER CLOSED — RELEASE STATE GO — REAL CARD/PAYMENT PROOF NOT RUN`

PR #11 merged into `main` and live proof passed. Merge commit: `31b3ea03940ec49f905a770674c20b342cb99e81`. Cloudflare Production deployment: `ba0824b5-c317-49ae-9456-27f842005994`. Source: `main` / `31b3ea0`. Live proof confirmed the homepage, `/plan-my-party/`, and `/soccer-fan-face-painting-los-angeles/` return 200; Plan My Party CTAs are live; old `Get Quote -> /contact/` sticky CTA is absent; GALLERY-01 through GALLERY-06 appear live; GALLERY-07 and GALLERY-08 are not homepage-featured; old forbidden gallery paths are absent; Google Drive hotlinks are absent; all six gallery image URLs return 200 as WebP; and the live visual lock passes against `homepage-visual-baseline-v0.3-owner-gallery-20260616`.

`BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001 = CLOSED by PR #11 homepage gallery v0.3 live visual proof`. Preserved closed: `BLK-PUBLIC-POST-DEPLOY-INSTANT-QUOTE-COPY-OVERPROMISE-001`, `BLK-PUBLIC-POST-DEPLOY-P1-LIVE-GMAIL-SHEETS-FIELD-VERIFICATION-001`, `BLK-PUBLIC-POST-DEPLOY-AVAILABILITY-SLOTS-NOT-SEEDED-001`, `BLK-PUBLIC-PLAN-MY-PARTY-LEAD-DATA-ENDPOINT-AMBIGUITY-001`, and `BLK-PUBLIC-CANONICAL-HOMEPAGE-NAV-IMAGE-BASELINE-MISMATCH-001`.

Real card/payment proof was not run. No Stripe access, slot creation, availability seeding, D1/KV mutation, Make/Gmail/Sheets action, DNS/SEO/Ads/GBP action, cache purge, secret exposure, or PII dump occurred.

`PUBLIC BOOKING POST-DEPLOY P1 CONTROLLED DEPLOY VERIFICATION RESUME NON-PAYMENT CHECKS = PASS — RELEASE STATE GO`

The skipped non-payment checks from the controlled deploy verification are complete. Live deterministic birthday-party Availability Hold reachability works without a pre-seeded D1 slot; a Stripe-hosted Checkout URL was returned with `pending_artist_confirmation` and a 20% retainer, but the URL value/session ID was not recorded, no card was entered, and no payment authorization/capture/refund occurred. Live customer copy on `/plan-my-party/` and the synthetic confirmation page says Availability Hold / Not confirmed yet / booking confirmed only after Happy Faces LA confirmation, and forbidden reserved/guaranteed/non-refundable wording is absent. Admin booking and slot endpoints fail closed with missing/wrong tokens. `BLK-PUBLIC-POST-DEPLOY-INSTANT-QUOTE-COPY-OVERPROMISE-001 = CLOSED by live non-payment customer-copy verification`. `BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001 = CLOSED by PR #11 homepage gallery v0.3 live visual proof`. No source-code edit, D1 migration, production slot creation, availability seeding, card entry, payment authorization, payment capture, refund, Stripe Dashboard access, DNS/SEO/Ads/GBP action, Make webhook exposure, secret exposure, raw Stripe object exposure, broad production export, or PII dump occurred.

`PUBLIC BOOKING POST-DEPLOY P1 MAKE/GMAIL/SHEETS MAPPING REPAIR V2 = PASS / final-destination field proof passed — RELEASE STATE GO`

Make final-destination mapping repair V2 completed in manual/API safe mode only. The `Integration Webhooks` scenario now maps Gmail and Google Sheets from canonical top-level Plan My Party payload fields. One synthetic non-customer Plan My Party lead proved final owner Gmail and Google Sheets field-level delivery with complete canonical fields. `BLK-PUBLIC-POST-DEPLOY-P1-LIVE-GMAIL-SHEETS-FIELD-VERIFICATION-001 = CLOSED by Make/Gmail/Sheets mapping repair V2 final-destination proof`. The later live non-payment verification closed `BLK-PUBLIC-POST-DEPLOY-INSTANT-QUOTE-COPY-OVERPROMISE-001`; PR #11 live proof closed `BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001`. No website deploy, source-code edit, D1 migration, checkout reachability, payment, Stripe access, slot creation, availability seeding, DNS/SEO/Ads/GBP action, homepage/image/visual-guard change, Make webhook exposure, secret exposure, raw Gmail body, private Sheet URL, broad export, customer PII dump, card data, or raw Stripe object exposure occurred in the V2 mapping phase.

`PUBLIC WEBSITE HOMEPAGE + SERVICES IMAGE UPDATE = PASS / accepted in source — RELEASE STATE GO`

Owner-approved source-only image update accepted: face painting and glitter tattoos service images remain unchanged; Balloon Twisting now uses the owner-selected local WebP asset at `/images/services/happy-faces-la-balloon-twisting-pink-yellow-balloon-animals-outdoor-party-01.webp` with no Google Drive hotlink; Face Gems content remains unchanged and service-card rendering is normalized to the same 4:5 frame on the homepage and `/services/`. Required validation/build/QA/visual-lock/no-secret checks passed. The later PR #11 owner-selected gallery v0.3 live proof closed `BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001`. No deploy, rollback, cache purge, production mutation, Stripe access, checkout/payment action, DNS/SEO/Ads/GitHub action, Make webhook exposure, secret exposure, customer-data export, or PII dump occurred in the source-only image update phase.

`PUBLIC WEBSITE HOMEPAGE VISUAL / IMAGE BASELINE GUARD + MOBILE CTA PATCH = PASSED / Owner Image Baseline Approval Required — RELEASE STATE GO`

Owner-authorized source-only patch completed: the mobile sticky booking CTA now uses `Plan My Party -> /plan-my-party/`; a draft homepage baseline marker and build manifest generation are installed; build-time and live homepage visual lock scripts are present; and every current built homepage image is listed in the draft manifest. PR #11 later supplied the owner-selected gallery v0.3 baseline and live proof, so `BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001 = CLOSED by PR #11 homepage gallery v0.3 live visual proof`. No deploy, rollback, cache purge, image replacement, production mutation, Stripe access, DNS/SEO/Ads/GitHub action, Make webhook exposure, secret exposure, raw customer data, or PII dump occurred in the source-only guard patch phase.

`PUBLIC WEBSITE LIVE HOMEPAGE VISUAL / IMAGE REGRESSION DIAGNOSIS + PERMANENT GUARD PLAN = PASSED / Owner Patch or Rollback Decision Required — RELEASE STATE GO`

Emergency read-only diagnosis found the live custom domain was serving Production deployment `e598a7a9-835f-4aee-848c-0008e3960023`; no newer Production deployment was observed. Cache-busting fetch returned `200` with `cf-cache-status: DYNAMIC`, and live homepage image hashes matched local build/public files. The root cause was not a proven Cloudflare rollback/cache issue; it was that the prior accepted homepage lock was too narrow and did not define a full homepage visual/image inventory. PR #11 later merged the owner-selected gallery v0.3 baseline and live visual proof passed, closing `BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001`. See `PUBLIC_WEBSITE_LIVE_HOMEPAGE_VISUAL_IMAGE_REGRESSION_DIAGNOSIS_REPORT.md`.

`PUBLIC BOOKING POST-DEPLOY P1 CONTROLLED DEPLOY EXECUTION = PASS / live non-payment verification complete — RELEASE STATE GO`

Controlled deploy rerun reached production deployment `e598a7a9-835f-4aee-848c-0008e3960023` and applied D1 migration `0004` to `hfla-availability-production`. Pre-deploy validation, environment gate, migration, deployment, homepage/nav/CTA verification, scoped D1 lead persistence, final Gmail/Google Sheets proof, non-seeded no-card Availability Hold reachability, live customer-copy verification, and admin endpoint guard verification passed. The live copy blocker is CLOSED. This does not authorize or claim real card/payment completion.

`PUBLIC BOOKING POST-DEPLOY P1 LIVE GMAIL/SHEETS FINAL-DESTINATION PROOF RECONCILIATION = BLOCKED — RELEASE STATE GO`

Historical reconciliation of the already-submitted synthetic lead confirmed the split: D1 scoped predicates passed and the deployed endpoint recorded Make-derived success flags, but final owner Gmail/Google Sheets field-level delivery was not independently proven. V2 mapping repair superseded this blocked proof by submitting exactly one new synthetic proof lead and proving complete final-destination fields in Gmail and Sheets.

`PUBLIC-BOOKING POST-DEPLOY P1 CONDITIONAL RETAINER HOLD NON-SEEDED MODEL REMEDIATION = PASS / accepted — RELEASE STATE GO` (auditor accepted 2026-06-15; included in the blocked controlled deploy rerun. Deterministic birthday-party Availability Hold checkout no longer requires a pre-seeded D1 slot; seeded open slots preserve D1 conflict protection; unsafe matching slots fail closed. Prior phases: Plan My Party lead data accepted; homepage baseline patch accepted.)

## Current State

The earlier P1 conditional retainer hold implementation was NOT accepted because it still required seeded D1 availability. The owner-authorized non-seeded remediation is accepted in source and was included in the controlled deploy rerun: deterministic birthday-party requests can place a manual-capture 20% Availability Hold without a pre-seeded slot; seeded open slots still preserve D1 conflict protection; matching unsafe seeded slots still fail closed. The old `$150/$30` proof-only live policy was replaced with a deterministic birthday-party hold policy. Source proofs pass: checkout contract 18/18, manual-capture 10/10, artist-confirmed 8/8, artist-unavailable 9/9, pricing matrix 6/6, exclusion 7/7, copy 13/13, canonical model 26/26, canonical endpoints 17/17, delivery 12/12, metadata 12/12, astro check/build/QA, no-leak/release-boundary, and homepage/nav/image lock. The source-baseline blocker remains CLOSED. Final Gmail/Google Sheets verification is CLOSED by V2 mapping repair, live non-payment checks passed, and the homepage visual/image blocker is CLOSED by PR #11 live proof.

**Homepage baseline (2026-06-15):** `PUBLIC WEBSITE CANONICAL HOMEPAGE / NAV / IMAGE BASELINE MINIMAL RECONSTRUCTION PATCH ACCEPTED` (auditor accepted 2026-06-15). The homepage now surfaces "Plan My Party" as its primary hero CTA and as a desktop+mobile nav item (→ `/plan-my-party/`), matching the accepted live presentation. Only `navigation.ts` + `index.astro` changed; butterfly hero + global styles + images preserved; astro check/build/QA + no-leak pass. The controlled deploy rerun verified the live homepage/nav/CTA baseline on the custom domain. `BLK-PUBLIC-CANONICAL-HOMEPAGE-NAV-IMAGE-BASELINE-MISMATCH-001 = CLOSED by the patch`. See `PUBLIC_WEBSITE_CANONICAL_HOMEPAGE_NAV_IMAGE_BASELINE_MINIMAL_RECONSTRUCTION_PATCH_REPORT.md`.

Accepted state preserved:

- `PUBLIC RELEASE = AUTHORIZED BY OWNER`
- `RELEASE STATE = GO`
- `BLK-PUBLIC-POST-DEPLOY-QUOTE-REQUEST-FIELD-MAPPING-001 = CLOSED`
- `BLK-PUBLIC-POST-DEPLOY-LIVE-PRODUCTION-UI-REGRESSION-001 = CLOSED`
- `BLK-PUBLIC-POST-DEPLOY-STRIPE-WEBHOOK-CHECKOUT-METADATA-INVALID-001 = CLOSED`

## Recently Closed Blocker

| Blocker ID | Status |
| --- | --- |
| BLK-PUBLIC-POST-DEPLOY-P1-CONDITIONAL-RETAINER-HOLD-SOURCE-BASELINE-MISMATCH-001 | CLOSED by P1 source baseline + quote-classification restoration (auditor accepted 2026-06-14) |
| BLK-PUBLIC-PLAN-MY-PARTY-LEAD-DATA-ENDPOINT-AMBIGUITY-001 | CLOSED by canonical Plan My Party lead model unification (auditor accepted 2026-06-15); source and migration `0004` deployed in controlled rerun; final Gmail/Sheets verification now passed by V2 mapping repair |

## Remaining / Reclassified P1 Blockers

| Blocker ID | Status |
| --- | --- |
| BLK-PUBLIC-POST-DEPLOY-AVAILABILITY-SLOTS-NOT-SEEDED-001 | CLOSED as hard checkout prerequisite by accepted non-seeded conditional hold model; optional seeded slots may still be used later for capacity optimization and conflict protection |
| BLK-PUBLIC-POST-DEPLOY-INSTANT-QUOTE-COPY-OVERPROMISE-001 | CLOSED by live non-payment customer-copy verification |
| BLK-PUBLIC-POST-DEPLOY-P1-LIVE-GMAIL-SHEETS-FIELD-VERIFICATION-001 | CLOSED by Make/Gmail/Sheets mapping repair V2 final-destination proof |
| BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001 | CLOSED by PR #11 homepage gallery v0.3 live visual proof |

## Evidence Index

| Evidence ID | Status | Accepted? | Notes |
| --- | --- | --- | --- |
| EVD-PUBLIC-BOOKING-POST-DEPLOY-P1-SOURCE-BASELINE-RESTORATION-001 | PASS / accepted | Yes (2026-06-14) | Candidate ZIP restored locally; quote-classification module reconstructed; contracts, Astro check, build, postbuild QA, and no-leak scans pass. |
| EVD-PUBLIC-BOOKING-POST-DEPLOY-P1-QUOTE-CLASSIFICATION-001 | PASS / accepted | Yes (2026-06-14) | Exact module was not recoverable; reconstructed from restored source contract only. |
| EVD-PUBLIC-BOOKING-POST-DEPLOY-P1-CONDITIONAL-RETAINER-HOLD-001 | BLOCKED / superseded by non-seeded remediation | No | Prior seeded-slot source implementation was not accepted; it required seeded D1 availability before checkout. |
| EVD-PUBLIC-BOOKING-POST-DEPLOY-P1-CONDITIONAL-RETAINER-HOLD-NON-SEEDED-001 | PASS / accepted | Yes (2026-06-15) | Non-seeded conditional hold model accepted in source; no-slot deterministic checkout, seeded-slot safety, live-policy replacement, contracts, validation, no-leak, and homepage lock pass; included in blocked controlled deploy rerun. |
| EVD-PUBLIC-WEBSITE-CANONICAL-HOMEPAGE-BASELINE-001 | BLOCKED / superseded by patch | No | Investigation: no exact source reproduces the live "Plan My Party" homepage nav; local main + hflpub@c33233f are old inquiry-style. |
| EVD-PUBLIC-WEBSITE-CANONICAL-HOMEPAGE-PATCH-001 | PASS / accepted | Yes (2026-06-15) | Plan My Party added to nav + homepage hero primary CTA → /plan-my-party/; butterfly hero + images preserved; only navigation.ts + index.astro changed; astro check/build/QA + no-leak pass; live homepage/nav verified in blocked controlled deploy rerun. |
| EVD-PUBLIC-WEBSITE-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001 | PASS / closed by PR #11 live proof | Yes (2026-06-16) | PR #11 merged owner-selected gallery v0.3 baseline; Cloudflare Production deployment `ba0824b5-c317-49ae-9456-27f842005994` passed live visual proof against `homepage-visual-baseline-v0.3-owner-gallery-20260616`. |
| EVD-PUBLIC-WEBSITE-HOMEPAGE-VISUAL-GUARD-MOBILE-CTA-001 | PASS / accepted and live-proven by PR #11 | Yes (2026-06-16) | Source-only guard + mobile CTA patch; mobile sticky booking CTA now points to Plan My Party, build manifest and visual locks installed, and PR #11 live visual proof passed. |
| EVD-PUBLIC-WEBSITE-HOMEPAGE-GALLERY-V03-LIVE-PROOF-001 | PASS / accepted | Yes (2026-06-16) | PR #11 merged owner-selected gallery v0.3 baseline; GALLERY-01 through GALLERY-06 appear live, extras are not featured, forbidden old paths are absent, and live visual lock passes. |
| EVD-PUBLIC-BOOKING-POST-DEPLOY-P1-PLAN-MY-PARTY-LEAD-DATA-001 | PASS / accepted | Yes (2026-06-15) | Both lead paths unified onto canonical model; `preferredContactMethod` type-contract fixed; canonical/endpoints/delivery/metadata contracts and astro/build/QA/no-leak pass; migration `0004` applied, D1 scoped persistence passed, and final Gmail/Sheets verification now passes by V2 mapping repair. |

## Production Boundary

The P1 controlled deploy has completed the remaining non-payment live verification sequence. Final Gmail/Google Sheets field-level proof is passed by Make/Gmail/Sheets mapping repair V2, non-seeded Availability Hold reachability is proven without card entry, live customer copy is verified, and admin endpoints fail closed with missing/wrong tokens. PR #11 later merged the owner-selected homepage gallery v0.3 baseline and Cloudflare Production deployment `ba0824b5-c317-49ae-9456-27f842005994` passed live visual proof, closing the homepage visual/image blocker. Real card/payment proof was not run. No Stripe access, slot creation, availability seeding, D1/KV mutation, Make/Gmail/Sheets action, DNS/SEO/Ads/GBP action, cache purge, secret exposure, or PII dump occurred.
