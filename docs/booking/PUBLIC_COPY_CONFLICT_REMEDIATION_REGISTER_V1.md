# PUBLIC_COPY_CONFLICT_REMEDIATION_REGISTER_V1

Status: Documentation Register (No Public Edits Authorized)
Date: 2026-05-27

Implementation status for every row in this register is fixed as:

- `NOT AUTHORIZED FOR PUBLIC EDIT YET`

## Conflict Register

| Conflict Item | Route | Repository Source File | Current Published Text or Accurate Summary | Risk Type | Release Blocker Status | Required Owner | Remediation Dependency | Implementation Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Homepage legacy Birthday Party Package | `/` | `src/data/packages.ts`, `src/pages/index.astro` | Legacy package structure and naming still presented in package preview. | Commercial, UX | BLOCKS controlled package release alignment | CEO, Developer | Released package model and approved copy map | NOT AUTHORIZED FOR PUBLIC EDIT YET |
| Homepage legacy Face Painting + Balloons Package | `/` | `src/data/packages.ts`, `src/pages/index.astro` | Legacy combined package naming remains public. | Commercial, UX | BLOCKER | CEO, Developer | Released package taxonomy | NOT AUTHORIZED FOR PUBLIC EDIT YET |
| Homepage “Great for parties of all sizes.” | `/` | `src/data/packages.ts` | Capacity claim not tied to released guest-capacity rule. | Trust, Legal, UX | BLOCKER | CEO, Counsel, Developer | Capacity rules release + approved wording | NOT AUTHORIZED FOR PUBLIC EDIT YET |
| Homepage “Bookings start at $150.” | `/` | `src/components/sections/TrustSection.astro` | Legacy starting-price statement remains public. | Commercial, Legal, Conversion | BLOCKER | CEO, Counsel | Released pricing manifest | NOT AUTHORIZED FOR PUBLIC EDIT YET |
| Homepage “$50 deposit reserves your date.” | `/` | `src/components/sections/TrustSection.astro` | Fixed deposit language conflicts with future configurable payment rule. | Legal, Commercial, Trust | BLOCKER | Counsel, CEO | Counsel-approved payment rule terminology | NOT AUTHORIZED FOR PUBLIC EDIT YET |
| Homepage insurance statement | `/` | `src/components/sections/InsuranceBadgeSection.astro` | Insurance coverage claim requires supporting documentation and QA packet. | Legal, Trust | BLOCKER (evidence verification) | Operations, Counsel, CEO | Insurance evidence and release QA checklist | NOT AUTHORIZED FOR PUBLIC EDIT YET |
| Pricing-page legacy package structure | `/pricing/` | `src/pages/pricing.astro`, `src/data/packages.ts` | Legacy package model not yet mapped to release-manifest contract. | Commercial, UX | BLOCKER | CEO, Developer | Manifest-driven package presentation plan | NOT AUTHORIZED FOR PUBLIC EDIT YET |
| Pricing-page quote-only flow | `/pricing/` | `src/pages/pricing.astro`, `src/components/conversion/QuoteForm.astro` | Current flow routes to quote intake; no lane split for instant eligibility. | Conversion, UX | BLOCKER | Developer, Operations | Lane-routing spec implementation (future phase) | NOT AUTHORIZED FOR PUBLIC EDIT YET |
| Booking-policy “$50 deposit” | `/booking-policy/` | `src/pages/booking-policy.astro` | Fixed amount language conflicts with configurable payment policy requirement. | Legal, Commercial | BLOCKER | Counsel, CEO | Approved terms and payment-rule release | NOT AUTHORIZED FOR PUBLIC EDIT YET |
| Booking-policy non-refundable language | `/booking-policy/` | `src/pages/booking-policy.astro` | Refundability statement requires counsel-reviewed terms versioning for booking system. | Legal, Trust | BLOCKER | Counsel | Terms documents versioned release | NOT AUTHORIZED FOR PUBLIC EDIT YET |
| Booking-policy one-time transfer language | `/booking-policy/` | `src/pages/booking-policy.astro` | Transfer policy requires rules alignment with state transitions and operations policy. | Legal, Operations | BLOCKER | Counsel, Operations | Reschedule/transfer workflow policy release | NOT AUTHORIZED FOR PUBLIC EDIT YET |
| Travel wording requiring released rule alignment | `/booking-policy/` | `src/pages/booking-policy.astro` | Travel charges wording not linked to explicit released travel-rule versioning. | Commercial, Legal | BLOCKER | CEO, Counsel, Developer | Travel-rule contract and released version | NOT AUTHORIZED FOR PUBLIC EDIT YET |
| FAQ pricing wording | `/faq/` | `src/data/faqs.ts`, `src/pages/faq.astro` | FAQ references legacy pricing phrasing and quote framing. | Commercial, UX | BLOCKER | CEO, Developer | Approved FAQ copy pack tied to release version | NOT AUTHORIZED FOR PUBLIC EDIT YET |
| Schools/festivals generic quote route | `/school-festival-face-painting-los-angeles/` | `src/pages/school-festival-face-painting-los-angeles.astro`, `src/components/sections/EventTypePageSections.astro` | Should route to custom intake lane but currently uses generic quote flow. | UX, Operations, Conversion | BLOCKER | Developer, Operations | Custom lane intake contract implementation | NOT AUTHORIZED FOR PUBLIC EDIT YET |
| Corporate-events generic quote route | `/corporate-event-face-painting-los-angeles/` | `src/pages/corporate-event-face-painting-los-angeles.astro`, `src/components/sections/EventTypePageSections.astro` | Should route to custom intake lane but currently uses generic quote flow. | UX, Operations, Conversion | BLOCKER | Developer, Operations | Custom lane intake contract implementation | NOT AUTHORIZED FOR PUBLIC EDIT YET |
| Privacy-policy expansion for booking/payment system | `/privacy-policy/` | `src/pages/privacy-policy.astro` | Current policy does not yet cover full booking-state, payment processing, retention, and webhook lifecycle requirements. | Privacy, Legal, Trust | BLOCKER | Counsel, CEO, Developer | Privacy matrix approval + counsel review | NOT AUTHORIZED FOR PUBLIC EDIT YET |

## Notes

- This register documents conflicts only and does not authorize copy edits in this phase.
- All remediation actions remain gated by controller/auditor approval and release governance.
