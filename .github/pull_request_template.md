<!--
  Anti-regression PR template (issue #38).
  The verify-release CI gate runs `npm run guard:owner-baseline` and `npm run build`
  on every PR to main. Do NOT bypass it. See docs/OWNER_SOURCE_OF_TRUTH.md.
-->

## Baseline / anti-regression proof

- [ ] Branched from current `origin/main` (ran `git fetch` + verified base is latest `main`)
- [ ] `npm run guard:owner-baseline` passed **before** edits
- [ ] `npm run guard:owner-baseline` passed **after** edits
- [ ] `npm run build` passed
- [ ] No stale branch or old folder copied over current work
- [ ] No manual `dist` upload (production deploys only via Cloudflare Pages git auto-deploy from `main`)
- [ ] No image changes unless explicitly owner-approved (if approved, `image-inventory.json` regenerated in this PR)
- [ ] Business phone / owner facts unchanged unless explicitly owner-approved (cite source below)
- [ ] Homepage baseline marker preserved (`homepage-visual-baseline-v0.3-owner-gallery-20260616`)
- [ ] Plan My Party route + `/plan-my-party/` canonical preserved
- [ ] Soccer page baseline preserved
- [ ] PR #12 SEO baseline preserved unless this PR explicitly fixes a proven regression

### Owner authorization (only if changing owner facts / images / baselines)

> Cite the exact owner authorization source (issue comment, message, etc.):

## Changed files

> List every changed file and why.

## Production verification plan

> What will be checked after merge and Cloudflare auto-deploy (live URLs, phone, routes).
