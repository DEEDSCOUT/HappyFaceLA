# HOMEPAGE CANONICAL VISUAL BASELINE

Status: APPROVED OWNER ACCEPTED / Live Proof Required For Closure
Release state: GO
Date: 2026-06-16
Baseline version: `homepage-visual-baseline-v0.3-owner-gallery-20260616`

## Purpose

This file defines the homepage visual/image baseline that future deploy gates must enforce. The v0.3 baseline replaces the previous unapproved recent-event/gallery homepage images with owner-selected Drive assets converted to local WebP files. Owner/auditor source acceptance is recorded; live custom-domain proof is required for blocker closure.

## Required Homepage Structure

Required:

- Header navigation includes `Plan My Party`.
- Header `Plan My Party` link points to `/plan-my-party/`.
- Homepage hero primary CTA label is `Plan My Party`.
- Homepage hero primary CTA points to `/plan-my-party/`.
- Bottom homepage CTA points to `/plan-my-party/`.
- Mobile sticky CTA is `Plan My Party -> /plan-my-party/`.
- Butterfly hero image is present.
- The soccer page/source remains present after PR #7.
- No primary inquiry-only quote flow is allowed.
- No old `Get Quote -> /contact/` sticky booking CTA is allowed.

## Approved Image Paths

Approved by prior minimal baseline:

- `/images/hero/happy-faces-la-hero-face-painting-butterfly-01.webp`
  - SHA256: `54c231e0496a73c732922d2311ed44718a3ea6b629c4d86d7cf7093be39bf418`

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

## Owner-Selected Homepage Gallery Baseline

The current homepage gallery renders six images. The v0.3 source patch uses GALLERY-01 through GALLERY-06 as the homepage set and stages GALLERY-07 and GALLERY-08 as extra owner-selected assets. The homepage was not expanded to eight images in this phase to avoid layout changes without explicit owner approval.

Homepage gallery set:

- GALLERY-01: `/images/gallery/face-painting/happy-faces-la-face-painting-easter-eggs-cherry-blossom-01.webp`
  - SHA256: `a176c29b696ce88ba7c264afb529b587284fe85a4d0e3c385a31733517dcd6f5`
- GALLERY-02: `/images/gallery/face-painting/happy-faces-la-face-painting-superhero-web-eye-cheek-art-01.webp`
  - SHA256: `fa1f872817927a440dbf892a2a6541d60a2ff17c2d72ba02fd6f8c56849af546`
  - Public filename/alt text use neutral descriptive wording.
- GALLERY-03: `/images/gallery/face-painting/happy-faces-la-face-painting-yellow-superhero-mask-full-face-01.webp`
  - SHA256: `054c4d93ad471989646a8875f2d6c126c6f623f146a4c0699d83167306c69f82`
  - Public filename/alt text use neutral descriptive wording.
- GALLERY-04: `/images/gallery/face-painting/happy-faces-la-face-painting-black-tribal-swirl-eye-design-01.webp`
  - SHA256: `fc330c80b51bfc2ff169bbc221888fd9aa0fc21555d42395b02121c219ca588b`
- GALLERY-05: `/images/gallery/face-painting/happy-faces-la-face-painting-rainbow-unicorn-full-face-glitter-flowers-01.webp`
  - SHA256: `03dbca202e3f604ae9c42f7c2ae8609dd3ae3a122b1aaf6b3340070dc9774538`
- GALLERY-06: `/images/gallery/balloon-twisting/happy-faces-la-balloon-twisting-red-balloon-sword-outdoor-party-01.webp`
  - SHA256: `687463ecf286f67e65418afd2b493fb1820dd11282d32fe2ceb1fa1bb2984856`

Owner-selected staged extras, not homepage-featured in the current six-image layout:

- GALLERY-07: `/images/gallery/balloon-twisting/happy-faces-la-balloon-twisting-blue-balloon-animal-outdoor-party-01.webp`
  - SHA256: `714f877e8b68dcceb0c21fb402f453584f533be157d7bbf0578acda5924962c8`
- GALLERY-08: `/images/gallery/balloon-twisting/happy-faces-la-balloon-artist-table-bounce-house-party-01.webp`
  - SHA256: `f2c7e66948bcb67c69079b5fe5c4cbcfdd1f036e47b3662a6f2e6e81e52f58fe`

Gallery rendering note:

- Homepage gallery images render inside the existing 4:5 cover frame.
- Images are not stretched.
- The old six homepage gallery images remain on disk but are no longer featured.

## Forbidden Old Copy / CTA Patterns

Forbidden as primary homepage or sticky-booking path unless owner explicitly re-approves:

- `Get Quote -> /contact/`
- `Get Availability & Pricing -> /contact/`
- `Request Availability & Pricing`
- inquiry-only homepage primary CTA
- homepage without `Plan My Party`

## Forbidden Old Image Paths / Hashes

Owner-approved forbidden service-card regression:

- `/images/services/happy-faces-la-balloon-twisting-service.webp`
  - SHA256: `aa712166ea4932196fafd200d4b88fc4da3e53e90509823799c39d7ed568c957`
  - Reason: replaced by owner-selected balloon twisting Drive asset.

Forbidden replaced homepage gallery paths:

- `/images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-01.webp`
- `/images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-02.webp`
- `/images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-03.webp`
- `/images/gallery/balloon-twisting/happy-faces-la-balloon-twisting-kids-party-los-angeles-01.webp`
- `/images/gallery/face-gems/happy-faces-la-face-gems-birthday-party-los-angeles-01.webp`
- `/images/gallery/face-gems/happy-faces-la-face-gems-birthday-party-los-angeles-02.webp`

The deployment guard must fail if:

- any forbidden replaced homepage image path returns;
- any homepage image path appears that is not present in the manifest;
- any approved/source-baseline image hash changes unexpectedly;
- any old inquiry-only homepage CTA returns as the primary path.

## Screenshot Baseline

Captured evidence from the prior visual regression diagnosis:

- Desktop screenshot: `evidence/homepage-visual-regression/screenshots/live-home-debug-20260615171855.png`

Required before closure:

- Owner/auditor acceptance of the v0.3 source baseline: complete.
- Controlled live desktop and mobile screenshot proof after deploy.
- Live visual lock proof against `homepage-visual-baseline-v0.3-owner-gallery-20260616`.
- Image manifest hashes accepted by owner/auditor.

## Closure Condition

`BLK-PUBLIC-LIVE-HOMEPAGE-VISUAL-IMAGE-REGRESSION-001` may close only after a controlled patch/deploy proof shows:

- live custom domain matches the owner-approved baseline;
- build-time visual/image lock passes;
- live visual/image lock passes;
- forbidden old images/copy are absent;
- owner-selected images/copy are present;
- deployment provenance marker is present;
- no unrelated production mutation occurred.
