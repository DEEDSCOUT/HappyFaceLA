# ADR-001: HFLA Online Booking Architecture

Status: Proposed (Specification Only)
Date: 2026-05-27
Decision Scope: Architecture contracts only, no runtime implementation

## 1. Decision Summary

- Current confirmed stack: Astro static site with Cloudflare Pages-style deployment and Cloudflare Pages Functions for API endpoints.
- Confirmed existing lead-flow architecture: website quote form posts to `/api/lead`, server validates payload and forwards outbound webhook to configured `CRM_WEBHOOK_URL`.
- Selected future direction: same-domain `/book` customer experience.
- Implementation status: specification only, not implemented.
- Release status: blocked from production activation pending commercial/legal release gates.

## 2. Evidence Basis

Repository evidence:

- Build/runtime stack: `package.json`, `astro.config.mjs`, `wrangler.toml`, `README.md`.
- Lead flow frontend: `src/components/conversion/QuoteForm.astro`.
- Lead flow backend forwarding: `functions/api/lead.ts`.
- Existing public policy/copy conflict sources: `src/components/sections/TrustSection.astro`, `src/pages/booking-policy.astro`, `src/data/packages.ts`, `src/data/faqs.ts`.
- Tracking baseline: `src/layouts/BaseLayout.astro`, `src/data/tracking.ts`.

Live route findings (read-only checks):

- `https://happyfacesla.com/book/` returned 404 during audit.
- `book.happyfacesla.com` resolution was not present during audit session (NXDOMAIN result in terminal check).
- Current customer pages confirmed active for `/`, `/pricing/`, `/contact/`, `/booking-policy/`, `/privacy-policy/`.

## 3. Corrected Unknowns

The following remain unknown or unproven and must not be assumed complete:

- Cloudflare dashboard production settings and environment bindings are not proven by repository-only evidence.
- DNS/dashboard routing controls are not proven beyond local command checks.
- CRM webhook destination platform, retention lifecycle, access controls, and automation logic are external unknowns.
- Google Ads conversion tracking is UNKNOWN / NOT PROVEN ACTIVE (presence of `generate_lead` event alone is insufficient proof).
- Stripe, calendar scheduling, and SMS automation are not present or not proven in runtime architecture.
- Insurance claim support documentation is not verified; public claim requires release QA and evidence package.

## 4. Architecture Alternatives Considered

1. Native Astro page integration (directly inside existing site pages)

- Pros: lowest initial change surface.
- Cons: tight coupling to marketing site; weaker separation for booking state/payment boundaries.

1. Isolated booking module in current Astro + Cloudflare deployment

- Pros: same deployment stack, operational continuity, route-level control.
- Cons: requires strict boundary discipline to avoid mixing with marketing code.

1. Independently deployed booking application mounted under `/book`

- Pros: strongest service boundary and independent scaling while preserving same-domain UX.
- Cons: added deployment/routing coordination and ops complexity.

1. Subdomain model `book.happyfacesla.com`

- Pros: strong isolation.
- Cons: additional DNS/TLS/routing overhead and potential conversion friction.

1. Third-party embedded booking product

- Pros: faster initial delivery.
- Cons: weaker control over release-manifest rules, webhook semantics, and long-term data ownership.

## 5. Selected Architecture Direction

Direction selected: same-domain `/book`.

Open deployment decision (intentionally unresolved in this ADR until platform evidence is verified):

- Option A: isolated route/module inside current Astro + Cloudflare Pages deployment.
- Option B: independently deployed booking application reverse-routed or mounted under `/book`.

Both options must preserve the same business boundary:

- customer runtime reads only released manifest records;
- no direct workbook reads;
- server-authoritative eligibility, pricing, booking state, and payment transitions.

## 6. System Context Diagram

```mermaid
flowchart LR
    C[Customer Browser]
    M[Marketing Website\nAstro Pages]
    B[/book Application Boundary]
    RM[Released Manifest Store\nVersioned + Released Only]
    ES[Eligibility + Pricing Service\nServer Authoritative]
    SS[Booking + Hold State Store]
    PA[Payment Adapter\nProvider Integration Boundary]
    WH[Webhook Handler\nVerified Provider Events]
    NA[Notification Adapter\nEmail/SMS/CRM Outbound]
    CA[Calendar Sync Adapter]
    AL[Audit Log\nImmutable Event Trail]
    AR[Admin + Release Control Surface]

    C --> M
    C --> B
    B --> RM
    B --> ES
    ES --> SS
    B --> SS
    SS --> PA
    PA --> WH
    WH --> SS
    SS --> NA
    SS --> CA
    RM --> AL
    ES --> AL
    SS --> AL
    WH --> AL
    AR --> RM
    AR --> SS
```

Data-flow intent:

- marketing pages continue lead intake and route discovery traffic;
- `/book` consumes only released, versioned manifest data;
- booking status changes are server-managed;
- payment confirmation requires verified webhook or later-approved admin process;
- all critical transitions produce audit events.

## 7. Release and Rollback Boundary

- Existing quote flow remains available as fallback path while `/book` is feature-flagged, disabled, or not yet released.
- Rollback model: disable `/book` availability (or route exposure) without changing existing `/contact` quote path.
- No public package/payment/policy switchover is authorized until preconditions are met.

## 8. Production Preconditions

1. Commercial release artifact approved and versioned (`release_manifest` with released status).
1. Counsel-approved terms documents published and referenced by `terms_version`.
1. Payment rule version approved with terminology guardrails (no hard-coded fixed deposit behavior).
1. Booking state machine, hold logic, and concurrency model implemented and test-evidenced.
1. Payment webhook verification and server-confirmed booking transitions validated in test mode.
1. Privacy/data classification controls and retention decisions approved.
1. External system controls evidenced (dashboard settings, environment bindings, monitoring, rollback plan).
1. Copy conflict remediation package approved by owner/counsel and scheduled for authorized public edits.

---

This ADR does not authorize production code changes, deployment, payment activation, or policy/copy publication.
