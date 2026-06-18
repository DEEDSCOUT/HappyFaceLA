// Happy Faces LA — Thumbtack Command Center engine.
//
// Pure, dependency-free logic that converts a raw Thumbtack webhook payload into
// a normalized lead, a lead score, a pricing recommendation, a ready-to-copy
// reply draft, a follow-up schedule, and an internal alert. No network, no
// secrets, no clock side effects (callers pass `now`). This keeps the whole
// pipeline unit-testable with plain `node` (see tests/thumbtack/logic.test.mjs).
//
// IMPORTANT: This engine never sends a customer-facing quote. It only produces
// internal drafts and recommendations (see project requirement #12). Sending is
// always a separate, human-approved action.

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThumbtackEventType =
    | "lead.created"
    | "message.created"
    | "review.created"
    | "lead.updated"
    | "unknown";

/** The 16 normalized fields required by the spec, plus a little metadata. */
export type NormalizedLead = {
    lead_id: string;
    customer_name: string;
    lead_type: string;
    paid_status: "paid" | "unpaid" | "unknown";
    lead_fee: number | null;
    event_city: string;
    event_zip: string;
    event_date: string;
    event_time: string;
    event_length: string;
    event_type: string;
    requested_services: string[];
    guest_count: number | null;
    age_range: string;
    pros_contacted: number | null;
    reply_deadline: string;
    action_link: string;
    message_text: string;
    // metadata (not part of the 16, used downstream)
    event: ThumbtackEventType;
    review_rating: number | null;
    received_at: string;
    source: "thumbtack";
};

export type ScoreBucket = "high" | "medium" | "caution";

export type LeadScore = {
    score: ScoreBucket;
    priority: number; // 0–100
    reasons: string[];
    cautions: string[];
};

export type PricingTier = "basic" | "standard" | "premium" | "custom";

export type PricingRecommendation = {
    service_count: number;
    tier: PricingTier;
    recommended: number | null; // null when a custom quote is required
    recommended_display: string;
    ladder: { basic: number | null; standard: number | null; premium: number | null };
    retainer: number | null;
    travel_adjustment: number;
    capacity_review: boolean;
    custom_quote: boolean;
    notes: string[];
};

export type FollowUp = {
    id: string;
    label: string;
    offset: string;
    due_at: string;
    action: string;
};

/** Mirrors the Booking Control Center metrics columns (spec #11). */
export type MetricsRow = {
    lead_id: string;
    received_at: string;
    event: ThumbtackEventType;
    lead_fee: number | null;
    response_time_min: number | null;
    quote_amount: number | null;
    estimate_sent: boolean;
    customer_replied: boolean;
    retainer_requested: boolean;
    booked: boolean;
    booked_revenue: number | null;
    lost_reason: string;
};

export type LeadCard = {
    lead: NormalizedLead;
    score: LeadScore;
    pricing: PricingRecommendation;
    reply_draft: string;
    follow_ups: FollowUp[];
    metrics: MetricsRow;
    alert: { slack_text: string; sms_text: string };
    summary: string;
};

// ---------------------------------------------------------------------------
// Approved package ladder + service-area constants (spec #6, #7)
// ---------------------------------------------------------------------------

export const PACKAGE_LADDER = {
    1: { basic: 150, standard: 215, premium: 275 },
    2: { basic: 180, standard: 255, premium: 325 },
} as const;

/** When a 2-service premium booking is recommended, price is "325+". */
const TWO_SERVICE_PREMIUM_IS_PLUS = true;

/** Flat surcharge applied when the event is outside the core service area. */
export const TRAVEL_SURCHARGE = 35;

/** Above this guest count a single artist needs capacity review / a 2nd artist. */
export const CAPACITY_SINGLE_ARTIST = 25;

/** Core service-area cities (lowercased). Mirrors src/data/business.ts areaServed. */
export const SERVICE_AREA = [
    "los angeles",
    "burbank",
    "glendale",
    "pasadena",
    "sherman oaks",
    "studio city",
    "encino",
    "woodland hills",
    "northridge",
    "santa monica",
    "beverly hills",
    "west hollywood",
    "calabasas",
];

const PACKAGE_NAMES: Record<PricingTier, string> = {
    basic: "Birthday Party Package",
    standard: "Face Painting + Balloons Package",
    premium: "Premium Party Package",
    custom: "Custom Event Quote",
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v.trim();
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return "";
}

