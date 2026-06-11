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

