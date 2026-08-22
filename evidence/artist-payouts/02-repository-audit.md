# 02 — Repository audit

Status: **SOURCE IMPLEMENTATION COMPLETE; EXTERNAL SANDBOX/DEPLOYMENT ACCEPTANCE OUTSTANDING**

## Branch-local implementation inventory

The audited source contains:

- domain logic under `src/lib/artist-payouts/` for authentication, authorization, configuration, money, eligibility, scheduling, approval digests, state transitions, source/CRM adapters, Stripe access, persistence, webhooks, application orchestration, and the protected admin UI;
- protected internal and onboarding Pages Functions under `functions/`;
- distinct account and payout webhook routes under `functions/api/stripe/`;
- environment-identity and fresh-schema D1 migrations under `migrations/artist-payouts/`;
- migration verification and replay-refusal scripts under `scripts/`;
- 14 Node test files, one real-browser E2E runner, and one shared test helper under `tests/artist-payouts/`;
- a deployable seven-operation Google Apps Script server under `integrations/artist-payouts-google-apps-script/`;
- architecture, environment, migration, communications, launch, and rollback documentation under `docs/artist-payouts/`.

The final reviewed changed-file inventory contains 98 files. This is an inventory fact, not a Git publication, merge, or deployment claim.

## Verified repository findings

- Financial values use integer minor units and an exact component equation.
- The schema provides permanent obligation, Transfer-attempt, Stripe-event, exception, and audit identities.
- Approval snapshots bind exact source revisions and material digests.
- Financial audit history and migration identity are protected by append-only/immutable triggers.
- Environment-specific configuration is present in `.env.example` and `.dev.vars.example`; payout flags default to false.
- Migration membership, byte length, SHA-256, and execution order are captured in `migrations/artist-payouts/manifest.json`.
- The protected dashboard uses exact global state/amount totals, stable keyset continuation for every growing D1 collection (including failed webhooks), an independent global latest-five Transfer query, a separately signed complete active-roster list for the onboarding queue, and selected-artist account status plus exact aggregates and isolated pages for unpaid assignments, complete payment history, and open exceptions.
- Onboarding claims bind a separate one-time challenge to environment, artist, Account, roster revision, authoritative email, and claim nonce. Wrong codes durably count toward a five-attempt lock; a successful same-origin confirmation consumes exactly once. Owner activation atomically records an immutable payee-identity verification and opaque evidence reference after re-resolving current roster, Account, readiness, and payout destination.
- `@playwright/cli` is lockfile-pinned to `0.1.18`; the E2E gate uses its local binary, and CI installs the corresponding locked Chromium runtime before release verification.
- The Stripe secret guard scans tracked index content, staged content, tracked worktree content, and untracked non-ignored files without printing matching secret values; its self-test contains positive/negative fixtures for each surface.

## CRM implementation now present

The repository contains both sides of the Booking Control Center contract:

- Cloudflare signed read/write/readback clients for roster identity, roster status projection, assignment/closeout source, and payout projection;
- an exact mutual-HMAC Apps Script transport with bounded replay, signed responses, bounded Google redirects, strict schemas, a 64 KiB default and non-list bound, and a named 192 KiB cap only for `artist_roster_list_v1`;
- a seven-operation Apps Script server with environment/workbook identity, revision compare-and-swap, immutable connected-account identity, formula/validation/protection preservation, digest-only audit entries, a bounded summary-only active-roster list, and a deterministic approval/version-gated schema migration.

Local client and server cases are included in the confirmed current implementation results recorded in `07-test-matrix.md`. The server has not been deployed and has not been exercised through real signed requests against the owner-only nonproduction copy. That external integration gap remains a launch blocker, but it is no longer missing source implementation.

The current implementation passed the complete local `npm run verify:release` workflow before this final Markdown refresh, including owner baseline, migration identity/execution, formatting, lint, typecheck, zero-vulnerability dependency audit, payout and existing regressions, build, and post-build QA. The exact-evidence-byte rerun remains pending and is not pre-claimed. Independent security and release-regression reviews passed for the implementation, but external acceptance remains outstanding; no production deploy or runtime mutation is claimed here.
