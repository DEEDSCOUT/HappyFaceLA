// Happy Faces LA — Thumbtack Command Center dispatch layer.
//
// Side-effecting fan-out: takes an assembled LeadCard and pushes it to the
// channels Shawn actually uses — Slack, SMS (Twilio), the Booking Control
// Center Google Sheet (via an Apps Script web app), and an optional CRM webhook.
//
// Every sender is guarded: if its config is absent it returns a "skipped"
// result instead of throwing, and a single channel failure never blocks the
// others (Promise.allSettled). Nothing here is customer-facing — these are
// internal alerts and logs only (requirement #12).

import type { LeadCard } from "./engine";

export type DispatchEnv = {
    SLACK_WEBHOOK_URL?: string;
    TWILIO_ACCOUNT_SID?: string;
    TWILIO_AUTH_TOKEN?: string;
    TWILIO_FROM?: string;
    TWILIO_FROM_NUMBER?: string;
    OWNER_SMS_TO?: string;
    TWILIO_TO_NUMBER?: string;
    SHEETS_WEBHOOK_URL?: string;
    SHEETS_WEBHOOK_SECRET?: string;
    THUMBTACK_CRM_WEBHOOK_URL?: string;
    THUMBTACK_CRM_WEBHOOK_SECRET?: string;
};

export type ChannelResult = {
    channel: "slack" | "sms" | "sheet" | "crm";
    status: "sent" | "skipped" | "error";
    detail: string;
};

function clean(v: string | undefined): string {
    return String(v ?? "").trim();
}

function isBusinessMessage(card: LeadCard): boolean {
    return card.lead.event === "message.created" && card.lead.message_direction === "business";
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

async function postSlack(env: DispatchEnv, card: LeadCard): Promise<ChannelResult> {
    if (isBusinessMessage(card)) {
        return { channel: "slack", status: "skipped", detail: "business outbound message" };
    }
    const url = clean(env.SLACK_WEBHOOK_URL);
    if (!url) return { channel: "slack", status: "skipped", detail: "SLACK_WEBHOOK_URL not set" };
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: card.alert.slack_text }),
        });
        return {
            channel: "slack",
            status: res.ok ? "sent" : "error",
            detail: `status ${res.status}`,
        };
    } catch (err) {
        return { channel: "slack", status: "error", detail: String(err).slice(0, 120) };
    }
}

async function sendSms(env: DispatchEnv, card: LeadCard): Promise<ChannelResult> {
    if (isBusinessMessage(card)) {
        return { channel: "sms", status: "skipped", detail: "business outbound message" };
    }
    const sid = clean(env.TWILIO_ACCOUNT_SID);
    const token = clean(env.TWILIO_AUTH_TOKEN);
    const from = clean(env.TWILIO_FROM || env.TWILIO_FROM_NUMBER);
    const to = clean(env.OWNER_SMS_TO || env.TWILIO_TO_NUMBER);
    if (!sid || !token || !from || !to) {
        return { channel: "sms", status: "skipped", detail: "Twilio env not fully set" };
    }
    try {
        const body = new URLSearchParams({ From: from, To: to, Body: card.alert.sms_text });
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: "POST",
            headers: {
                authorization: `Basic ${btoa(`${sid}:${token}`)}`,
                "content-type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
        });
        return { channel: "sms", status: res.ok ? "sent" : "error", detail: `status ${res.status}` };
    } catch (err) {
        return { channel: "sms", status: "error", detail: String(err).slice(0, 120) };
    }
}

async function appendSheet(env: DispatchEnv, card: LeadCard): Promise<ChannelResult> {
    const url = clean(env.SHEETS_WEBHOOK_URL);
    if (!url) return { channel: "sheet", status: "skipped", detail: "SHEETS_WEBHOOK_URL not set" };
    const secret = clean(env.SHEETS_WEBHOOK_SECRET);
    try {
        const payload = JSON.stringify({
            sheet: "Booking Control Center",
            lead: card.lead,
            score: card.score,
            pricing: card.pricing,
            metrics: card.metrics,
            reply_draft: card.reply_draft,
            follow_ups: card.follow_ups,
        });
        const headers: Record<string, string> = { "content-type": "application/json" };
        let target = url;
        if (secret) {
            const sig = await hmacHex(secret, payload);
            headers["x-hfla-signature"] = sig;
            // Apps Script web apps cannot read custom headers — also pass sig as a
            // query param so the sheet writer can HMAC-verify the raw body.
            target += (url.includes("?") ? "&" : "?") + "sig=" + sig;
        }
        const res = await fetch(target, { method: "POST", headers, body: payload });
        const text = await res.text();
        let parsed: any = null;
        try {
            parsed = text ? JSON.parse(text) : null;
        } catch {
            parsed = null;
        }
        if (!res.ok) {
            return { channel: "sheet", status: "error", detail: `status ${res.status}` };
        }
        if (parsed && parsed.ok === false) {
            return {
                channel: "sheet",
                status: "error",
                detail: String(parsed.error || "Apps Script rejected payload").slice(0, 120),
            };
        }
        if (text && !parsed) {
            return {
                channel: "sheet",
                status: "error",
                detail: `non-json Apps Script response: ${text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300)}`,
            };
        }
        return {
            channel: "sheet",
            status: "sent",
            detail: parsed && parsed.row ? `status ${res.status} row ${parsed.row}` : `status ${res.status}`,
        };
    } catch (err) {
        return { channel: "sheet", status: "error", detail: String(err).slice(0, 120) };
    }
}

async function forwardCrm(env: DispatchEnv, card: LeadCard): Promise<ChannelResult> {
    if (isBusinessMessage(card)) {
        return { channel: "crm", status: "skipped", detail: "business outbound message" };
    }
    const url = clean(env.THUMBTACK_CRM_WEBHOOK_URL);
    if (!url) return { channel: "crm", status: "skipped", detail: "CRM webhook not set" };
    const secret = clean(env.THUMBTACK_CRM_WEBHOOK_SECRET);
    try {
        const payload = JSON.stringify({ source: "thumbtack", card });
        const headers: Record<string, string> = {
            "content-type": "application/json",
            "x-lead-source": "happyfacesla-thumbtack",
        };
        if (secret) headers["x-signature-sha256"] = await hmacHex(secret, payload);
        const res = await fetch(url, { method: "POST", headers, body: payload });
        return { channel: "crm", status: res.ok ? "sent" : "error", detail: `status ${res.status}` };
    } catch (err) {
        return { channel: "crm", status: "error", detail: String(err).slice(0, 120) };
    }
}

/** Fan out to every configured channel. Never throws. */
export async function dispatchCard(env: DispatchEnv, card: LeadCard): Promise<ChannelResult[]> {
    const settled = await Promise.allSettled([
        postSlack(env, card),
        sendSms(env, card),
        appendSheet(env, card),
        forwardCrm(env, card),
    ]);
    return settled.map((r, i) => {
        const channel = (["slack", "sms", "sheet", "crm"] as const)[i];
        if (r.status === "fulfilled") return r.value;
        return { channel, status: "error" as const, detail: String(r.reason).slice(0, 120) };
    });
}
