# HOMEPAGE CANONICAL VISUAL BASELINE

Status: DRAFT / Owner Approval Required
Release state: GO
Date: 2026-06-15
Baseline version: `homepage-visual-baseline-v0.2-draft-20260615`

## Purpose

This file defines the homepage visual/image baseline that future deploy gates must enforce. It is currently a draft because the live owner-observed complaint says the current homepage may still contain older images / presentation. The current live state is inventoried, but not fully accepted as canonical until owner/auditor review.

## Required homepage structure

Required:

- Header navigation includes `Plan My Party`.
- Header `Plan My Party` link points to `/plan-my-party/`.
- Homepage hero primary CTA label is `Plan My Party`.
- Homepage hero primary CTA points to `/plan-my-party/`.
- Bottom homepage CTA points to `/plan-my-party/`.
- Butterfly hero image is present.
- No primary inquiry-only quote flow is allowed.

Known current state:

- Mobile sticky CTA source has been patched to `Plan My Party -> /plan-my-party/` in the source-only guard patch. This is not deployed in this phase.
- Owner has accepted the four service-card image decisions below.
- The recent-event/gallery image set has not been owner-accepted as canonical.

## Approved image paths

Approved by prior minimal baseline:

- `/images/hero/happy-faces-la-hero-face-painting-butterfly-01.webp`

Approved service-card image decisions:

- Face Painting: `/images/services/happy-faces-la-face-painting-service.webp`
  - SHA256: `ac9f0b6a7adf396d3649281cfa955278800a9fa3c112e7785c55489afe06d33f`
  - Owner decision: keep unchanged.
- Balloon Twisting: `/images/services/happy-faces-la-balloon-twisting-pink-yellow-balloon-animals-outdoor-party-01.webp`
  - SHA256: `ff626a329ac0f0ee7db27e51729e65783ad9f5bedd9ab7a30e5f425da3cf041a`
  - Owner decision: replace prior balloon image with the owner-selected Drive asset converted to WebP.
- Glitter Tattoos: `/images/services/happy-faces-la-glitter-tattoo-service.webp`
  - SHA256: `fb67fbb98cf4a3054623bbbc13fe006c781cb32c3080b8668ada03bf5cc7f9ae`
  - Owner decision: keep unchanged.
- Face Gems & Face Jewelry: `/images/services/happy-faces-la-face-gems-service.webp`
  - SHA256: `7ccd61ccc3e57568feaa7564d8d5256444a0d1bc17507f675407834d9d2436bf`
  - Owner decision: keep image content unchanged.
  - Rendering note: service-card images use a scoped 4:5 cover frame so Face Gems matches the other service-card image sizes without stretching.

Current live/local image paths that still require owner confirmation before becoming approved:

- `/images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-01.webp`
- `/images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-02.webp`
- `/images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-03.webp`
- `/images/gallery/balloon-twisting/happy-faces-la-balloon-twisting-kids-party-los-angeles-01.webp`
- `/images/gallery/face-gems/happy-faces-la-face-gems-birthday-party-los-angeles-01.webp`
- `/images/gallery/face-gems/happy-faces-la-face-gems-birthday-party-los-angeles-02.webp`

## Forbidden old copy / CTA patterns

Forbidden as primary homepage or sticky-booking path unless owner explicitly re-approves:

- `Get Quote -> /contact/`
- `Get Availability & Pricing -> /contact/`
- `Request Availability & Pricing`
- inquiry-only homepage primary CTA
- homepage without `Plan My Party`

## Forbidden old image paths / hashes

Owner-approved forbidden service-card regression:

- `/images/services/happy-faces-la-balloon-twisting-service.webp`
  - SHA256: `aa712166ea4932196fafd200d4b88fc4da3e53e90509823799c39d7ed568c957`
  - Reason: replaced by owner-selected balloon twisting Drive asset.

The deployment guard must also fail if:

- any unapproved homepage image path appears that is not present in the manifest;
- any approved image hash changes unexpectedly;
- any old inquiry-only homepage CTA returns as the primary path.

## Screenshot baseline

Captured evidence:

- Desktop screenshot: `evidence/homepage-visual-regression/screenshots/live-home-debug-20260615171855.png`

Required before closure:

- Owner-approved desktop screenshot.
- Owner-approved mobile screenshot.
- Screenshot filenames recorded in governance.
- Image manifest hashes accepted by owner/auditor.

## Closure condition

`BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001` may close only after a controlled patch/deploy proof shows:

- live custom domain matches the owner-approved baseline;
- build-time visual/image lock passes;
- live visual/image lock passes;
- old images/copy are absent;
- approved images/copy are present;
- deployment provenance marker is present;
- no unrelated production mutation occurred.
