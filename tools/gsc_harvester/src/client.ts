import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { logger } from "./logger.js";
import type {
  McpConnectionConfig,
  RetryConfig,
  SearchAnalyticsToolRequest,
  ToolNames,
  ToolSchemaInfo
} from "./types.js";

interface McpCallToolResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialDelayMs: 800,
  backoffMultiplier: 2,
  maxDelayMs: 10_000
};

export class GscMcpClient {
  private readonly connection: McpConnectionConfig;
  private readonly toolNames: ToolNames;
  private readonly retry: RetryConfig;
  private client: Client | null = null;

  public constructor(connection: McpConnectionConfig, toolNames: ToolNames, retry?: Partial<RetryConfig>) {
    this.connection = connection;
    this.toolNames = toolNames;
    this.retry = {
      ...DEFAULT_RETRY_CONFIG,
      ...retry
    };
  }

  public async connect(): Promise<void> {
    if (this.client) {
      return;
    }

    this.client = new Client(
      {
        name: "gsc-harvester",
        version: "1.0.0"
      },
      {
        capabilities: {}
      }
    );

    const transport = new StdioClientTransport(
      this.connection.env
        ? {
            command: this.connection.command,
            args: this.connection.args,
            env: this.connection.env
          }
        : {
            command: this.connection.command,
            args: this.connection.args
          }
    );

    await this.client.connect(transport);
    logger.info({ command: this.connection.command, args: this.connection.args }, "Connected to MCP server");
  }

  public async listTools(): Promise<ToolSchemaInfo[]> {
    this.ensureConnected();

    const response = await this.client!.listTools();
    const tools = Array.isArray(response.tools) ? response.tools : [];

    return tools.map((tool) => ({
      name: tool.name,
      ...(typeof tool.description === "string" ? { description: tool.description } : {}),
      ...(typeof tool.inputSchema !== "undefined" ? { inputSchema: tool.inputSchema } : {})
    }));
  }

  public async getCapabilities(): Promise<unknown> {
    return this.callToolWithRetry("get_capabilities", {});
  }

  public async listProperties(): Promise<unknown> {
    return this.callToolWithRetry("list_properties", {});
  }

  public async fetchSearchAnalytics(request: SearchAnalyticsToolRequest): Promise<unknown> {
    return this.callToolWithRetry(this.toolNames.searchAnalytics, { ...request });
  }

  public async fetchIndexingStatus(args: Record<string, unknown>): Promise<unknown> {
    return this.callToolWithRetry(this.toolNames.indexingStatus, args);
  }

  public async fetchSitemapStatus(args: Record<string, unknown>): Promise<unknown> {
    return this.callToolWithRetry(this.toolNames.sitemapStatus, args);
  }

  private ensureConnected(): void {
    if (!this.client) {
      throw new Error("GSC MCP client is not connected. Call connect() before making requests.");
    }
  }

  private async callToolWithRetry(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    this.ensureConnected();

    let attempt = 0;
    let delayMs = this.retry.initialDelayMs;

    while (attempt < this.retry.maxAttempts) {
      attempt += 1;

      try {
        const response = (await this.client!.callTool({
          name: toolName,
          arguments: args
        })) as McpCallToolResult;

        if (response.isError) {
          throw new Error(`MCP tool ${toolName} returned isError=true`);
        }

        return extractPayload(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isRateLimited = /\b429\b|rate limit|quota|too many requests/i.test(message);
        const shouldRetry = isRateLimited && attempt < this.retry.maxAttempts;

        logger.warn(
          {
            toolName,
            attempt,
            maxAttempts: this.retry.maxAttempts,
            isRateLimited,
            message
          },
          "MCP tool call failed"
        );

        if (!shouldRetry) {
          throw error;
        }

        await delay(delayMs);
        delayMs = Math.min(Math.floor(delayMs * this.retry.backoffMultiplier), this.retry.maxDelayMs);
      }
    }

    throw new Error(`MCP tool ${toolName} failed after ${this.retry.maxAttempts} attempts.`);
  }
}

function extractPayload(response: McpCallToolResult): unknown {
  if (typeof response.structuredContent !== "undefined") {
    return response.structuredContent;
  }

  const textParts = (response.content ?? [])
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text as string);

  if (textParts.length === 0) {
    return response;
  }

  const combined = textParts.join("\n").trim();
  if (!combined) {
    return response;
  }

  try {
    return JSON.parse(combined) as unknown;
  } catch {
    return { text: combined };
  }
}