function num(v: unknown): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const s = str(v).replace(/[^0-9.\-]/g, "");
    if (!s) return null;
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : null;
}

/** First integer found in a string, e.g. "20 kids" -> 20, "4-8 years" -> 4. */
function firstInt(v: unknown): number | null {
    const m = str(v).match(/-?\d+/);
    return m ? Number.parseInt(m[0], 10) : null;
}

function matchKey(key: string, candidates: string[], mode: "exact" | "includes"): boolean {
    const k = key.toLowerCase();
    return candidates.some((c) => {
        const w = c.toLowerCase();
        return mode === "exact" ? k === w : k.includes(w);
    });
}

function walk(obj: unknown, candidates: string[], mode: "exact" | "includes", depth: number): unknown {
    if (obj == null || depth > 6) return undefined;
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const found = walk(item, candidates, mode, depth + 1);
            if (found !== undefined) return found;
        }
        return undefined;
    }
    if (typeof obj === "object") {
        const entries = Object.entries(obj as Record<string, unknown>);
        // Prefer a scalar hit at this level before recursing into children.
        for (const [k, val] of entries) {
            if (val != null && typeof val !== "object" && matchKey(k, candidates, mode)) return val;
        }
        for (const [, val] of entries) {
            if (val && typeof val === "object") {
                const found = walk(val, candidates, mode, depth + 1);
                if (found !== undefined) return found;
            }
        }
    }
    return undefined;
}

/**
 * Find the first scalar value under a key matching any candidate. Two-phase:
 * an exact-key pass first (so `startTime` wins over the substring of
 * `createTimestamp`), then a substring pass for tolerant matching.
 */
function deepFind(obj: unknown, candidates: string[]): unknown {
    const exact = walk(obj, candidates, "exact", 0);
    if (exact !== undefined) return exact;
    return walk(obj, candidates, "includes", 0);
}

type QA = { q: string; a: string };

/** Collect any question/answer detail pairs Thumbtack attaches to a request. */
function collectQA(obj: unknown, depth = 0, out: QA[] = []): QA[] {
    if (obj == null || depth > 6) return out;
    if (Array.isArray(obj)) {
        for (const item of obj) {
            if (item && typeof item === "object") {
                const rec = item as Record<string, unknown>;
                const q = str(rec.question ?? rec.label ?? rec.title ?? rec.name ?? rec.key);
                const a = str(
                    rec.answer ?? rec.value ?? rec.response ?? rec.text ?? rec.selectedValue,
                );
                if (q && a) out.push({ q, a });
            }
            collectQA(item, depth + 1, out);
        }
        return out;
    }
    if (typeof obj === "object") {
        for (const val of Object.values(obj as Record<string, unknown>)) {
            if (val && typeof val === "object") collectQA(val, depth + 1, out);
        }
    }
    return out;
}

function qaAnswer(qa: QA[], keywords: string[]): string {
    const wants = keywords.map((k) => k.toLowerCase());
    for (const { q, a } of qa) {
        const ql = q.toLowerCase();
        if (wants.some((w) => ql.includes(w))) return a;
    }
    return "";
}

function splitServices(v: unknown): string[] {
    if (Array.isArray(v)) return v.map(str).filter(Boolean);
    const s = str(v);
    if (!s) return [];
    return s
        .split(/[,;/]|\band\b/i)
        .map((x) => x.trim())
        .filter(Boolean);
}

function rec(v: unknown): Record<string, any> {
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};
}

function firstString(...values: unknown[]): string {
    for (const value of values) {
        const s = str(value);
        if (s) return s;
    }
    return "";
}

function fullName(first: unknown, last: unknown): string {
    return [str(first), str(last)].filter(Boolean).join(" ").trim();
}

function firstArrayItem(v: unknown): Record<string, any> {
    return Array.isArray(v) && v[0] ? rec(v[0]) : {};
}

