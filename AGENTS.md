\# Repository Agent Protocol



\## Global release lock



This repository is under draft-only development unless the owner explicitly authorizes release.



Forbidden without explicit owner authorization:

\- Production deployment

\- Live Stripe charges

\- DNS changes

\- Ads changes

\- SEO/indexing/GSC/sitemap/robots/canonical changes

\- Secret exposure

\- Publishing happyfacesla.com changes

\- Mutating external production systems



\## Developer Agent: Codex



Codex may:

\- Read the GitHub issue

\- Implement local code changes

\- Run local tests/builds

\- Create a feature branch

\- Open a draft PR

\- Comment progress on the GitHub issue



Codex must not:

\- Deploy

\- Enable live payments

\- Use production Stripe keys

\- Change secrets

\- Merge its own PR

\- Mark work approved



\## Auditor Agent: ChatGPT



The auditor must:

\- Inspect the issue body

\- Inspect linked branch/PR diff

\- Verify tests/build evidence

\- Verify release locks were respected

\- Post one machine-readable GitHub issue comment



Allowed auditor statuses:

\- APPROVED

\- EDIT\_REQUIRED

\- BLOCKED



Codex may continue only when the latest `\[AUDITOR]` comment is `EDIT\_REQUIRED`.

Codex must stop when the latest `\[AUDITOR]` comment is `APPROVED` or `BLOCKED`.

---

## Mandatory session-start protocol (anti-regression — issue #38)

Every coding agent MUST run this preflight **before editing any file**, to
guarantee it is working from the latest source of truth and not a stale branch:

```bash
git fetch origin --prune
git switch main
git pull --ff-only origin main
git status --short
git log --oneline -n 12
npm run guard:owner-baseline
```

> Working in a detached worktree where `main` is checked out elsewhere? Create
> your work branch directly from the latest remote tip instead:
> `git fetch origin --prune && git switch -c <branch> origin/main`, then run
> `npm run guard:owner-baseline`.

Then paste this preflight block into the PR / issue before editing:

```text
Base branch: main
Base SHA:
Production source expected: main
Owner baseline guard: PASS
Uncommitted changes: none
Files planned for edit:
Explicit owner authorization source:
```

### Hard stop — do NOT edit if any of these are true

- not on the current `main` (or a branch freshly cut from `origin/main`)
- local `main` differs from `origin/main`
- `npm run guard:owner-baseline` fails
- uncommitted changes exist
- the planned edit touches images without explicit owner approval
- the planned edit touches the PR #12 SEO baseline without regression proof
- the planned edit changes phone / business facts without owner confirmation
- the homepage / soccer / Plan My Party baselines would change unintentionally
- Cloudflare Pages production source is not `main`

The single source of truth is `docs/OWNER_SOURCE_OF_TRUTH.md`. The guard
(`scripts/guard-owner-baseline.mjs`) mechanically enforces it. Never bypass,
weaken, or comment out the guard to make a PR pass — fix the regression instead.

### Deployment

Production deploys **only** via Cloudflare Pages git auto-deploy from `main`.
`wrangler pages deploy dist` and any manual `dist` upload are forbidden unless
the owner separately authorizes it.

