# OWNER SOURCE OF TRUTH

This file is the authoritative, owner-owned record of the facts that must never
silently regress. It exists because of repeated stale-branch / old-baseline
regressions (phone number reverting, homepage/soccer pages reverting, Plan My
Party work disappearing, SEO state reverting).

**Mechanical enforcement:** `scripts/guard-owner-baseline.mjs`
(`npm run guard:owner-baseline`). Every agent runs it before editing; CI runs it
on every PR to `main`. If a value below changes, the guard and this file must be
updated **together, in the same reviewed PR, with owner authorization** — never
one without the other.

---

## Release / deployment

| Fact | Value |
| --- | --- |
| Production branch | `main` |
| Deployment method | Cloudflare Pages **git auto-deploy from `main`** |
| Manual `dist` upload | **FORBIDDEN** unless the owner separately authorizes it in writing |
| `wrangler pages deploy dist` | **FORBIDDEN** — production deploys only via Cloudflare Pages git auto-deploy from `main` |

Production == `main`. Merging to `main` ships to production. Do not run
`wrangler pages deploy dist`, do not upload a `dist` build by hand.

> **Cloudflare production-source verification (owner/admin to confirm):**
> Cloudflare Pages → project `happyfacesla` → Settings → Builds & deployments →
> Production branch must read `main`. If it reads anything else, **stop** — that
> is a production-source mismatch and a hard-stop condition.

---

## Business facts (centralized in `src/data/business.ts`)

`src/data/business.ts` is the **single source of truth** for these. Header,
footer, schema, and CTAs should consume it rather than hardcoding values.

| Fact | Value | Status |
| --- | --- | --- |
| Business name | `Happy Faces LA` | confirmed |
| Canonical website | `https://happyfacesla.com` | confirmed |
| Canonical business phone | `+13108002860` | **OWNER CONFIRM REQUIRED** — pinned to current `main` to block regression; not yet formally confirmed as final |
| Canonical display phone | `(310) 800-2860` | **OWNER CONFIRM REQUIRED** — same as above |
| Business email | `info@happyfacesla.com` | owner-provided in issue #38 work order |
| Instagram | `https://www.instagram.com/happy_faces_la/` | confirmed |

### Phone: why "OWNER CONFIRM REQUIRED" while also pinned

The owner reports phone-number regressions. The number currently on `main`
(`+13108002860` / `(310) 800-2860`) is **pinned by the guard** so it cannot
silently change. That pin is *anti-regression*, not a claim that the owner has
finalized it. If the owner confirms a different canonical number, change
`src/data/business.ts`, the `EXPECTED` block in `scripts/guard-owner-baseline.mjs`,
and this table — all in one PR.

### Blocked / old phone numbers (must never reappear as the public contact number)

The guard fails if any of these appear anywhere in `src/` or `public/`:

- `818-619-5506` / `(818) 619-5506` / `+18186195506`
- `323-747-9474` / `(323) 747-9474` / `+13237479474`

---

## Page / SEO baselines

| Baseline | Marker the guard enforces |
| --- | --- |
| Primary conversion page | `/plan-my-party/` exists with trailing-slash canonical |
| Homepage visual baseline | `homepage-visual-baseline-v0.3-owner-gallery-20260616` |
| Homepage SEO title | `LA Face Painting & Kids Party Entertainment \| Happy Faces LA` |
| Homepage FAQ schema | `faqJsonLd(commonFaqs)` |
| Homepage primary H2 | `Kids Party Entertainment Services in Los Angeles` |
| Soccer page | `src/pages/soccer-fan-face-painting-los-angeles.astro` with title `Soccer Fan Face Painting Los Angeles \| Happy Faces LA` |
| Trailing slash policy | `astro.config.mjs` → `trailingSlash: 'always'` |
| Sitemap exclusion | `/booking-confirmed` and `/booking-confirmed/` (noindex post-payment page) |
| Technical SEO baseline | PR #12 (homepage canonical/title/schema markers above) |

> **Sitemap note — `/reviews` is intentionally NOT excluded.** Earlier work orders
> listed `/reviews` as a sitemap exclusion, but current `main` deliberately
> surfaced the reviews page for SEO ("seo: fix reviews page discovery"). The guard
> therefore does **not** re-exclude `/reviews`. Re-adding that exclusion would be a
> regression. Only `/booking-confirmed` is enforced as a hard exclusion.

### Critical routes that must exist

- `/`
- `/plan-my-party/`
- `/face-painting-cost-los-angeles/`
- `/pricing/`
- `/services/`
- `/gallery/`
- soccer page: `/soccer-fan-face-painting-los-angeles/` (route present and confirmed)

---

## Images

Image changes are owner-approval-gated. `scripts/owner-baseline/image-inventory.json`
records every tracked image (path + byte size). The guard fails if any image is
added, removed, or modified. To approve image changes:

1. Get explicit owner approval.
2. Run `node scripts/guard-owner-baseline.mjs --update-images`.
3. Commit the updated `scripts/owner-baseline/image-inventory.json` in the same PR.

No generated `dist` is committed or used as source (`dist/` is gitignored).

---

## How to change something in this file

A value here changes **only** when the owner authorizes it. The PR must:

1. Cite the owner authorization source (issue comment, message, etc.).
2. Update `src/data/business.ts` / page / config as needed.
3. Update `scripts/guard-owner-baseline.mjs` `EXPECTED` / marker constants to match.
4. Update this file.
5. Pass `npm run guard:owner-baseline` and `npm run build`.
