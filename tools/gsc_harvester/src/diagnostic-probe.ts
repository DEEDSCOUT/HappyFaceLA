import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type JsonMap = Record<string, unknown>;

interface ParsedArgs {
  mcpCommand: string;
  mcpArgs: string[];
  preferredSiteUrl?: string;
  pageUrl: string;
}

interface ToolCallEvidence {
  tool: string;
  phase: "before_tool_execution" | "after_tool_execution" | "execution_error";
  args: JsonMap;
  isError?: boolean;
  rawResult?: unknown;
  parsedPayload?: unknown;
  errorMessage?: string;
  errorStackBoundary?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const bag: Record<string, string> = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      continue;
    }
    const [key, ...rest] = arg.slice(2).split("=");
    if (!key || rest.length === 0) {
      continue;
    }
    bag[key] = rest.join("=");
  }

  const mcpCommand = bag.mcpCommand ?? process.env.GSC_MCP_COMMAND;
  const mcpArgsJson = bag.mcpArgsJson ?? process.env.GSC_MCP_ARGS_JSON;

  if (!mcpCommand || !mcpArgsJson) {
    throw new Error("Missing required --mcpCommand and --mcpArgsJson values.");
  }

  const parsed = JSON.parse(mcpArgsJson) as unknown;
  if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== "string")) {
    throw new Error("mcpArgsJson must parse to a string array");
  }

  const preferredSiteUrl = bag.preferredSiteUrl ?? process.env.GSC_SITE_URL;

  return {
    mcpCommand,
    mcpArgs: parsed,
    ...(preferredSiteUrl ? { preferredSiteUrl } : {}),
    pageUrl: bag.pageUrl ?? "https://happyfacesla.com/services/"
  };
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }

  if (value && typeof value === "object") {
    const redacted: JsonMap = {};
    for (const [key, raw] of Object.entries(value as JsonMap)) {
      if (/(access_token|refresh_token|token|secret|authorization|cookie|credential|private_key|client_secret)/i.test(key)) {
        redacted[key] = "[REDACTED]";
        continue;
      }
      redacted[key] = sanitizeValue(raw);
    }
    return redacted;
  }

  if (
    typeof value === "string" &&
    /(ya29\.[A-Za-z0-9\-_]+|Bearer\s+[A-Za-z0-9\-_.]+|"access_token"\s*:|"refresh_token"\s*:|-----BEGIN\s+PRIVATE\s+KEY-----)/i.test(
      value
    )
  ) {
    return "[REDACTED]";
  }

  return value;
}

function parseToolPayload(result: unknown): unknown {
  const typed = result as {
    structuredContent?: unknown;
    content?: Array<{ type?: string; text?: string }>;
  };

  if (typeof typed.structuredContent !== "undefined") {
    return typed.structuredContent;
  }

  const textParts = (typed.content ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string);

  if (textParts.length === 0) {
    return result;
  }

  const joined = textParts.join("\n").trim();
  if (!joined) {
    return result;
  }

  try {
    return JSON.parse(joined) as unknown;
  } catch {
    return { text: joined };
  }
}

function toBoundaryStack(stack: string | undefined): string | undefined {
  if (!stack) {
    return undefined;
  }
  return stack.split("\n").slice(0, 8).join("\n");
}

async function callToolWithEvidence(
  client: Client,
  tool: string,
  args: JsonMap,
  evidence: ToolCallEvidence[]
): Promise<unknown> {
  evidence.push({
    tool,
    phase: "before_tool_execution",
    args: sanitizeValue(args) as JsonMap
  });

  try {
    const result = await client.callTool({ name: tool, arguments: args });
    const typed = result as { isError?: boolean };
    evidence.push({
      tool,
      phase: "after_tool_execution",
      args: sanitizeValue(args) as JsonMap,
      ...(typeof typed.isError === "boolean" ? { isError: typed.isError } : {}),
      rawResult: sanitizeValue(result),
      parsedPayload: sanitizeValue(parseToolPayload(result))
    });

    if (typed.isError) {
      throw new Error(`Tool ${tool} returned isError=true`);
    }

    return parseToolPayload(result);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const errorEvidence: ToolCallEvidence = {
      tool,
      phase: "execution_error",
      args: sanitizeValue(args) as JsonMap,
      errorMessage: err.message
    };
    const stackBoundary = toBoundaryStack(err.stack);
    if (stackBoundary) {
      errorEvidence.errorStackBoundary = stackBoundary;
    }
    evidence.push(errorEvidence);
    throw err;
  }
}

