import assert from "node:assert/strict";
import test from "node:test";

import { appsScriptRequest } from "../../src/lib/artist-payouts/apps-script-transport.ts";
import {
  APPS_SCRIPT_TEST_SECRET,
  assertValidAppsScriptRequest,
  parseAppsScriptRequest,
  signedAppsScriptResponse,
} from "./apps-script-test-helpers.mjs";

const NOW = "2026-08-22T19:00:00.000Z";
const ORIGIN = "https://adapter.example.test";
const GOOGLE_ORIGIN = "https://script.google.com";
const MAX_CONFIGURED_RESPONSE_BYTES = 192 * 1024;
const URL = `${ORIGIN}/macros/s/synthetic/exec/read`;
const DESCRIPTOR = JSON.stringify({
  operation: "synthetic_read_v1",
  artistId: "artist_A01",
});
const CONFIG = {
  url: URL,
  allowedOrigin: ORIGIN,
  secret: APPS_SCRIPT_TEST_SECRET,
  environment: "sandbox",
  timeoutMs: 1_000,
  maxResponseBytes: 4_096,
  maxResponseClockSkewSeconds: 300,
};
const OPTIONS = {
  clock: { now: () => new Date(NOW) },
  requestIdFactory: () => "transport_request_001",
};

function getInput(overrides = {}) {
  return {
    operation: "synthetic_read_v1",
    method: "GET",
    businessDescriptor: DESCRIPTOR,
    query: [["artistId", "artist_A01"]],
    config: CONFIG,
    options: OPTIONS,
    ...overrides,
  };
}

function postInput(overrides = {}) {
  const payload = {
    operation: "synthetic_write_v1",
    artistId: "artist_A01",
    state: "restricted",
  };
  return {
    operation: "synthetic_write_v1",
    method: "POST",
    businessDescriptor: JSON.stringify(payload),
    payload,
    config: { ...CONFIG, url: `${ORIGIN}/macros/s/synthetic/exec/write` },
    options: {
      ...OPTIONS,
      requestIdFactory: () => "transport_request_002",
    },
    ...overrides,
  };
}

test("GET uses the signed query envelope and verifies an exact signed response", async () => {
  const payload = { ok: true, artistId: "artist_A01" };
  const result = await appsScriptRequest(getInput(), async (url, init) => {
    const request = await assertValidAppsScriptRequest({
      url,
      init,
      businessDescriptor: DESCRIPTOR,
      operation: "synthetic_read_v1",
    });
    assert.deepEqual(request.business, { artistId: "artist_A01" });
    assert.equal(init.body, undefined);
    assert.equal(String(url).includes(APPS_SCRIPT_TEST_SECRET), false);
    return signedAppsScriptResponse(url, init, payload);
  });
  assert.deepEqual(result, {
    payload,
    requestId: "transport_request_001",
  });
});

test("POST signs only the exact auth and payload envelope", async () => {
  const input = postInput();
  const result = await appsScriptRequest(input, async (url, init) => {
    const request = await assertValidAppsScriptRequest({
      url,
      init,
      businessDescriptor: input.businessDescriptor,
      operation: input.operation,
    });
    assert.deepEqual(request.payload, input.payload);
    assert.deepEqual(Object.keys(JSON.parse(String(init.body))).sort(), [
      "auth",
      "payload",
    ]);
    assert.equal(String(init.body).includes(APPS_SCRIPT_TEST_SECRET), false);
    return signedAppsScriptResponse(url, init, { ok: true });
  });
  assert.deepEqual(result, {
    payload: { ok: true },
    requestId: "transport_request_002",
  });
});

test("tampered payloads, signatures, and response bindings fail closed", async (t) => {
  const cases = [
    {
      name: "payload digest",
      response: (url, init) =>
        signedAppsScriptResponse(
          url,
          init,
          { ok: true },
          {
            payloadDigestOverride: "0".repeat(64),
          },
        ),
      expected: /payload digest/,
    },
    {
      name: "signature",
      response: (url, init) =>
        signedAppsScriptResponse(
          url,
          init,
          { ok: true },
          {
            signatureOverride: `v1=${"0".repeat(64)}`,
          },
        ),
      expected: /signature/,
    },
    {
      name: "environment",
      response: (url, init) =>
        signedAppsScriptResponse(
          url,
          init,
          { ok: true },
          {
            authOverrides: { environment: "live" },
          },
        ),
      expected: /authentication/,
    },
    {
      name: "operation",
      response: (url, init) =>
        signedAppsScriptResponse(
          url,
          init,
          { ok: true },
          {
            authOverrides: { operation: "other_read_v1" },
          },
        ),
      expected: /authentication/,
    },
    {
      name: "request identity",
      response: (url, init) =>
        signedAppsScriptResponse(
          url,
          init,
          { ok: true },
          {
            authOverrides: { requestId: "transport_request_substituted" },
          },
        ),
      expected: /authentication/,
    },
    {
      name: "stale timestamp",
      response: (url, init) =>
        signedAppsScriptResponse(
          url,
          init,
          { ok: true },
          {
            timestamp: "2026-08-22T18:00:00.000Z",
          },
        ),
      expected: /replay window/,
    },
  ];
  for (const entry of cases) {
    await t.test(entry.name, async () => {
      await assert.rejects(
        appsScriptRequest(getInput(), entry.response),
        entry.expected,
      );
    });
  }
});

