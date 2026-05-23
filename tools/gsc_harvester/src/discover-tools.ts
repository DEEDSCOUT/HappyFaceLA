import { GscMcpClient } from "./client.js";
import { logger } from "./logger.js";
import { resolveMcpRuntime } from "./runtime-config.js";

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      continue;
    }
    const [key, ...rest] = arg.slice(2).split("=");
    if (!key || rest.length === 0) {
      continue;
    }
    result[key] = rest.join("=");
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runtime = resolveMcpRuntime(args.mcpCommand ?? process.env.GSC_MCP_COMMAND, args.mcpArgsJson ?? process.env.GSC_MCP_ARGS_JSON);

  const client = new GscMcpClient(
    {
      command: runtime.command,
      args: runtime.args,
      env: {
        ...process.env
      } as Record<string, string>
    },
    {
      searchAnalytics: "unused",
      indexingStatus: "unused",
      sitemapStatus: "unused"
    }
  );

  await client.connect();
  const tools = await client.listTools();
  const gscTools = tools.filter((tool) => /search|console|index|sitemap|query|analytics/i.test(tool.name));

  const payload = {
    totalTools: tools.length,
    matchingTools: gscTools.length,
    toolNames: gscTools.map((tool) => tool.name),
    tools: gscTools
  };

  logger.info(payload, "MCP tool discovery complete");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.message : String(error) }, "Tool discovery failed");
  process.exitCode = 1;
});
