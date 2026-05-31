# DATA_CLASSIFICATION_PRIVACY_MATRIX_V1

Status: Draft Contract (Documentation Only)
Date: 2026-05-27

## Consent Separation Rules

Required booking acknowledgements (required for booking flow):

- terms acceptance tied to `terms_version`.
- payment authorization acknowledgement tied to `payment_rule_version`.

Optional media/photo consent (must be independent and optional):

- consent to publish testimonials/photos/videos.
- consent to publish identifiable details (name/city/event context).

Marketing/contact consent (separate from booking legal terms):

- consent to be contacted by phone/SMS/email for inquiry follow-up.

## Data Classification Matrix

| Data Element | Collection Purpose | Required/Optional | Sensitivity Class | Public/Private Handling | Retention Requirement | Access-Control Need | Third-Party Sharing Exposure | Production-Release Dependency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Customer name | Identify requester and booking contact | Required | Personal Data | Private by default; public only with explicit media/testimonial consent | To be defined by policy | Role-based business access | CRM/webhook destination (external unknown) | Release privacy controls and data policy |
| Phone | Contact and operational coordination | Required | Personal Data | Private | To be defined | Restricted operations/sales access | CRM/SMS tooling if enabled | Consent and outbound-contact rule release |
| Email | Contact, confirmations, receipts | Required | Personal Data | Private | To be defined | Restricted operations/sales access | CRM/email provider if enabled | Consent and communications release |
| Event date/time | Scheduling and availability | Required | Operational Personal Data | Private | To be defined | Scheduling/ops access | Potential calendar sync providers | Availability engine and policy release |
| Event city | Travel eligibility and pricing zone | Required | Operational Personal Data | Private | To be defined | Ops/pricing access | CRM/webhook payload | Travel rule release |
| Event address/cross streets | Precise travel and logistics | Optional (current quote form) | Sensitive Location Data | Private, minimum exposure | To be defined | Strict need-to-know access | CRM/webhook payload | Travel and privacy policy release |
| Event type | Eligibility routing (instant vs custom) | Required | Operational Data | Private | To be defined | Ops/booking access | CRM/webhook payload | Eligibility/custom routing release |
| Guest count | Capacity and package recommendation | Required | Operational Data | Private | To be defined | Ops/pricing access | CRM/webhook payload | Capacity rule release |
| Children count | Capacity/context for child-focused events | Optional (current form) | Sensitive Child-Related Context | Private | To be defined with counsel | Restricted access | CRM/webhook payload | Child-data handling policy release |
| Child age | Service suitability and safety planning | Optional (future) | Sensitive Child-Related Context | Private | To be defined with counsel | Restricted access | Potential CRM storage | Counsel-approved collection rule |
| Skin sensitivity information | Safety accommodation planning | Optional | Sensitive Health-Adjacent Context | Private and minimized | To be defined with counsel | Restricted access, least privilege | Potential CRM storage | Counsel-approved sensitive-data policy |
| Customer notes/message | Event details and constraints | Optional | Personal/Operational Data | Private | To be defined | Role-based access | CRM/webhook payload | Privacy policy and access controls release |
| Service selections | Pricing and staffing composition | Required | Operational Data | Private in booking process | To be defined | Booking/ops access | CRM/webhook payload | Released service/package catalog |
| Price summary | Payment and audit reference | Required when checkout enabled | Commercial Sensitive Data | Private; public display controlled by released copy | To be defined | Finance/ops access | Payment provider metadata, receipts | Released manifest + payment rules |
| Payment identifiers | Reconciliation and dispute handling | Required for paid bookings | Financial Sensitive Metadata | Private | To be defined with finance/legal | Finance/ops restricted | Payment processor + accounting integrations | Payment boundary release |
| Terms acceptance | Legal enforceability of booking | Required for checkout | Legal Record | Private with audit trace | To be defined with counsel | Compliance/ops access | Potential legal evidence workflows | Terms document release |
| Release version | Traceability to approved configuration | Required | Governance Data | Private operational metadata | To be defined | Engineering/ops/compliance access | Internal systems only | Release-manifest controls |
| Photo/video consent | Media publication authorization | Optional | Consent Record | Private record; governs public publication | To be defined with counsel | Marketing + compliance access | External publishing channels if approved | Counsel-approved consent model |
| Uploaded vendor/COI documents | Venue/vendor compliance requirements | Optional (custom lane) | Sensitive Document Data | Private, restricted document store | To be defined with counsel/ops | Strict restricted access | Potential secure storage vendor | Custom lane document policy release |
| Attribution parameters (`utm_*`, `gclid`, `fbclid`, `msclkid`) | Marketing attribution and optimization | Optional/auto-captured | Tracking Data | Private analytics handling | To be defined | Marketing/analytics access | Analytics/CRM tooling | Analytics governance release |
| Audit logs | Security, compliance, troubleshooting | Required | Security/Governance Data | Private immutable logs | To be defined with compliance | Restricted engineering/compliance access | Monitoring/logging providers | Audit policy release |

## Privacy Control Requirements

1. Data minimization per lane:

- Instant Book captures only what is required for booking/payment execution.
- Custom lane can capture additional operational documents with explicit purpose.

1. Purpose limitation:

- Collected fields must map to documented processing purpose.

1. Access controls:

- Enforce least privilege with role segmentation (sales, operations, finance, compliance).

1. Logging and auditability:

- Access to sensitive records must be auditable.

1. Deletion/retention governance:

- Production release requires approved retention schedules and deletion handling.

## External Unknowns (Not Proven in Repository)

- CRM destination storage and retention behavior.
- Third-party automation fan-out and downstream access controls.
- Final legal retention obligations for booking and payment records.

---

This matrix is a planning contract and does not authorize new collection fields in production runtime.
