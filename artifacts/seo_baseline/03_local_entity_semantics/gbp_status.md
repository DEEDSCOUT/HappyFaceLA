# GBP STATUS
## Audit Date: 2026-05-28

---

## GBP MCP Server Build Status

A custom Python GBP MCP server was built at `c:\HappyFaceLA\tools\gbp_mcp\` in this session.

**Server file:** `tools/gbp_mcp/server.py`
**Client file:** `tools/gbp_mcp/client.py`
**Config file:** `tools/gbp_mcp/config.py`
**Token file:** `C:\Dev\happyfacesla-commercial-control-room\.secrets\gbp_token.json`
**Venv:** `tools/gbp_mcp/.venv/` (installed, exit code 0)
**MCP registration:** `.vscode/mcp.json` — server `happyfacesla-gbp` registered

**OAuth Scope:** `https://www.googleapis.com/auth/business.manage`
**GCP Project:** `deedscout` (project number `453668029032`)
**APIs enabled in GCP:** mybusinessaccountmanagement v1, mybusinessbusinessinformation v1, businessprofileperformance v1

---

## GBP API Quota Status

### Problem

After enabling the three GBP APIs in GCP Console, the APIs defaulted to **0 RPM quota**. Any API
call to `mybusinessaccountmanagement.googleapis.com` or `mybusinessbusinessinformation.googleapis.com`
returns a quota exceeded error immediately.

### Impact

- Cannot call `gbp_list_accounts` → cannot discover GBP account resource name
- Cannot call `gbp_list_locations` → cannot discover location resource name
- `GBP_ACCOUNT_NAME` and `GBP_LOCATION_NAME` in `tools/gbp_mcp/.env.local` remain empty
- All GBP listing data (location details, categories, hours, photos, posts, Q&A) unavailable
- `businessprofileperformance v1` API (search keywords, daily metrics) also blocked since
  it requires the location resource name

### Resolution Path — Authorization Required

Obtain explicit authorization from the site owner before submitting a quota increase request.
The GCP quota increase path (once authorized) is:
- `mybusinessaccountmanagement.googleapis.com` → Quotas → Request quota increase
- `mybusinessbusinessinformation.googleapis.com` → Quotas → Request quota increase

URL: `https://console.cloud.google.com/apis/api/mybusinessaccountmanagement.googleapis.com/quotas?project=453668029032`

Once quota is approved, run:
1. `gbp_health_check` — verify connectivity
2. `gbp_list_accounts` — get `accounts/XXXXXXX` resource name
3. `gbp_list_locations` — get `accounts/XXXXXXX/locations/YYYYYYY` resource name
4. Update `GBP_ACCOUNT_NAME` and `GBP_LOCATION_NAME` in `tools/gbp_mcp/.env.local`
5. Restart VS Code to reload MCP server with updated config

---

## GBP Listing Data (Not Yet Retrieved)

The following GBP data points could not be collected in this audit pass:

- Business name as listed on Google
- Primary category and secondary categories
- Business hours (regular + holiday)
- Business description
- Service area configuration
- Phone number on GBP vs. website (NAP consistency check)
- Total review count and average rating
- Recent reviews content
- Recent local posts
- Photos uploaded to GBP
- Q&A section
- GBP search keyword impressions (businessprofileperformance API)
- Daily metric trends (calls, direction requests, website clicks)

---

## GBP Entity Signals (from Website Source)

Although direct GBP API access is blocked, the following entity signals can be inferred from
the website source code and will inform GBP consistency checks when access is restored:

| Signal | Website Value | Check Against GBP |
|---|---|---|
| Business Name | Happy Faces LA | Verify exact match |
| Phone | +13108002860 / (310) 800-2860 | Verify exact match (NAP) |
| Website URL | https://happyfacesla.com | Verify in GBP listing |
| Instagram | https://www.instagram.com/happy_faces_la/ | Verify in GBP sameAs |
| Service Area | Los Angeles + 12 other cities | Verify service area config |
| Business type | Service-area business (no storefront) | Verify "service-area business" type in GBP |
| Services listed | Face Painting, Balloon Twisting, Glitter Tattoos, Face Gems, Temporary Tattoos | Verify GBP services section |

---

## Summary

| Item | Status |
|---|---|
| GBP MCP server built | ✅ Complete |
| OAuth token generated | ✅ Valid |
| API quota | ❌ Blocked (0 RPM) |
| GBP listing data | ❌ Not retrieved |
| NAP consistency check | ⏳ Pending quota resolution |
| GBP performance data | ⏳ Pending quota + location name |
