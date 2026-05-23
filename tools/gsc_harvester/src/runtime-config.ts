export const APPROVED_MCP_COMMAND = "uvx";
export const APPROVED_MCP_ARGS = ["--from", "mcp-search-console==0.3.2", "mcp-search-console"] as const;
export const DIAGNOSTIC_OVERRIDE_ENV = "GSC_ALLOW_UNPINNED_MCP_FOR_DIAGNOSTIC";

export interface McpRuntimeConfig {
  command: string;
  args: string[];
}

function parseArgsJson(argsJson: string): string[] {
  const parsed = JSON.parse(argsJson) as unknown;
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
    throw new Error("mcpArgsJson must parse to a JSON string array");
  }
  return parsed as string[];
}

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function referencesMcpSearchConsole(command: string, args: string[]): boolean {
  if (/mcp-search-console/i.test(command)) {
    return true;
  }
  return args.some((arg) => /mcp-search-console/i.test(arg));
}

export function resolveMcpRuntime(commandValue: string | undefined, argsJsonValue: string | undefined): McpRuntimeConfig {
  const command = (commandValue ?? APPROVED_MCP_COMMAND).trim();
  const args = argsJsonValue ? parseArgsJson(argsJsonValue) : [...APPROVED_MCP_ARGS];

  if (!command) {
    throw new Error("mcpCommand must be non-empty");
  }

  return { command, args };
}

export function isApprovedPinnedRuntime(command: string, args: string[]): boolean {
  if (command !== APPROVED_MCP_COMMAND) {
    return false;
  }
  if (args.length !== APPROVED_MCP_ARGS.length) {
    return false;
  }

  return APPROVED_MCP_ARGS.every((value, index) => args[index] === value);
}

export function enforcePinnedRuntimeForHarvest(
  command: string,
  args: string[],
  allowUnpinnedOverride: string | undefined
): void {
  if (isApprovedPinnedRuntime(command, args)) {
    return;
  }

  if (!referencesMcpSearchConsole(command, args)) {
    return;
  }

  if (isTrue(allowUnpinnedOverride)) {
    return;
  }

  throw new Error(
    `Unpinned mcp-search-console runtime is blocked for harvest. Use the approved invocation ` +
      `\"${APPROVED_MCP_COMMAND} ${APPROVED_MCP_ARGS.join(" ")}\" or explicitly set ${DIAGNOSTIC_OVERRIDE_ENV}=true for diagnostic/development only.`
  );
}
