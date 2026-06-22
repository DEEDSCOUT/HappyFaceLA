import {
  buildCanonicalLead,
  buildCanonicalNotificationPayload,
  type CanonicalPlanMyPartyLead,
} from '../../src/lib/quote-request/canonical-lead.ts';

type Env = {
    OWNER_NOTIFICATION_EMAIL?: string;
    CRM_WEBHOOK_URL?: string;
    CRM_WEBHOOK_SECRET?: string;
    QUOTE_REQUEST_MAKE_WEBHOOK_URL?: string;
    QUOTE_REQUEST_MAKE_SHARED_SECRET?: string;
    SHEETS_WEBHOOK_URL?: string;
    SHEETS_WEBHOOK_SECRET?: string;
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
    lead_source?: string;
    source_path?: string;
    campaign?: string;
    selected_package?: string;
    organization_venue_name?: string;
    package_interest?: string;
    painting_window?: string;
    venue_permission_confirmed?: string;
    need_invoice_coi?: string;
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

function parseWebhookResult(body: string): { ok: true } | { ok: false; reason: string } {
    const trimmed = body.trim();
    if (!trimmed) {
        return { ok: false, reason: "empty response body" };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        return { ok: false, reason: "non-json response body" };
    }

    if (!parsed || typeof parsed !== "object" || !("ok" in parsed)) {
        return { ok: false, reason: "missing ok field" };
    }

    const ok = (parsed as { ok?: unknown }).ok;
    if (ok === true) {
        return { ok: true };
    }
    if (ok === false) {
        return { ok: false, reason: "webhook returned ok:false" };
    }

    return { ok: false, reason: "invalid ok field" };
}

function deriveLeadSource(input: Pick<LeadPayload, "lead_source" | "utm_source">): string {
    const explicit = normalizeString(input.lead_source);
    if (explicit) {
        return explicit;
    }

    const utmSource = normalizeString(input.utm_source);
    return utmSource.toLowerCase() === "yelp" ? "yelp" : "";
}

function deriveSourcePath(input: Pick<LeadPayload, "source_path" | "source_page">): string {
    const explicit = normalizeString(input.source_path);
    if (explicit) {
        return explicit;
    }

    const sourcePage = normalizeString(input.source_page);
    if (!sourcePage) {
        return "";
    }

    if (sourcePage.startsWith("/")) {
        return sourcePage.split("?")[0] || "/";
    }

    try {
        return new URL(sourcePage).pathname || "";
    } catch {
        return sourcePage;
    }
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

// A Plan My Party submission delivered through the legacy contact endpoint is
// detected by its source page so it can be mapped into the canonical lead model.
// Simple contact-form and packages-page leads are otherwise unaffected.
function isPlanMyPartyLead(p: LeadPayload): boolean {
    const sp = String(p.source_page ?? "").toLowerCase();
    return sp.includes("plan-my-party") || sp.includes("plan_my_party");
}

function isPackagesLead(p: LeadPayload): boolean {
    const source = `${p.source_page ?? ""} ${p.source_path ?? ""}`.toLowerCase();
    return source.includes("/packages");
}

function legacyChildCount(p: LeadPayload): { bucket: string; actual: number | null } {
    const childrenRaw = String(p.children_count_optional ?? "").trim();
    const actual = /^\d+$/.test(childrenRaw) ? Number(childrenRaw) : null;
    const guest = String(p.estimated_guest_count ?? "").trim();
    const bucket = guest || (actual !== null ? String(actual) : "not-sure");
    return { bucket: bucket || "not-sure", actual };
}

function legacyLeadToCanonical(p: LeadPayload, leadId: string, now: string): CanonicalPlanMyPartyLead {
    const { bucket, actual } = legacyChildCount(p);
    return buildCanonicalLead({
        endpoint: "lead-adapter",
        leadId,
        createdAt: now,
        sourcePage: String(p.source_page ?? "") || null,
        firstName: String(p.first_name ?? ""),
        lastName: String(p.last_name ?? ""),
        email: String(p.email ?? ""),
        phone: String(p.phone ?? "") || null,
        preferredContactMethod: "not_provided",
        eventType: String(p.event_type ?? ""),
        eventDate: String(p.event_date ?? "") || null,
        startTime: String(p.event_start_time ?? "") || null,
        eventCity: String(p.event_city ?? ""),
        venueOrAddress: String(p.event_address_or_cross_streets_optional ?? "") || null,
        services: Array.isArray(p.services_requested) ? p.services_requested : [],
        childCountBucket: bucket,
        childCountActual: actual,
        designStyle: "",
        selectedDurationMinutes: null,
        recommendedDurationMinutes: null,
        serviceWindowMinutes: null,
        requiredArtistCount: null,
        travelMiles: null,
        hasExactAddress: Boolean(String(p.event_address_or_cross_streets_optional ?? "").trim()),
        quoteClassification: null,
        recommendationSummary: null,
        systemEstimatedTotalCents: null,
        systemRetainerCents: null,
        pricingModel: null,
        customerBudgetRaw: String(p.budget_range ?? "") || null,
        notes: String(p.message ?? "") || null,
        utmSource: String(p.utm_source ?? "") || null,
        utmMedium: String(p.utm_medium ?? "") || null,
        utmCampaign: String(p.utm_campaign ?? "") || null,
        utmTerm: String(p.utm_term ?? "") || null,
        utmContent: String(p.utm_content ?? "") || null,
        gclid: String(p.gclid ?? "") || null,
        fbclid: String(p.fbclid ?? "") || null,
        msclkid: String(p.msclkid ?? "") || null,
        consentAcknowledgement: true,
    });
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
        lead_source: deriveLeadSource(input),
        source_path: deriveSourcePath(input),
        campaign: normalizeString(input.campaign),
        selected_package: normalizeString(input.selected_package || input.package_interest),
        organization_venue_name: normalizeString(input.organization_venue_name),
        package_interest: normalizeString(input.package_interest),
        painting_window: normalizeString(input.painting_window),
        venue_permission_confirmed: normalizeString(input.venue_permission_confirmed),
        need_invoice_coi: normalizeString(input.need_invoice_coi),
        consent_to_contact: input.consent_to_contact
    };

    const errors = validateLead(normalized);
    if (Object.keys(errors).length) {
        return json({ ok: false, errors }, 400);
    }

    const leadId = crypto.randomUUID();
    const submittedAt = new Date().toISOString();
    const attributionSummary = [
        normalized.lead_source ? `lead_source=${normalized.lead_source}` : "",
        normalized.source_path ? `source_path=${normalized.source_path}` : "",
        normalized.utm_source ? `utm_source=${normalized.utm_source}` : "",
        normalized.utm_medium ? `utm_medium=${normalized.utm_medium}` : "",
        normalized.utm_campaign ? `utm_campaign=${normalized.utm_campaign}` : "",
    ].filter(Boolean).join("; ");
    const crmPayload: Record<string, unknown> = { leadId, submittedAt, lead: normalized };

    if (isPlanMyPartyLead(normalized)) {
        const canonical = legacyLeadToCanonical(normalized, leadId, submittedAt);
        crmPayload.canonical = {
            ...buildCanonicalNotificationPayload(canonical),
            lead_source: normalized.lead_source || null,
            source_path: normalized.source_path || null,
        };
    }

    const crmWebhookUrl = normalizeString(env.CRM_WEBHOOK_URL);
    const makeWebhookUrl = normalizeString(env.QUOTE_REQUEST_MAKE_WEBHOOK_URL);
    const sheetsWebhookUrl = normalizeString(env.SHEETS_WEBHOOK_URL);
    const webhookUrl = crmWebhookUrl || makeWebhookUrl || sheetsWebhookUrl;
    const webhookSecret = crmWebhookUrl
        ? normalizeString(env.CRM_WEBHOOK_SECRET)
        : makeWebhookUrl
            ? normalizeString(env.QUOTE_REQUEST_MAKE_SHARED_SECRET)
            : normalizeString(env.SHEETS_WEBHOOK_SECRET);
    const shouldValidateWebhookJson = Boolean(crmWebhookUrl || (!makeWebhookUrl && sheetsWebhookUrl));
    // NOTE: CF_PAGES_BRANCH is a build-time variable and is NOT available in Pages Functions
    // runtime env bindings. Do not rely on it for production guards - always require
    // an explicitly configured runtime webhook binding.

    if (!webhookUrl) {
        console.error("[lead] STUB MODE - no lead webhook is configured. Lead NOT forwarded.");
        return json({ ok: false, error: "Lead capture backend is not configured" }, 500);
    }

    try {
        console.log("[lead] webhook host:", new URL(webhookUrl).host);
    } catch {
        console.error("[lead] lead webhook URL is not valid");
        return json({ ok: false, error: "Lead capture backend is misconfigured" }, 500);
    }

    try {
        const proofNotes = [attributionSummary, normalized.message].filter(Boolean).join("\n\n") || null;
        const useCanonicalMakePayload = isPackagesLead(normalized) || isPlanMyPartyLead(normalized);
        const makePayload = useCanonicalMakePayload ? {
            ...buildCanonicalNotificationPayload(legacyLeadToCanonical({
                ...normalized,
                message: proofNotes || "",
            }, leadId, submittedAt)),
            lead_source: normalized.lead_source || null,
            source_path: normalized.source_path || null,
            message: normalized.message || null,
            proof_token_or_notes: proofNotes,
            legacy_lead: normalized,
        } : {
            leadId,
            submittedAt,
            source: "legacy-contact",
            source_endpoint: "lead",
            source_page: normalized.source_page || null,
            lead_source: normalized.lead_source || null,
            source_path: normalized.source_path || null,
            message: normalized.message || null,
            proof_token_or_notes: proofNotes,
            lead: normalized,
            legacy_lead: normalized,
        };
        const body = JSON.stringify(makeWebhookUrl && !crmWebhookUrl ? makePayload : crmPayload);
        const headers: Record<string, string> = {
            "content-type": "application/json",
            "x-lead-source": "happyfacesla-cloudflare-pages"
        };

        if (webhookSecret) {
            headers["x-signature-sha256"] = await hashHmac(webhookSecret, body);
        }

        const webhookResponse = await fetch(webhookUrl, {
            method: "POST",
            headers,
            body
        });

        const webhookBody = await webhookResponse.text();
        console.log("[lead] webhook response status:", webhookResponse.status);
        console.log("[lead] webhook response body prefix:", webhookBody.slice(0, 200));

        if (!webhookResponse.ok) {
            console.error("[lead] webhook returned non-2xx:", webhookResponse.status);
            return json({ ok: false, error: "Failed to route lead" }, 502);
        }

        if (shouldValidateWebhookJson) {
            const webhookResult = parseWebhookResult(webhookBody);
            if (!webhookResult.ok) {
                console.error("[lead] webhook response rejected:", webhookResult.reason);
                return json({ ok: false, error: "Lead capture backend returned an invalid response" }, 502);
            }
        }

        return json({ ok: true, leadId });
    } catch (err) {
        console.error("[lead] webhook fetch threw:", String(err));
        return json({ ok: false, error: "Unexpected lead processing error" }, 500);
    }
};
