# PUBLIC-BOOKING-R13-R8D Preview BOOKINGS_KV Binding Recheck / Current-Code Preview Redeploy / Checkout-Webhook Proof Rerun Report

Date: 2026-06-11
Release state: NO_GO
Evidence ID: EVD-PUBLIC-BOOKING-R13-R8D-001
Status: Pending Auditor Review / Pending

## Verdict

PUBLIC-BOOKING-R13-R8D PREVIEW BOOKINGS_KV BINDING RECHECK / CURRENT-CODE PREVIEW REDEPLOY / CHECKOUT-WEBHOOK PROOF RERUN SUBMITTED — AUDITOR REVIEW REQUIRED — RELEASE STATE NO_GO

Preview `BOOKINGS_KV` is now available to current-code Pages Functions. The fresh no-seed checkout gate returned 409 fail-closed with no checkout URL, not 503 `Booking storage is not configured`.

## Required Validation

| Command | Exit | Result |
| --- | ---: | --- |
| `npm run astro -- check` | 0 | PASS - 0 errors; existing warnings/hints only. |
| `node tests\r13-r4\d1-availability-controlled-implementation.mjs` | 0 | PASS - controlled implementation tests passed. |
| `npm run build` | 0 | PASS - Astro build completed, 28 pages built. |
| `npm run qa:postbuild` | 0 | PASS - required files/routes present; no `TBD_BY_OWNER` in built HTML. |

## Redacted Preconditions

| Precondition | Proof | Result |
| --- | --- | --- |
| Preview `AVAILABILITY_D1` | Cloudflare Pages metadata has Preview `d1_databases.AVAILABILITY_D1`; no-seed eligibility returned 200 `availability.status=unavailable`, not storage unknown. | PASS |
| Preview `ADMIN_SLOT_TOKEN` | Cloudflare metadata type `secret_text`; `/api/admin/slots` missing/wrong token returned 401, not 503. | PASS |
| Preview `STRIPE_SECRET_KEY` | Cloudflare metadata type `secret_text`; checkout reached D1 availability gate, proving Stripe TEST key gate passed. | PASS |
| Preview `STRIPE_WEBHOOK_SECRET` | Cloudflare metadata type `secret_text`; webhook no-signature returned 400 and bad-signature returned 401, not missing/invalid-secret 500. | PASS |
| Preview `BOOKINGS_KV` | Cloudflare metadata has Preview `kv_namespaces.BOOKINGS_KV`; namespace ID matches owner-provided `1feee337a6364d64ac98779ab18ec387`; no-seed checkout no longer returned KV 503. | PASS |
| Production `AVAILABILITY_D1` absent | Cloudflare Pages metadata production `d1_binding_names` was empty; production `kv_binding_names` was empty. | PASS |

No secret value was printed, logged, written to evidence, or exposed.

## Fresh Preview Redeploy

| Item | Evidence |
| --- | --- |
| Command | `npx wrangler pages deploy dist --project-name happyfacesla --branch r13-r8d-proof` |
| Exit | 0 |
| Preview URL | `https://c5d78321.happyfacesla.pages.dev` |
| Alias URL | `https://r13-r8d-proof.happyfacesla.pages.dev` |
| Deployment branch | `r13-r8d-proof` |
| Deployment ID | `c5d78321-1c8e-492a-927b-109931546c80` |
| Current source | `2431c8b` (`git rev-parse --short HEAD` exit 0) |
| Functions proof | Wrangler output: `Compiled Worker successfully`, `Uploading Functions bundle`, `Deployment complete`. |

No production deploy was performed.

## No-Seed Checkout Gate

Command:

```powershell
node -e "const base='https://c5d78321.happyfacesla.pages.dev'; const body={eventType:'birthday-party',services:['face-painting'],kidsCountBucket:'11-18',designStyle:'standard-party',durationMinutes:120,travelMiles:0,eventDate:'2026-11-27',startTime:'07:30'}; const res=await fetch(base+'/api/create-checkout-session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); const text=await res.text(); let json; try{json=JSON.parse(text)}catch{json={raw:text.slice(0,200)}}; console.log(JSON.stringify({status:res.status,body:json,hasCheckoutUrl:!!json.checkoutUrl},null,2)); if(res.status===503 && json.error==='Booking storage is not configured') process.exit(2); if(json.checkoutUrl) process.exit(3);"
```

Exit: 0

Result: 409 `Availability is not confirmed for online retainer checkout`; `availability.status=unavailable`; `hasCheckoutUrl=false`.

Conclusion: `BLK-PUBLIC-R13-R8-PREVIEW-KV-BINDING-001` is proposed closed by R13-R8D.

## Checkout / Webhook Proof Rerun

All seeded data used the synthetic `r13r8d_cont` prefix and date `2026-11-28`.

