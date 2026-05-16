type Env = {
    OWNER_NOTIFICATION_EMAIL?: string;
    CRM_WEBHOOK_URL?: string;
    CRM_WEBHOOK_SECRET?: string;
    CF_PAGES_BRANCH?: string;
};

type LeadPayload = {
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
    event_date?: string;
    event_start_time?: string;
    event_city?: string;
    event_address_or_cross_streets_optional?: string;
    event_type?: string;
    estimated_guest_count?: string | number;
    children_count_optional?: string | number;
    services_requested?: string[];
    budget_range?: string;
    message?: string;
    source_page?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
    gclid?: string;
    fbclid?: string;
    msclkid?: string;
    consent_to_contact?: boolean | string;
    honeypot?: string;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 6;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store"
        }
    });
}

function normalizeString(input: unknown): string {
    return String(input ?? "").trim();
}

function normalizeStringArray(input: unknown): string[] {
    if (!Array.isArray(input)) {
        return [];
    }
    return input.map((item) => normalizeString(item)).filter(Boolean);
}

function validateLead(payload: LeadPayload): Record<string, string> {
    const errors: Record<string, string> = {};

    if (!normalizeString(payload.first_name)) {
        errors.first_name = "First name is required.";
    }
    if (!normalizeString(payload.phone)) {
        errors.phone = "Phone is required.";
    }
    if (!normalizeString(payload.email)) {
        errors.email = "Email is required.";
    }
    if (!normalizeString(payload.event_date)) {
        errors.event_date = "Event date is required.";
    }
    if (!normalizeString(payload.event_city)) {
        errors.event_city = "Event city is required.";
    }
    if (!normalizeString(payload.event_type)) {
        errors.event_type = "Event type is required.";
    }
    if (!normalizeStringArray(payload.services_requested).length) {
        errors.services_requested = "Select at least one service.";
    }

    const consent = payload.consent_to_contact;
    const consentValue = String(consent ?? "").toLowerCase();
    if (!(consent === true || consentValue === "true" || consentValue === "on" || consentValue === "1")) {
        errors.consent_to_contact = "Consent is required.";
    }

    return errors;
}

async function hashHmac(secret: string, body: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const existing = rateLimitMap.get(ip);

    if (!existing || now > existing.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return false;
    }

    if (existing.count >= RATE_LIMIT_MAX) {
        return true;
    }

    existing.count += 1;
    rateLimitMap.set(ip, existing);
    return false;
}

export const onRequest = async (context: any): Promise<Response> => {
    const { request, env } = context as { request: Request; env: Env };

    if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
        return json({ ok: false, error: "Unsupported media type" }, 415);
    }

    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    if (isRateLimited(ip)) {
        return json({ ok: false, error: "Too many requests" }, 429);
    }

    let input: LeadPayload;
    try {
        input = (await request.json()) as LeadPayload;
    } catch {
        return json({ ok: false, error: "Invalid JSON payload" }, 400);
    }

    if (normalizeString(input.honeypot)) {
        return json({ ok: true, leadId: crypto.randomUUID() });
    }

    const normalized: LeadPayload = {
        ...input,
        first_name: normalizeString(input.first_name),
        last_name: normalizeString(input.last_name),
        phone: normalizeString(input.phone),
        email: normalizeString(input.email),
        event_date: normalizeString(input.event_date),
        event_start_time: normalizeString(input.event_start_time),
        event_city: normalizeString(input.event_city),
        event_address_or_cross_streets_optional: normalizeString(input.event_address_or_cross_streets_optional),
        event_type: normalizeString(input.event_type),
        estimated_guest_count: normalizeString(input.estimated_guest_count),
        children_count_optional: normalizeString(input.children_count_optional),
        services_requested: normalizeStringArray(input.services_requested),
        budget_range: normalizeString(input.budget_range),
        message: normalizeString(input.message),
        source_page: normalizeString(input.source_page),
        utm_source: normalizeString(input.utm_source),
        utm_medium: normalizeString(input.utm_medium),
        utm_campaign: normalizeString(input.utm_campaign),
        utm_term: normalizeString(input.utm_term),
        utm_content: normalizeString(input.utm_content),
        gclid: normalizeString(input.gclid),
        fbclid: normalizeString(input.fbclid),
        msclkid: normalizeString(input.msclkid),
        consent_to_contact: input.consent_to_contact
    };

    const errors = validateLead(normalized);
    if (Object.keys(errors).length) {
        return json({ ok: false, errors }, 400);
    }

    const leadId = crypto.randomUUID();
    const submittedAt = new Date().toISOString();
    const crmPayload = { leadId, submittedAt, lead: normalized };

    const webhookUrl = normalizeString(env.CRM_WEBHOOK_URL);
    const webhookSecret = normalizeString(env.CRM_WEBHOOK_SECRET);
    const isProduction = normalizeString(env.CF_PAGES_BRANCH) === "main";

    if (!webhookUrl) {
        if (isProduction) {
            return json({ ok: false, error: "Lead capture backend is not configured" }, 500);
        }

        console.log("[lead] Stub mode active: CRM_WEBHOOK_URL missing in non-production environment");
        return json({ ok: true, leadId });
    }

    try {
        const body = JSON.stringify(crmPayload);
        const headers: Record<string, string> = {
            "content-type": "application/json",
            "x-lead-source": "happyfacesla-cloudflare-pages"
        };

        if (webhookSecret) {
            headers["x-signature-sha256"] = await hashHmac(webhookSecret, body);
        }

        const crmResponse = await fetch(webhookUrl, {
            method: "POST",
            headers,
            body
        });

        if (!crmResponse.ok) {
            console.error("[lead] CRM webhook error", crmResponse.status);
            return json({ ok: false, error: "Failed to route lead" }, 502);
        }

        return json({ ok: true, leadId });
    } catch {
        return json({ ok: false, error: "Unexpected lead processing error" }, 500);
    }
};
