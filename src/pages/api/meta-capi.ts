import type { APIRoute } from "astro";

// Non-production stub: Cloudflare Pages production backend lives in functions/api/meta-capi.ts.

export const POST: APIRoute = async () => {
    return new Response(
        JSON.stringify({
            ok: true,
            message: "Meta CAPI endpoint is not yet connected. Configure credentials in environment variables."
        }),
        {
            status: 200,
            headers: { "content-type": "application/json" }
        }
    );
};

export const GET: APIRoute = async () => {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
        status: 405,
        headers: { "content-type": "application/json" }
    });
};
