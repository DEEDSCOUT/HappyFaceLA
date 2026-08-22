# 06 — Security review

Status: **INDEPENDENT FINAL SECURITY DISPOSITION: APPROVED — CRITICAL/HIGH/MEDIUM/LOW 0/0/0/0; NOT A LAUNCH APPROVAL**

## Controls present in source

- Cloudflare Access JWT verification checks issuer, audience, time bounds, algorithm, and current/previous JWKS keys; identities are mapped through explicit owner/admin allowlists.
- Financial mutations require same-origin checks, Fetch Metadata, an explicit confirmation header, a bounded idempotency key, server-side role authorization, and action-specific typed phrases.
- Browser callers cannot select live mode, Stripe destination, amount, or public base URL.
- Environment-specific secrets and origins fail closed; sandbox never falls back to live.
- Stripe webhook signatures are checked on raw bodies before durable registration.
- Thin/snapshot payload state is not trusted; current Stripe objects are retrieved and mode-checked.
- Signed roster/source/CRM adapters use exact origin allowlists, bounded schemas, mutual canonical HMAC signatures, replay controls, identity substitution checks, and separate readback. The Apps Script transport manually permits only bounded 301/302/303 redirects to Google's exact content origin, strips body/headers on redirect, rejects 307/308, enforces a 64 KiB default/every-non-list response bound and a named 192 KiB cap only for `artist_roster_list_v1`, decodes strict UTF-8, and verifies the signed response before any business field is consumed.
- Every initial Apps Script allowlist is exactly `https://script.google.com`; the Apps Script manifest requests only `spreadsheets` and `drive.metadata.readonly`. The active-roster list exposes only Artist ID, display name, and revision and rejects the reserved initial cursor `START` as an Artist ID.
- Account refresh, mapping, activation, and account/payout webhooks project only safe roster status fields; projection failure leaves the Stripe event durable and retryable rather than silently advancing the workflow.
- Internal HTML uses a per-response CSP nonce and no unsafe inline-script allowance.
- Onboarding claims are HMAC-bound to environment, purpose, artist, Account, roster revision, recipient-email confirmation, nonce, and a separately delivered high-entropy code. Preview/refresh GETs are non-mutating, wrong codes durably lock the claim after five failures, successful confirmation consumes exactly once, and raw single-use Stripe URLs are not exposed in email.
- Owner activation re-resolves the signed roster, exact Account/readiness/destination and atomically stores an immutable owner-attested payee-identity verification containing only an opaque evidence reference.
- Every payout/roster free-text field rejects spreadsheet formula prefixes in both the Cloudflare adapter and Apps Script server before any value, formula, audit, or revision mutation.
- A recovered batch execution rotates the execution claim token. A delayed former worker is fenced before provider-outcome handling or D1 persistence, while the current worker reuses the same Stripe idempotency identity.
- Financial logs retain safe identifiers, bounded reasons, and the allowlisted Cloudflare Access operator email as accountable actor identity. Artist/customer email, phone, banking, tax, identity-document, and onboarding-link data do not belong in Stripe metadata, evidence, or operational details.
- D1 triggers preserve environment identity, approved material, batch snapshots, manual evidence, immutable payee identity/destination variance, and append-only audit. Webhook lifecycle `CHECK` constraints reject impossible direct D1 states.

## Red-team conditions represented by declared tests

Declared tests cover authentication rotation/outage, owner-role bypass, cross-origin requests, oversized/malformed JSON, source identity substitution, HMAC tampering, wrong Stripe mode, duplicate recipient recovery, stale approval, ambiguous Transfer outcomes, concurrent/rotated batch claims, provider-delayed worker fencing, webhook replay/lease takeover and impossible-state constraints, spreadsheet-formula injection, CRM response loss, exact readback, manual-payment cancellation, and destination-payment membership.

The independent final security review of the current implementation bytes returned **APPROVED** with Critical `0`, High `0`, Medium `0`, and Low `0`. That disposition approves the reviewed security implementation; it does not authorize launch, deployment, live Stripe mutation, production configuration, or any unresolved external acceptance step.

## Open security/release blockers

- No accessible Stripe Sandbox was available for real nonproduction object and webhook exercises.
- The owner-only Booking Control Center copy has the exact additive schema and preservation evidence. The signed adapter server/client are implemented, but no Apps Script deployment or real signed copy integration is evidenced.
- The final reporting tree passed owner baseline, migration checks, formatting, lint, typecheck, a zero-vulnerability dependency audit, payout/existing regressions, build, and post-build QA. The same command was rerun after the result record was written, and post-push CI is the final commit-byte authority. The standalone secret guard scans tracked index, staged, tracked worktree, and untracked non-ignored content without disclosing matches, and its self-test passes.
- Production Access policy, secret-manager configuration, webhook destinations, and least-privilege Stripe credentials are not provisioned or evidenced.
- CPA/legal decisions and owner policies remain outstanding.

Result: independent implementation security disposition **APPROVED**, with no open Critical/High/Medium/Low finding. Launch certification remains **BLOCKED** until the external provider, deployment, configuration, owner, legal, and CPA gates close.
