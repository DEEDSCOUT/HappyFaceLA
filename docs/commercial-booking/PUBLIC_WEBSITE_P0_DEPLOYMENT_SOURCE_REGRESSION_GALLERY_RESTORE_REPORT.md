# PUBLIC WEBSITE P0 DEPLOYMENT SOURCE REGRESSION GALLERY RESTORE REPORT

Status: `P0 DEPLOYMENT SOURCE REGRESSION FIX PASSED — GALLERY V0.3 RESTORED AND QUOTE-REQUEST PROOF PRESERVED — RELEASE STATE GO`

Date: 2026-06-16
Release state: GO

## Summary

The live homepage gallery regression was confirmed as a deployment-source regression. Cloudflare Production deployment `94d10a52-52c2-45e2-b593-1a9e9dcfb0d2` from source label `47b789a` preserved the P0 quote-request hotfix but did not include the accepted PR #11 homepage gallery v0.3 source baseline.

A clean reconciliation branch was created from latest `origin/main` and updated to include both accepted states:

- PR #11 homepage gallery v0.3 baseline.
- P0 durable `/api/quote-request` endpoint and exact child-count UX fix.

The reconciled source was deployed as Cloudflare Production deployment `e8f11ebc-f9c1-48ca-a953-b78b32a08780` from source label `8339378`.

## Root Cause

The post-PR11 P0 hotfix deployment used source that contained the quote-request endpoint fix but lacked the PR #11 gallery v0.3 baseline. This overwrote the live homepage gallery with older homepage image references.

## Source Reconciliation

Branch: `p0-main-reconcile-quote-request-and-gallery-v03-20260616`

Reconciled commits:

- `eefe23b` - durable quote-request endpoint and exact child-count source.
- `0b3c212` - owner-accepted gallery v0.3 manifest/baseline status.
- `8339378` - build-manifest homepage baseline alignment.

The reconciled source preserves:

- GALLERY-01 through GALLERY-06 as the six homepage recent-event images.
- GALLERY-07 and GALLERY-08 as staged extras, not homepage-featured.
- Forbidden/historical old gallery paths in the manifest.
- Plan My Party nav, hero, bottom, and mobile sticky CTAs.
- Soccer page route.
- Durable `/api/quote-request` fail-closed behavior.
- Exact child-count UX and canonical payload persistence.

## Validation

Pre-deploy validation passed:

- `npm run astro -- check`
- `npm run build`
- `npm run qa:postbuild`
- `HFLA_HOMEPAGE_VISUAL_LOCK_MODE=review node tests/post-release/homepage-visual-image-lock.mjs`
- scoped no-secret/release-boundary scan

## Deployment

Final controlled deploy:

- Cloudflare Pages project: `happyfacesla`
- Environment: Production
- Branch label: `main`
- Deployment ID: `e8f11ebc-f9c1-48ca-a953-b78b32a08780`
- Deployment URL: `https://e8f11ebc.happyfacesla.pages.dev`
- Source label: `8339378`
- Source commit: `8339378ba716bbcb455ac4aaed39f1e9c2106f9f`

An intermediate deployment `5eaf9eac-7ad0-4679-8373-87e3d235e376` was superseded because deploy-mode live visual lock correctly rejected the manifest while it still said pending auditor review. The final deployment uses the owner-accepted manifest status and v0.3 build provenance.

## Live Visual Proof

Live custom-domain proof passed:

- homepage returns 200.
- `/plan-my-party/` returns 200.
- `/soccer-fan-face-painting-los-angeles/` returns 200.
- Plan My Party CTAs are live.
- old `Get Quote -> /contact/` sticky CTA is absent.
- GALLERY-01 through GALLERY-06 appear live.
- GALLERY-07 and GALLERY-08 are not homepage-featured.
- old forbidden gallery paths are absent.
- Google Drive hotlinks are absent.
- all six gallery image URLs return 200 as WebP.
- live visual lock passes against `homepage-visual-baseline-v0.3-owner-gallery-20260616`.

## Quote-Request Proof

One persisted synthetic non-customer proof lead passed:

- Proof token: `HFLA-P0-MAINRECONCILE-20260616T171704`
- Lead ID: `lead_789c0656c43d48ca86d89dd26641`
- Endpoint returned `ok=true`, `received=true`, `persisted=true`, and a lead ID.
- Scoped D1 proof found exactly one matching row.
- Exact child count persisted as `18`.
- Child count confidence persisted as `exact`.
- Canonical payload contains the proof token.
- Make-derived delivery flags returned true.
- Owner Gmail arrived at `info@happyfacesla.com`.
- Approved Google Sheets row was found in `Happy Faces LA Leads / Leads`.

A preceding malformed synthetic request using an invalid idempotency key failed closed with `received=false` and `persisted=false`; it created no D1 row and no lead ID.

## Boundary

No card entry, payment authorization, capture, refund, Stripe Dashboard access, raw Stripe object exposure, production slot creation, availability seeding, broad D1/KV export, raw Gmail body in evidence, private Sheet URL, Make webhook exposure, secret exposure, customer PII dump, DNS/SEO/Ads/GBP action, or cache purge occurred.

## Governance

`BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001 = CLOSED by P0 deployment source regression fix restoring gallery v0.3 and preserving quote-request proof`.

Required deployment guard: future Production deploys must come only from latest `main` or an explicitly reconciled hotfix branch that proves both homepage visual lock and durable quote-request proof.
