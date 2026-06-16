# Public Website Homepage Gallery Image Replacement Report

Status: HOMEPAGE GALLERY OWNER-SELECTED IMAGE REPLACEMENT PASSED - OWNER/AUDITOR REVIEW REQUIRED - RELEASE STATE GO

Date: 2026-06-16

## Scope

This phase replaced the homepage recent-events gallery baseline with owner-selected Google Drive assets converted to local WebP files. No website deploy, merge, cache purge, production mutation, D1/KV action, Stripe action, Make/Gmail/Sheets action, DNS/SEO/Ads/GBP action, secret exposure, PII dump, or raw customer-data export occurred.

## Homepage Gallery Decision

The current homepage renders six featured gallery images. To avoid a layout expansion without separate owner confirmation, GALLERY-01 through GALLERY-06 are the homepage recent-events set. GALLERY-07 and GALLERY-08 were converted and staged as owner-selected extra gallery assets with `featured: false`.

Final homepage gallery count: 6.

Staged extra gallery assets: 2.

## Implemented Source Updates

- Added eight owner-selected local WebP gallery assets under `public/images/gallery/**`.
- Updated `src/data/gallery.ts` so the first six owner-selected assets are featured homepage images.
- Preserved the two extra owner-selected assets as non-featured staged gallery items.
- Set the previous six homepage gallery images to `featured: false`; the old files were not deleted.
- Updated `evidence/homepage-visual-baseline/homepage_image_manifest.json` to baseline version `homepage-visual-baseline-v0.3-owner-gallery-20260616`.
- Moved replaced old homepage gallery image paths into the manifest forbidden/historical section.
- Updated `docs/commercial-booking/HOMEPAGE_CANONICAL_VISUAL_BASELINE.md` with the new owner-selected gallery baseline and closure conditions.
- Updated build-time and live visual guard baseline versions.

## Guard Behavior

The homepage visual/image guard now fails if:

- the homepage lacks Plan My Party CTA/link coverage;
- the mobile sticky booking CTA regresses to `Get Quote -> /contact/`;
- the owner-selected homepage gallery paths are missing;
- the old replaced homepage gallery paths return;
- a manifest-approved image hash changes unexpectedly;
- an unknown homepage image path appears.

## Preserved Boundaries

Preserved:

- Plan My Party nav/header link.
- Homepage hero CTA: `Plan My Party -> /plan-my-party/`.
- Homepage bottom CTA: `Plan My Party -> /plan-my-party/`.
- Mobile sticky CTA: `Plan My Party -> /plan-my-party/`.
- Old sticky `Get Quote -> /contact/` remains absent.
- Soccer page remains source-present.
- Owner-selected Balloon Twisting service-card image remains `/images/services/happy-faces-la-balloon-twisting-pink-yellow-balloon-animals-outdoor-party-01.webp`.
- 4:5 service-card normalization remains.
- Build manifest generation remains.
- Homepage visual guard scripts remain.

Not touched:

- booking/payment source;
- Stripe source;
- D1/KV migrations;
- Make/Gmail/Sheets source or configuration;
- Plan My Party pricing/checkout logic;
- DNS/SEO/Ads/GBP.

## Proof Summary

Validation passed:

- `npm run astro -- check`: exit 0.
- `npm run build`: exit 0.
- `npm run qa:postbuild`: exit 0.
- `HFLA_HOMEPAGE_VISUAL_LOCK_MODE=review node tests/post-release/homepage-visual-image-lock.mjs`: exit 0.

No-secret and release-boundary scan passed with zero real findings.

## Governance

`BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001` remains OPEN pending owner/auditor acceptance and live custom-domain visual/image proof.

`RELEASE STATE = GO` is preserved.
