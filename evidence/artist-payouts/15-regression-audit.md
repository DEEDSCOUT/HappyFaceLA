# 15 — Regression audit

Status: **FINAL RELEASE REGRESSION PASS; FINAL REPORTING TREE FULL LOCAL GATES PASS; NO DEPLOYMENT CLAIM**

## Repository release gates

The complete `npm run verify:release` workflow passed before and after the final Markdown refresh: owner baseline, exact migration membership/identity, formatting, lint, typecheck, `npm audit` with zero vulnerabilities, payout tests, existing regressions, build, and post-build QA. Payout results were unit 91/91, integration Node suites 108/108 plus sandbox/live migration apply-once/replay checks, HTTP/onboarding E2E 29/29 (22 HTTP + 7 portal), and real Chromium desktop/mobile prepare-and-approve PASS. Existing regressions passed lead validation 23/23, outcome writeback 15/15, and the controlled customer Checkout gate 1/1 with 22 assertions. The build produced 33 pages and post-build QA passed.

The same full command was rerun after this result record was written; the immutable post-push GitHub check is the final commit-byte authority.

The independent final security review returned **APPROVED** with Critical/High/Medium/Low `0/0/0/0`; that is not a launch approval. The secret guard inspects tracked/indexed, staged, tracked-worktree, and untracked non-ignored content without printing matching values, and its self-test covers those surfaces. The browser gate uses lockfile-pinned `@playwright/cli` `0.1.18`, and CI installs its corresponding locked Chromium runtime. The reviewed changed-file inventory contains 98 files.

## Final independent public-output comparison

The final release-regression audit compared base `1a51ee9b43aa9a91ab76f07cc05e25a573b378d2` and current implementation in isolated worktrees. Both built 33 pages and passed post-build QA. With the supported `compressHTML: false` setting retained after the Astro 7.2.4 security upgrade:

- 33/33 routes had identical visible text, 33/33 identical ARIA, and 33/33 identical semantics;
- all 6/6 screenshots were pixel-identical across the three audited pages at 1440×1000 and 390×844;
- both 2/2 audited interactions were byte/pixel-identical;
- all 4/4 static `_redirects`, `robots.txt`, and sitemap artifacts were identical;
- the customer Checkout regression passed 1/1 controlled gate with 22 assertions;
- no public phone, email, content, image, canonical, sitemap, robots, route, customer price, or customer money-flow change was found.

The controlled counterfactual removed only `compressHTML: false`. It retained semantics on 33/33 routes but preserved visible text on only 1/33, ARIA on 32/33, screenshots on 0/6, and interactions on 0/2. This proves `compressHTML: false` is a required compatibility control, not optional formatting, after the Astro 7.2.4 security upgrade.

Astro 6.4.8 was rejected because its runtime dependency audit reported seven high vulnerabilities. The customer Checkout runtime pin remains exactly `2026-05-27.dahlia`, matching the production base behavior; only the isolated artist-payout client uses `2026-07-29.dahlia`, the version bundled with `stripe` 22.5.0.

## External no-impact verification

- Production Booking Control Center revision moved from `1592` to `1595` through unrelated operational row activity. Final read-only audit confirmed the same relevant sheet IDs/dimensions and exact original 30 headers on tabs 11/12/13: no schema drift and no project mutation. The owner-only copy remains revision `4` with additive 54/43/44-column schemas; its signed adapter is not deployed.
- Stripe live inventory was read only for account `acct_1TcGsVFEQspruzB8`: v1 connected accounts `0`, v2 core accounts `0`, and the existing webhook remained unchanged without required Connect payout events. No Account, webhook, Transfer, Payout, or Account Link was mutated, and no Sandbox was accessible.
- This project created no Gmail draft, sent no message, and contacted no artist. Read-only search observed two unrelated historical artist-assignment sends, so no global Gmail no-activity claim is made.
- No production deployment, DNS, ads, SEO, secret, live payment, or customer/artist contact action occurred.

## Unfinished external regression proof

No Cloudflare preview deployment or nonfinancial preview smoke test was authorized or run. No Apps Script deployment or Stripe Sandbox exists for deployed integration testing. Those are explicit acceptance blockers, not hidden local regressions.

The final 98-file changed-inventory marker scan found no unresolved `TODO`, `FIXME`, `HACK`, `TEMP`, `not implemented`, or `mock production` marker. The benign `placeholder` matches are three HTML input hints displaying exact owner-confirmation syntax, internal SQL bind-variable usages, secret-guard self-test fixture names/assembled synthetic values, and the existing customer Checkout regression's synthetic test key. None is unfinished functionality or production evidence.
