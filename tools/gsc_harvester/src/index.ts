import { GscMcpClient } from "./client.js";
import { logger } from "./logger.js";
import { GscPipeline } from "./pipeline.js";
import { validateReadOnlyToolNames } from "./safety.js";
import { resolveOutputRoot } from "./storage.js";
import type { PipelineRunConfig, ToolNames } from "./types.js";

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      continue;
    }

    const [rawKey, ...rest] = arg.slice(2).split("=");
    if (!rawKey || rest.length === 0) {
      continue;
    }

    result[rawKey] = rest.join("=");
  }

  return result;
}

function requireValue(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required value for ${name}`);
  }
  return value;
}

function parsePositiveInt(name: string, value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseFloatValue(name: string, value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a finite number >= 0`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const siteUrl = requireValue("siteUrl", args.siteUrl ?? process.env.GSC_SITE_URL);
  const mcpCommand = requireValue("mcpCommand", args.mcpCommand ?? process.env.GSC_MCP_COMMAND);
  const mcpArgsJson = requireValue("mcpArgsJson", args.mcpArgsJson ?? process.env.GSC_MCP_ARGS_JSON);

  const mcpArgs = JSON.parse(mcpArgsJson) as unknown;
  if (!Array.isArray(mcpArgs) || mcpArgs.some((v) => typeof v !== "string")) {
    throw new Error("mcpArgsJson must parse to a JSON string array");
  }

  const toolNames: ToolNames = {
    searchAnalytics: args.searchAnalyticsTool ?? process.env.GSC_TOOL_SEARCH_ANALYTICS ?? "get_search_analytics",
    indexingStatus: args.indexingStatusTool ?? process.env.GSC_TOOL_INDEXING_STATUS ?? "inspect_url_enhanced",
    sitemapStatus: args.sitemapStatusTool ?? process.env.GSC_TOOL_SITEMAP_STATUS ?? "get_sitemaps"
  };

  validateReadOnlyToolNames(toolNames);

  const runConfig: PipelineRunConfig = {
    siteUrl,
    outputDir: resolveOutputRoot(args.outputDir ?? process.env.GSC_OUTPUT_DIR),
    days: parsePositiveInt("days", args.days ?? process.env.GSC_DAYS, 30),
    rowLimit: parsePositiveInt("rowLimit", args.rowLimit ?? process.env.GSC_ROW_LIMIT, 1000),
    topLimit: parsePositiveInt("topLimit", args.topLimit ?? process.env.GSC_TOP_LIMIT, 50),
    opportunityFilter: {
      minPosition: parseFloatValue("minPosition", args.minPosition ?? process.env.GSC_MIN_POSITION, 5),
      maxPosition: parseFloatValue("maxPosition", args.maxPosition ?? process.env.GSC_MAX_POSITION, 15),
      maxCtr: parseFloatValue("maxCtr", args.maxCtr ?? process.env.GSC_MAX_CTR, 0.02),
      minImpressions: parsePositiveInt(
        "minImpressions",
        args.minImpressions ?? process.env.GSC_MIN_IMPRESSIONS,
        100
      )
    }
  };

  const client = new GscMcpClient(
    {
      command: mcpCommand,
      args: mcpArgs,
      env: {
        ...process.env
      } as Record<string, string>
    },
    toolNames
  );

  await client.connect();
  const pipeline = new GscPipeline(client);
  const result = await pipeline.run(runConfig);

  logger.info(result, "Pipeline result");
}

main().catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error(
    {
      err: err.message,
      stackBoundary: err.stack?.split("\n").slice(0, 8).join("\n")
    },
    "Pipeline execution failed"
  );
  process.exitCode = 1;
});
