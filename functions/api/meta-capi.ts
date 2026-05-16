type Env = {
    META_PIXEL_ID?: string;
    META_ACCESS_TOKEN?: string;
    META_TEST_EVENT_CODE?: string;
};

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store"
        }
    });
}

export const onRequest = async (context: any): Promise<Response> => {
    const { request, env } = context as { request: Request; env: Env };

    if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed" }, 405);
    }

    if (!(request.headers.get("content-type") || "").includes("application/json")) {
        return json({ ok: false, error: "Unsupported media type" }, 415);
    }

    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return json({ ok: false, error: "Invalid JSON payload" }, 400);
    }

    const pixelId = String(env.META_PIXEL_ID || "").trim();
    const accessToken = String(env.META_ACCESS_TOKEN || "").trim();
    const testCode = String(env.META_TEST_EVENT_CODE || "").trim();

    if (!pixelId || !accessToken) {
        return json({
            ok: true,
            mode: "stub",
            message: "Meta CAPI not configured. Set META_PIXEL_ID and META_ACCESS_TOKEN.",
            received: Boolean(payload)
        });
    }

    return json({
        ok: true,
        mode: "configured_stub",
        message: "Meta CAPI shell is configured. Add final event mapping in production hardening.",
        test_event_code: testCode ? "present" : "missing"
    });
};
