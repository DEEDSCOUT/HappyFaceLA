import {
  type Device,
  type IndexingDiagnostic,
  type OpportunityFilter,
  type QueryOpportunity,
  type SearchAnalyticsRow,
  type SearchDimension,
  type SitemapStatus
} from "./types.js";

function asNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeCtr(value: unknown): number {
  const raw = asNumber(value);
  return raw > 1 ? raw / 100 : raw;
}

function asDevice(value: unknown): Device | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const upper = value.toUpperCase();
  if (upper === "DESKTOP" || upper === "MOBILE" || upper === "TABLET") {
    return upper;
  }
  if (upper === "UNKNOWN" || upper === "OTHER") {
    return upper;
  }
  return "OTHER";
}

function getRows(payload: unknown): unknown[] {
  const base = unwrapPayload(payload);

  if (Array.isArray(base)) {
    return base;
  }

  if (base && typeof base === "object") {
    const candidate = (base as { rows?: unknown }).rows;
    if (Array.isArray(candidate)) {
      return candidate;
    }

    const items = (base as { items?: unknown }).items;
    if (Array.isArray(items)) {
      return items;
    }

    const data = (base as { data?: { rows?: unknown } }).data;
    if (data && Array.isArray(data.rows)) {
      return data.rows;
    }

    const sitemaps = (base as { sitemaps?: unknown }).sitemaps;
    if (Array.isArray(sitemaps)) {
      return sitemaps;
    }
  }

  return [];
}

function unwrapPayload(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const result = (payload as { result?: unknown }).result;
    if (typeof result === "string") {
      try {
        return JSON.parse(result) as unknown;
      } catch {
        return { text: result };
      }
    }

    if (typeof result !== "undefined") {
      return result;
    }
  }

  return payload;
}

export function normalizeSearchAnalytics(
  payload: unknown,
  dimensions: SearchDimension[]
): SearchAnalyticsRow[] {
  const unwrapped = unwrapPayload(payload);
  if (unwrapped && typeof unwrapped === "object" && typeof (unwrapped as { text?: unknown }).text === "string") {
    return [];
  }

  const rows = getRows(unwrapped);
  const result: SearchAnalyticsRow[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const typedRow = row as {
      keys?: unknown[];
      query?: unknown;
      page?: unknown;
      device?: unknown;
      clicks?: unknown;
      impressions?: unknown;
      ctr?: unknown;
      position?: unknown;
    };

    const keys = Array.isArray(typedRow.keys) ? typedRow.keys : [];
    const indexed = Object.fromEntries(dimensions.map((dim, idx) => [dim, keys[idx]]));

    const queryCandidate =
      (typeof typedRow.query === "string" ? typedRow.query : undefined) ??
      (typeof indexed.query === "string" ? indexed.query : undefined);

    const pageCandidate =
      (typeof typedRow.page === "string" ? typedRow.page : undefined) ??
      (typeof indexed.page === "string" ? indexed.page : undefined);

    const deviceCandidate = asDevice(typedRow.device ?? indexed.device);

    result.push({
      ...(queryCandidate ? { query: queryCandidate } : {}),
      ...(pageCandidate ? { page: pageCandidate } : {}),
      ...(deviceCandidate ? { device: deviceCandidate } : {}),
      clicks: asNumber(typedRow.clicks),
      impressions: asNumber(typedRow.impressions),
      ctr: normalizeCtr(typedRow.ctr),
      position: asNumber(typedRow.position)
    });
  }

  return result;
}

export function topByImpressions(rows: SearchAnalyticsRow[], limit: number): SearchAnalyticsRow[] {
  return [...rows].sort((a, b) => b.impressions - a.impressions).slice(0, limit);
}

export function findHighImpressionLowClickOpportunities(
  rows: SearchAnalyticsRow[],
  filter: OpportunityFilter
): QueryOpportunity[] {
  return rows
    .filter(
      (row) =>
        row.impressions >= filter.minImpressions &&
        row.position >= filter.minPosition &&
        row.position <= filter.maxPosition &&
        row.ctr < filter.maxCtr
    )
    .sort((a, b) => b.impressions - a.impressions)
    .map((row) => ({ ...row, reason: "high_impression_low_click" }));
}

