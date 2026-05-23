import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { GscPipeline } from "../src/pipeline.js";
import { validateReadOnlyToolNames } from "../src/safety.js";
import type { GscMcpClient } from "../src/client.js";
import type { PipelineRunConfig } from "../src/types.js";

class MockClient {
  public readonly calls: Array<{ method: string; args: Record<string, unknown> }> = [];

  public constructor(
    private readonly responses: {
      capabilities: unknown;
      properties: unknown;
      analytics: unknown;
      indexing: unknown;
      sitemaps: unknown;
    }
  ) {}

  public async getCapabilities(): Promise<unknown> {
    return this.responses.capabilities;
  }

  public async listProperties(): Promise<unknown> {
    return this.responses.properties;
  }

  public async fetchSearchAnalytics(args: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ method: "get_search_analytics", args });
    return this.responses.analytics;
  }

  public async fetchIndexingStatus(args: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ method: "inspect_url_enhanced", args });
    return this.responses.indexing;
  }

  public async fetchSitemapStatus(args: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ method: "get_sitemaps", args });
    return this.responses.sitemaps;
  }
}

function makeRunConfig(outputDir: string): PipelineRunConfig {
  return {
    siteUrl: "sc-domain:happyfacesla.com",
    outputDir,
    days: 30,
    rowLimit: 1000,
    topLimit: 50,
    opportunityFilter: {
      minPosition: 5,
      maxPosition: 15,
      maxCtr: 0.02,
      minImpressions: 100
    }
  };
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}

test("harvest uses MCP probe-compatible argument contracts", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gsc-harvester-test-"));
  const mock = new MockClient({
    capabilities: { result: "Google Search Console MCP Server\n\nAUTH STATUS:\n✅ Authenticated — ready to use all tools." },
    properties: { result: '{"count":1,"properties":[{"site_url":"sc-domain:happyfacesla.com"}]}' },
    analytics: { result: "No search analytics data found for sc-domain:happyfacesla.com in the last 28 days." },
    indexing:
      '{"page_url":"https://happyfacesla.com/services/","verdict":"NEUTRAL","coverage_state":"Discovered - currently not indexed","last_crawled":null}',
    sitemaps: {
      result:
        '{"site_url":"sc-domain:happyfacesla.com","count":1,"sitemaps":[{"path":"https://happyfacesla.com/sitemap-index.xml","status":"Valid","indexed_urls":"12","errors":0,"warnings":0}]}'
    }
  });

  const pipeline = new GscPipeline(mock as unknown as GscMcpClient);
  await pipeline.run(makeRunConfig(tempDir));

  const sitemapCall = mock.calls.find((entry) => entry.method === "get_sitemaps");
  const analyticsCall = mock.calls.find((entry) => entry.method === "get_search_analytics");
  const inspectCall = mock.calls.find((entry) => entry.method === "inspect_url_enhanced");

  assert.deepEqual(sitemapCall?.args, { site_url: "sc-domain:happyfacesla.com" });
  assert.deepEqual(analyticsCall?.args, {
    site_url: "sc-domain:happyfacesla.com",
    days: 28,
    dimensions: "query",
    row_limit: 20
  });
  assert.deepEqual(inspectCall?.args, {
    site_url: "sc-domain:happyfacesla.com",
    page_url: "https://happyfacesla.com/services/"
  });

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("preflight fails before collection when auth is not confirmed", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gsc-harvester-test-"));
  const mock = new MockClient({
    capabilities: { result: "AUTH STATUS:\n❌ Not authenticated" },
    properties: { result: '{"count":1,"properties":[{"site_url":"sc-domain:happyfacesla.com"}]}' },
    analytics: { result: "" },
    indexing: {},
    sitemaps: {}
  });

  const pipeline = new GscPipeline(mock as unknown as GscMcpClient);
  await assert.rejects(() => pipeline.run(makeRunConfig(tempDir)), /Preflight failed: get_capabilities/);
  assert.equal(mock.calls.length, 0);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("preflight fails before collection when property is missing", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gsc-harvester-test-"));
  const mock = new MockClient({
    capabilities: { result: "AUTH STATUS:\n✅ Authenticated" },
    properties: { result: '{"count":0,"properties":[]}' },
    analytics: { result: "" },
    indexing: {},
    sitemaps: {}
  });

  const pipeline = new GscPipeline(mock as unknown as GscMcpClient);
  await assert.rejects(() => pipeline.run(makeRunConfig(tempDir)), /Preflight failed: list_properties/);
  assert.equal(mock.calls.length, 0);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("zero-data analytics is normalized as success with row_count 0", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gsc-harvester-test-"));
  const mock = new MockClient({
    capabilities: { result: "AUTH STATUS:\n✅ Authenticated" },
    properties: { result: '{"count":1,"properties":[{"site_url":"sc-domain:happyfacesla.com"}]}' },
    analytics: { result: "No search analytics data found for sc-domain:happyfacesla.com in the last 28 days." },
    indexing:
      '{"page_url":"https://happyfacesla.com/services/","verdict":"NEUTRAL","coverage_state":"Discovered - currently not indexed","last_crawled":null}',
    sitemaps: {
      result:
        '{"site_url":"sc-domain:happyfacesla.com","count":1,"sitemaps":[{"path":"https://happyfacesla.com/sitemap-index.xml","status":"Valid","indexed_urls":"12","errors":0,"warnings":0}]}'
    }
  });

  const pipeline = new GscPipeline(mock as unknown as GscMcpClient);
  const result = await pipeline.run(makeRunConfig(tempDir));
  const normalized = (await readJson(result.normalizedFilePath)) as {
    analytics: { status: string; row_count: number };
    sitemapStatuses: Array<Record<string, unknown>>;
  };

  assert.equal(normalized.analytics.status, "success");
  assert.equal(normalized.analytics.row_count, 0);
  assert.equal(normalized.sitemapStatuses[0]?.submitted_urls, 12);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized.sitemapStatuses[0] ?? {}, "indexed_urls"), false);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("read-only tool allowlist rejects unsafe overrides", () => {
  assert.doesNotThrow(() =>
    validateReadOnlyToolNames({
      searchAnalytics: "get_search_analytics",
      indexingStatus: "inspect_url_enhanced",
      sitemapStatus: "get_sitemaps"
    })
  );

  assert.throws(
    () =>
      validateReadOnlyToolNames({
        searchAnalytics: "get_search_analytics",
        indexingStatus: "request_indexing",
        sitemapStatus: "get_sitemaps"
      }),
    /Unsafe tool mapping/
  );
});