function toIsoDate(v: unknown): string {
    const s = str(v);
    if (!s) return "";
    // Already ISO-ish
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

function timeFromIso(v: unknown): string {
    const s = str(v);
    const m = s.match(/T(\d{2}):(\d{2})/);
    if (!m) return "";
    let hour = Number.parseInt(m[1], 10);
    const minute = m[2];
    const suffix = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    return `${hour}:${minute} ${suffix}`;
}

function durationFromRange(start: unknown, end: unknown): string {
    const startDate = new Date(str(start));
    const endDate = new Date(str(end));
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return "";
    const minutes = Math.round((endDate.getTime() - startDate.getTime()) / 60_000);
    if (minutes <= 0) return "";
    if (minutes % 60 === 0) {
        const hours = minutes / 60;
        return `${hours} ${hours === 1 ? "hour" : "hours"}`;
    }
    return `${minutes} minutes`;
}

function eventDurationMinutes(v: unknown): number | null {
    const s = str(v).toLowerCase();
    if (!s) return null;

    const hourMatch = s.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|h)\b/);
    if (hourMatch) return Math.round(Number.parseFloat(hourMatch[1]) * 60);

    const minuteMatch = s.match(/(\d+(?:\.\d+)?)\s*(minutes?|mins?|min|m)\b/);
    if (minuteMatch) return Math.round(Number.parseFloat(minuteMatch[1]));

    const numeric = Number.parseFloat(s);
    if (Number.isFinite(numeric)) return numeric <= 4 ? Math.round(numeric * 60) : Math.round(numeric);
    return null;
}

// ---------------------------------------------------------------------------
// Event-type detection + parsing (spec #4)
// ---------------------------------------------------------------------------

export function detectEventType(raw: any): ThumbtackEventType {
    const t = str(raw?.eventType ?? raw?.event ?? raw?.type ?? raw?.event_type).toLowerCase();
    if (t.includes("review")) return "review.created";
    if (t.includes("message")) return "message.created";
    if (t.includes("update") || t.includes("status")) return "lead.updated";
    if (t.includes("lead") || t.includes("request")) return "lead.created";
    // Structural fallbacks
    if (raw?.review || raw?.rating != null) return "review.created";
    if (raw?.message || raw?.messageText || raw?.message_text) return "message.created";
    if (raw?.lead || raw?.request) return "lead.created";
    return "unknown";
}

