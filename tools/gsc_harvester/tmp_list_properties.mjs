import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const target = "sc-domain:happyfacesla.com";
const client = new Client({ name: "list-props-check", version: "1.0.0" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: "uvx",
  args: ["--from", "mcp-search-console==0.3.2", "mcp-search-console"],
  env: process.env
});

await client.connect(transport);
const res = await client.callTool({ name: "list_properties", arguments: {} });
const text = (res.content ?? [])
  .filter((p) => p.type === "text" && typeof p.text === "string")
  .map((p) => p.text)
  .join("\n");

let payload = {};
try {
  payload = JSON.parse(text);
} catch {
  payload = { raw: text };
}

const properties = Array.isArray(payload.properties) ? payload.properties : [];
const match = properties.find((p) => p && (p.site_url === target || p.siteUrl === target));
const permissionLevel = match?.permission_level ?? match?.permissionLevel ?? null;

console.log(JSON.stringify({ found: Boolean(match), permissionLevel }, null, 2));