test("unsigned, malformed, oversized, and non-success responses fail closed", async (t) => {
  await t.test("unsigned", async () => {
    await assert.rejects(
      appsScriptRequest(getInput(), async () =>
        Response.json({ payload: { ok: false }, auth: null }),
      ),
      /authentication/,
    );
  });
  await t.test("malformed JSON", async () => {
    await assert.rejects(
      appsScriptRequest(
        getInput(),
        async () => new Response("{not-json", { status: 200 }),
      ),
      /malformed JSON/,
    );
  });
  await t.test("invalid UTF-8", async () => {
    await assert.rejects(
      appsScriptRequest(
        getInput(),
        async () => new Response(new Uint8Array([0xff])),
      ),
      /invalid UTF-8/,
    );
  });
  await t.test("extra envelope field", async () => {
    await assert.rejects(
      appsScriptRequest(getInput(), async (url, init) => {
        const valid = await signedAppsScriptResponse(url, init, { ok: true });
        const envelope = await valid.json();
        return Response.json({ ...envelope, unapproved: true });
      }),
      /unapproved fields/,
    );
  });
  await t.test("declared oversized", async () => {
    await assert.rejects(
      appsScriptRequest(
        getInput({ config: { ...CONFIG, maxResponseBytes: 1_024 } }),
        async () =>
          new Response("{}", {
            headers: { "content-length": "2048" },
          }),
      ),
      /too large/,
    );
  });
  await t.test("actual oversized", async () => {
    await assert.rejects(
      appsScriptRequest(
        getInput({ config: { ...CONFIG, maxResponseBytes: 1_024 } }),
        async () => new Response("x".repeat(1_025)),
      ),
      /too large/,
    );
  });
  await t.test("the default response ceiling remains 64 KiB", async () => {
    await assert.rejects(
      appsScriptRequest(
        getInput({
          config: { ...CONFIG, maxResponseBytes: undefined },
        }),
        async () => new Response("x".repeat(64 * 1024 + 1)),
      ),
      /too large/,
    );
  });
  await t.test(
    "the configurable ceiling rejects exactly one byte over 192 KiB",
    async () => {
      await assert.rejects(
        appsScriptRequest(
          getInput({
            operation: "artist_roster_list_v1",
            businessDescriptor: JSON.stringify({
              operation: "artist_roster_list_v1",
              afterArtistId: "START",
            }),
            query: [["afterArtistId", "START"]],
            config: {
              ...CONFIG,
              maxResponseBytes: MAX_CONFIGURED_RESPONSE_BYTES,
            },
          }),
          async () =>
            new Response("x".repeat(MAX_CONFIGURED_RESPONSE_BYTES + 1)),
        ),
        /too large/,
      );
    },
  );
  await t.test("HTTP failure", async () => {
    await assert.rejects(
      appsScriptRequest(
        getInput(),
        async () => new Response("unavailable", { status: 503 }),
      ),
      /request failed/,
    );
  });
});

test("only the bounded Google ContentService redirect is accepted", async () => {
  let original;
  let calls = 0;
  const input = postInput({
    config: {
      ...CONFIG,
      url: `${GOOGLE_ORIGIN}/macros/s/synthetic/exec/write`,
      allowedOrigin: GOOGLE_ORIGIN,
    },
  });
  const result = await appsScriptRequest(input, async (url, init) => {
    calls += 1;
    if (calls === 1) {
      original = { url, init };
      return new Response(null, {
        status: 302,
        headers: {
          location:
            "https://script.googleusercontent.com/macros/echo?user_content_key=synthetic",
        },
      });
    }
    assert.equal(
      String(url),
      "https://script.googleusercontent.com/macros/echo?user_content_key=synthetic",
    );
    assert.equal(init.method, "GET");
    assert.equal(init.body, undefined);
    assert.equal(new Headers(init.headers).has("content-type"), false);
    assert.equal(new Headers(init.headers).has("accept"), false);
    return signedAppsScriptResponse(original.url, original.init, { ok: true });
  });
  assert.equal(calls, 2);
  assert.deepEqual(result.payload, { ok: true });
});