| Proof | Command / Evidence | Result |
| --- | --- | --- |
| Seed | `npx wrangler d1 execute hfla-availability-preview --remote --file evidence\r13-r8d\continuation_seed.sql -y --json` exit 0 | PASS - Preview D1 only. |
| P1 | `P1_open_confirmed` in `continuation_http_results.json` | 200 confirmed; paymentAllowed true; safe slot only. |
| P2 | `P2_nomatch_failclosed` | 200 unavailable; paymentAllowed false. |
| P5 | `P5_checkout_blocked` | 409, no checkout URL. |
| P6 | `P6_checkout_open` | 200; Stripe TEST checkout URL on `checkout.stripe.com`; D1 hold created; availability held. |
| P7 | `P7_checkout_nomatch` | 409, no checkout URL. |
| P8a | `P8a_webhook_no_signature`, `P8a_webhook_bad_signature` | 400 missing signature; 401 invalid signature; fail-closed. |
| P8 approved TEST simulation | `npx wrangler d1 execute hfla-availability-preview --remote --file evidence\r13-r8d\continuation_p8_simulate.sql -y --json` exit 0 | Held capacity moved to reserved, hold reserved, booking-slot link reserved. |
| P9 duplicate simulation | `npx wrangler d1 execute hfla-availability-preview --remote --file evidence\r13-r8d\continuation_p9_duplicate_attempt.sql -y --json` exit 0 | Final query showed held 0, reserved 1, one link; no double reservation. |
| P10 | Admin missing/wrong token in HTTP proof runner | 401/401 fail-closed. |

P6 generated synthetic booking ID `book_mq8zsfw5_12b770845d15` for targeted KV cleanup. This is not customer PII.

## Cleanup Proof

| Cleanup item | Command / Evidence | Result |
| --- | --- | --- |
| P6 synthetic KV key | `npx wrangler kv key delete "booking:book_mq8zsfw5_12b770845d15" --namespace-id 1feee337a6364d64ac98779ab18ec387 --remote` exit 0 | Deleted exact synthetic key. |
| P8 synthetic KV key | `npx wrangler kv key delete "booking:book_r13r8d_cont_p8_0001" --namespace-id 1feee337a6364d64ac98779ab18ec387 --remote` exit 0 | Deleted exact synthetic key. |
| P8 idempotency KV key | `npx wrangler kv key delete "stripe_event:evt_r13r8d_cont_p8_0001" --namespace-id 1feee337a6364d64ac98779ab18ec387 --remote` exit 0 | Deleted exact synthetic key. |
| D1 cleanup | `npx wrangler d1 execute hfla-availability-preview --remote --file evidence\r13-r8d\continuation_cleanup.sql -y --json` exit 0 | Deleted synthetic `r13r8d_cont` rows only. |
| D1 zero-count verification | Synthetic prefix count query exit 0 | `availability_slots=0`, `slot_holds=0`, `booking_slot_links=0`, `slot_audit_log=0`. |
| KV deletion verification | Exact-key `wrangler kv key get ... --remote --text` for all three keys | Expected exit 1 / Cloudflare 404 Not Found for each exact synthetic key. |

No KV list operation was run. No pre-existing KV records were read, modified, or deleted. No production D1 or production KV was touched.

## Static / Leak Scan Summary

Final scans were run after documentation updates. Classified false positives:

- Public `dist` scan: no admin token names, Stripe secret prefixes, KV/D1 binding names, synthetic booking IDs, D1 hold/slot IDs, governance IDs, Drive paths, `.env`, `.dev.vars`, or `.secrets` paths were found in built public output.
- Source/docs scan: expected governance references to secret variable names, blocker IDs, evidence IDs, and `.dev.vars` setup text were found. These are names/instructions only, not values.
- Existing script false positives: `scripts/stripe-validate.mjs`, `scripts/stripe-setup.mjs`, `scripts/stripe-audit.mjs`, and `scripts/validate-r8-r2-real-runtime.mjs` contain local `.env` / `.dev.vars` loading helpers; `scripts/setup-ga4-credentials.py` contains an old `.secrets/credentials.json` output path; `scripts/qa-postbuild.mjs` contains generic `readFile` use. These scripts were not used to read credentials in R13-R8D, and no secret-file contents were opened.
- Public copy/CSS false positives: customer-facing `artist` wording appears in public service and booking pages, and CSS includes `margin` properties. These are public copy/style terms, not contractor, cost, margin, internal artist, or private operating details.
- SEO/indexing: R13-R8D touched evidence/docs/README governance mirrors only; no robots, sitemap, canonical, schema, SEO component, or indexing source file was edited by this continuation.

## Governance Updates

| Item | R13-R8D Status |
| --- | --- |
| `EVD-PUBLIC-BOOKING-R13-R8D-001` | Pending Auditor Review / Pending |
| `BLK-PUBLIC-R13-R8-PREVIEW-KV-BINDING-001` | Proposed Closed by R13-R8D |
| `BLK-PUBLIC-R13-R8-PREVIEW-FUNCTIONS-CURRENT-CODE-001` | Proposed Closed by R13-R8D |
| `EVD-PUBLIC-BOOKING-R13-R8-001` | Pending Auditor Review / Pending |
| `BLK-R9-001` | OPEN |
| `BLK-R9-002` | OPEN |
| `BLK-R9-003` | OPEN |
| Release state | NO_GO |

## Future Gate Preservation

`PUBLIC-BOOKING-R13-R11 FINAL LIVE PRE-PUBLIC TEST` remains a future mandatory gate only after R13-R8 proof passes, R13-R9, R13-R10, BLK-R9-002/003 closeout, and separate owner authorization. It was not executed in R13-R8D.
