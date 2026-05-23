# GSC MCP Harvester (TypeScript)

Production-grade, strictly typed Google Search Console harvesting pipeline using MCP tools.

## What It Does

- Pulls search analytics for last 30 days (queries and landing pages) for a target site.
- Identifies high-impression, low-click opportunities (default: position 5-15 and CTR < 2%).
- Pulls indexing diagnostics and sitemap status for crawl/indexation checks.
- Stores raw and normalized snapshots under `data/gsc/` with timestamped filenames.

## Architecture

- `src/client.ts`: MCP client layer with retries and rate-limit handling.
- `src/transform.ts`: normalization and opportunity analysis.
- `src/storage.ts`: timestamped JSON persistence.
- `src/pipeline.ts`: orchestration across all layers.
- `src/types.ts`: strict shared contracts.
- `src/discover-tools.ts`: schema discovery helper.

## Setup

1. Install dependencies:

```bash
cd tools/gsc_harvester
npm install
```

1. Copy `.env.example` to `.env` and update values.

## Approved MCP Runtime (Operational)

The approved Happy Faces LA operational MCP server invocation is pinned to a fixed release:

```bash
uvx --from "mcp-search-console==0.3.2" mcp-search-console
```

`harvest` enforces this pin by default. Unpinned `mcp-search-console` invocations are rejected unless
`GSC_ALLOW_UNPINNED_MCP_FOR_DIAGNOSTIC=true` is explicitly set for diagnostic/development-only use.

## Step 1 - Discover Exact MCP Tool Schemas

Run:

```bash
npm run discover -- --mcpCommand=uvx --mcpArgsJson='["--from","mcp-search-console==0.3.2","mcp-search-console"]'
```

This prints matching tool names and input schemas so you can set:

- `GSC_TOOL_SEARCH_ANALYTICS` (default: `get_search_analytics`)
- `GSC_TOOL_INDEXING_STATUS` (default: `inspect_url_enhanced`)
- `GSC_TOOL_SITEMAP_STATUS` (default: `get_sitemaps`)

## Step 2 - Run Harvester Pipeline

```bash
npm run harvest -- --siteUrl=sc-domain:happyfacesla.com --mcpCommand=uvx --mcpArgsJson='["--from","mcp-search-console==0.3.2","mcp-search-console"]'
```

Read-only safety note:

```bash
GSC_ALLOW_DESTRUCTIVE=false npm run harvest -- --siteUrl=sc-domain:happyfacesla.com
```

Optional parameters:

- `--days=30`
- `--rowLimit=1000`
- `--topLimit=50`
- `--minPosition=5`
- `--maxPosition=15`
- `--maxCtr=0.02`
- `--minImpressions=100`
- `--outputDir=../../data/gsc`

## Output Files

- `data/gsc/raw/gsc-raw-<timestamp>.json`
- `data/gsc/normalized/gsc-normalized-<timestamp>.json`

The normalized output includes:

- `topQueries`
- `topPages`
- `opportunities`
- `indexingDiagnostics`
- `sitemapStatuses`
- `flags` for sitemap errors, crawl errors, and unindexed page count