test("redirects outside the Google execution allowlist or beyond the bound fail", async (t) => {
  await t.test("untrusted origin", async () => {
    let calls = 0;
    await assert.rejects(
      appsScriptRequest(getInput(), async () => {
        calls += 1;
        return new Response(null, {
          status: 302,
          headers: { location: "https://evil.example.test/steal" },
        });
      }),
      /outside the Google execution allowlist/,
    );
    assert.equal(calls, 1);
  });
  await t.test("redirect limit", async () => {
    let calls = 0;
    await assert.rejects(
      appsScriptRequest(
        getInput({
          config: {
            ...CONFIG,
            url: `${GOOGLE_ORIGIN}/macros/s/synthetic/exec/read`,
            allowedOrigin: GOOGLE_ORIGIN,
          },
        }),
        async () => {
          calls += 1;
          return new Response(null, {
            status: 302,
            headers: {
              location:
                "https://script.googleusercontent.com/macros/echo?user_content_key=loop",
            },
          });
        },
      ),
      /redirect limit/,
    );
    assert.equal(calls, 3);
  });
  await t.test("307 and 308 are never followed", async () => {
    for (const status of [307, 308]) {
      let calls = 0;
      await assert.rejects(
        appsScriptRequest(getInput(), async () => {
          calls += 1;
          return new Response(null, {
            status,
            headers: { location: `${ORIGIN}/redirected` },
          });
        }),
        /request failed/,
      );
      assert.equal(calls, 1);
    }
  });
  await t.test(
    "content host cannot redirect back to the execution host",
    async () => {
      let calls = 0;
      await assert.rejects(
        appsScriptRequest(
          getInput({
            config: {
              ...CONFIG,
              url: `${GOOGLE_ORIGIN}/macros/s/synthetic/exec/read`,
              allowedOrigin: GOOGLE_ORIGIN,
            },
          }),
          async () => {
            calls += 1;
            return new Response(null, {
              status: 302,
              headers: {
                location:
                  calls === 1
                    ? "https://script.googleusercontent.com/macros/echo?user_content_key=one"
                    : `${GOOGLE_ORIGIN}/macros/s/synthetic/exec/read`,
              },
            });
          },
        ),
        /redirected away from the Google content host/,
      );
      assert.equal(calls, 2);
    },
  );
});

test("unsafe endpoints, secrets, environments, and method contracts fail before network", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return Response.json({ ok: true });
  };
  await assert.rejects(
    appsScriptRequest(
      getInput({
        config: { ...CONFIG, allowedOrigin: "http://script.google.com" },
      }),
      fetcher,
    ),
    /allowed origin/,
  );
  await assert.rejects(
    appsScriptRequest(
      getInput({
        config: { ...CONFIG, allowedOrigin: `${ORIGIN}/` },
      }),
      fetcher,
    ),
    /allowed origin/,
  );
  await assert.rejects(
    appsScriptRequest(
      getInput({
        config: { ...CONFIG, maxResponseBytes: 64 * 1024 + 1 },
      }),
      fetcher,
    ),
    /response bound/,
  );
  await assert.rejects(
    appsScriptRequest(
      getInput({
        operation: "artist_roster_list_v1",
        businessDescriptor: JSON.stringify({
          operation: "artist_roster_list_v1",
          afterArtistId: "START",
        }),
        query: [["afterArtistId", "START"]],
        config: {
          ...CONFIG,
          maxResponseBytes: MAX_CONFIGURED_RESPONSE_BYTES + 1,
        },
      }),
      fetcher,
    ),
    /response bound/,
  );
  await assert.rejects(
    appsScriptRequest(
      getInput({
        config: {
          ...CONFIG,
          url: "https://adapter.example.test:8443/read",
          allowedOrigin: "https://adapter.example.test:8443",
        },
      }),
      fetcher,
    ),
    /allowed origin/,
  );
  await assert.rejects(
    appsScriptRequest(
      getInput({
        config: {
          ...CONFIG,
          url: "https://evil.example.test/macros/s/synthetic/exec/read",
        },
      }),
      fetcher,
    ),
    /allowlist/,
  );
  await assert.rejects(
    appsScriptRequest(
      getInput({ config: { ...CONFIG, secret: "too-short" } }),
      fetcher,
    ),
    /secret/,
  );
  await assert.rejects(
    appsScriptRequest(
      getInput({ config: { ...CONFIG, environment: "unknown" } }),
      fetcher,
    ),
    /environment/,
  );
  await assert.rejects(
    appsScriptRequest(getInput({ payload: { unexpected: true } }), fetcher),
    /GET request contract/,
  );
  await assert.rejects(
    appsScriptRequest(postInput({ query: [["unexpected", "true"]] }), fetcher),
    /POST request contract/,
  );
  assert.equal(calls, 0);
});

test("a final response URL outside the allowlist is rejected", async () => {
  await assert.rejects(
    appsScriptRequest(getInput(), async (url, init) => {
      const response = await signedAppsScriptResponse(url, init, { ok: true });
      Object.defineProperty(response, "url", {
        value: "https://evil.example.test/result",
      });
      return response;
    }),
    /response came from outside/,
  );
});

test("a Google execution URL cannot return content directly without ContentService", async () => {
  await assert.rejects(
    appsScriptRequest(
      getInput({
        config: {
          ...CONFIG,
          url: `${GOOGLE_ORIGIN}/macros/s/synthetic/exec/read`,
          allowedOrigin: GOOGLE_ORIGIN,
        },
      }),
      async (url, init) => signedAppsScriptResponse(url, init, { ok: true }),
    ),
    /did not come from the Google content host/,
  );
});