function boolFromUnknown(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return undefined;
}

export function normalizeIndexingDiagnostics(payload: unknown): IndexingDiagnostic[] {
  const unwrapped = unwrapPayload(payload);
  const rows = getRows(unwrapped);
  const sourceRows = rows.length > 0 ? rows : unwrapped && typeof unwrapped === "object" ? [unwrapped] : [];
  const result: IndexingDiagnostic[] = [];

  for (const item of sourceRows) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const raw = item as Record<string, unknown>;
    const page =
      (typeof raw.page === "string" && raw.page) ||
      (typeof raw.page_url === "string" && raw.page_url) ||
      (typeof raw.url === "string" && raw.url) ||
      (typeof raw.inspectedUrl === "string" && raw.inspectedUrl) ||
      "";

    if (!page) {
      continue;
    }

    const verdict = typeof raw.verdict === "string" ? raw.verdict : undefined;
    const coverageState =
      typeof raw.coverageState === "string"
        ? raw.coverageState
        : typeof raw.coverage_state === "string"
          ? raw.coverage_state
        : typeof raw.indexStatusResult === "string"
          ? raw.indexStatusResult
          : undefined;

    const indexedFromFlag = boolFromUnknown(raw.indexed);
    const indexedFromVerdict = verdict ? /pass|indexed|ok|valid/i.test(verdict) : undefined;
    const indexed = indexedFromFlag ?? indexedFromVerdict ?? false;

    const crawlErrors: string[] = [];
    if (typeof raw.error === "string" && raw.error.trim()) {
      crawlErrors.push(raw.error.trim());
    }
    if (Array.isArray(raw.issues)) {
      for (const issue of raw.issues) {
        if (typeof issue === "string" && issue.trim()) {
          crawlErrors.push(issue.trim());
        }
      }
    }

    const lastCrawlTime =
      typeof raw.lastCrawlTime === "string"
        ? raw.lastCrawlTime
        : typeof raw.last_crawled === "string"
          ? raw.last_crawled
        : typeof raw.lastCrawled === "string"
          ? raw.lastCrawled
          : undefined;

    result.push({
      page,
      indexed,
      ...(verdict ? { verdict } : {}),
      ...(coverageState ? { coverageState } : {}),
      crawlErrors,
      ...(lastCrawlTime ? { lastCrawlTime } : {})
    });
  }

  return result;
}

export function normalizeSitemapStatus(payload: unknown): SitemapStatus[] {
  const rows = getRows(payload);
  const result: SitemapStatus[] = [];

  for (const item of rows) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const raw = item as Record<string, unknown>;
    const sitemap =
      (typeof raw.sitemap === "string" && raw.sitemap) ||
      (typeof raw.path === "string" && raw.path) ||
      (typeof raw.loc === "string" && raw.loc) ||
      "";

    if (!sitemap) {
      continue;
    }

    const type = typeof raw.type === "string" ? raw.type : undefined;
    const lastSubmitted =
      typeof raw.lastSubmitted === "string"
        ? raw.lastSubmitted
        : typeof raw.lastSubmittedAt === "string"
          ? raw.lastSubmittedAt
          : undefined;
    const lastDownloaded =
      typeof raw.lastDownloaded === "string"
        ? raw.lastDownloaded
        : typeof raw.lastDownloadedAt === "string"
          ? raw.lastDownloadedAt
          : undefined;

    result.push({
      sitemap,
      status: typeof raw.status === "string" ? raw.status : "UNKNOWN",
      ...(type ? { type } : {}),
      submitted_urls: asNumber(raw.submitted_urls ?? raw.indexed_urls),
      warnings: asNumber(raw.warnings),
      errors: asNumber(raw.errors),
      ...(lastSubmitted ? { lastSubmitted } : {}),
      ...(lastDownloaded ? { lastDownloaded } : {})
    });
  }

  return result;
}
