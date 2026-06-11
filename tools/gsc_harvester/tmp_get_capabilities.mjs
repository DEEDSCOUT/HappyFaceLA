import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "cap-check", version: "1.0.0" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: "uvx",
  args: ["--from", "mcp-search-console==0.3.2", "mcp-search-console"],
  env: process.env
});

await client.connect(transport);
const res = await client.callTool({ name: "get_capabilities", arguments: {} });

const text = (res.content ?? [])
  .filter((p) => p.type === "text" && typeof p.text === "string")
  .map((p) => p.text)
  .join("\n");

const authActive = /AUTH STATUS:[\s\S]*Authenticated/i.test(text);
const destructiveDisabled = /Destructive \(disabled by default/i.test(text);
const readOnlyCandidates = [
  "list_properties",
  "get_site_details",
  "get_search_analytics",
  "get_performance_overview",
  "compare_search_periods",
  "get_search_by_page_query",
  "get_advanced_search_analytics",
  "inspect_url_enhanced",
  "batch_url_inspection",
  "check_indexing_issues",
  "get_sitemaps",
  "list_sitemaps_enhanced"
];

const readOnlyTools = readOnlyCandidates.filter((tool) => {
  const pattern = new RegExp(`-\\s+${tool}\\b`, "i");
  return pattern.test(text);
});

console.log(JSON.stringify({ authActive, readOnlyTools, destructiveDisabled }, null, 2));