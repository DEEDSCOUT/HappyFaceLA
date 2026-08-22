# 07 — Test matrix

Status: **FINAL REPORTING TREE FULL LOCAL GATES PASS; EXTERNAL ACCEPTANCE BLOCKED**

## Confirmed current implementation results

The complete `npm run verify:release` workflow passed both before and after the final Markdown refresh. It was rerun again after this result record was written; the immutable post-push GitHub check is the final commit-byte authority.

| Gate / suite                          | Result | Tests / logical gates | Passed | Failed | Current implementation evidence                                                                                 |
| ------------------------------------- | ------ | --------------------: | -----: | -----: | --------------------------------------------------------------------------------------------------------------- |
| Owner baseline guard                  | PASS   |                1 gate |      1 |      0 | Owner-source compatibility and repository secret guard.                                                        |
| Migration identity and D1 execution   | PASS   |        2 environments |      2 |      0 | Exact membership plus fresh sandbox/live apply-once and replay-refusal checks.                                 |
| Payout formatting                     | PASS   |                     — |      — |      0 | All scoped implementation files matched Prettier.                                                              |
| Payout ESLint                         | PASS   |                     — |      — |      0 | Payout TypeScript and Pages Functions.                                                                          |
| Payout TypeScript                     | PASS   |                     — |      — |      0 | `tsc -p tsconfig.artist-payouts.json`.                                                                          |
| Dependency audit                      | PASS   |     0 vulnerabilities |      — |      0 | `npm audit` reported no vulnerability.                                                                          |
| Artist-payout unit                    | PASS   |                    91 |     91 |      0 | Core, auth, Stripe gateway, Apps Script transport, source/roster adapters, and onboarding claim.                |
| Artist-payout integration Node suites | PASS   |                   108 |    108 |      0 | CRM, seven-operation Apps Script server, D1 repository, application service, and webhooks.                     |
| Artist-payout HTTP/portal E2E          | PASS   |                    29 |     29 |      0 | 22 protected HTTP-route cases plus 7 onboarding-portal cases.                                                   |
| Real Chromium admin flow              | PASS   |      desktop + mobile |   both |      0 | Protected prepare-and-approve flow passed at both viewports using the locked browser runtime.                  |
| Existing lead validation              | PASS   |                    23 |     23 |      0 | Existing public lead flow.                                                                                     |
| Existing outcome writeback            | PASS   |                    15 |     15 |      0 | Existing internal outcome flow.                                                                                |
| Customer Checkout regression          | PASS   | 1 gate, 22 assertions |      1 |      0 | Controlled existing customer Checkout implementation.                                                          |
| Static build                          | PASS   |              33 pages |     33 |      0 | Astro 7.2.4 build.                                                                                              |
| Post-build QA                         | PASS   |              33 pages |     33 |      0 | Required public routes/assets and owner controls.                                                              |

`npm run test:payouts` and the broader release workflow passed in full on the final reporting tree. External provider/deployment acceptance remains separate.

## Current artist-payout coverage

The focused suites cover:

- integer money, exact compensation equations, Los Angeles time, and Monday/Wednesday scheduling;
- Cloudflare Access authentication, role authorization, same-origin/Fetch-Metadata defenses, deliberate confirmation phrases, CSP nonce, redacted failures, and isolated cursor scopes;
- Accounts v2 recipients, complete bounded account discovery, current-secret provenance, exact platform binding, recipient readiness, standalone Transfers, automatic Payout membership, schedule checks, and fail-closed rejection when an external account advertises Instant Payouts;
- a separate high-entropy onboarding code, authoritative-email/roster/account/revision binding, non-mutating preview/refresh GETs, same-origin confirmation POST, durable five-attempt lockout, single consumption, and owner-only immutable payee-identity verification;
- Apps Script mutual HMAC, replay, strict UTF-8, exact origins/redirects, seven operations, 120-character IDs, reserved `START`, roster drift/duplicate/reorder/continuation/count/page/byte bounds, queue-unavailable propagation, a 192 KiB roster-list-only cap with one-byte-over rejection, 64 KiB bounds for every other operation, and signed JSON `null` for a missing payout projection;
- spreadsheet-formula prefix rejection in payout and roster free text at both the Cloudflare adapter and Apps Script server before any mutation;
- D1 environment identity, migration replay refusal, immutable identity/approval evidence, ten-item parameter-safe batch partitioning, execution leases, selected-artist profile totals and pages, global dashboard/failed-webhook totals and stable cursors, exceptions, manual-payment recovery, and closed-loop CRM reconciliation;
- provider ambiguity, persistence failure after Stripe success, rotated batch-execution claim fencing, webhook replay/out-of-order/failure/recovery and impossible-state constraints, payout keyset traversal beyond 500 ledgers, renewable leases and stale-worker fencing, failed-payout replacement, and roster-projection outage retry.

The browser gate invokes the lockfile-installed `@playwright/cli` `0.1.18` binary rather than a dynamic package download. The repository CI workflow installs the corresponding locked Chromium runtime. The current implementation's real-browser gate passed the protected prepare-and-approve flow in both desktop and mobile viewports.

## Acceptance boundary

Local synthetic tests cannot replace the absent Stripe Sandbox, a deployed seven-route Apps Script integration against the owner-only copy, verified protected ranges, protected Cloudflare preview, real event destinations, D1 load/failure injection, or the three-synthetic-artist closed loop. Stripe Dashboard-level Instant Payouts disablement also remains unverified. Those external nonproduction gates are **BLOCKED**, so the product is **NOT LAUNCH READY**.
