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

export const POST: APIRoute = async ({ request }) => {
    const formData = await request.formData();

    if (String(formData.get("honeypot") || "").trim() !== "") {
        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" }
        });
    }

    for (const key of requiredFields) {
        const value = formData.get(key);
        if (!value || String(value).trim() === "") {
            return new Response(JSON.stringify({ ok: false, error: `Missing required field: ${key}` }), {
                status: 400,
                headers: { "content-type": "application/json" }
            });
        }
    }

    const payload = Object.fromEntries(formData.entries());

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
