# PAYMENT_BOUNDARY_CONTRACT_V1

Status: Draft Contract (Documentation Only)
Date: 2026-05-27

## Payment Principles

- Amounts are server-calculated only.
- Browser/client is never price-authoritative.
- No hard-coded `$50` deposit behavior is permitted.
- Payment terminology (reservation payment, retainer, deposit) must be configured only through counsel-approved released payment rules.
- Test mode is mandatory before any live activation.
- Booking confirmation requires verified payment webhook (or later-approved administrative process).

## Future Interaction Contract

1. Booking summary validation

Server validates selected package/add-ons/travel/capacity against active released manifest and rejects stale or missing manifest references.

1. Terms acknowledgment capture

Server records terms acknowledgment with `terms_version` and timestamp before payment initiation.

1. Availability hold creation

Server creates atomic hold and returns hold reference with expiry metadata.

1. Server-generated payment intent

Server creates provider payment intent using validated amount and hold reference. Provider identifiers are stored server-side and returned only as needed for client payment UI.

1. Customer payment attempt

Customer completes payment through provider client UX using server-issued intent context.

1. Webhook verification

Server verifies provider signature and event authenticity. Unverified or replayed events are rejected and audited.

1. Confirmed-booking transition

On verified success event, server transitions booking state to `CONFIRMED`. Client callback alone cannot confirm booking.

1. Receipt/notification process

After server confirmation, notification adapter sends customer and operations messages.

1. Failed or expired-payment behavior

Failed payment keeps booking non-confirmed and may retain or release hold per released rule. Expired hold invalidates pending payment path and requires new hold cycle.

## Payment Data Model (Provider-Agnostic)

| Field | Description |
| --- | --- |
| `payment_id` | Internal payment record identifier |
| `booking_id` | Linked booking identifier |
| `booking_hold_id` | Linked hold identifier (if applicable) |
| `provider` | Payment provider key |
| `provider_payment_intent_id` | Provider-side intent identifier |
| `provider_customer_id` | Optional provider customer reference |
| `amount_minor` | Total amount in minor currency units |
| `currency` | ISO currency code |
| `status` | Internal payment status (`CREATED`, `REQUIRES_ACTION`, `SUCCEEDED`, `FAILED`, `CANCELLED`) |
| `payment_rule_version` | Rule version used for payment behavior |
| `terms_version` | Terms version accepted for this payment attempt |
| `release_version` | Release manifest version in effect |
| `webhook_event_id` | Last processed provider webhook event reference |
| `webhook_verified` | Boolean verification result |
| `failure_code` | Provider failure code (nullable) |
| `failure_message` | Provider failure detail (nullable, sanitized) |
| `created_at` | Record creation timestamp |
| `updated_at` | Last update timestamp |
| `created_by` | Actor/system source |
| `audit_correlation_id` | Correlation key for audit trail |

## Webhook Requirements

- Verify signature with provider secret.
- Enforce idempotency on webhook event IDs.
- Record all webhook processing outcomes to audit log.
- Reject malformed payloads without mutating booking confirmation state.

## Explicitly Prohibited Implementation in Phase 2A

- Adding payment SDK dependencies.
- Implementing PaymentIntent API calls.
- Creating payment webhook runtime endpoints.
- Configuring live payment credentials.
- Enabling customer-facing payment flows.

---

This document defines boundaries only. Implementation remains blocked until release gates are approved.
