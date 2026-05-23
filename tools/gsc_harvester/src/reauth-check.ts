import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolveMcpRuntime } from "./runtime-config.js";

type JsonMap = Record<string, unknown>;

function parseArgs(argv: string[]): { command: string; args: string[] } {
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

  return resolveMcpRuntime(bag.mcpCommand ?? process.env.GSC_MCP_COMMAND, bag.mcpArgsJson ?? process.env.GSC_MCP_ARGS_JSON);
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => sanitize(v));
  }
  if (value && typeof value === "object") {
    const out: JsonMap = {};
    for (const [k, v] of Object.entries(value as JsonMap)) {
      if (/(access_token|refresh_token|token|secret|authorization|cookie|credential|private_key|client_secret)/i.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitize(v);
      }
    }
    return out;
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

async function main(): Promise<void> {
  const cfg = parseArgs(process.argv.slice(2));

  const client = new Client(
    { name: "gsc-harvester-reauth-check", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(
    new StdioClientTransport({
      command: cfg.command,
      args: cfg.args,
      env: {
        ...process.env
      } as Record<string, string>
    })
  );

  try {
    const result = await client.callTool({ name: "reauthenticate", arguments: {} });
    process.stdout.write(
      `${JSON.stringify(
        {
          status: "success",
          server: client.getServerVersion(),
          rawResult: sanitize(result)
        },
        null,
        2
      )}\n`
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    process.stdout.write(
      `${JSON.stringify(
        {
          status: "failure",
          server: client.getServerVersion(),
          error: { message: err.message, stack: err.stack?.split("\n").slice(0, 8).join("\n") }
        },
        null,
        2
      )}\n`
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error));
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "fatal",
        error: { message: err.message, stack: err.stack?.split("\n").slice(0, 8).join("\n") }
      },
      null,
      2
    )}\n`
  );
  process.exitCode = 1;
});
