# BOOKING_DOMAIN_STATE_MACHINE_V1

Status: Draft Contract (Documentation Only)
Date: 2026-05-27

## Scope

This document defines the future booking domain model and state machine contract for the `/book` architecture direction. No runtime implementation is authorized in this phase.

## Entities

- `service`: released service definition available for booking logic.
- `package`: released package definition containing one or more services.
- `package_price`: released price record for a package under a specific rule version.
- `add_on`: released optional add-on that may be applied to a booking.
- `capacity_rule`: released throughput/guest-capacity recommendation logic.
- `travel_rule`: released travel zone and travel computation logic.
- `payment_rule`: released payment behavior and terminology rule set.
- `terms_version`: released legal terms identifier required at acknowledgment.
- `availability_slot`: normalized date/time capacity unit for booking checks.
- `booking_hold`: temporary reservation lock for selected slot/capacity.
- `booking`: canonical booking aggregate root.
- `booking_item`: line-item composition of selected services/packages/add-ons.
- `payment`: provider-agnostic payment record linked to a booking.
- `consent_record`: explicit capture of terms, contact, and optional media consent.
- `release_manifest`: released configuration package applied to runtime decisioning.
- `audit_event`: immutable event trail record for state and rule decisions.
- `custom_booking_request`: structured request for Guided Custom Booking lane.

## Booking States

Minimum supported states:

- `DRAFT`
- `CUSTOM_REVIEW`
- `HELD`
- `PAYMENT_PENDING`
- `CONFIRMED`
- `EXPIRED`
- `CANCELLED`
- `RESCHEDULE_REQUESTED`
- `REFUNDED` (only where policy/counsel permits in a later release)

## Allowed State Transitions

| From | To | Allowed By | Notes |
| --- | --- | --- | --- |
| DRAFT | CUSTOM_REVIEW | Server rule evaluation | For schools/festivals/corporate/multi-artist/exception cases. |
| DRAFT | HELD | Server hold service | Requires eligibility pass, released manifest, and slot availability. |
| HELD | PAYMENT_PENDING | Server payment-intent creation | Hold must still be active and unexpired. |
| PAYMENT_PENDING | CONFIRMED | Verified payment webhook or approved admin flow | Browser-only actions are insufficient. |
| HELD | EXPIRED | Hold expiry worker | Triggered when hold TTL passes without progression. |
| PAYMENT_PENDING | EXPIRED | Payment timeout policy | Timeout semantics governed by payment rule. |
| DRAFT | CANCELLED | Customer or admin | Allowed before hold commitment. |
| HELD | CANCELLED | Customer or admin | Allowed by policy and timing constraints. |
| CONFIRMED | RESCHEDULE_REQUESTED | Customer or admin | Does not imply automatic reschedule approval. |
| CONFIRMED | REFUNDED | Admin/system policy process | Only with policy-permitted refund pathway. |

## Prohibited State Transitions

- `DRAFT` -> `CONFIRMED`
- `CUSTOM_REVIEW` -> `CONFIRMED` without approved custom workflow outcome
- `HELD` -> `CONFIRMED` without verified server-side payment or approved admin path
- Any transition directly initiated by browser/client into `CONFIRMED`
- `EXPIRED` -> `CONFIRMED` without a new hold/payment cycle

Critical invariant:

- `CONFIRMED` must require verified server-side payment confirmation through a valid webhook or another later-approved administrative process.

## Concurrency and Hold Rules

1. Hold duration must be configurable (`hold_ttl_seconds`) by released rule, not hard-coded in client code.
1. Hold creation must be atomic against availability source of truth.
1. Same-slot conflict resolution must be deterministic: first committed hold wins, later requests receive conflict response.
1. Expired holds must be released automatically and produce audit events.
1. Payment attempts against expired holds must fail safely and require a new hold.
1. Calendar sync failures must not silently confirm bookings.
1. Calendar sync failure handling requires explicit fallback policy.

- Keep booking in non-confirmed reconciliation state when external sync outcome is uncertain.
- Notify operations for manual intervention.
- Write audit events for failure and resolution.

1. Every hold create/extend/expire/release event must write an `audit_event`.

- Actor/system source.
- Manifest/rule versions in effect.
- Slot identifier and booking reference.
- Timestamp and outcome.

## Audit Event Minimum Fields

- `event_id`
- `event_type`
- `occurred_at`
- `actor_type`
- `actor_id` (nullable for system events)
- `booking_id` (nullable for pre-booking events)
- `booking_hold_id` (nullable)
- `release_version`
- `terms_version`
- `payment_rule_version`
- `travel_rule_version`
- `result`
- `details_json`

## Lane Routing Constraint

- Instant Book lane may proceed only when eligibility rules pass under released manifest constraints.
- Guided Custom Booking lane must capture and persist `custom_booking_request` when any custom-routing condition is met.

---

This contract is normative for future implementation planning and test design, but it does not authorize runtime code changes in this phase.
