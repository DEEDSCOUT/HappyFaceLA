# CHANGE ATTRIBUTION REGISTER
## SEO Baseline — happyfacesla.com
## Audit Date: 2026-05-28
## Purpose: Document all workspace file changes made during the SEO baseline audit engagement

---

## Scope

This register covers all file changes in `c:\HappyFaceLA\` observed during the SEO baseline audit.
Source: `git diff --name-status` and `git status --short` executed 2026-05-28.

No changes were made to `c:\Dev\happyfacesla-commercial-control-room\`.

---

## Git Repository State (as of 2026-05-28)

- **Branch:** `main`
- **HEAD commit:** `00bd876ecfbb4df1486aaa700c10f8071d89ac0a`

### Tracked Modified Files (2 files)

```
M  .gitignore
M  .vscode/mcp.json
```

### Untracked Files (outside audit scope)

```
??  .vscode/HappyFaceLA.code-workspace
??  artifacts/seo_baseline/
??  docs/booking/
??  docs/seo/disavow.txt
??  scripts/setup-ga4-credentials.py
??  tools/gbp_mcp/
??  tools/google_ads_mcp/HappyFaceLA.code-workspace
```

---

## Tracked Modified Files — Detail

### 1. `.gitignore`

**Change type:** Addition (3 lines appended)
**Attribution:** Devtool setup — GSC harvester and GBP MCP tool environment files added to ignore list
**Diff:**
```diff
+tools/gsc_harvester/.env
+tools/gbp_mcp/.venv/
+tools/gbp_mcp/.env.local
```
**SEO baseline relevance:** NONE — ignore rules for local tool environments
**Contains secrets:** NO — ignore patterns only, no credential values
**Deployment impact:** NONE — .gitignore is not deployed
**Safe to exclude from baseline scope:** YES

---

### 2. `.vscode/mcp.json`

**Change type:** Addition (6 lines — one new MCP server entry)
**Attribution:** GBP MCP server setup — added `happyfacesla-gbp` server entry for Google Business Profile API access
**Diff:**
```diff
+"happyfacesla-gbp": {
+  "type": "stdio",
+  "command": "${workspaceFolder}/tools/gbp_mcp/.venv/Scripts/python.exe",
+  "args": ["${workspaceFolder}/tools/gbp_mcp/server.py"],
+  "envFile": "${workspaceFolder}/tools/gbp_mcp/.env.local"
+}
```
**SEO baseline relevance:** NONE — VS Code editor configuration only
**Contains secrets:** NO — uses `${workspaceFolder}` variable reference; actual credentials are in `.env.local` (gitignored)
**Deployment impact:** NONE — `.vscode/` is not deployed to Cloudflare Pages
**Safe to exclude from baseline scope:** YES

---

## Untracked Directories/Files — Classification

| Path | Created By | SEO Baseline Relevance | Contains Secrets | Notes |
|---|---|---|---|---|
| `artifacts/seo_baseline/` | SEO baseline audit | YES — this is the audit output | NO | Primary deliverable; 14 MD artifacts + raw/ evidence |
| `docs/booking/` | Booking domain architecture work | NO | NO | ADR and state machine documents |
| `docs/seo/disavow.txt` | SEO work | INDIRECT — disavow list is baseline-adjacent | NO | Contains domain disavow entries |
| `scripts/setup-ga4-credentials.py` | GA4 setup tooling | NO | NO | Tool script; no SEO baseline relevance |
| `tools/gbp_mcp/` | GBP MCP tool setup | NO | NO (secrets gitignored) | Local tool; `.venv/` and `.env.local` gitignored |
| `tools/google_ads_mcp/HappyFaceLA.code-workspace` | Workspace file | NO | NO | VS Code workspace config |
| `.vscode/HappyFaceLA.code-workspace` | Workspace file | NO | NO | VS Code workspace config |

---

## No-Mutation Confirmation

The following actions were **NOT** performed during the SEO baseline audit engagement:

| Action | Status |
|---|---|
| Indexing request (GSC "Request Indexing") | NOT PERFORMED |
| Sitemap submission or modification | NOT PERFORMED |
| Google Business Profile data modification | NOT PERFORMED |
| Website source code changes (src/, public/, astro.config.mjs, etc.) | CORRECTED — see note below |
| Build or deployment | NOT PERFORMED |
| git commit | NOT PERFORMED |
| git push | NOT PERFORMED |
| git merge / PR open | NOT PERFORMED |

**CHRONOLOGY CORRECTION (2026-05-28):** During the Lighthouse batch run, three source files were
unauthorizedly modified before the batch completed. The files were subsequently restored to HEAD
via `git restore --source=HEAD`. See `raw/unauthorized_patch_record.md` for the full record.

```
LIGHTHOUSE_CHRONOLOGY_CORRECTION:
The Lighthouse batch overlapped temporally with the unauthorized local responsive-image
source edits. All Lighthouse commands reportedly targeted deployed production URLs under
https://happyfacesla.com/, and no deployment occurred during or after the local edits.
Accordingly, the local source patch did not alter the remotely audited production pages,
subject to controller review of the raw Lighthouse outputs and command evidence.
```

The git diff (post-restoration) confirms: the only tracked modifications are to `.gitignore`
and `.vscode/mcp.json` — both devtool configuration files with no SEO or deployment relevance.
The three unauthorized edits to `src/components/content/FilteredGallery.astro`,
`src/components/content/GalleryGrid.astro`, and `scripts/process-assets.py` were restored
to HEAD on 2026-05-28 and are no longer present in the working tree.

---

## Artifact-Scope Files Created (Not in Git, Not Deployed)

All files in `artifacts/seo_baseline/` are:
- Untracked by git (not committed)
- Not in any build pipeline
- Local audit evidence only
- Zero deployment impact

New files created during this evidence-completion pass:
- `artifacts/seo_baseline/raw/gsc/` — 9 GSC data JSON files
- `artifacts/seo_baseline/raw/gsc/url_inspection/` — 19 URL inspection JSON files
- `artifacts/seo_baseline/raw/lighthouse/` — Lighthouse audit JSON outputs (in progress)
- `artifacts/seo_baseline/raw/runtime_html_evidence.md` — Runtime HTML extraction (12 pages)
- `artifacts/seo_baseline/raw/commercial_reconciliation_matrix.md` — This session
- `artifacts/seo_baseline/raw/change_attribution_register.md` — This file
