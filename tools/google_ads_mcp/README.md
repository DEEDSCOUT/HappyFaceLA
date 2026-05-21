# Happy Faces LA — Google Ads MCP (read + safety-gated write)

Local MCP server exposing the Google Ads API to GitHub Copilot in VS Code.

> Full edit capability is implemented, but every mutation is gated by:
> approval token + before/after snapshot + JSON mutation plan + audit log,
> and defaults to `validate_only=true`.

## Files

| File | Purpose |
|---|---|
| `server.py` | FastMCP entry point with all read/write tools |
| `config.py` | Loads `.env.local`; exposes secret redactor |
| `auth.py` | Health check (`list_accessible_customers`) |
| `google_ads_client.py` | SDK client builder |
| `gaql.py` | GAQL read-only guard + stream helper |
| `diagnostics.py` | GAQL queries + Markdown report generator |
| `mutations.py` | `with_safety()` context: approval, snapshot, plan, audit |
| `mutation_plans.py` | JSON plan writer |
| `snapshots.py` | Before/after JSON snapshots |
| `audit.py` | Append-only JSONL audit log |
| `schemas.py` | Pydantic input models for write tools |
| `generate_refresh_token.py` | One-time OAuth bootstrap |
| `requirements.txt` | `google-ads`, `mcp[cli]`, `pydantic`, `python-dotenv`, `google-auth-oauthlib` |
| `tests/` | Unit tests (no live API required) |

## One-time setup

```powershell
cd C:\HappyFaceLA\tools\google_ads_mcp
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env.local
notepad .env.local      # fill in DEV TOKEN, CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN
```

### Generate refresh token (one-time)

> **OAuth client type MUST be "Desktop app".**
> Do NOT use "Web application" — it will fail with `redirect_uri_mismatch`.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Click **Create credentials → OAuth client ID**.
3. Application type: **Desktop app**. Give it any name.
4. Download or copy the **Client ID** and **Client secret** into `.env.local`.
5. Enable the **Google Ads API** on the same Cloud project.

```powershell
python generate_refresh_token.py
# Sign in as the Google account that has access to MCC 634-051-0052
# (which manages client account 469-912-0105).
# The script opens a browser, listens on http://localhost:8080, and
# prints ONLY the refresh token. Paste it into .env.local.
```

**If you see `redirect_uri_mismatch`:** your OAuth client is type "Web application".
Delete it and create a new "Desktop app" client.

**Security note:** if a client secret was previously exposed (e.g. printed to terminal,
logged, or committed), treat that OAuth client as compromised. Delete it in Cloud Console
and create a fresh Desktop app client before running this script.

## VS Code wiring

`.vscode/mcp.json` registers the server. After creating the venv and `.env.local`:

1. **MCP: List Servers** → start `happyfacesla-google-ads`.
2. Ask Copilot to call `google_ads_health_check` first.

## Read tools

`google_ads_health_check`, `google_ads_gaql_query`, `google_ads_account_summary`,
`google_ads_campaigns`, `google_ads_campaign_diagnostics`,
`google_ads_conversion_actions`, `google_ads_conversion_goals`,
`google_ads_pmax_asset_groups`, `google_ads_assets`, `google_ads_locations`,
`google_ads_keywords_and_negatives`, `google_ads_change_history`,
`google_ads_generate_diagnostics_report`.

## Write tools (all default `validate_only=true`)

`google_ads_update_campaign_status`, `google_ads_update_campaign_budget`,
`google_ads_update_bid_strategy`, `google_ads_update_conversion_action`,
`google_ads_update_customer_conversion_goal`,
`google_ads_update_campaign_conversion_goals`,
`google_ads_add_campaign_negative_keywords`,
`google_ads_create_search_campaign` (always PAUSED),
`google_ads_create_or_update_search_keywords`,
`google_ads_update_pmax_assets`, `google_ads_update_locations`,
`google_ads_upload_image_assets`, `google_ads_apply_recommendation`.

### Required payload shape for every write tool

```jsonc
{
  "validate_only": true,                     // default; flip to false to actually mutate
  "approval_token": "I_APPROVE_GOOGLE_ADS_MUTATION",  // required when validate_only=false
  "reason": "Short human reason. REMOVE/ENABLE/BROAD_OK tokens if applicable.",
  // ...tool-specific fields...
}
```

### Hard rules enforced in code

- `GOOGLE_ADS_ALLOW_MUTATE=false` blocks every write tool.
- Without `approval_token` matching `.env.local`, write tools refuse.
- `REMOVED` status requires the word `REMOVE` in `reason`.
- Budget delta > `GOOGLE_ADS_MAX_DAILY_BUDGET_DELTA_PERCENT` requires `force_large_budget_change=true` AND the token.
- BROAD-match keywords require `BROAD_OK` in `reason`.
- New Search campaigns are created `PAUSED`. Enablement is a separate explicit call.
- PMax campaign-level negative keywords are refused (resource doesn't exist; use brand-suitability lists in UI).
- `apply_recommendation` has no Google Ads `validate_only` mode and is intentionally hard-gated.

### Every mutation produces

- `docs/google-ads/snapshots/<ts>-<tool>-before.json`
- `docs/google-ads/mutation-plans/<ts>-<tool>.json`
- `docs/google-ads/snapshots/<ts>-<tool>-after.json`
- One line appended to `docs/google-ads/audit-log.jsonl`

All four are run through a secret-redactor before writing.

## Initial negative keyword list (recommended)

```text
jobs, hiring, class, classes, tutorial, diy, supplies, kit, wholesale,
free, cheap, Halloween makeup tutorial, costume makeup, face paint set
```

## Initial high-intent Search keywords (recommended)

```text
face painting los angeles, face painter los angeles,
face painter birthday party, kids party face painting,
balloon twisting los angeles, balloon artist birthday party,
kids party entertainment los angeles, school carnival face painting,
corporate family event entertainment
```

## Diagnostics report

`google_ads_generate_diagnostics_report` writes `docs/google-ads/diagnostics.md`
with: account, campaigns, Kids Party Face Painting deep-dive, conversion
actions, conversion goals, **conversion-tracking-incomplete diagnosis**, PMax
asset groups, signals, locations, recommendations placeholder, risks, UI-only
items, recommended next actions, and 30-day change history.

## Tests

```powershell
cd C:\HappyFaceLA
python -m pytest tools/google_ads_mcp/tests -q
```

Unit tests cover: GAQL guard, budget micros, approval enforcement, redaction,
audit/snapshot/plan writers, schema validation. No live API calls.
