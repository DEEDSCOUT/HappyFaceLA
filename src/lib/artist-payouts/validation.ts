import {
  PAYOUT_ENVIRONMENTS,
  type LedgerDraft,
  type PayoutEnvironment,
} from "./types.ts";
import { validateArtistPayAmounts } from "./money.ts";

const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/;
const STRIPE_ACCOUNT_RE = /^acct_[A-Za-z0-9]{12,80}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function isSafeBusinessId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID_RE.test(value);
}

export function isStripeAccountId(value: unknown): value is string {
  return typeof value === "string" && STRIPE_ACCOUNT_RE.test(value);
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

export function isIsoInstant(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_INSTANT_RE.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

export function isPayoutEnvironment(
  value: unknown,
): value is PayoutEnvironment {
  return (
    typeof value === "string" &&
    PAYOUT_ENVIRONMENTS.includes(value as PayoutEnvironment)
  );
}

export function sanitizeOperationalText(
  value: unknown,
  maxLength: number,
): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function isSpreadsheetSafeText(
  value: unknown,
  maxLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    sanitizeOperationalText(value, maxLength) === value &&
    !/^[=+\-@]/.test(value.trimStart())
  );
}

export function assertLedgerDraft(draft: LedgerDraft): void {
  const ids = [
    draft.ledgerId,
    draft.bookingId,
    draft.assignmentId,
    draft.crmRecordId,
    draft.artistId,
  ];
  if (!ids.every(isSafeBusinessId))
    throw new Error(
      "Ledger, booking, assignment, and artist IDs must be valid",
    );
  if (!isStripeAccountId(draft.connectedAccountId))
    throw new Error("Connected account ID is malformed");
  if (!isIsoDate(draft.eventDate))
    throw new Error("Event date must be a real YYYY-MM-DD date");
  if (!isIsoInstant(draft.closeoutVerifiedAt))
    throw new Error("Closeout verification time must be an ISO UTC instant");
  if (!isPayoutEnvironment(draft.environment))
    throw new Error("Payout environment is invalid");
  if (!Number.isSafeInteger(draft.sourceRevision) || draft.sourceRevision < 1) {
    throw new Error("Source revision must be a positive integer");
  }
  if (!sanitizeOperationalText(draft.artistName, 160))
    throw new Error("Artist name is required");
  if (!sanitizeOperationalText(draft.eventName, 240))
    throw new Error("Event name is required");
  if (!sanitizeOperationalText(draft.service, 240))
    throw new Error("Service is required");
  if (
    !sanitizeOperationalText(draft.crmRevision, 200) ||
    sanitizeOperationalText(draft.crmRevision, 200) !== draft.crmRevision
  ) {
    throw new Error(
      "CRM revision is required and must be bounded operational text",
    );
  }
  validateArtistPayAmounts(draft);
}

export async function readJsonObject(
  request: Request,
  maxBytes = 32_768,
): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes)
    throw new Error("Request body is too large");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes)
    throw new Error("Request body is too large");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Request body must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}