export function parseThumbtackEvent(raw: any, now: string): NormalizedLead {
    const event = detectEventType(raw);
    const qa = collectQA(raw);
    const leadObj = rec(raw?.lead);
    const requestObj = rec(raw?.request ?? leadObj.request);
    const customerObj = rec(raw?.customer ?? leadObj.customer ?? requestObj.customer);
    const categoryObj = rec(requestObj.category);
    const scheduleObj = rec(requestObj.schedule);
    const locationObj = rec(requestObj.location);
    const proposedTime = firstArrayItem(requestObj.proposedTimes);
    const proposedStart = proposedTime.start;
    const proposedEnd = proposedTime.end;

    // NOTE: deliberately QA-first and avoids "eventType"/"event_type" keys — those
    // collide with the webhook envelope's own `eventType` (e.g. "LeadCreated").
    const eventTypeRaw =
        qaAnswer(qa, ["type of event", "what type", "occasion", "kind of event"]) ||
        str(deepFind(raw, ["occasion", "eventOccasion"]));

    const lead_type =
        firstString(categoryObj.name, requestObj.categoryName, requestObj.category) ||
        str(deepFind(raw, ["category", "requestCategory", "serviceCategory", "categoryName"])) ||
        firstString(requestObj.title, deepFind(raw, ["title", "requestTitle"]));

    const services =
        splitServices(deepFind(raw, ["requestedServices", "requested_services", "services"]));
    const servicesFromQA = splitServices(
        qaAnswer(qa, ["what services", "which services", "add-ons", "add ons"]),
    );
    const requested_services = (services.length ? services : servicesFromQA.length ? servicesFromQA : splitServices(lead_type)).map((s) => s);

    const fulfillment = str(
        firstString(
            leadObj.fulfillmentStatus,
            raw?.chargeState,
            raw?.status,
            deepFind(raw, ["fulfillmentStatus", "paid_status", "paidStatus", "status"]),
        ),
    ).toLowerCase();
    const fee = num(
        raw?.leadPrice ??
            leadObj.leadPrice ??
            deepFind(raw, ["leadCharge", "leadPrice", "leadFee", "lead_fee", "charge", "amount", "price"]),
    );
    let paid_status: NormalizedLead["paid_status"] = "unknown";
    if (fulfillment.includes("paid") || (fee != null && fee > 0)) paid_status = "paid";
    else if (fulfillment.includes("unpaid") || fulfillment.includes("free")) paid_status = "unpaid";

    const guestRaw =
        deepFind(raw, ["guestCount", "guest_count", "numberOfGuests", "guests", "attendees"]) ??
        qaAnswer(qa, ["how many guests", "guest count", "number of", "how many kids", "how many people"]);

    const ageRaw =
        str(deepFind(raw, ["ageRange", "age_range", "ages"])) ||
        qaAnswer(qa, ["age range", "ages of", "how old", "age of"]);

    const lengthRaw =
        str(deepFind(raw, ["eventLength", "event_length", "duration", "hours"])) ||
        qaAnswer(qa, ["how long", "event length", "duration", "how many hours"]) ||
        durationFromRange(proposedStart, proposedEnd);

    const review_rating = num(deepFind(raw, ["rating", "stars", "reviewRating", "score"]));

    const message_text =
        str(deepFind(raw, ["messageText", "message_text", "body", "text", "message"])) ||
        str(deepFind(raw, ["reviewText", "review_text", "comment", "reviewBody"]));

    return {
        lead_id:
            firstString(
                requestObj.requestID,
                requestObj.requestId,
                leadObj.leadID,
                leadObj.leadId,
                raw?.leadID,
                raw?.lead_id,
                raw?.leadId,
                raw?.id,
                deepFind(raw, ["leadID", "lead_id", "leadId", "requestID", "requestId", "id"]),
            ) ||
            `tt_${now}`,
        customer_name:
            firstString(
                fullName(customerObj.firstName, customerObj.lastName),
                customerObj.name,
                customerObj.displayName,
                raw?.customerName,
                raw?.customer_name,
                deepFind(raw, ["customerName", "customer_name", "displayName"]),
            ) || "Customer",
        lead_type: lead_type || "General inquiry",
        paid_status,
        lead_fee: fee,
        event_city: firstString(locationObj.city, deepFind(raw, ["city", "event_city", "eventCity", "locality"])),
        event_zip: firstString(
            locationObj.zipCode,
            locationObj.zip,
            deepFind(raw, ["zipCode", "zip", "event_zip", "postalCode", "postal_code"]),
        ),
        event_date: toIsoDate(
            firstString(proposedStart, scheduleObj.eventDate, deepFind(raw, ["eventDate", "event_date", "date", "startDate"])),
        ),
        event_time: firstString(scheduleObj.startTime, deepFind(raw, ["startTime", "event_time", "eventTime"]), timeFromIso(proposedStart)),
        event_length: lengthRaw,
        event_type: eventTypeRaw,
        requested_services,
        guest_count: typeof guestRaw === "number" ? guestRaw : firstInt(guestRaw),
        age_range: ageRaw,
        pros_contacted: num(deepFind(raw, ["numProsContacted", "pros_contacted", "prosContacted"])),
        reply_deadline: str(
            deepFind(raw, ["expectedResponseBy", "reply_deadline", "respondBy", "replyBy", "deadline"]),
        ),
        action_link: str(deepFind(raw, ["actionLink", "actionUrl", "thumbtackUrl", "leadUrl"])),
        message_text,
        event,
        review_rating,
        received_at:
            firstString(raw?.createdAt, deepFind(raw, ["createTimestamp", "received_at", "timestamp", "createdAt"])) || now,
        source: "thumbtack",
    };
}

// ---------------------------------------------------------------------------
// Lead scoring (spec #6)
// ---------------------------------------------------------------------------

const HIGH_VALUE_EVENT = /(birthday|private|kids|child|family|graduation|baby shower)/i;
const HAPPY_FACES_SERVICE = /(face\s*paint|balloon|glitter\s*tattoo|face\s*gem)/i;