function pickHappyFacesProperty(propertiesPayload: unknown, preferred?: string): string | undefined {
  if (typeof propertiesPayload === "string") {
    const matches = propertiesPayload.match(/sc-domain:[^\s,\]\)}"']+|https?:\/\/[^\s,\]\)}"']+/gi) ?? [];
    const cleaned = matches.map((m) => m.trim());
    if (preferred && cleaned.includes(preferred)) {
      return preferred;
    }
    return cleaned.find((value) => /happyfacesla\.com/i.test(value));
  }

  if (propertiesPayload && typeof propertiesPayload === "object" && "result" in (propertiesPayload as JsonMap)) {
    const result = (propertiesPayload as JsonMap).result;
    if (typeof result === "string") {
      return pickHappyFacesProperty(result, preferred);
    }
  }

  const entries = Array.isArray(propertiesPayload)
    ? propertiesPayload
    : propertiesPayload && typeof propertiesPayload === "object" && Array.isArray((propertiesPayload as JsonMap).properties)
      ? ((propertiesPayload as JsonMap).properties as unknown[])
      : [];

  const candidates = entries
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }
      if (entry && typeof entry === "object") {
        const o = entry as JsonMap;
        const values = [o.siteUrl, o.site_url, o.property, o.resource, o.url];
        for (const value of values) {
          if (typeof value === "string" && value.trim()) {
            return value;
          }
        }
      }
      return undefined;
    })
    .filter((v): v is string => typeof v === "string");

  if (preferred && candidates.includes(preferred)) {
    return preferred;
  }

  return candidates.find((value) => /happyfacesla\.com/i.test(value));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const client = new Client(
    {
      name: "gsc-harvester-diagnostic",
      version: "1.0.0"
    },
    {
      capabilities: {}
    }
  );

  const transport = new StdioClientTransport({
    command: args.mcpCommand,
    args: args.mcpArgs,
    env: {
      ...process.env
    } as Record<string, string>
  });

  await client.connect(transport);

  const toolsResult = await client.listTools();
  const tools = (toolsResult.tools ?? []).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }));

  const evidence: ToolCallEvidence[] = [];
  let selectedSiteUrl: string | undefined;

  try {
    const capabilitiesPayload = await callToolWithEvidence(client, "get_capabilities", {}, evidence);
    const propertiesPayload = await callToolWithEvidence(client, "list_properties", {}, evidence);

    selectedSiteUrl = pickHappyFacesProperty(propertiesPayload, args.preferredSiteUrl);
    if (!selectedSiteUrl) {
      throw new Error(
        "No Happy Faces LA property found in list_properties result. Configure preferredSiteUrl if needed."
      );
    }

    await callToolWithEvidence(client, "get_sitemaps", { site_url: selectedSiteUrl }, evidence);
    await callToolWithEvidence(
      client,
      "get_search_analytics",
      {
        site_url: selectedSiteUrl,
        days: 28,
        dimensions: "query",
        row_limit: 20
      },
      evidence
    );
    await callToolWithEvidence(
      client,
      "inspect_url_enhanced",
      {
        site_url: selectedSiteUrl,
        page_url: args.pageUrl
      },
      evidence
    );

    const output = {
      baselineCommand: {
        command: args.mcpCommand,
        args: args.mcpArgs
      },
      server: {
        version: client.getServerVersion(),
        capabilities: client.getServerCapabilities()
      },
      tools,
      selectedSiteUrl,
      evidence: sanitizeValue(evidence),
      status: "success",
      noSecretAssertion: true,
      capabilitiesPayload: sanitizeValue(capabilitiesPayload),
      propertiesPayload: sanitizeValue(propertiesPayload)
    };

    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const output = {
      baselineCommand: {
        command: args.mcpCommand,
        args: args.mcpArgs
      },
      server: {
        version: client.getServerVersion(),
        capabilities: client.getServerCapabilities()
      },
      tools,
      selectedSiteUrl,
      evidence: sanitizeValue(evidence),
      status: "failure",
      failure: {
        message: err.message,
        stackBoundary: toBoundaryStack(err.stack)
      },
      noSecretAssertion: true,
      capabilitiesPayload: sanitizeValue(
        evidence.find((item) => item.tool === "get_capabilities" && item.phase === "after_tool_execution")
          ?.parsedPayload
      ),
      propertiesPayload: sanitizeValue(
        evidence.find((item) => item.tool === "list_properties" && item.phase === "after_tool_execution")?.parsedPayload
      )
    };

    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error));
  const output = {
    status: "fatal",
    failure: {
      message: err.message,
      stackBoundary: toBoundaryStack(err.stack)
    },
    noSecretAssertion: true
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = 1;
});
