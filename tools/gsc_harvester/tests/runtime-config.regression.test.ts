import assert from "node:assert/strict";
import test from "node:test";

import {
  APPROVED_MCP_ARGS,
  APPROVED_MCP_COMMAND,
  DIAGNOSTIC_OVERRIDE_ENV,
  enforcePinnedRuntimeForHarvest,
  isApprovedPinnedRuntime,
  resolveMcpRuntime
} from "../src/runtime-config.js";

test("default MCP runtime resolves to approved pinned invocation", () => {
  const runtime = resolveMcpRuntime(undefined, undefined);

  assert.equal(runtime.command, APPROVED_MCP_COMMAND);
  assert.deepEqual(runtime.args, [...APPROVED_MCP_ARGS]);
  assert.equal(isApprovedPinnedRuntime(runtime.command, runtime.args), true);
});

test("harvest rejects unpinned mcp-search-console by default", () => {
  assert.throws(
    () => enforcePinnedRuntimeForHarvest("uvx", ["mcp-search-console"], undefined),
    new RegExp(`${DIAGNOSTIC_OVERRIDE_ENV}=true`)
  );
});

test("diagnostic override is disabled by default and only enabled when explicitly true", () => {
  assert.throws(
    () => enforcePinnedRuntimeForHarvest("uvx", ["mcp-search-console"], "false"),
    new RegExp(`${DIAGNOSTIC_OVERRIDE_ENV}=true`)
  );

  assert.doesNotThrow(() => enforcePinnedRuntimeForHarvest("uvx", ["mcp-search-console"], "true"));
});
