// Testimonial submission API — Happy Faces LA
// Receives testimonial form data, validates consent, and forwards to the
// CRM/notification webhook. Submissions are NEVER auto-published.
// All entries arrive with status: "New" and require owner approval before
// they can appear on the website.
//
// Private contact info (contact_email_or_phone) is forwarded to the owner only
// and must never be exposed in any public-facing response or page.
//
// Environment variables required (Cloudflare Pages → Settings → Env vars):
//   TESTIMONIAL_WEBHOOK_URL  — dedicated webhook for testimonial intake (preferred)
//                              Falls back to CRM_WEBHOOK_URL if not set.
//   CRM_WEBHOOK_URL          — existing lead webhook (fallback)
//   CRM_WEBHOOK_SECRET       — optional HMAC-SHA256 signing secret (shared with lead.ts)

type Env = {
    TESTIMONIAL_WEBHOOK_URL?: string;
    CRM_WEBHOOK_URL?: string;
    CRM_WEBHOOK_SECRET?: string;
};

type TestimonialPayload = {
    first_name?: string;
    last_initial?: string;
    city_or_area?: string;
    event_type?: string;
    services_booked?: string[];
    testimonial_text?: string;
    consent_to_publish?: boolean | string;
    consent_to_publish_details?: boolean | string;
    contact_email_or_phone?: string;
    photo_filename?: string;
    source_page?: string;
    honeypot?: string;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 4;
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
    if (!Array.isArray(input)) return [];
    return input.map((item) => normalizeString(item)).filter(Boolean);
}

function isTrueish(value: unknown): boolean {
    if (value === true) return true;
    const v = String(value ?? "").toLowerCase();
    return v === "true" || v === "on" || v === "1";
}

function validateTestimonial(payload: TestimonialPayload): Record<string, string> {
    const errors: Record<string, string> = {};

    if (!normalizeString(payload.first_name)) {
        errors.first_name = "First name is required.";
    }
    if (!normalizeString(payload.city_or_area)) {
        errors.city_or_area = "City or area is required.";
    }
    if (!normalizeString(payload.event_type)) {
        errors.event_type = "Event type is required.";
    }
    if (!normalizeStringArray(payload.services_booked).length) {
        errors.services_booked = "Select at least one service.";
    }
    const text = normalizeString(payload.testimonial_text);
    if (!text) {
        errors.testimonial_text = "Please share your experience.";
    } else if (text.length > 2000) {
        errors.testimonial_text = "Please keep your experience to 2000 characters or fewer.";
    }
    if (!isTrueish(payload.consent_to_publish)) {
        errors.consent_to_publish = "Consent to publish your testimonial is required.";
    }
    if (!isTrueish(payload.consent_to_publish_details)) {
        errors.consent_to_publish_details = "Consent to publish your name, city, and event details is required.";
    }
    if (!normalizeString(payload.contact_email_or_phone)) {
        errors.contact_email_or_phone = "An email or phone number is required so we can verify your submission.";
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
    return Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const existing = rateLimitMap.get(ip);

    if (!existing || now > existing.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return false;
    }
    if (existing.count >= RATE_LIMIT_MAX) return true;

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

    let input: TestimonialPayload;
    try {
        input = (await request.json()) as TestimonialPayload;
    } catch {
        return json({ ok: false, error: "Invalid JSON payload" }, 400);
    }

    // Honeypot — silently succeed so bots don't know they were caught
    if (normalizeString(input.honeypot)) {
        return json({ ok: true, submissionId: crypto.randomUUID() });
    }

    const normalized: TestimonialPayload = {
        first_name: normalizeString(input.first_name),
        last_initial: normalizeString(input.last_initial),
        city_or_area: normalizeString(input.city_or_area),
        event_type: normalizeString(input.event_type),
        services_booked: normalizeStringArray(input.services_booked),
        testimonial_text: normalizeString(input.testimonial_text),
        contact_email_or_phone: normalizeString(input.contact_email_or_phone),
        photo_filename: normalizeString(input.photo_filename),
        source_page: normalizeString(input.source_page),
        consent_to_publish: input.consent_to_publish,
        consent_to_publish_details: input.consent_to_publish_details,
    };

    const errors = validateTestimonial(normalized);
    if (Object.keys(errors).length) {
        return json({ ok: false, errors }, 400);
    }

    const submissionId = crypto.randomUUID();
    const submittedAt = new Date().toISOString();

    // Structured payload forwarded to owner webhook.
    // contact_email_or_phone is in the "private" block — it must remain owner-only.
    // status starts as "New". Owner must set to "Approved" before any public use.
    const webhookPayload = {
        submissionId,
        submittedAt,
        type: "testimonial",
        status: "New",
        public: {
            first_name: normalized.first_name,
            last_initial: normalized.last_initial || null,
            city_or_area: normalized.city_or_area,
            event_type: normalized.event_type,
            services_booked: normalized.services_booked,
            testimonial_text: normalized.testimonial_text,
            photo_filename: normalized.photo_filename || null,
        },
        private: {
            // NEVER expose contact_email_or_phone in any public response or page
            contact_email_or_phone: normalized.contact_email_or_phone,
        },
        consent: {
            consent_to_publish: true,
            consent_to_publish_details: true,
            consent_method: "Website form — /share-your-experience/",
            consent_date: submittedAt,
        },
        source_page: normalized.source_page,
    };

    // Prefer dedicated TESTIMONIAL_WEBHOOK_URL, fall back to shared CRM_WEBHOOK_URL
    const webhookUrl =
        normalizeString(env.TESTIMONIAL_WEBHOOK_URL) ||
        normalizeString(env.CRM_WEBHOOK_URL);
    const webhookSecret = normalizeString(env.CRM_WEBHOOK_SECRET);

    if (!webhookUrl) {
        console.error(
            "[testimonial] STUB MODE — no webhook configured. Submission NOT stored."
        );
        return json(
            { ok: false, error: "Testimonial submission backend is not configured" },
            500
        );
    }

    try {
        console.log("[testimonial] Webhook host:", new URL(webhookUrl).host);
    } catch {
        console.error("[testimonial] Webhook URL is not a valid URL");
        return json(
            { ok: false, error: "Testimonial submission backend is misconfigured" },
            500
        );
    }

    try {
        const body = JSON.stringify(webhookPayload);
        const headers: Record<string, string> = {
            "content-type": "application/json",
            "x-lead-source": "happyfacesla-testimonial",
        };

        if (webhookSecret) {
            headers["x-signature-sha256"] = await hashHmac(webhookSecret, body);
        }

        const webhookResponse = await fetch(webhookUrl, {
            method: "POST",
            headers,
            body,
        });

        const responseBody = await webhookResponse.text();
        console.log("[testimonial] Webhook status:", webhookResponse.status);
        console.log("[testimonial] Webhook body prefix:", responseBody.slice(0, 200));

        if (!webhookResponse.ok) {
            console.error("[testimonial] Webhook non-2xx:", webhookResponse.status);
            return json({ ok: false, error: "Failed to store testimonial submission" }, 502);
        }

        return json({ ok: true, submissionId });
    } catch (err) {
        console.error("[testimonial] Webhook fetch threw:", String(err));
        return json({ ok: false, error: "Unexpected error processing submission" }, 500);
    }
};
