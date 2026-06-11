# Commercial Booking Evidence Register

Date: 2026-06-11
Release state: NO_GO

## Evidence Records

| Evidence ID | Evidence Type | Status | Accepted? | Auditor Verdict | Next Dependency | What It Proves |
| --- | --- | --- | --- | --- | --- | --- |
| EVD-PUBLIC-BOOKING-R13-R9-001 | Admin slot workflow and browser QA proof | BLOCKED / Not Submitted | No | Not submitted | Provide Preview `ADMIN_SLOT_TOKEN` through a non-exposing runtime environment variable | Missing/wrong admin token fail closed; fresh Preview deployment exists; correct-token admin create/read/update, browser QA, checkout hold, webhook/simulation, idempotency, and cleanup proof are blocked. |
| EVD-PUBLIC-BOOKING-R13-R8D-001 | Preview `BOOKINGS_KV` binding recheck, current-code Preview redeploy, checkout/webhook proof rerun | Accepted | Yes | Accepted | R13-R9 authorization basis satisfied | Preview `BOOKINGS_KV` is bound after fresh current-code Preview redeploy; checkout fail-closed/no-url behavior, Stripe TEST checkout hold creation, webhook fail-closed behavior, approved TEST reservation/idempotency simulation, cleanup, and leak scans were rerun. |
| EVD-PUBLIC-BOOKING-R13-R8-001 | Full R13-R8 public booking Preview proof | Accepted for R13-R9 authorization basis | Yes for R13-R9 entry | Accepted for R13-R9 entry | Complete R13-R9 after admin-token blocker is resolved | R13-R8 proof chain is sufficient to authorize R13-R9, per owner confirmation. |

## R13-R9 Evidence Pointers

| Artifact | Purpose |
| --- | --- |
| `docs/commercial-booking/PUBLIC_BOOKING_R13_R9_ADMIN_SLOT_WORKFLOW_AND_BROWSER_QA_PROOF_REPORT.md` | Canonical R13-R9 blocked execution report |
| `https://ff381b9f.happyfacesla.pages.dev` | Fresh R13-R9 Preview deployment |
| `https://r13-r9-proof.happyfacesla.pages.dev` | Fresh R13-R9 Preview alias |

## R13-R8D Evidence Pointers

| Artifact | Purpose |
| --- | --- |
| `docs/commercial-booking/PUBLIC_BOOKING_R13_R8D_PREVIEW_BOOKINGS_KV_BINDING_RECHECK_CURRENT_CODE_PREVIEW_REDEPLOY_CHECKOUT_WEBHOOK_PROOF_RERUN_REPORT.md` | Canonical R13-R8D continuation report |
| `evidence/r13-r8d/run_continuation_proofs.mjs` | HTTP proof runner for fresh Preview deployment |
| `evidence/r13-r8d/continuation_http_results.json` | P1/P2/P5/P6/P7/P8a/P10 runtime evidence |
| `evidence/r13-r8d/continuation_seed.sql` | Preview-only synthetic D1 seed |
| `evidence/r13-r8d/continuation_p8_simulate.sql` | Approved TEST reservation simulation |
| `evidence/r13-r8d/continuation_p9_duplicate_attempt.sql` | Duplicate/idempotency simulation |
| `evidence/r13-r8d/continuation_cleanup.sql` | Preview-only synthetic D1 cleanup |

## Blocker Register Summary

| Blocker ID | Status | Wording |
| --- | --- | --- |
| BLK-PUBLIC-R13-R8-PREVIEW-KV-BINDING-001 | CLOSED / Accepted for closure | Fresh current-code Preview no-seed checkout gate returned 409 fail-closed with no checkout URL, not 503 `Booking storage is not configured`; Cloudflare metadata shows Preview `BOOKINGS_KV`; P6 Stripe TEST checkout succeeded through KV write path. |
| BLK-PUBLIC-R13-R8-PREVIEW-FUNCTIONS-CURRENT-CODE-001 | CLOSED / Accepted for closure | Fresh deployment `c5d78321` from commit `2431c8b` uploaded the Functions bundle and served current booking functions. |
| BLK-PUBLIC-R13-R9-ADMIN-SLOT-TOKEN-RUNTIME-001 | OPEN | Correct-token admin workflow cannot run because `ADMIN_SLOT_TOKEN` is not available to the execution environment through a non-exposing runtime variable. |
| BLK-R9-001 | OPEN until auditor confirms R13-R9 and later R13-R10 closure criteria | R13-R9 is blocked before submission. |
| BLK-R9-002 | OPEN | Future R9 blocker remains open. |
| BLK-R9-003 | OPEN | Future R9 blocker remains open. |
