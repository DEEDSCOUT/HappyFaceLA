import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "readonly-sitemap-inspect", version: "1.0.0" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: "uvx",
  args: ["--from", "mcp-search-console==0.3.2", "mcp-search-console"],
  env: process.env
});

await client.connect(transport);

const siteUrl = "sc-domain:happyfacesla.com";
const pageUrl = "https://happyfacesla.com/services/";

const sitemapsRes = await client.callTool({
  name: "get_sitemaps",
  arguments: { site_url: siteUrl }
});

const inspectRes = await client.callTool({
  name: "inspect_url_enhanced",
  arguments: { site_url: siteUrl, page_url: pageUrl }
});

const textOf = (res) => (res.content ?? [])
  .filter((p) => p.type === "text" && typeof p.text === "string")
  .map((p) => p.text)
  .join("\n");

const parseJson = (txt) => {
  try { return JSON.parse(txt); } catch { return { raw: txt }; }
};

const sitemapsPayload = parseJson(textOf(sitemapsRes));
const inspectPayload = parseJson(textOf(inspectRes));

const firstSitemap = Array.isArray(sitemapsPayload.sitemaps) && sitemapsPayload.sitemaps.length > 0
  ? sitemapsPayload.sitemaps[0]
  : null;

const out = {
  sitemap: firstSitemap
    ? {
        path: firstSitemap.path ?? null,
        status: firstSitemap.status ?? null,
        errors: firstSitemap.errors ?? null,
        warnings: firstSitemap.warnings ?? null,
        submitted_urls: firstSitemap.submitted_urls ?? firstSitemap.indexed_urls ?? null
      }
    : null,
  inspection: {
    coverage_state: inspectPayload.coverage_state ?? null,
    verdict: inspectPayload.verdict ?? null,
    last_crawled: inspectPayload.last_crawled ?? null
  }
};

console.log(JSON.stringify(out, null, 2));