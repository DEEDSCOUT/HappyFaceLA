export type SearchDimension = "query" | "page" | "device";

export type Device =
  | "DESKTOP"
  | "MOBILE"
  | "TABLET"
  | "UNKNOWN"
  | "OTHER";

export interface SearchAnalyticsToolRequest {
  site_url: string;
  days: number;
  dimensions: string;
  row_limit?: number;
}

export interface SearchAnalyticsRow {
  query?: string;
  page?: string;
  device?: Device;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface OpportunityFilter {
  minPosition: number;
  maxPosition: number;
  maxCtr: number;
  minImpressions: number;
}

export interface QueryOpportunity extends SearchAnalyticsRow {
  reason: "high_impression_low_click";
}

export interface IndexingDiagnostic {
  page: string;
  indexed: boolean;
  verdict?: string;
  coverageState?: string;
  crawlErrors: string[];
  lastCrawlTime?: string;
}

export interface SitemapStatus {
  sitemap: string;
  status: string;
  type?: string;
  submitted_urls: number;
  warnings: number;
  errors: number;
  lastSubmitted?: string;
  lastDownloaded?: string;
}

export interface PipelineNormalizedOutput {
  siteUrl: string;
  generatedAt: string;
  range: {
    startDate: string;
    endDate: string;
    days: number;
  };
  topQueries: SearchAnalyticsRow[];
  topPages: SearchAnalyticsRow[];
  analytics: {
    status: "success";
    row_count: number;
  };
  opportunities: QueryOpportunity[];
  indexingDiagnostics: IndexingDiagnostic[];
  sitemapStatuses: SitemapStatus[];
  flags: {
    hasSitemapErrors: boolean;
    hasCrawlErrors: boolean;
    unindexedPages: number;
  };
}

export interface PipelineRawOutput {
  siteUrl: string;
  generatedAt: string;
  queriesRaw: unknown;
  pagesRaw: unknown;
  indexingRaw: unknown;
  sitemapsRaw: unknown;
}

export interface ToolNames {
  searchAnalytics: string;
  indexingStatus: string;
  sitemapStatus: string;
}

export interface McpConnectionConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

export interface PipelineRunConfig {
  siteUrl: string;
  outputDir: string;
  days: number;
  rowLimit: number;
  topLimit: number;
  opportunityFilter: OpportunityFilter;
}

export interface HarvestResult {
  rawFilePath: string;
  normalizedFilePath: string;
  summary: {
    topQueries: number;
    topPages: number;
    opportunities: number;
    unindexedPages: number;
    sitemapErrors: number;
  };
}

export interface ToolSchemaInfo {
  name: string;
  description?: string;
  inputSchema?: unknown;
}