export function scoreLead(lead: NormalizedLead): LeadScore {
    const reasons: string[] = [];
    const cautions: string[] = [];
    let priority = 50;

    if (lead.paid_status === "paid") {
        priority += 25;
        reasons.push("Direct paid lead — high priority.");
    }

    if (HIGH_VALUE_EVENT.test(lead.event_type) || HIGH_VALUE_EVENT.test(lead.lead_type)) {
        priority += 15;
        reasons.push("Birthday / private party — high-fit event.");
    }

    const hasDate = Boolean(lead.event_date);
    const hasTime = Boolean(lead.event_time);
    const hasService = lead.requested_services.length > 0 || Boolean(lead.lead_type);
    const hasKids = lead.guest_count != null || Boolean(lead.age_range);
    if (hasDate && hasTime && hasService && hasKids) {
        priority += 15;
        reasons.push("Clear date, time, service, and guest details.");
    }

    // Cautions
    const cityKnown = Boolean(lead.event_city);
    const inArea = SERVICE_AREA.includes(lead.event_city.toLowerCase());
    if (cityKnown && !inArea) {
        priority -= 15;
        cautions.push(`Outside core service area (${lead.event_city}) — travel surcharge / vetting.`);
    }

    const weakDetails = !hasDate || !hasTime || !hasService;
    if (weakDetails) {
        priority -= 12;
        cautions.push("Weak details — date/time/service incomplete.");
    }

    const serviceCount = lead.requested_services.length || (lead.lead_type ? 1 : 0);
    if (serviceCount <= 1 && lead.guest_count != null && lead.guest_count <= 8) {
        priority -= 8;
        cautions.push("Low ticket — single service, very small guest count.");
    }

    if (lead.guest_count != null && lead.guest_count > CAPACITY_SINGLE_ARTIST) {
        priority -= 5;
        cautions.push(
            `High guest count (${lead.guest_count}) — capacity review / additional artist.`,
        );
    }

    priority = Math.max(0, Math.min(100, priority));

    let score: ScoreBucket = "medium";
    if (priority >= 70) score = "high";
    else if (priority < 45) score = "caution";
    // A far-travel + weak-details combo is always at least a caution.
    if (cityKnown && !inArea && weakDetails) score = "caution";

    if (reasons.length === 0) reasons.push("Standard inbound lead.");

    return { score, priority, reasons, cautions };
}

// ---------------------------------------------------------------------------
// Pricing recommendation (spec #7)
// ---------------------------------------------------------------------------

function pickTier(lead: NormalizedLead): Exclude<PricingTier, "custom"> {
    const guests = lead.guest_count ?? 15;
    const minutes = eventDurationMinutes(lead.event_length);
    if (minutes != null) {
        if (minutes <= 60) return "basic";
        if (minutes <= 90) return "standard";
        return "premium";
    }

    let tier: Exclude<PricingTier, "custom"> = "standard";
    if (guests <= 12) tier = "basic";
    else if (guests > 25) tier = "premium";
    return tier;
}

export function recommendPricing(lead: NormalizedLead, score: LeadScore): PricingRecommendation {
    const notes: string[] = [];
    const serviceCount = lead.requested_services.length || (lead.lead_type ? 1 : 0) || 1;
    const durationMinutes = eventDurationMinutes(lead.event_length);

    const inArea = lead.event_city ? SERVICE_AREA.includes(lead.event_city.toLowerCase()) : true;
    const travel_adjustment = !inArea && lead.event_city ? TRAVEL_SURCHARGE : 0;
    if (travel_adjustment) notes.push(`+ $${travel_adjustment} travel for ${lead.event_city}.`);

    const capacity_review = lead.guest_count != null && lead.guest_count > CAPACITY_SINGLE_ARTIST;
    if (capacity_review) {
        notes.push(
            `Guest count ${lead.guest_count} > ${CAPACITY_SINGLE_ARTIST}: coverage depends on final flow/design choices; review capacity and artist count.`,
        );
    }

    const eventProfile = `${lead.event_type} ${lead.lead_type} ${lead.message_text}`.toLowerCase();
    const serviceProfile = `${lead.lead_type} ${lead.requested_services.join(" ")}`.trim();
    const manualReviewEvent = /(school|festival|corporate|company|office|camp|fundraiser|community|public|fair|high[-\s]?volume|large)/i.test(eventProfile);
    const highVolume = (lead.guest_count ?? 0) >= 40;
    const extendedDuration = durationMinutes != null && durationMinutes > 120;
    const unmappedService = Boolean(serviceProfile) && !HAPPY_FACES_SERVICE.test(serviceProfile);

    // 3+ services, high-volume/manual-review event types, or >2h durations need
    // human quoting instead of silently stretching the party ladder.
    if (serviceCount >= 3 || highVolume || manualReviewEvent || extendedDuration || unmappedService) {
        if (serviceCount >= 3) notes.push("3+ services — build a custom quote.");
        if (highVolume) notes.push("40+ guests/kids — manual capacity review required.");
        if (manualReviewEvent) notes.push("School, festival, corporate, or high-volume event — manual review required.");
        if (extendedDuration) notes.push("Duration over 2 hours — manual quote required.");
        if (unmappedService) notes.push("Unmapped Thumbtack category/service — manual quote required.");
        return {
            service_count: serviceCount,
            tier: "custom",
            recommended: null,
            recommended_display: "Custom quote",
            ladder: { basic: null, standard: null, premium: null },
            retainer: null,
            travel_adjustment,
            capacity_review,
            custom_quote: true,
            notes,
        };
    }

    const ladder = PACKAGE_LADDER[serviceCount === 2 ? 2 : 1];
    const tier = pickTier(lead);
    let recommended = ladder[tier];

    const plus = serviceCount === 2 && tier === "premium" && TWO_SERVICE_PREMIUM_IS_PLUS;
    const base = recommended + travel_adjustment;
    const retainer = Math.max(50, Math.round((base * 0.5) / 5) * 5);

    return {
        service_count: serviceCount,
        tier,
        recommended: base,
        recommended_display: `$${base}${plus ? "+" : ""}`,
        ladder: { basic: ladder.basic, standard: ladder.standard, premium: ladder.premium },
        retainer,
        travel_adjustment,
        capacity_review,
        custom_quote: false,
        notes,
    };
}

