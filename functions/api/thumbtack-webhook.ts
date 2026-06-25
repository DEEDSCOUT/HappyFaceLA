// Happy Faces LA — Thumbtack Command Center webhook receiver (production).
//
// Cloudflare Pages Function that receives Thumbtack webhooks (new leads, customer
// messages, reviews, lead/status updates), normalizes them, scores them, builds a
// pricing recommendation + a ready-to-copy reply DRAFT, then fans the internal
// action card out to Slack / SMS / the Booking Control Center sheet / CRM.
//
// Auth (choose one in Cloudflare env — first configured wins):
//   1. THUMBTACK_WEBHOOK_TOKEN  → Custom Header auth: Thumbtack sends
//      "X-HFL-Webhook-Token: <token>" (set in Thumbtack UI → Custom Header).
//      This is the primary / recommended path because Thumbtack's webhook UI
//      exposes None / Basic / Custom Header — not an HMAC option.
//   2. THUMBTACK_WEBHOOK_SECRET → HMAC-SHA256 auth over the raw body, for any
//      proxy / Zapier path that can compute and forward a signature.
//   3. Neither set              → unverified mode (dev / Zapier MVP). Responses
//      are flagged verified:false so the state is always visible.
//
// Safety: this endpoint NEVER sends a customer-facing quote — drafts only (#12).

import { buildLeadCard } from "../../src/lib/thumbtack/engine";
import { dispatchCard, type DispatchEnv } from "../../src/lib/thumbtack/dispatch";

type Env = DispatchEnv & {
    THUMBTACK_WEBHOOK_TOKEN?: string;
    THUMBTACK_WEBHOOK_SECRET?: string;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
        },
    });
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

async function hmacHex(secret: string, body: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    return Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/** Constant-time-ish compare to avoid leaking the signature via timing. */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

async function verifySignature(secret: string, rawBody: string, header: string): Promise<boolean> {
    const provided = header.replace(/^sha256=/i, "").trim().toLowerCase();
    if (!provided) return false;
    const expected = await hmacHex(secret, rawBody);
    return timingSafeEqual(provided, expected);
}

export const onRequest = async (context: any): Promise<Response> => {
    const { request, env } = context as { request: Request; env: Env };

    // GET/HEAD => lightweight health check (useful when registering the webhook URL).
    if (request.method === "GET" || request.method === "HEAD") {
        return json({ ok: true, service: "thumbtack-command-center", ready: true });
    }
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

    // Read the raw body first — HMAC needs the exact bytes, and token auth is
    // checked before parsing to fail fast on bad credentials.
    const rawBody = await request.text();

    const token = String(env.THUMBTACK_WEBHOOK_TOKEN || "").trim();
    const secret = String(env.THUMBTACK_WEBHOOK_SECRET || "").trim();
    let verified = false;
    let auth_method: "token" | "hmac" | "none" = "none";

    if (token) {
        // Primary path: Custom Header auth (matches Thumbtack's UI option).
        const provided = String(request.headers.get("x-hfl-webhook-token") || "").trim();
        if (!timingSafeEqual(provided, token)) {
            console.warn("[thumbtack] token verification failed");
            return json({ ok: false, error: "Unauthorized" }, 401);
        }
        verified = true;
        auth_method = "token";
    } else if (secret) {
        // Secondary path: HMAC-SHA256 over the raw body (Zapier proxy or similar).
        const sigHeader =
            request.headers.get("x-thumbtack-signature") ||
            request.headers.get("x-signature-sha256") ||
            request.headers.get("x-hfla-signature") ||
            "";
        verified = await verifySignature(secret, rawBody, sigHeader);
        if (!verified) {
            console.warn("[thumbtack] hmac verification failed");
            return json({ ok: false, error: "Invalid signature" }, 401);
        }
        auth_method = "hmac";
    }
    // else: unverified mode — dev/MVP, flagged in response as verified:false

    let raw: unknown;
    try {
        raw = JSON.parse(rawBody);
    } catch {
        return json({ ok: false, error: "Invalid JSON payload" }, 400);
    }

    const now = new Date().toISOString();
    let card;
    try {
        card = buildLeadCard(raw, now);
    } catch (err) {
        console.error("[thumbtack] failed to build lead card:", String(err));
        return json({ ok: false, error: "Could not process payload" }, 422);
    }

    // Diagnostic logging — summary only, never the full reply/PII dump.
    console.log(
        `[thumbtack] ${card.lead.event} ${card.lead.lead_id} score=${card.score.score}/${card.score.priority} quote=${card.pricing.recommended_display} auth=${auth_method}`,
    );

    const dispatch = await dispatchCard(env, card);

    return json({
        ok: true,
        verified,
        auth_method,
        event: card.lead.event,
        lead_id: card.lead.lead_id,
        score: card.score.score,
        priority: card.score.priority,
        recommended: card.pricing.recommended_display,
        retainer: card.pricing.retainer,
        summary: card.summary,
        follow_ups: card.follow_ups.map((f) => ({ offset: f.offset, due_at: f.due_at })),
        dispatch,
        // The reply is a DRAFT for Shawn to review — it is never auto-sent to the customer.
        reply_draft: card.reply_draft,
    });
};
