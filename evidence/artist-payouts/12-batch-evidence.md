# 12 — Batch evidence

Status: **MONDAY/WEDNESDAY CONTROL FLOW IMPLEMENTED; NO REAL BATCH EXECUTED**

## Eligibility and schedule

- Eligibility is derived server-side from authoritative closeout, actual end time, source revision, compensation equation, artist mapping, owner-exception state, and current Stripe readiness.
- Processing days are Los Angeles Monday and Wednesday. The documented conservative rule uses the next processing date strictly after controls clear; a different same-day cutoff requires owner approval.
- Preparation and execution reject past, future, and non-Monday/Wednesday dates before a Transfer write.

## Owner review and funding

A batch snapshot includes each artist/assignment, amount, source revision, destination, memo, material digest, item count, and total. Owner approval and execution are separate exact-confirmation actions. Execution revalidates the approval, source, Stripe recipient, available USD platform balance, and configured reserve.

Preparation reviews at most ten candidates per batch, counts every additional eligible candidate, and records that exact remainder so the dashboard directs the owner to a subsequent batch. Prepared and readiness-blocked items together cannot exceed the ten-item D1-safe review bound; local repository tests enforce a 100-bind ceiling for every statement and prove an eleven-candidate inventory becomes one ten-item batch plus one exact remaining candidate.

If the funding preview is unavailable, the dashboard warns that no batch is represented as funded. Execution still performs its own authoritative balance/reserve check. Insufficient available funds block before item claims.

## No payment claim

No Stripe Sandbox was accessible and no live Transfer was authorized. Therefore there is no provider batch ID, Transfer list, payout outcome, or Monday/Wednesday operational run to report. Batch acceptance remains pending nonproduction execution with synthetic artists, an approved reserve, and verified expected platform Account binding.