// ---------------------------------------------------------------------------
// Ready-to-copy reply draft (spec #8) — DRAFT ONLY, never auto-sent (#12)
// ---------------------------------------------------------------------------

function firstName(full: string): string {
    const n = full.trim().split(/\s+/)[0] || "there";
    return n.replace(/[^A-Za-z'-]/g, "") || "there";
}

export function buildReplyDraft(
    lead: NormalizedLead,
    pricing: PricingRecommendation,
): string {
    const name = firstName(lead.customer_name);
    const pkg = PACKAGE_NAMES[pricing.tier];
    const occasion = lead.event_type || lead.lead_type || "your event";
    const when = lead.event_date ? ` on ${lead.event_date}` : "";

    const priceLine = pricing.custom_quote
        ? `For an event like this I'd put together a quick custom quote so it's priced exactly right.`
        : `For ${occasion}${when}, I'd recommend our ${pkg} at ${pricing.recommended_display}.`;

    const capacity =
        pricing.capacity_review
            ? ` With this guest count, coverage depends on final flow and design choices; I can recommend the right artist count once we confirm details.`
            : "";

    const nextStep = pricing.custom_quote
        ? `Want me to send that quote and hold your date? Just reply YES.`
        : `Want me to hold your date and send a simple booking link? Just reply YES.`;

    return [
        `Hi ${name}! Thanks for reaching out to Happy Faces LA. 🎨`,
        `${priceLine}${capacity}`,
        nextStep,
    ].join("\n\n");
}

// ---------------------------------------------------------------------------
// Follow-up schedule (spec #10)
// ---------------------------------------------------------------------------

const FOLLOWUP_STAGES: { label: string; offset: string; ms: number; action: string }[] = [
    { label: "Instant reply", offset: "15m", ms: 15 * 60_000, action: "Send the approved reply draft." },
    { label: "Same-day nudge", offset: "12h", ms: 12 * 3_600_000, action: "Friendly check-in if no reply." },
    { label: "Day-1 follow-up", offset: "24h", ms: 24 * 3_600_000, action: "Re-offer to hold the date." },
    { label: "Day-2 follow-up", offset: "48h", ms: 48 * 3_600_000, action: "Share a photo / review + value." },
    { label: "Close the loop", offset: "5–7d", ms: 6 * 24 * 3_600_000, action: "Last touch; mark lost reason if no reply." },
];

export function buildFollowUps(lead: NormalizedLead, baseISO: string): FollowUp[] {
    const base = new Date(baseISO);
    const baseMs = Number.isNaN(base.getTime()) ? Date.now() : base.getTime();
    return FOLLOWUP_STAGES.map((s, i) => ({
        id: `${lead.lead_id}:fu${i + 1}`,
        label: s.label,
        offset: s.offset,
        due_at: new Date(baseMs + s.ms).toISOString(),
        action: s.action,
    }));
}

// ---------------------------------------------------------------------------
// Metrics row (spec #11)
// ---------------------------------------------------------------------------

function buildMetrics(lead: NormalizedLead, pricing: PricingRecommendation): MetricsRow {
    return {
        lead_id: lead.lead_id,
        received_at: lead.received_at,
        event: lead.event,
        lead_fee: lead.lead_fee,
        response_time_min: null,
        quote_amount: pricing.recommended,
        estimate_sent: false,
        customer_replied: false,
        retainer_requested: false,
        booked: false,
        booked_revenue: null,
        lost_reason: "",
    };
}

// ---------------------------------------------------------------------------
// Alerts (spec #9) — internal only
// ---------------------------------------------------------------------------

const SCORE_EMOJI: Record<ScoreBucket, string> = { high: "🟢", medium: "🟡", caution: "🟠" };

function buildAlert(
    card: Pick<LeadCard, "lead" | "score" | "pricing" | "reply_draft" | "follow_ups">,
): { slack_text: string; sms_text: string } {
    const { lead, score, pricing } = card;
    const emoji = SCORE_EMOJI[score.score];

    if (lead.event === "review.created") {
        const stars = lead.review_rating != null ? `${lead.review_rating}★` : "new";
        const slack_text = [
            `⭐ *New Thumbtack review (${stars})* from ${lead.customer_name}`,
            lead.message_text ? `> ${lead.message_text}` : "",
            `Next: thank them publicly + log it.`,
        ]
            .filter(Boolean)
            .join("\n");
        return { slack_text, sms_text: `New TT review (${stars}) from ${lead.customer_name}.` };
    }

    if (lead.event === "message.created") {
        const slack_text = [
            `💬 *New Thumbtack message* from ${lead.customer_name} (${lead.lead_id})`,
            lead.message_text ? `> ${lead.message_text}` : "",
            `Draft reply ready in the lead card.`,
        ]
            .filter(Boolean)
            .join("\n");
        return {
            slack_text,
            sms_text: `New TT msg from ${lead.customer_name}: ${lead.message_text.slice(0, 80)}`,
        };
    }

    const feeLine = lead.lead_fee != null ? ` • fee $${lead.lead_fee}` : "";
    const quote = pricing.custom_quote ? "Custom quote" : `${pricing.recommended_display}`;
    const retainer = pricing.retainer != null ? ` • retainer $${pricing.retainer}` : "";
    const followUpLine = card.follow_ups.map((f) => `${f.offset}: ${f.action}`).join(" | ");
    const slack_text = [
        `${emoji} *${score.score.toUpperCase()} lead* — ${lead.customer_name} (${lead.lead_id})${feeLine}`,
        `Type: ${lead.lead_type} • Status: ${lead.paid_status} • Event: ${lead.event}`,
        `${lead.event_type || lead.lead_type} • ${lead.event_city || "city?"} • ${lead.event_date || "date?"} ${lead.event_time}`,
        `Services: ${lead.requested_services.join(", ") || lead.lead_type} • Guests: ${lead.guest_count ?? "?"}`,
        `💰 Recommend: *${quote}*${retainer}`,
        score.cautions.length ? `⚠️ ${score.cautions.join(" ")}` : "",
        followUpLine ? `Follow-ups: ${followUpLine}` : "",
        lead.action_link ? `Thumbtack action: ${lead.action_link}` : "",
        `Ready-to-copy Thumbtack reply:`,
        card.reply_draft,
    ]
        .filter(Boolean)
        .join("\n");

    const sms_text =
        `${emoji} ${score.score.toUpperCase()} TT lead: ${lead.customer_name}, ` +
        `${lead.event_type || lead.lead_type} ${lead.event_date || ""}. ` +
        `Quote ${quote}${pricing.retainer != null ? `, retainer $${pricing.retainer}` : ""}. ` +
        `Reply deadline ${lead.reply_deadline || "ASAP"}.`;

    return { slack_text, sms_text };
}

// ---------------------------------------------------------------------------
// Assemble the full lead/action card (spec #2–#11)
// ---------------------------------------------------------------------------

export function buildLeadCard(raw: any, now: string): LeadCard {
    const lead = parseThumbtackEvent(raw, now);
    const score = scoreLead(lead);
    const pricing = recommendPricing(lead, score);
    const reply_draft = buildReplyDraft(lead, pricing);
    const follow_ups = buildFollowUps(lead, now);
    const metrics = buildMetrics(lead, pricing);

    const partial = { lead, score, pricing, reply_draft, follow_ups, metrics };
    const alert = buildAlert(partial);

    const summary =
        `${lead.event} | ${lead.customer_name} | ${score.score} (${score.priority}) | ` +
        `${pricing.recommended_display}`;

    return { ...partial, alert, summary };
}
