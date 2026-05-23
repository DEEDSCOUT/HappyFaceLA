import type { ToolNames } from "./types.js";

export const READ_ONLY_TOOL_ALLOWLIST = {
  searchAnalytics: "get_search_analytics",
  indexingStatus: "inspect_url_enhanced",
  sitemapStatus: "get_sitemaps"
} as const;

export function validateReadOnlyToolNames(toolNames: ToolNames): void {
  const entries: Array<[keyof ToolNames, string]> = [
    ["searchAnalytics", toolNames.searchAnalytics],
    ["indexingStatus", toolNames.indexingStatus],
    ["sitemapStatus", toolNames.sitemapStatus]
  ];

  for (const [key, value] of entries) {
    const expected = READ_ONLY_TOOL_ALLOWLIST[key];
    if (value !== expected) {
      throw new Error(
        `Unsafe tool mapping for ${key}: ${value}. Expected read-only tool ${expected}.`
      );
    }
  }
}
