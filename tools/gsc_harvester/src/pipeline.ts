import path from "node:path";

import { GscMcpClient } from "./client.js";
import { logger } from "./logger.js";
import { saveJson } from "./storage.js";
import {
  findHighImpressionLowClickOpportunities,
  normalizeIndexingDiagnostics,
  normalizeSearchAnalytics,
  normalizeSitemapStatus,
  topByImpressions
} from "./transform.js";
import type { HarvestResult, PipelineNormalizedOutput, PipelineRawOutput, PipelineRunConfig } from "./types.js";

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildDateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(days - 1, 0));

  return {
    startDate: toDateString(start),
    endDate: toDateString(end)
  };
}

function textFromPayload(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }

  if (payload && typeof payload === "object" && "result" in (payload as Record<string, unknown>)) {
    const result = (payload as Record<string, unknown>).result;
    return typeof result === "string" ? result : "";
  }

  return "";
}

function pickSiteUrl(propertiesPayload: unknown, preferred: string): string | undefined {
  const text = textFromPayload(propertiesPayload);
  if (text) {
    try {
      const parsed = JSON.parse(text) as unknown;
      const picked = pickSiteUrl(parsed, preferred);
      if (picked) {
        return picked;
      }
    } catch {
      const matches: string[] = text.match(/sc-domain:[^\s,\]\)}"']+|https?:\/\/[^\s,\]\)}"']+/gi) ?? [];
      if (matches.includes(preferred)) {
        return preferred;
      }
      return matches.find((value) => /happyfacesla\.com/i.test(value));
    }
  }

  if (Array.isArray(propertiesPayload)) {
    const urls = propertiesPayload.filter((item): item is string => typeof item === "string");
    if (urls.includes(preferred)) {
      return preferred;
    }
    return urls.find((value) => /happyfacesla\.com/i.test(value));
  }

  if (propertiesPayload && typeof propertiesPayload === "object") {
    const obj = propertiesPayload as Record<string, unknown>;
    const entries = Array.isArray(obj.properties) ? obj.properties : [];
    const urls = entries
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return undefined;
        }
        const typed = entry as Record<string, unknown>;
        const candidate = typed.site_url ?? typed.siteUrl;
        return typeof candidate === "string" ? candidate : undefined;
      })
      .filter((value): value is string => typeof value === "string");

    if (urls.includes(preferred)) {
      return preferred;
    }

    return urls.find((value) => /happyfacesla\.com/i.test(value));
  }

  return undefined;
}

export class GscPipeline {
  private readonly client: GscMcpClient;

  public constructor(client: GscMcpClient) {
    this.client = client;
  }

  public async run(config: PipelineRunConfig): Promise<HarvestResult> {
    const generatedAt = new Date().toISOString();
    const { startDate, endDate } = buildDateRange(config.days);

    logger.info(
      {
        siteUrl: config.siteUrl,
        startDate,
        endDate,
        rowLimit: config.rowLimit,
        topLimit: config.topLimit
      },
      "Starting GSC harvest"
    );

    const capabilitiesPayload = await this.client.getCapabilities();
    const capabilitiesText = textFromPayload(capabilitiesPayload);
    const authStatusLine =
      capabilitiesText.match(/AUTH STATUS:\s*(?:\r?\n\s*)?([^\r\n]+)/i)?.[1] ??
      capabilitiesText.match(/AUTH STATUS:[^\n]*/i)?.[0] ??
      "";
    const isAuthenticated = /authenticated/i.test(authStatusLine) && !/not authenticated/i.test(authStatusLine);
    if (!isAuthenticated) {
      throw new Error("Preflight failed: get_capabilities did not report authenticated status.");
    }

    const propertiesPayload = await this.client.listProperties();
    const selectedSiteUrl = pickSiteUrl(propertiesPayload, config.siteUrl);
    if (!selectedSiteUrl) {
      throw new Error("Preflight failed: list_properties did not return an accessible Happy Faces LA property.");
    }

    logger.info({ selectedSiteUrl }, "Preflight completed");

    const [queriesRaw, indexingRaw, sitemapsRaw] = await Promise.all([
      this.client.fetchSearchAnalytics({
        site_url: selectedSiteUrl,
        days: 28,
        dimensions: "query",
        row_limit: 20
      }),
      this.client.fetchIndexingStatus({
        site_url: selectedSiteUrl,
        page_url: "https://happyfacesla.com/services/"
      }),
      this.client.fetchSitemapStatus({ site_url: selectedSiteUrl })
    ]);

    const queryRows = normalizeSearchAnalytics(queriesRaw, ["query"]);
    const pageRows: ReturnType<typeof normalizeSearchAnalytics> = [];
    const indexingDiagnostics = normalizeIndexingDiagnostics(indexingRaw);
    const sitemapStatuses = normalizeSitemapStatus(sitemapsRaw);

    const topQueries = topByImpressions(queryRows, config.topLimit);
    const topPages = topByImpressions(pageRows, config.topLimit);
    const opportunities = findHighImpressionLowClickOpportunities(queryRows, config.opportunityFilter);

    const normalizedOutput: PipelineNormalizedOutput = {
      siteUrl: selectedSiteUrl,
      generatedAt,
      range: {
        startDate,
        endDate,
        days: config.days
      },
      topQueries,
      topPages,
      analytics: {
        status: "success",
        row_count: queryRows.length
      },
      opportunities,
      indexingDiagnostics,
      sitemapStatuses,
      flags: {
        hasSitemapErrors: sitemapStatuses.some((s) => s.errors > 0),
        hasCrawlErrors: indexingDiagnostics.some((d) => d.crawlErrors.length > 0),
        unindexedPages: indexingDiagnostics.filter((d) => !d.indexed).length
      }
    };

    const rawOutput: PipelineRawOutput = {
      siteUrl: selectedSiteUrl,
      generatedAt,
      queriesRaw,
      pagesRaw: [],
      indexingRaw,
      sitemapsRaw
    };

    const baseDir = path.resolve(config.outputDir);
    const rawFilePath = await saveJson({
      baseDir,
      relativeDir: "raw",
      baseName: "gsc-raw",
      timestamp: generatedAt,
      data: rawOutput
    });

    const normalizedFilePath = await saveJson({
      baseDir,
      relativeDir: "normalized",
      baseName: "gsc-normalized",
      timestamp: generatedAt,
      data: normalizedOutput
    });

    const summary = {
      topQueries: topQueries.length,
      topPages: topPages.length,
      opportunities: opportunities.length,
      unindexedPages: normalizedOutput.flags.unindexedPages,
      sitemapErrors: sitemapStatuses.reduce((total, status) => total + status.errors, 0)
    };

    logger.info(
      {
        rawFilePath,
        normalizedFilePath,
        summary
      },
      "GSC harvest complete"
    );

    return {
      rawFilePath,
      normalizedFilePath,
      summary
    };
  }
}
