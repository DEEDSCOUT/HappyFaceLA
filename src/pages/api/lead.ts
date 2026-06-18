import type { APIRoute } from "astro";

// Non-production stub: Cloudflare Pages production backend lives in functions/api/lead.ts.

const requiredFields = [
    "first_name",
    "last_name",
    "phone",
    "email",
    "event_date",
    "event_start_time",
    "event_city",
    "event_type",
    "estimated_guest_count",
    "consent_to_contact"
];

async function readPayload(request: Request): Promise<Record<string, unknown>> {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
        return (await request.json()) as Record<string, unknown>;
    }

    const formData = await request.formData();
    const payload = Object.fromEntries(formData.entries()) as Record<string, unknown>;
    const services = formData.getAll("services_requested[]")
        .map((value) => String(value).trim())
        .filter(Boolean);

    if (services.length) {
        payload.services_requested = services;
    }

    return payload;
}

export const POST: APIRoute = async ({ request }) => {
    let payload: Record<string, unknown>;
    try {
        payload = await readPayload(request);
    } catch {
        return new Response(JSON.stringify({ ok: false, error: "Invalid lead payload" }), {
            status: 400,
            headers: { "content-type": "application/json" }
        });
    }

    if (String(payload.honeypot || "").trim() !== "") {
        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" }
        });
    }

    for (const key of requiredFields) {
        const value = payload[key];
        if (!value || String(value).trim() === "") {
            return new Response(JSON.stringify({ ok: false, error: `Missing required field: ${key}` }), {
                status: 400,
                headers: { "content-type": "application/json" }
            });
        }
    }

    return new Response(
        JSON.stringify({
            ok: true,
            message: "Lead endpoint is currently a safe stub. CRM routing is TBD_BY_OWNER.",
            lead: payload
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
