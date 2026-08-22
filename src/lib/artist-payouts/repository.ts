import {
  digestBatchSnapshot,
  digestLedgerMaterial,
  transferIdempotencyKey,
} from "./approval.ts";
import { assertTransition } from "./state-machine.ts";
import type {
  BatchApprovalSnapshot,
  BatchSnapshotItem,
  CloseoutControls,
  D1Database,
  LedgerDraft,
  LedgerRecord,
  OnboardingState,
  PayoutEnvironment,
  PayoutState,
} from "./types.ts";
import type { D1PreparedStatement } from "../booking/availability-types.ts";
import {
  assertLedgerDraft,
  isIsoDate,
  isIsoInstant,
  isSafeBusinessId,
  isStripeAccountId,
  sanitizeOperationalText,
} from "./validation.ts";

type D1Value = string | number | null;

const SHA256_DIGEST_RE = /^sha256:[A-Za-z0-9_-]{43}$/;
const HMAC_SHA256_HEX_RE = /^hmac-sha256:[a-f0-9]{64}$/;
const STRIPE_TRANSFER_RE = /^tr_[A-Za-z0-9]{12,80}$/;
const STRIPE_ACCOUNT_RE = /^acct_[A-Za-z0-9]{12,80}$/;
const STRIPE_BANK_ACCOUNT_RE = /^ba_[A-Za-z0-9]{12,80}$/;
const STRIPE_DESTINATION_PAYMENT_RE = /^py_[A-Za-z0-9]{12,80}$/;
const STRIPE_PAYOUT_RE = /^po_[A-Za-z0-9]{12,80}$/;
const STRIPE_EVENT_RE = /^evt_[A-Za-z0-9]{12,80}$/;
// Each atomic batch snapshot row uses eight bound parameters. Ten rows leave
// room for the statement-level controls beneath D1's 100-parameter limit.
export const MAX_PAYOUT_BATCH_ASSIGNMENTS = 10;
const PROVEN_PRE_STRIPE_FAILURE_CODES = new Set([
  "RECIPIENT_OR_DESTINATION_NOT_APPROVED",
  "RECIPIENT_STATUS_UNAVAILABLE",
  "BALANCE_CHECK_UNAVAILABLE",
  "PAYOUT_RESERVE_BLOCKED",
]);
const PRE_TRANSFER_STATES: readonly PayoutState[] = [
  "NOT_ELIGIBLE",
  "CLOSEOUT_PENDING",
  "ISSUE_REVIEW",
  "READY_FOR_OWNER_APPROVAL",
  "OWNER_APPROVED",
];
const LEDGER_INTAKE_STATES = [
  "NOT_ELIGIBLE",
  "CLOSEOUT_PENDING",
  "ISSUE_REVIEW",
  "READY_FOR_OWNER_APPROVAL",
] as const;
export type LedgerIntakeState = (typeof LEDGER_INTAKE_STATES)[number];

export type BatchStatus =
  | "PREPARED"
  | "OWNER_APPROVED"
  | "EXECUTING"
  | "PARTIALLY_COMPLETED"
  | "COMPLETED"
  | "BLOCKED"
  | "CANCELED";

export type BatchItemStatus =
  | "PREPARED"
  | "APPROVED"
  | "TRANSFER_QUEUED"
  | "TRANSFER_CREATED"
  | "COMPLETED"
  | "BLOCKED"
  | "FAILED"
  | "REVERSED";

export type TransferAttemptStatus =
  "CLAIMED" | "STRIPE_SUCCEEDED" | "STRIPE_FAILED" | "RECONCILED";
export type WebhookProcessingStatus =
  "RECEIVED" | "PROCESSING" | "PROCESSED" | "FAILED" | "IGNORED";

export class PayoutRepositoryError extends Error {
  readonly code:
    | "INVALID_INPUT"
    | "NOT_FOUND"
    | "CONFLICT"
    | "STALE_REVISION"
    | "APPROVAL_INVALIDATED"
    | "CLAIM_REJECTED"
    | "DATA_INTEGRITY"
    | "STORAGE_UNAVAILABLE";

  constructor(
    code:
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "CONFLICT"
      | "STALE_REVISION"
      | "APPROVAL_INVALIDATED"
      | "CLAIM_REJECTED"
      | "DATA_INTEGRITY"
      | "STORAGE_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "PayoutRepositoryError";
  }
}

interface ArtistAccountRow {
  artist_id: string;
  environment: PayoutEnvironment;
  stripe_account_id: string;
  artist_display_name: string;
  onboarding_status: OnboardingState;
  requirements_status: string;
  transfers_status: string;
  payouts_status: string;
  dashboard_type: "express";
  preferred_payout_type: "automatic_standard" | "unverified";
  payout_destination_id: string | null;
  payout_ready_approved_at: string | null;
  last_requirements_check_at: string | null;
  onboarded_at: string | null;
  disabled_reason: string | null;
  payout_exception_flag: number;
  created_at: string;
  updated_at: string;
}

interface ArtistDashboardRow extends ArtistAccountRow {
  unpaid_assignment_count: number;
  unpaid_amount_cents: number;
  assignment_count: number;
  paid_assignment_count: number;
  open_exception_count: number;
}

interface LedgerRow {
  ledger_id: string;
  environment: PayoutEnvironment;
  booking_id: string;
  assignment_id: string;
  crm_record_id: string;
  crm_revision: string;
  crm_reconciled_revision: string | null;
  crm_correction_required: number;
  reconciliation_claim_token: string | null;
  reconciliation_claim_expires_at: string | null;
  reconciliation_projection_at: string | null;
  crm_correction_projection_at: string | null;
  manual_payment_claim_token: string | null;
  manual_payment_claim_expires_at: string | null;
  artist_id: string;
  artist_name: string;
  event_name: string;
  event_date: string;
  closeout_verified_at: string;
  service: string;
  service_pay_cents: number;
  travel_pay_cents: number;
  bonus_cents: number;
  adjustment_cents: number;
  deduction_cents: number;
  total_approved_pay_cents: number;
  material_digest: string;
  closeout_controls_json: string;
  closeout_status: string;
  state: PayoutState;
  source_revision: number;
  owner_approval_status: "NOT_REVIEWED" | "APPROVED" | "INVALIDATED";
  owner_approval_revision: number;
  approval_digest: string | null;
  approved_by: string | null;
  approval_timestamp: string | null;
  batch_eligibility_date: string | null;
  batch_id: string | null;
  stripe_connected_account_id: string;
  approved_payout_destination_id: string | null;
  approved_payout_destination_at: string | null;
  stripe_transfer_id: string | null;
  stripe_destination_payment_id: string | null;
  stripe_transfer_status: string | null;
  stripe_payout_id: string | null;
  stripe_payout_status: string | null;
  expected_arrival: string | null;
  failure_code: string | null;
  failure_reason: string | null;
  payment_memo: string;
  manual_payment_method: string | null;
  manual_payment_amount_cents: number | null;
  manual_payment_reason: string | null;
  manual_payment_evidence_reference: string | null;
  manual_payment_memo: string | null;
  manual_payment_recorded_by: string | null;
  manual_payment_recorded_at: string | null;
  manual_payment_crm_revision: string | null;
  reconciled: number;
  reconciled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface BatchRow {
  batch_id: string;
  environment: PayoutEnvironment;
  scheduled_date: string;
  status: BatchStatus;
  currency: "usd";
  item_count: number;
  blocked_item_count: number;
  remaining_candidate_count: number;
  total_cents: number;
  available_balance_cents: number | null;
  minimum_reserve_cents: number | null;
  projected_balance_cents: number | null;
  approval_digest: string | null;
  approval_revision: number;
  created_by: string;
  approved_by: string | null;
  approval_timestamp: string | null;
  execution_claim_token: string | null;
  execution_started_at: string | null;
  execution_completed_at: string | null;
  recovery_processing_date: string | null;
  recovery_authorized_by: string | null;
  recovery_authorized_at: string | null;
  recovery_reason: string | null;
  last_execution_date: string | null;
  created_at: string;
  updated_at: string;
}

interface BatchItemRow {
  batch_id: string;
  environment: PayoutEnvironment;
  ledger_id: string;
  assignment_id_snapshot: string;
  artist_id_snapshot: string;
  connected_account_id_snapshot: string;
  amount_cents_snapshot: number;
  source_revision_snapshot: number;
  material_digest_snapshot: string;
  payment_memo_snapshot: string;
  item_status: BatchItemStatus;
  failure_code: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface TransferAttemptRow {
  attempt_id: string;
  ledger_id: string;
  batch_id: string;
  environment: PayoutEnvironment;
  idempotency_fingerprint: string;
  source_revision: number;
  request_amount_cents: number;
  destination_account_id: string;
  attempt_status: TransferAttemptStatus;
  stripe_transfer_id: string | null;
  safe_error_code: string | null;
  retry_count: number;
  destination_resnapshot_authorized: number;
  created_at: string;
  updated_at: string;
}

interface PayoutDestinationVarianceApprovalRow {
  approval_id: string;
  environment: PayoutEnvironment;
  ledger_id: string;
  payout_id: string;
  original_destination_id: string;
  approved_destination_id: string;
  recipient_approval_at: string;
  approved_by: string;
  reason: string;
  created_at: string;
}

interface WebhookEventRow {
  stripe_event_id: string;
  environment: PayoutEnvironment;
  event_type: string;
  connected_account_id: string | null;
  received_at: string;
  processing_status: WebhookProcessingStatus;
  processing_claim_token: string | null;
  processing_started_at: string | null;
  processing_lease_expires_at: string | null;
  processed_at: string | null;
  safe_error_code: string | null;
  retry_count: number;
}

export interface ArtistAccountRecord {
  artistId: string;
  environment: PayoutEnvironment;
  stripeAccountId: string;
  artistDisplayName: string;
  onboardingStatus: OnboardingState;
  requirementsStatus: string;
  transfersStatus: string;
  payoutsStatus: string;
  dashboardType: "express";
  preferredPayoutType: "automatic_standard" | "unverified";
  payoutDestinationId: string | null;
  payoutReadyApprovedAt: string | null;
  lastRequirementsCheckAt: string | null;
  onboardedAt: string | null;
  disabledReason: string | null;
  payoutExceptionFlag: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ArtistAccountWrite {
  artistId: string;
  stripeAccountId: string;
  artistDisplayName: string;
  onboardingStatus: OnboardingState;
  requirementsStatus: string;
  transfersStatus: string;
  payoutsStatus: string;
  automaticPayoutsEnabled: boolean;
  payoutDestinationId: string | null;
  payoutReadyApprovedAt: string | null;
  lastRequirementsCheckAt: string | null;
  onboardedAt: string | null;
  disabledReason: string | null;
  payoutExceptionFlag: boolean;
  auditActor?: string;
  auditRequestId?: string | null;
  auditId?: string;
  now: string;
}

export interface LedgerUpsertInput {
  draft: LedgerDraft;
  state: LedgerIntakeState;
  closeoutStatus: string;
  batchEligibilityDate: string | null;
  paymentMemo: string;
  actor: string;
  auditId: string;
  requestId: string | null;
  now: string;
}

export interface LedgerUpsertResult {
  record: LedgerRecord;
  created: boolean;
  approvalInvalidated: boolean;
}

export interface PayoutBatchRecord {
  batchId: string;
  environment: PayoutEnvironment;
  scheduledDate: string;
  status: BatchStatus;
  currency: "usd";
  itemCount: number;
  blockedItemCount: number;
  remainingCandidateCount: number;
  totalCents: number;
  availableBalanceCents: number | null;
  minimumReserveCents: number | null;
  projectedBalanceCents: number | null;
  approvalDigest: string | null;
  approvalRevision: number;
  createdBy: string;
  approvedBy: string | null;
  approvalTimestamp: string | null;
  executionClaimToken: string | null;
  executionStartedAt: string | null;
  executionCompletedAt: string | null;
  recoveryProcessingDate: string | null;
  recoveryAuthorizedBy: string | null;
  recoveryAuthorizedAt: string | null;
  recoveryReason: string | null;
  lastExecutionDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutBatchItemRecord extends BatchSnapshotItem {
  batchId: string;
  environment: PayoutEnvironment;
  status: BatchItemStatus;
  failureCode: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransferAttemptRecord {
  attemptId: string;
  ledgerId: string;
  batchId: string;
  environment: PayoutEnvironment;
  idempotencyFingerprint: string;
  sourceRevision: number;
  requestAmountCents: number;
  destinationAccountId: string;
  status: TransferAttemptStatus;
  stripeTransferId: string | null;
  safeErrorCode: string | null;
  retryCount: number;
  destinationResnapshotAuthorized: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutDestinationVarianceApprovalRecord {
  approvalId: string;
  environment: PayoutEnvironment;
  ledgerId: string;
  payoutId: string;
  originalDestinationId: string;
  approvedDestinationId: string;
  recipientApprovalAt: string;
  approvedBy: string;
  reason: string;
  createdAt: string;
}

export interface WebhookEventRecord {
  stripeEventId: string;
  environment: PayoutEnvironment;
  eventType: string;
  connectedAccountId: string | null;
  receivedAt: string;
  status: WebhookProcessingStatus;
  processingClaimToken: string | null;
  processingStartedAt: string | null;
  processingLeaseExpiresAt: string | null;
  processedAt: string | null;
  safeErrorCode: string | null;
  retryCount: number;
}

export interface PayoutExceptionRecord {
  exceptionId: string;
  environment: PayoutEnvironment;
  ledgerId: string | null;
  batchId: string | null;
  artistId: string | null;
  bookingId: string | null;
  assignmentId: string | null;
  exceptionType: string;
  reasonCode: string;
  safeReason: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  ownerActionRequired: string;
  lastAttemptAt: string | null;
  nextAllowedAttemptAt: string | null;
  stripeReference: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionEvidence: string | null;
}

export interface AuditWrite {
  auditId: string;
  timestamp: string;
  actor: string;
  action: string;
  bookingId?: string | null;
  assignmentId?: string | null;
  artistId?: string | null;
  amountCents?: number | null;
  currency?: "usd" | null;
  connectedAccountId?: string | null;
  transferId?: string | null;
  payoutId?: string | null;
  previousState?: string | null;
  newState?: string | null;
  approvalRevision?: number | null;
  idempotencyFingerprint?: string | null;
  result: string;
  failureReason?: string | null;
  requestId?: string | null;
  batchId?: string | null;
  safeDetails?: Record<string, unknown>;
}

export interface AuditHistoryRecord {
  auditId: string;
  timestamp: string;
  actor: string;
  action: string;
  bookingId: string | null;
  assignmentId: string | null;
  artistId: string | null;
  amountCents: number | null;
  currency: string | null;
  transferId: string | null;
  payoutId: string | null;
  previousState: string | null;
  newState: string | null;
  approvalRevision: number | null;
  result: string;
  failureReason: string | null;
  batchId: string | null;
}

export interface DashboardSnapshot {
  environment: PayoutEnvironment;
  pageLimit: number;
  collectionPages: Record<DashboardCollectionKey, DashboardPageMetadata>;
  fundingPreviewUnavailable: boolean;
  fundingPreviewError: {
    code:
      "STRIPE_BALANCE_UNAVAILABLE" | "STRIPE_PREVIEW_CONFIGURATION_UNAVAILABLE";
    checkedAt: string;
  } | null;
  stateTotals: Array<{
    state: PayoutState;
    count: number;
    amountCents: number;
  }>;
  onboardingTotals: Array<{ status: OnboardingState; count: number }>;
  batches: PayoutBatchRecord[];
  batchReviewItems: Array<{
    batchId: string;
    ledgerId: string;
    artistId: string;
    artistName: string;
    eventName: string;
    bookingId: string;
    assignmentId: string;
    eventDate: string;
    closeoutVerifiedAt: string;
    service: string;
    servicePayCents: number;
    travelPayCents: number;
    bonusCents: number;
    adjustmentCents: number;
    deductionCents: number;
    totalCents: number;
    connectedAccountId: string;
    closeoutStatus: string;
    stripeReadiness: string;
    eligibilityState: PayoutState;
    exceptionCount: number;
    scheduledDate: string;
    snapshotMatches: boolean;
    itemStatus: BatchItemStatus;
  }>;
  batchBlockedItems: Array<{
    batchId: string;
    ledgerId: string;
    artistId: string;
    artistName: string;
    eventName: string;
    bookingId: string;
    assignmentId: string;
    eventDate: string;
    service: string;
    totalCents: number;
    reasonCode: string;
    safeReason: string;
    ownerActionRequired: string;
    createdAt: string;
  }>;
  ledgers: LedgerRecord[];
  recentTransfers: LedgerRecord[];
  openExceptions: PayoutExceptionRecord[];
  artistAccounts: ArtistAccountRecord[];
  artistProfileMetrics: Array<{
    artistId: string;
    unpaidAssignmentCount: number;
    unpaidAmountCents: number;
    assignmentCount: number;
    paidAssignmentCount: number;
    openExceptionCount: number;
  }>;
  selectedArtistProfile: ArtistProfileSnapshot | null;
  activeRosterCount: number | null;
  onboardingQueueUnavailable: boolean;
  onboardingQueue: Array<{
    artistId: string;
    displayName: string;
    onboardingStatus: OnboardingState;
  }>;
  auditHistory: AuditHistoryRecord[];
  webhookBacklog: {
    received: number;
    processing: number;
    failed: number;
  };
  failedWebhookEvents: Array<{
    eventId: string;
    eventType: string;
    connectedAccountId: string | null;
    receivedAt: string;
    safeErrorCode: string;
    retryCount: number;
  }>;
  lastReconciliationAt: string | null;
}

export type DashboardCollectionKey =
  | "batches"
  | "ledgers"
  | "artistAccounts"
  | "openExceptions"
  | "auditHistory"
  | "batchBlockedItems"
  | "failedWebhookEvents";

export type ArtistProfileCollectionKey =
  "unpaidAssignments" | "paymentHistory" | "openExceptions";

export interface DashboardPageMetadata {
  totalCount: number;
  returnedCount: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ArtistProfileSnapshot {
  artistId: string;
  account: ArtistAccountRecord;
  metrics: {
    unpaidAssignmentCount: number;
    unpaidAmountCents: number;
    assignmentCount: number;
    paidAssignmentCount: number;
    openExceptionCount: number;
  };
  collectionPages: Record<ArtistProfileCollectionKey, DashboardPageMetadata>;
  unpaidAssignments: LedgerRecord[];
  paymentHistory: LedgerRecord[];
  openExceptions: PayoutExceptionRecord[];
}

export interface DashboardQuery {
  limit?: number;
  cursors?: Partial<Record<DashboardCollectionKey, string>>;
  artistId?: string;
  artistProfileCursors?: Partial<Record<ArtistProfileCollectionKey, string>>;
}

const DASHBOARD_QUERY_PARAMETERS = Object.freeze({
  cursor_batches: "batches",
  cursor_ledgers: "ledgers",
  cursor_accounts: "artistAccounts",
  cursor_exceptions: "openExceptions",
  cursor_audit: "auditHistory",
  cursor_blocked: "batchBlockedItems",
  cursor_failed_webhooks: "failedWebhookEvents",
} satisfies Record<string, DashboardCollectionKey>);

const ARTIST_PROFILE_QUERY_PARAMETERS = Object.freeze({
  cursor_artist_unpaid: "unpaidAssignments",
  cursor_artist_payments: "paymentHistory",
  cursor_artist_exceptions: "openExceptions",
} satisfies Record<string, ArtistProfileCollectionKey>);

export function dashboardQueryFromUrl(url: string): DashboardQuery {
  const parsed = new URL(url);
  const allowed = new Set([
    "limit",
    "artist_id",
    ...Object.keys(DASHBOARD_QUERY_PARAMETERS),
    ...Object.keys(ARTIST_PROFILE_QUERY_PARAMETERS),
  ]);
  for (const key of parsed.searchParams.keys()) {
    if (!allowed.has(key) || parsed.searchParams.getAll(key).length !== 1) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Dashboard pagination query is malformed",
      );
    }
  }
  const rawLimit = parsed.searchParams.get("limit");
  const limit = rawLimit === null ? 100 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 250) {
    throw new PayoutRepositoryError(
      "INVALID_INPUT",
      "Dashboard limit must be between 1 and 250",
    );
  }
  const cursors: Partial<Record<DashboardCollectionKey, string>> = {};
  for (const [parameter, collection] of Object.entries(
    DASHBOARD_QUERY_PARAMETERS,
  )) {
    const cursor = parsed.searchParams.get(parameter);
    if (cursor === null) continue;
    if (!/^[A-Za-z0-9_-]{4,600}$/.test(cursor)) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Dashboard cursor is malformed",
      );
    }
    cursors[collection] = cursor;
  }
  const artistId = parsed.searchParams.get("artist_id") ?? undefined;
  if (artistId !== undefined && !isSafeBusinessId(artistId)) {
    throw new PayoutRepositoryError(
      "INVALID_INPUT",
      "Dashboard artist ID is malformed",
    );
  }
  const artistProfileCursors: Partial<
    Record<ArtistProfileCollectionKey, string>
  > = {};
  for (const [parameter, collection] of Object.entries(
    ARTIST_PROFILE_QUERY_PARAMETERS,
  )) {
    const cursor = parsed.searchParams.get(parameter);
    if (cursor === null) continue;
    if (!artistId || !/^[A-Za-z0-9_-]{4,600}$/.test(cursor)) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Dashboard artist profile cursor is malformed",
      );
    }
    artistProfileCursors[collection] = cursor;
  }
  return { limit, cursors, artistId, artistProfileCursors };
}

function changes(result: { meta?: { changes?: number } }): number {
  return Number(result.meta?.changes ?? 0);
}

function encodeDashboardCursor(values: string[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(values));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function decodeDashboardCursor(
  cursor: string | undefined,
  collection: DashboardCollectionKey | ArtistProfileCollectionKey,
): string[] | null {
  if (cursor === undefined) return null;
  if (!/^[A-Za-z0-9_-]{4,600}$/.test(cursor)) {
    throw new PayoutRepositoryError(
      "INVALID_INPUT",
      `Dashboard ${collection} cursor is malformed`,
    );
  }
  try {
    const base64 = cursor.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    const decoded = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (
      !Array.isArray(decoded) ||
      decoded.some(
        (value) =>
          typeof value !== "string" ||
          value.length < 1 ||
          value.length > 240 ||
          /[\u0000-\u001F\u007F]/.test(value),
      )
    ) {
      throw new Error("invalid cursor material");
    }
    return decoded as string[];
  } catch {
    throw new PayoutRepositoryError(
      "INVALID_INPUT",
      `Dashboard ${collection} cursor is malformed`,
    );
  }
}

function assertArtistProfileCursorParts(
  parts: string[] | null,
  collection: ArtistProfileCollectionKey,
  artistId: string,
): string[] | null {
  if (parts === null) return null;
  const matchesArtist = parts[0] === artistId;
  const valid =
    matchesArtist &&
    (collection === "openExceptions"
      ? parts.length === 3 &&
        isIsoInstant(parts[1]) &&
        isSafeBusinessId(parts[2])
      : parts.length === 4 &&
        isIsoDate(parts[1]) &&
        isSafeBusinessId(parts[2]) &&
        isSafeBusinessId(parts[3]));
  if (!valid) {
    throw new PayoutRepositoryError(
      "INVALID_INPUT",
      `Dashboard ${collection} cursor is malformed or belongs to another artist`,
    );
  }
  return parts;
}

function assertDashboardCursorParts(
  parts: string[] | null,
  collection: DashboardCollectionKey,
): string[] | null {
  if (parts === null) return null;
  const valid = (() => {
    if (collection === "artistAccounts") {
      return parts.length === 1 && isSafeBusinessId(parts[0]);
    }
    if (collection === "batches") {
      return (
        parts.length === 3 &&
        isIsoDate(parts[0]) &&
        isIsoInstant(parts[1]) &&
        isSafeBusinessId(parts[2])
      );
    }
    if (collection === "ledgers") {
      return (
        parts.length === 3 &&
        isIsoDate(parts[0]) &&
        isSafeBusinessId(parts[1]) &&
        isSafeBusinessId(parts[2])
      );
    }
    return (
      parts.length === 2 && isIsoInstant(parts[0]) && isSafeBusinessId(parts[1])
    );
  })();
  if (!valid) {
    throw new PayoutRepositoryError(
      "INVALID_INPUT",
      `Dashboard ${collection} cursor is malformed`,
    );
  }
  return parts;
}

function dashboardPageMetadata<Row>(
  rowsWithSentinel: Row[],
  limit: number,
  totalCount: number,
  cursorValues: (row: Row) => string[],
): { rows: Row[]; metadata: DashboardPageMetadata } {
  const rows = rowsWithSentinel.slice(0, limit);
  const hasMore = rowsWithSentinel.length > limit;
  const last = rows.at(-1);
  return {
    rows,
    metadata: {
      totalCount,
      returnedCount: rows.length,
      hasMore,
      nextCursor:
        hasMore && last ? encodeDashboardCursor(cursorValues(last)) : null,
    },
  };
}

function operationalRepositoryId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function assertInstant(value: string, label: string): void {
  if (!isIsoInstant(value) || new Date(value).toISOString() !== value) {
    throw new PayoutRepositoryError(
      "INVALID_INPUT",
      `${label} must be a canonical ISO UTC instant`,
    );
  }
}

function assertSafeId(value: string, label: string): void {
  if (!isSafeBusinessId(value))
    throw new PayoutRepositoryError("INVALID_INPUT", `${label} is malformed`);
}

function boundedText(value: string, maxLength: number, label: string): string {
  const normalized = sanitizeOperationalText(value, maxLength);
  if (!normalized || normalized !== value.trim()) {
    throw new PayoutRepositoryError(
      "INVALID_INPUT",
      `${label} contains unsupported characters or formatting`,
    );
  }
  return normalized;
}

function assertDigest(value: string, label = "Digest"): void {
  if (!SHA256_DIGEST_RE.test(value))
    throw new PayoutRepositoryError("INVALID_INPUT", `${label} is malformed`);
}

function assertStripeObjectId(
  value: string,
  pattern: RegExp,
  label: string,
): string {
  if (!pattern.test(value))
    throw new PayoutRepositoryError("INVALID_INPUT", `${label} is malformed`);
  return value;
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PayoutRepositoryError(
      "INVALID_INPUT",
      `${label} must be a non-negative safe integer`,
    );
  }
}

function normalizeDraft(draft: LedgerDraft): LedgerDraft {
  assertLedgerDraft(draft);
  return {
    ...draft,
    artistName: boundedText(draft.artistName, 160, "Artist name"),
    eventName: boundedText(draft.eventName, 240, "Event name"),
    service: boundedText(draft.service, 240, "Service"),
    closeout: normalizeCloseout(draft.closeout),
  };
}

function normalizeCloseout(value: CloseoutControls): CloseoutControls {
  const booleanKeys: Array<keyof CloseoutControls> = [
    "assignmentExists",
    "bookingIdValid",
    "assignmentIdValid",
    "eventCompleted",
    "artistCompletionConfirmed",
    "serviceCompleted",
    "extraTimeReconciled",
    "serviceChangeReconciled",
    "travelPayReconciled",
    "adjustmentsReconciled",
    "noCustomerComplaintAffectingPay",
    "noRefundIssueAffectingPay",
    "noDamageOrSupplyIssueAffectingPay",
    "compensationApproved",
    "contractorControlSatisfied",
    "stripeOnboardingComplete",
    "stripeTransfersActive",
    "stripePayoutsActive",
    "connectedAccountMatchesArtist",
  ];
  for (const key of booleanKeys) {
    if (typeof value[key] !== "boolean") {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        `Closeout control ${key} must be boolean`,
      );
    }
  }
  if (value.actualEndTime !== null && !isIsoInstant(value.actualEndTime)) {
    throw new PayoutRepositoryError(
      "INVALID_INPUT",
      "Actual end time must be null or an ISO UTC instant",
    );
  }
  return {
    assignmentExists: value.assignmentExists,
    bookingIdValid: value.bookingIdValid,
    assignmentIdValid: value.assignmentIdValid,
    eventCompleted: value.eventCompleted,
    actualEndTime: value.actualEndTime,
    artistCompletionConfirmed: value.artistCompletionConfirmed,
    serviceCompleted: value.serviceCompleted,
    extraTimeReconciled: value.extraTimeReconciled,
    serviceChangeReconciled: value.serviceChangeReconciled,
    travelPayReconciled: value.travelPayReconciled,
    adjustmentsReconciled: value.adjustmentsReconciled,
    noCustomerComplaintAffectingPay: value.noCustomerComplaintAffectingPay,
    noRefundIssueAffectingPay: value.noRefundIssueAffectingPay,
    noDamageOrSupplyIssueAffectingPay: value.noDamageOrSupplyIssueAffectingPay,
    compensationApproved: value.compensationApproved,
    contractorControlSatisfied: value.contractorControlSatisfied,
    stripeOnboardingComplete: value.stripeOnboardingComplete,
    stripeTransfersActive: value.stripeTransfersActive,
    stripePayoutsActive: value.stripePayoutsActive,
    connectedAccountMatchesArtist: value.connectedAccountMatchesArtist,
  };
}

function parseCloseout(raw: string): CloseoutControls {
  try {
    const parsed = JSON.parse(raw) as CloseoutControls;
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    return normalizeCloseout(parsed);
  } catch {
    throw new PayoutRepositoryError(
      "DATA_INTEGRITY",
      "Stored closeout controls are malformed",
    );
  }
}

function mapArtist(row: ArtistAccountRow): ArtistAccountRecord {
  return {
    artistId: row.artist_id,
    environment: row.environment,
    stripeAccountId: row.stripe_account_id,
    artistDisplayName: row.artist_display_name,
    onboardingStatus: row.onboarding_status,
    requirementsStatus: row.requirements_status,
    transfersStatus: row.transfers_status,
    payoutsStatus: row.payouts_status,
    dashboardType: row.dashboard_type,
    preferredPayoutType: row.preferred_payout_type,
    payoutDestinationId: row.payout_destination_id,
    payoutReadyApprovedAt: row.payout_ready_approved_at,
    lastRequirementsCheckAt: row.last_requirements_check_at,
    onboardedAt: row.onboarded_at,
    disabledReason: row.disabled_reason,
    payoutExceptionFlag: row.payout_exception_flag === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLedger(row: LedgerRow): LedgerRecord {
  if (!SHA256_DIGEST_RE.test(row.material_digest)) {
    throw new PayoutRepositoryError(
      "DATA_INTEGRITY",
      "Stored ledger material digest is malformed",
    );
  }
  return {
    ledgerId: row.ledger_id,
    environment: row.environment,
    bookingId: row.booking_id,
    assignmentId: row.assignment_id,
    crmRecordId: row.crm_record_id,
    crmRevision: row.crm_revision,
    crmReconciledRevision: row.crm_reconciled_revision,
    crmCorrectionRequired: row.crm_correction_required === 1,
    reconciliationClaimToken: row.reconciliation_claim_token,
    reconciliationClaimExpiresAt: row.reconciliation_claim_expires_at,
    reconciliationProjectionAt: row.reconciliation_projection_at,
    crmCorrectionProjectionAt: row.crm_correction_projection_at,
    manualPaymentClaimToken: row.manual_payment_claim_token,
    manualPaymentClaimExpiresAt: row.manual_payment_claim_expires_at,
    artistId: row.artist_id,
    artistName: row.artist_name,
    eventName: row.event_name,
    eventDate: row.event_date,
    closeoutVerifiedAt: row.closeout_verified_at,
    service: row.service,
    servicePayCents: row.service_pay_cents,
    travelPayCents: row.travel_pay_cents,
    bonusCents: row.bonus_cents,
    adjustmentCents: row.adjustment_cents,
    deductionCents: row.deduction_cents,
    totalApprovedPayCents: row.total_approved_pay_cents,
    materialDigest: row.material_digest,
    sourceRevision: row.source_revision,
    closeout: parseCloseout(row.closeout_controls_json),
    connectedAccountId: row.stripe_connected_account_id,
    state: row.state,
    ownerApprovalRevision: row.owner_approval_revision,
    approvalDigest: row.approval_digest,
    approvedBy: row.approved_by,
    approvalTimestamp: row.approval_timestamp,
    batchEligibilityDate: row.batch_eligibility_date,
    batchId: row.batch_id,
    approvedPayoutDestinationId: row.approved_payout_destination_id,
    approvedPayoutDestinationAt: row.approved_payout_destination_at,
    stripeTransferId: row.stripe_transfer_id,
    stripeDestinationPaymentId: row.stripe_destination_payment_id,
    stripePayoutId: row.stripe_payout_id,
    stripePayoutStatus: row.stripe_payout_status,
    expectedArrival: row.expected_arrival,
    failureCode: row.failure_code,
    failureReason: row.failure_reason,
    paymentMemo: row.payment_memo,
    manualPaymentMethod: row.manual_payment_method,
    manualPaymentAmountCents: row.manual_payment_amount_cents,
    manualPaymentReason: row.manual_payment_reason,
    manualPaymentEvidenceReference: row.manual_payment_evidence_reference,
    manualPaymentMemo: row.manual_payment_memo,
    manualPaymentRecordedBy: row.manual_payment_recorded_by,
    manualPaymentRecordedAt: row.manual_payment_recorded_at,
    manualPaymentCrmRevision: row.manual_payment_crm_revision,
    reconciled: row.reconciled === 1,
    reconciledAt: row.reconciled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBatch(row: BatchRow): PayoutBatchRecord {
  return {
    batchId: row.batch_id,
    environment: row.environment,
    scheduledDate: row.scheduled_date,
    status: row.status,
    currency: row.currency,
    itemCount: row.item_count,
    blockedItemCount: row.blocked_item_count,
    remainingCandidateCount: row.remaining_candidate_count,
    totalCents: row.total_cents,
    availableBalanceCents: row.available_balance_cents,
    minimumReserveCents: row.minimum_reserve_cents,
    projectedBalanceCents: row.projected_balance_cents,
    approvalDigest: row.approval_digest,
    approvalRevision: row.approval_revision,
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    approvalTimestamp: row.approval_timestamp,
    executionClaimToken: row.execution_claim_token,
    executionStartedAt: row.execution_started_at,
    executionCompletedAt: row.execution_completed_at,
    recoveryProcessingDate: row.recovery_processing_date,
    recoveryAuthorizedBy: row.recovery_authorized_by,
    recoveryAuthorizedAt: row.recovery_authorized_at,
    recoveryReason: row.recovery_reason,
    lastExecutionDate: row.last_execution_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBatchItem(row: BatchItemRow): PayoutBatchItemRecord {
  return {
    batchId: row.batch_id,
    environment: row.environment,
    ledgerId: row.ledger_id,
    assignmentId: row.assignment_id_snapshot,
    artistId: row.artist_id_snapshot,
    connectedAccountId: row.connected_account_id_snapshot,
    totalApprovedPayCents: row.amount_cents_snapshot,
    sourceRevision: row.source_revision_snapshot,
    materialDigest: row.material_digest_snapshot,
    paymentMemo: row.payment_memo_snapshot,
    status: row.item_status,
    failureCode: row.failure_code,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPayoutDestinationVarianceApproval(
  row: PayoutDestinationVarianceApprovalRow,
): PayoutDestinationVarianceApprovalRecord {
  return {
    approvalId: row.approval_id,
    environment: row.environment,
    ledgerId: row.ledger_id,
    payoutId: row.payout_id,
    originalDestinationId: row.original_destination_id,
    approvedDestinationId: row.approved_destination_id,
    recipientApprovalAt: row.recipient_approval_at,
    approvedBy: row.approved_by,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

function mapAttempt(row: TransferAttemptRow): TransferAttemptRecord {
  return {
    attemptId: row.attempt_id,
    ledgerId: row.ledger_id,
    batchId: row.batch_id,
    environment: row.environment,
    idempotencyFingerprint: row.idempotency_fingerprint,
    sourceRevision: row.source_revision,
    requestAmountCents: row.request_amount_cents,
    destinationAccountId: row.destination_account_id,
    status: row.attempt_status,
    stripeTransferId: row.stripe_transfer_id,
    safeErrorCode: row.safe_error_code,
    retryCount: row.retry_count,
    destinationResnapshotAuthorized:
      row.destination_resnapshot_authorized === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWebhook(row: WebhookEventRow): WebhookEventRecord {
  return {
    stripeEventId: row.stripe_event_id,
    environment: row.environment,
    eventType: row.event_type,
    connectedAccountId: row.connected_account_id,
    receivedAt: row.received_at,
    status: row.processing_status,
    processingClaimToken: row.processing_claim_token,
    processingStartedAt: row.processing_started_at,
    processingLeaseExpiresAt: row.processing_lease_expires_at,
    processedAt: row.processed_at,
    safeErrorCode: row.safe_error_code,
    retryCount: row.retry_count,
  };
}

function mapException(row: Record<string, unknown>): PayoutExceptionRecord {
  return {
    exceptionId: String(row.exception_id),
    environment: row.environment as PayoutEnvironment,
    ledgerId: (row.ledger_id as string | null) ?? null,
    batchId: (row.batch_id as string | null) ?? null,
    artistId: (row.artist_id as string | null) ?? null,
    bookingId: (row.booking_id as string | null) ?? null,
    assignmentId: (row.assignment_id as string | null) ?? null,
    exceptionType: String(row.exception_type),
    reasonCode: String(row.reason_code),
    safeReason: String(row.safe_reason),
    status: row.status as PayoutExceptionRecord["status"],
    ownerActionRequired: String(row.owner_action_required),
    lastAttemptAt: (row.last_attempt_at as string | null) ?? null,
    nextAllowedAttemptAt:
      (row.next_allowed_attempt_at as string | null) ?? null,
    stripeReference: (row.stripe_reference as string | null) ?? null,
    createdAt: String(row.created_at),
    resolvedAt: (row.resolved_at as string | null) ?? null,
    resolvedBy: (row.resolved_by as string | null) ?? null,
    resolutionEvidence: (row.resolution_evidence as string | null) ?? null,
  };
}

function mapAuditHistory(row: Record<string, unknown>): AuditHistoryRecord {
  return {
    auditId: String(row.audit_id),
    timestamp: String(row.timestamp),
    actor: String(row.actor),
    action: String(row.action),
    bookingId: (row.booking_id as string | null) ?? null,
    assignmentId: (row.assignment_id as string | null) ?? null,
    artistId: (row.artist_id as string | null) ?? null,
    amountCents: row.amount_cents === null ? null : Number(row.amount_cents),
    currency: (row.currency as string | null) ?? null,
    transferId: (row.transfer_id as string | null) ?? null,
    payoutId: (row.payout_id as string | null) ?? null,
    previousState: (row.previous_state as string | null) ?? null,
    newState: (row.new_state as string | null) ?? null,
    approvalRevision:
      row.approval_revision === null ? null : Number(row.approval_revision),
    result: String(row.result),
    failureReason: (row.failure_reason as string | null) ?? null,
    batchId: (row.batch_id as string | null) ?? null,
  };
}

function snapshotItem(ledger: LedgerRecord): BatchSnapshotItem {
  return {
    ledgerId: ledger.ledgerId,
    assignmentId: ledger.assignmentId,
    artistId: ledger.artistId,
    connectedAccountId: ledger.connectedAccountId,
    totalApprovedPayCents: ledger.totalApprovedPayCents,
    sourceRevision: ledger.sourceRevision,
    materialDigest: ledger.materialDigest,
    paymentMemo: ledger.paymentMemo,
  };
}

function sensitiveDetailsReplacer(key: string, value: unknown): unknown {
  if (
    key &&
    /(secret|token|authorization|password|bank|routing|account_number)/i.test(
      key,
    )
  ) {
    throw new PayoutRepositoryError(
      "INVALID_INPUT",
      "Audit details contain a sensitive key",
    );
  }
  if (
    typeof value === "string" &&
    /(?:sk_(?:live|test)_|whsec_)[A-Za-z0-9]/.test(value)
  ) {
    throw new PayoutRepositoryError(
      "INVALID_INPUT",
      "Audit details contain a secret-like value",
    );
  }
  return value;
}

function serializeSafeDetails(details: Record<string, unknown> = {}): string {
  let json: string;
  try {
    json = JSON.stringify(details, sensitiveDetailsReplacer);
  } catch (error) {
    if (error instanceof PayoutRepositoryError) throw error;
    throw new PayoutRepositoryError(
      "INVALID_INPUT",
      "Audit details must be JSON serializable",
    );
  }
  if (new TextEncoder().encode(json).byteLength > 4096) {
    throw new PayoutRepositoryError(
      "INVALID_INPUT",
      "Audit details exceed 4096 bytes",
    );
  }
  return json;
}

function valuesCte(items: BatchSnapshotItem[]): {
  sql: string;
  values: D1Value[];
} {
  const tuple = "(?, ?, ?, ?, ?, ?, ?, ?)";
  return {
    sql: `expected(ledger_id, assignment_id, artist_id, connected_account_id, amount_cents, source_revision, material_digest, payment_memo) AS (VALUES ${items.map(() => tuple).join(", ")})`,
    values: items.flatMap((item) => [
      item.ledgerId,
      item.assignmentId,
      item.artistId,
      item.connectedAccountId,
      item.totalApprovedPayCents,
      item.sourceRevision,
      item.materialDigest,
      item.paymentMemo,
    ]),
  };
}

const CURRENT_SNAPSHOT_MATCH = `
  l.assignment_id = e.assignment_id
  AND l.artist_id = e.artist_id
  AND l.stripe_connected_account_id = e.connected_account_id
  AND l.total_approved_pay_cents = e.amount_cents
  AND l.source_revision = e.source_revision
  AND l.material_digest = e.material_digest
  AND l.payment_memo = e.payment_memo`;

export class PayoutRepository {
  private identityCheck: Promise<void> | null = null;
  private readonly db: D1Database;
  readonly environment: PayoutEnvironment;

  constructor(db: D1Database, environment: PayoutEnvironment) {
    if (!db || (environment !== "sandbox" && environment !== "live")) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "A valid payout database and environment are required",
      );
    }
    this.db = db;
    this.environment = environment;
  }

  async assertEnvironmentIdentity(now: string): Promise<void> {
    assertInstant(now, "Database identity time");
    if (!this.identityCheck) {
      this.identityCheck = (async () => {
        const identity = await this.db
          .prepare(
            `
            SELECT environment FROM payout_database_identity
            WHERE singleton_key = 'artist_payouts'
          `,
          )
          .first<{ environment: PayoutEnvironment }>();
        if (!identity || identity.environment !== this.environment) {
          throw new PayoutRepositoryError(
            "DATA_INTEGRITY",
            "Payout database identity is absent or does not match the configured environment",
          );
        }
      })();
    }
    await this.identityCheck;
  }

  private async ensureEnvironmentIdentity(): Promise<void> {
    await this.assertEnvironmentIdentity(new Date().toISOString());
  }

  private async transaction(statements: D1PreparedStatement[]) {
    if (!this.db.batch) {
      throw new PayoutRepositoryError(
        "STORAGE_UNAVAILABLE",
        "D1 transactional batch support is required",
      );
    }
    try {
      return await this.db.batch(statements);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown D1 failure";
      throw new PayoutRepositoryError(
        "STORAGE_UNAVAILABLE",
        `Payout storage transaction failed: ${message.slice(0, 180)}`,
      );
    }
  }

  async getArtistAccount(
    artistId: string,
  ): Promise<ArtistAccountRecord | null> {
    await this.ensureEnvironmentIdentity();
    assertSafeId(artistId, "Artist ID");
    const row = await this.db
      .prepare(
        "SELECT * FROM artist_stripe_accounts WHERE artist_id = ? AND environment = ?",
      )
      .bind(artistId, this.environment)
      .first<ArtistAccountRow>();
    return row ? mapArtist(row) : null;
  }

  async listArtistAccountsForRoster(): Promise<ArtistAccountRecord[]> {
    await this.ensureEnvironmentIdentity();
    const maximumAccounts = 10_000;
    const result = await this.db
      .prepare(
        `SELECT * FROM artist_stripe_accounts
         WHERE environment = ? ORDER BY artist_id ASC LIMIT ?`,
      )
      .bind(this.environment, maximumAccounts + 1)
      .all<ArtistAccountRow>();
    const rows = result.results ?? [];
    if (rows.length > maximumAccounts) {
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Artist account inventory exceeds the bounded authoritative roster view",
      );
    }
    return rows.map(mapArtist);
  }

  async createOnboardingClaim(input: {
    nonce: string;
    artistId: string;
    stripeAccountId: string;
    rosterRevision: string;
    challengeDigest: string;
    expiresAt: string;
    createdBy: string;
    createdAt: string;
  }): Promise<void> {
    await this.assertEnvironmentIdentity(input.createdAt);
    assertSafeId(input.nonce, "Onboarding claim nonce");
    assertSafeId(input.artistId, "Artist ID");
    const accountId = assertStripeObjectId(
      input.stripeAccountId,
      STRIPE_ACCOUNT_RE,
      "Stripe account ID",
    );
    const rosterRevision = boundedText(
      input.rosterRevision,
      200,
      "Roster revision",
    );
    if (!HMAC_SHA256_HEX_RE.test(input.challengeDigest)) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Onboarding challenge digest is malformed",
      );
    }
    const createdBy = boundedText(input.createdBy, 254, "Claim creator");
    assertInstant(input.createdAt, "Claim creation time");
    assertInstant(input.expiresAt, "Claim expiry");
    if (input.expiresAt <= input.createdAt)
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Onboarding claim expiry must follow creation",
      );
    const revoke = this.db
      .prepare(
        `
        UPDATE artist_onboarding_claims SET consumed_at = ?
        WHERE environment = ? AND artist_id = ? AND consumed_at IS NULL
      `,
      )
      .bind(input.createdAt, this.environment, input.artistId);
    const revokeSessions = this.db
      .prepare(
        `
        UPDATE artist_onboarding_sessions SET revoked_at = ?
        WHERE environment = ? AND artist_id = ? AND revoked_at IS NULL
      `,
      )
      .bind(input.createdAt, this.environment, input.artistId);
    const insert = this.db
      .prepare(
        `
        INSERT INTO artist_onboarding_claims (
          nonce, environment, artist_id, stripe_account_id, roster_revision,
          challenge_digest, challenge_failed_attempts, challenge_verified_at,
          challenge_locked_at, expires_at, consumed_at, created_by, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, NULL, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM artist_stripe_accounts
          WHERE artist_id = ? AND environment = ? AND stripe_account_id = ?
        )
      `,
      )
      .bind(
        input.nonce,
        this.environment,
        input.artistId,
        accountId,
        rosterRevision,
        input.challengeDigest,
        input.expiresAt,
        createdBy,
        input.createdAt,
        input.artistId,
        this.environment,
        accountId,
      );
    const accountUpdate = this.db
      .prepare(
        `
        UPDATE artist_stripe_accounts
        SET onboarding_status = 'INVITE_READY', updated_at = ?
        WHERE artist_id = ? AND environment = ? AND stripe_account_id = ?
          AND onboarding_status NOT IN ('PAYOUT_READY', 'DISABLED')
      `,
      )
      .bind(input.createdAt, input.artistId, this.environment, accountId);
    const results = await this.transaction([
      revoke,
      revokeSessions,
      insert,
      accountUpdate,
    ]);
    if (changes(results[2]) !== 1 || changes(results[3]) !== 1)
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Onboarding claim could not be bound to the artist recipient",
      );
  }

  async activateOnboardingSession(input: {
    claimNonce: string;
    sessionNonce: string;
    artistId: string;
    stripeAccountId: string;
    rosterRevision: string;
    challengeDigest: string;
    expiresAt: string;
    activatedAt: string;
    auditId: string;
    requestId: string | null;
  }): Promise<void> {
    await this.assertEnvironmentIdentity(input.activatedAt);
    assertSafeId(input.claimNonce, "Onboarding claim nonce");
    assertSafeId(input.sessionNonce, "Onboarding session nonce");
    assertSafeId(input.artistId, "Artist ID");
    assertSafeId(input.auditId, "Audit ID");
    const accountId = assertStripeObjectId(
      input.stripeAccountId,
      STRIPE_ACCOUNT_RE,
      "Stripe account ID",
    );
    const revision = boundedText(input.rosterRevision, 200, "Roster revision");
    if (!HMAC_SHA256_HEX_RE.test(input.challengeDigest)) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Onboarding challenge digest is malformed",
      );
    }
    assertInstant(input.expiresAt, "Onboarding session expiry");
    assertInstant(input.activatedAt, "Onboarding session activation time");
    if (input.expiresAt <= input.activatedAt)
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Onboarding session expiry must follow activation",
      );
    const consume = this.db
      .prepare(
        `
      UPDATE artist_onboarding_claims
      SET consumed_at = ?, challenge_verified_at = ?
      WHERE nonce = ? AND environment = ? AND artist_id = ?
        AND stripe_account_id = ? AND roster_revision = ?
        AND challenge_digest = ? AND challenge_failed_attempts < 5
        AND challenge_locked_at IS NULL
        AND consumed_at IS NULL AND expires_at > ?
    `,
      )
      .bind(
        input.activatedAt,
        input.activatedAt,
        input.claimNonce,
        this.environment,
        input.artistId,
        accountId,
        revision,
        input.challengeDigest,
        input.activatedAt,
      );
    const insert = this.db
      .prepare(
        `
      INSERT INTO artist_onboarding_sessions (
        nonce, environment, claim_nonce, artist_id, stripe_account_id,
        roster_revision, expires_at, link_created_at, revoked_at, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?
      WHERE EXISTS (
        SELECT 1 FROM artist_onboarding_claims c
        WHERE c.nonce = ? AND c.environment = ? AND c.artist_id = ?
          AND c.stripe_account_id = ? AND c.roster_revision = ?
          AND c.consumed_at = ? AND c.challenge_verified_at = ?
          AND NOT EXISTS (
            SELECT 1 FROM artist_onboarding_sessions s
            WHERE s.environment = c.environment AND s.claim_nonce = c.nonce
          )
      )
    `,
      )
      .bind(
        input.sessionNonce,
        this.environment,
        input.claimNonce,
        input.artistId,
        accountId,
        revision,
        input.expiresAt,
        input.activatedAt,
        input.claimNonce,
        this.environment,
        input.artistId,
        accountId,
        revision,
        input.activatedAt,
        input.activatedAt,
      );
    const accountUpdate = this.db
      .prepare(
        `
      UPDATE artist_stripe_accounts
      SET onboarding_status = 'ONBOARDING_STARTED', updated_at = ?
      WHERE artist_id = ? AND environment = ? AND stripe_account_id = ?
        AND onboarding_status NOT IN ('PAYOUT_READY', 'DISABLED')
        AND EXISTS (
          SELECT 1 FROM artist_onboarding_sessions s
          WHERE s.nonce = ? AND s.environment = ? AND s.claim_nonce = ?
            AND s.artist_id = ? AND s.stripe_account_id = ?
            AND s.created_at = ? AND s.revoked_at IS NULL
        )
    `,
      )
      .bind(
        input.activatedAt,
        input.artistId,
        this.environment,
        accountId,
        input.sessionNonce,
        this.environment,
        input.claimNonce,
        input.artistId,
        accountId,
        input.activatedAt,
      );
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.activatedAt,
        actor: "artist_onboarding_portal",
        action: "ARTIST_ONBOARDING_SESSION_STARTED",
        artistId: input.artistId,
        connectedAccountId: accountId,
        previousState: "INVITE_READY",
        newState: "ONBOARDING_STARTED",
        result: "SUCCESS",
        requestId: input.requestId,
        safeDetails: {
          claimNonce: input.claimNonce,
          sessionNonce: input.sessionNonce,
          outOfBandChallengeVerified: true,
        },
      },
      `EXISTS (
      SELECT 1 FROM artist_onboarding_sessions
      WHERE nonce = ? AND environment = ? AND revoked_at IS NULL
    )`,
      [input.sessionNonce, this.environment],
    );
    const results = await this.transaction([
      consume,
      insert,
      accountUpdate,
      audit,
    ]);
    if (results.some((result) => changes(result) !== 1)) {
      await this.db
        .prepare(
          `
          UPDATE artist_onboarding_claims
          SET challenge_failed_attempts = challenge_failed_attempts + 1,
            challenge_locked_at = CASE
              WHEN challenge_failed_attempts + 1 >= 5 THEN ?
              ELSE challenge_locked_at
            END
          WHERE nonce = ? AND environment = ? AND artist_id = ?
            AND stripe_account_id = ? AND roster_revision = ?
            AND challenge_digest <> ? AND challenge_failed_attempts < 5
            AND challenge_locked_at IS NULL
            AND consumed_at IS NULL AND expires_at > ?
        `,
        )
        .bind(
          input.activatedAt,
          input.claimNonce,
          this.environment,
          input.artistId,
          accountId,
          revision,
          input.challengeDigest,
          input.activatedAt,
        )
        .run();
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Onboarding invitation was already used, revoked, or no longer eligible",
      );
    }
  }

  async isOnboardingSessionActive(input: {
    sessionNonce: string;
    artistId: string;
    stripeAccountId: string;
    rosterRevision: string;
    now: string;
  }): Promise<boolean> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.sessionNonce, "Onboarding session nonce");
    assertSafeId(input.artistId, "Artist ID");
    assertInstant(input.now, "Onboarding session check time");
    const accountId = assertStripeObjectId(
      input.stripeAccountId,
      STRIPE_ACCOUNT_RE,
      "Stripe account ID",
    );
    const revision = boundedText(input.rosterRevision, 200, "Roster revision");
    const row = await this.db
      .prepare(
        `
      SELECT nonce FROM artist_onboarding_sessions
      WHERE nonce = ? AND environment = ? AND artist_id = ?
        AND stripe_account_id = ? AND roster_revision = ?
        AND revoked_at IS NULL AND expires_at > ?
    `,
      )
      .bind(
        input.sessionNonce,
        this.environment,
        input.artistId,
        accountId,
        revision,
        input.now,
      )
      .first<{ nonce: string }>();
    return row?.nonce === input.sessionNonce;
  }

  async recordOnboardingLinkCreated(input: {
    sessionNonce: string;
    artistId: string;
    stripeAccountId: string;
    createdAt: string;
    auditId: string;
    requestId: string | null;
  }): Promise<void> {
    await this.assertEnvironmentIdentity(input.createdAt);
    assertSafeId(input.sessionNonce, "Onboarding session nonce");
    assertSafeId(input.artistId, "Artist ID");
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.createdAt, "Onboarding link creation time");
    const accountId = assertStripeObjectId(
      input.stripeAccountId,
      STRIPE_ACCOUNT_RE,
      "Stripe account ID",
    );
    const sessionUpdate = this.db
      .prepare(
        `
      UPDATE artist_onboarding_sessions SET link_created_at = ?
      WHERE nonce = ? AND environment = ? AND artist_id = ?
        AND stripe_account_id = ? AND revoked_at IS NULL AND expires_at > ?
    `,
      )
      .bind(
        input.createdAt,
        input.sessionNonce,
        this.environment,
        input.artistId,
        accountId,
        input.createdAt,
      );
    const accountUpdate = this.db
      .prepare(
        `
      UPDATE artist_stripe_accounts SET onboarding_status = 'LINK_CREATED', updated_at = ?
      WHERE artist_id = ? AND environment = ? AND stripe_account_id = ?
        AND onboarding_status NOT IN ('PAYOUT_READY', 'DISABLED')
    `,
      )
      .bind(input.createdAt, input.artistId, this.environment, accountId);
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.createdAt,
        actor: "artist_onboarding_portal",
        action: "STRIPE_ONBOARDING_LINK_CREATED",
        artistId: input.artistId,
        connectedAccountId: accountId,
        previousState: "ONBOARDING_STARTED",
        newState: "LINK_CREATED",
        result: "SUCCESS",
        requestId: input.requestId,
        safeDetails: {
          sessionNonce: input.sessionNonce,
          rawLinkPersisted: false,
        },
      },
      `EXISTS (
      SELECT 1 FROM artist_onboarding_sessions WHERE nonce = ? AND environment = ?
        AND link_created_at = ? AND revoked_at IS NULL
    )`,
      [input.sessionNonce, this.environment, input.createdAt],
    );
    const results = await this.transaction([
      sessionUpdate,
      accountUpdate,
      audit,
    ]);
    if (results.some((result) => changes(result) !== 1))
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Onboarding session was revoked or expired before link creation",
      );
  }

  async revokeArtistOnboardingSessions(input: {
    artistId: string;
    revokedAt: string;
  }): Promise<void> {
    await this.assertEnvironmentIdentity(input.revokedAt);
    assertSafeId(input.artistId, "Artist ID");
    assertInstant(input.revokedAt, "Onboarding session revocation time");
    await this.db
      .prepare(
        `
      UPDATE artist_onboarding_sessions SET revoked_at = ?
      WHERE environment = ? AND artist_id = ? AND revoked_at IS NULL
    `,
      )
      .bind(input.revokedAt, this.environment, input.artistId)
      .run();
  }

  async getArtistAccountByStripeAccount(
    stripeAccountId: string,
  ): Promise<ArtistAccountRecord | null> {
    await this.ensureEnvironmentIdentity();
    if (!isStripeAccountId(stripeAccountId)) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Connected account ID is malformed",
      );
    }
    const row = await this.db
      .prepare(
        "SELECT * FROM artist_stripe_accounts WHERE stripe_account_id = ? AND environment = ?",
      )
      .bind(stripeAccountId, this.environment)
      .first<ArtistAccountRow>();
    return row ? mapArtist(row) : null;
  }

  async upsertArtistAccount(
    input: ArtistAccountWrite,
  ): Promise<ArtistAccountRecord> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.artistId, "Artist ID");
    if (!isStripeAccountId(input.stripeAccountId)) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Connected account ID is malformed",
      );
    }
    assertInstant(input.now, "Account update time");
    if (input.lastRequirementsCheckAt)
      assertInstant(input.lastRequirementsCheckAt, "Requirements check time");
    if (input.onboardedAt) assertInstant(input.onboardedAt, "Onboarded time");
    const displayName = boundedText(
      input.artistDisplayName,
      160,
      "Artist display name",
    );
    const requirements = boundedText(
      input.requirementsStatus,
      80,
      "Requirements status",
    );
    const transfers = boundedText(
      input.transfersStatus,
      80,
      "Transfers status",
    );
    const payouts = boundedText(input.payoutsStatus, 80, "Payouts status");
    const payoutDestinationId = input.payoutDestinationId
      ? assertStripeObjectId(
          input.payoutDestinationId,
          STRIPE_BANK_ACCOUNT_RE,
          "Stripe payout destination ID",
        )
      : null;
    if (input.payoutReadyApprovedAt)
      assertInstant(
        input.payoutReadyApprovedAt,
        "Payout readiness approval time",
      );
    if (
      input.onboardingStatus === "PAYOUT_READY" &&
      (!input.automaticPayoutsEnabled ||
        !payoutDestinationId ||
        !input.payoutReadyApprovedAt)
    ) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Payout-ready status requires automatic payouts, a bank destination, and owner approval",
      );
    }
    if (
      input.onboardingStatus !== "PAYOUT_READY" &&
      input.payoutReadyApprovedAt !== null
    ) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Only a payout-ready account can retain payout approval",
      );
    }
    const preferredPayoutType = input.automaticPayoutsEnabled
      ? "automatic_standard"
      : "unverified";
    const disabledReason = input.disabledReason
      ? boundedText(input.disabledReason, 240, "Disabled reason")
      : null;
    const existing = await this.getArtistAccount(input.artistId);
    if (existing && existing.stripeAccountId !== input.stripeAccountId) {
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Artist account identity cannot be replaced by a status refresh",
      );
    }

    const write = this.db
      .prepare(
        `
        INSERT INTO artist_stripe_accounts (
          artist_id, environment, stripe_account_id, artist_display_name,
          onboarding_status, requirements_status, transfers_status, payouts_status,
          dashboard_type, preferred_payout_type, payout_destination_id,
          payout_ready_approved_at, last_requirements_check_at,
          onboarded_at, disabled_reason, payout_exception_flag, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'express', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(artist_id, environment) DO UPDATE SET
          stripe_account_id = excluded.stripe_account_id,
          artist_display_name = excluded.artist_display_name,
          onboarding_status = excluded.onboarding_status,
          requirements_status = excluded.requirements_status,
          transfers_status = excluded.transfers_status,
          payouts_status = excluded.payouts_status,
          preferred_payout_type = excluded.preferred_payout_type,
          payout_destination_id = excluded.payout_destination_id,
          payout_ready_approved_at = excluded.payout_ready_approved_at,
          last_requirements_check_at = excluded.last_requirements_check_at,
          onboarded_at = COALESCE(artist_stripe_accounts.onboarded_at, excluded.onboarded_at),
          disabled_reason = excluded.disabled_reason,
          payout_exception_flag = excluded.payout_exception_flag,
          updated_at = excluded.updated_at
      `,
      )
      .bind(
        input.artistId,
        this.environment,
        input.stripeAccountId,
        displayName,
        input.onboardingStatus,
        requirements,
        transfers,
        payouts,
        preferredPayoutType,
        payoutDestinationId,
        input.payoutReadyApprovedAt,
        input.lastRequirementsCheckAt,
        input.onboardedAt,
        disabledReason,
        input.payoutExceptionFlag ? 1 : 0,
        input.now,
        input.now,
      );
    const statusChanged =
      !existing ||
      existing.onboardingStatus !== input.onboardingStatus ||
      existing.requirementsStatus !== requirements ||
      existing.transfersStatus !== transfers ||
      existing.payoutsStatus !== payouts ||
      existing.preferredPayoutType !== preferredPayoutType ||
      existing.payoutDestinationId !== payoutDestinationId ||
      existing.payoutReadyApprovedAt !== input.payoutReadyApprovedAt ||
      existing.disabledReason !== disabledReason ||
      existing.payoutExceptionFlag !== input.payoutExceptionFlag;
    const revokeSessions = ["PAYOUT_READY", "DISABLED"].includes(
      input.onboardingStatus,
    )
      ? this.db
          .prepare(
            `
            UPDATE artist_onboarding_sessions SET revoked_at = ?
            WHERE environment = ? AND artist_id = ? AND revoked_at IS NULL
          `,
          )
          .bind(input.now, this.environment, input.artistId)
      : null;
    if (statusChanged) {
      const auditId = input.auditId ?? operationalRepositoryId("audit_account");
      assertSafeId(auditId, "Account status audit ID");
      const actor = boundedText(
        input.auditActor ?? "stripe_authoritative_account_refresh",
        254,
        "Account status actor",
      );
      const statements = [
        write,
        this.auditStatement({
          auditId,
          timestamp: input.now,
          actor,
          action: existing
            ? "STRIPE_RECIPIENT_STATUS_CHANGED"
            : "STRIPE_RECIPIENT_STATUS_CREATED",
          artistId: input.artistId,
          connectedAccountId: input.stripeAccountId,
          previousState: existing?.onboardingStatus ?? null,
          newState: input.onboardingStatus,
          result: "SUCCESS",
          requestId: input.auditRequestId ?? null,
          safeDetails: {
            previousRequirements: existing?.requirementsStatus ?? null,
            newRequirements: requirements,
            previousTransfers: existing?.transfersStatus ?? null,
            newTransfers: transfers,
            previousPayouts: existing?.payoutsStatus ?? null,
            newPayouts: payouts,
            previousPreferredPayoutType: existing?.preferredPayoutType ?? null,
            newPreferredPayoutType: preferredPayoutType,
            previousPayoutDestinationId: existing?.payoutDestinationId ?? null,
            newPayoutDestinationId: payoutDestinationId,
            previousPayoutReadyApprovedAt:
              existing?.payoutReadyApprovedAt ?? null,
            newPayoutReadyApprovedAt: input.payoutReadyApprovedAt,
            previousDisabledReason: existing?.disabledReason ?? null,
            newDisabledReason: disabledReason,
          },
        }),
      ];
      if (revokeSessions) statements.push(revokeSessions);
      await this.transaction(statements);
    } else if (revokeSessions) {
      await this.transaction([write, revokeSessions]);
    } else {
      await write.run();
    }

    const stored = await this.getArtistAccount(input.artistId);
    if (!stored || stored.stripeAccountId !== input.stripeAccountId) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Artist account write did not persist the requested identity",
      );
    }
    return stored;
  }

  async activateArtistPayoutAccount(input: {
    artistId: string;
    stripeAccountId: string;
    rosterRevision: string;
    verificationId: string;
    identityEvidenceReference: string;
    actor: string;
    auditId: string;
    requestId: string | null;
    nextBatchEligibilityDate: string;
    now: string;
  }): Promise<ArtistAccountRecord> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.artistId, "Artist ID");
    const accountId = assertStripeObjectId(
      input.stripeAccountId,
      STRIPE_ACCOUNT_RE,
      "Stripe account ID",
    );
    const revision = boundedText(input.rosterRevision, 200, "Roster revision");
    assertSafeId(input.verificationId, "Payee identity verification ID");
    const identityEvidenceReference = boundedText(
      input.identityEvidenceReference,
      120,
      "Payee identity evidence reference",
    );
    if (
      !isSafeBusinessId(identityEvidenceReference) ||
      identityEvidenceReference.length < 8
    ) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Payee identity evidence reference is too short",
      );
    }
    const actor = boundedText(input.actor, 254, "Payout activation actor");
    assertSafeId(input.auditId, "Payout activation audit ID");
    assertInstant(input.now, "Payout activation time");
    if (!isIsoDate(input.nextBatchEligibilityDate)) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Next payout eligibility date is malformed",
      );
    }
    const existing = await this.getArtistAccount(input.artistId);
    if (!existing || existing.stripeAccountId !== accountId)
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Artist payout account was not found",
      );
    if (existing.onboardingStatus === "PAYOUT_READY")
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Artist payout account is already active",
      );
    const update = this.db
      .prepare(
        `
        UPDATE artist_stripe_accounts
        SET onboarding_status = 'PAYOUT_READY', payout_exception_flag = 0,
          disabled_reason = NULL, onboarded_at = COALESCE(onboarded_at, ?),
          payout_ready_approved_at = ?, updated_at = ?
        WHERE artist_id = ? AND environment = ? AND stripe_account_id = ?
          AND onboarding_status NOT IN ('PAYOUT_READY', 'DISABLED', 'RESTRICTED')
          AND requirements_status = 'complete'
          AND transfers_status = 'active' AND payouts_status = 'active'
          AND preferred_payout_type = 'automatic_standard'
          AND payout_destination_id IS NOT NULL
          AND disabled_reason IS NULL
      `,
      )
      .bind(
        input.now,
        input.now,
        input.now,
        input.artistId,
        this.environment,
        accountId,
      );
    const identityVerification = this.db
      .prepare(
        `
        INSERT INTO artist_payee_identity_verifications (
          verification_id, environment, artist_id, stripe_account_id,
          roster_revision, payout_destination_id, verified_by,
          evidence_reference, verified_at
        )
        SELECT ?, ?, artist_id, stripe_account_id, ?, payout_destination_id,
          ?, ?, ?
        FROM artist_stripe_accounts
        WHERE artist_id = ? AND environment = ? AND stripe_account_id = ?
          AND onboarding_status = 'PAYOUT_READY' AND updated_at = ?
          AND payout_destination_id IS NOT NULL
      `,
      )
      .bind(
        input.verificationId,
        this.environment,
        revision,
        actor,
        identityEvidenceReference,
        input.now,
        input.artistId,
        this.environment,
        accountId,
        input.now,
      );
    const revoke = this.db
      .prepare(
        `
        UPDATE artist_onboarding_sessions SET revoked_at = ?
        WHERE environment = ? AND artist_id = ? AND revoked_at IS NULL
          AND EXISTS (
            SELECT 1 FROM artist_stripe_accounts a
            WHERE a.artist_id = artist_onboarding_sessions.artist_id
              AND a.environment = artist_onboarding_sessions.environment
              AND a.onboarding_status = 'PAYOUT_READY' AND a.updated_at = ?
          )
      `,
      )
      .bind(input.now, this.environment, input.artistId, input.now);
    const rollReadyLedgers = this.db
      .prepare(
        `
        UPDATE artist_payment_ledger
        SET batch_eligibility_date = ?, updated_at = ?
        WHERE environment = ? AND artist_id = ?
          AND stripe_connected_account_id = ?
          AND state = 'READY_FOR_OWNER_APPROVAL' AND batch_id IS NULL
          AND manual_payment_claim_token IS NULL
          AND manual_payment_recorded_at IS NULL
          AND (
            batch_eligibility_date IS NULL OR batch_eligibility_date < ?
          )
          AND EXISTS (
            SELECT 1 FROM artist_stripe_accounts a
            WHERE a.artist_id = artist_payment_ledger.artist_id
              AND a.environment = artist_payment_ledger.environment
              AND a.onboarding_status = 'PAYOUT_READY' AND a.updated_at = ?
          )
      `,
      )
      .bind(
        input.nextBatchEligibilityDate,
        input.now,
        this.environment,
        input.artistId,
        accountId,
        input.nextBatchEligibilityDate,
        input.now,
      );
    const resolvePreviewExceptions = this.db
      .prepare(
        `
        UPDATE payout_exceptions
        SET status = 'RESOLVED', resolved_at = ?, resolved_by = ?,
          resolution_evidence = 'Owner reactivated the exact Stripe recipient and payout destination.'
        WHERE environment = ? AND artist_id = ?
          AND exception_type = 'RECIPIENT_BATCH_PREVIEW'
          AND status IN ('OPEN', 'ACKNOWLEDGED')
          AND EXISTS (
            SELECT 1 FROM artist_stripe_accounts a
            WHERE a.artist_id = payout_exceptions.artist_id
              AND a.environment = payout_exceptions.environment
              AND a.onboarding_status = 'PAYOUT_READY' AND a.updated_at = ?
          )
      `,
      )
      .bind(input.now, actor, this.environment, input.artistId, input.now);
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: "ARTIST_PAYOUT_IDENTITY_OWNER_ACTIVATED",
        artistId: input.artistId,
        connectedAccountId: accountId,
        previousState: existing.onboardingStatus,
        newState: "PAYOUT_READY",
        result: "SUCCESS",
        requestId: input.requestId,
        safeDetails: {
          rosterRevision: revision,
          nextBatchEligibilityDate: input.nextBatchEligibilityDate,
          payeeLegalIdentityVerified: true,
          identityVerificationId: input.verificationId,
          identityEvidenceReference,
        },
      },
      `EXISTS (
        SELECT 1 FROM artist_stripe_accounts
        WHERE artist_id = ? AND environment = ? AND stripe_account_id = ?
          AND onboarding_status = 'PAYOUT_READY' AND updated_at = ?
          AND EXISTS (
            SELECT 1 FROM artist_payee_identity_verifications v
            WHERE v.verification_id = ? AND v.environment = ?
              AND v.artist_id = artist_stripe_accounts.artist_id
              AND v.stripe_account_id = artist_stripe_accounts.stripe_account_id
          )
      )`,
      [
        input.artistId,
        this.environment,
        accountId,
        input.now,
        input.verificationId,
        this.environment,
      ],
    );
    const results = await this.transaction([
      update,
      identityVerification,
      rollReadyLedgers,
      resolvePreviewExceptions,
      revoke,
      audit,
    ]);
    if (
      changes(results[0]) !== 1 ||
      changes(results[1]) !== 1 ||
      changes(results[5]) !== 1
    )
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Artist payout activation requires exact Stripe-ready status",
      );
    const stored = await this.getArtistAccount(input.artistId);
    if (!stored || stored.onboardingStatus !== "PAYOUT_READY")
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Artist payout activation could not be read back",
      );
    return stored;
  }

  async getLedger(ledgerId: string): Promise<LedgerRecord | null> {
    await this.ensureEnvironmentIdentity();
    assertSafeId(ledgerId, "Ledger ID");
    const row = await this.db
      .prepare(
        "SELECT * FROM artist_payment_ledger WHERE ledger_id = ? AND environment = ?",
      )
      .bind(ledgerId, this.environment)
      .first<LedgerRow>();
    return row ? mapLedger(row) : null;
  }

  async getLedgerByAssignment(
    assignmentId: string,
  ): Promise<LedgerRecord | null> {
    await this.ensureEnvironmentIdentity();
    assertSafeId(assignmentId, "Assignment ID");
    const row = await this.db
      .prepare(
        "SELECT * FROM artist_payment_ledger WHERE assignment_id = ? AND environment = ?",
      )
      .bind(assignmentId, this.environment)
      .first<LedgerRow>();
    return row ? mapLedger(row) : null;
  }

  async getLedgerByTransferId(
    stripeTransferId: string,
  ): Promise<LedgerRecord | null> {
    await this.ensureEnvironmentIdentity();
    const transferId = assertStripeObjectId(
      stripeTransferId,
      STRIPE_TRANSFER_RE,
      "Stripe transfer ID",
    );
    const row = await this.db
      .prepare(
        `
        SELECT * FROM artist_payment_ledger
        WHERE stripe_transfer_id = ? AND environment = ?
      `,
      )
      .bind(transferId, this.environment)
      .first<LedgerRow>();
    return row ? mapLedger(row) : null;
  }

  async listUnreconciledLedgersForAccount(
    stripeAccountId: string,
    limit = 250,
    afterLedgerId: string | null = null,
  ): Promise<LedgerRecord[]> {
    await this.ensureEnvironmentIdentity();
    if (!isStripeAccountId(stripeAccountId)) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Connected account ID is malformed",
      );
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Unreconciled ledger limit must be between 1 and 500",
      );
    }
    if (afterLedgerId !== null) {
      assertSafeId(afterLedgerId, "Unreconciled ledger cursor");
    }
    const result = await this.db
      .prepare(
        `
        SELECT * FROM artist_payment_ledger
        WHERE stripe_connected_account_id = ? AND environment = ?
          AND reconciled = 0
          AND (? IS NULL OR ledger_id > ?)
          AND state IN (
            'TRANSFER_CREATED', 'TRANSFER_PENDING', 'TRANSFER_COMPLETED',
            'PAYOUT_PENDING', 'PAYOUT_FAILED', 'PAID'
          )
        ORDER BY ledger_id ASC LIMIT ?
      `,
      )
      .bind(
        stripeAccountId,
        this.environment,
        afterLedgerId,
        afterLedgerId,
        limit,
      )
      .all<LedgerRow>();
    return (result.results ?? []).map(mapLedger);
  }

  async upsertLedger(input: LedgerUpsertInput): Promise<LedgerUpsertResult> {
    await this.assertEnvironmentIdentity(input.now);
    const draft = normalizeDraft(input.draft);
    if (!LEDGER_INTAKE_STATES.includes(input.state)) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Ledger intake cannot enter an execution or paid state",
      );
    }
    if (draft.environment !== this.environment) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Ledger environment does not match repository environment",
      );
    }
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.now, "Ledger update time");
    if (input.batchEligibilityDate && !isIsoDate(input.batchEligibilityDate)) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Batch eligibility date is malformed",
      );
    }
    const closeoutStatus = boundedText(
      input.closeoutStatus,
      80,
      "Closeout status",
    );
    const paymentMemo = boundedText(input.paymentMemo, 240, "Payment memo");
    const actor = boundedText(input.actor, 254, "Actor");
    const materialDigest = await digestLedgerMaterial(draft);
    const closeoutJson = JSON.stringify(draft.closeout);
    const existing = await this.getLedgerByAssignment(draft.assignmentId);

    if (!existing) {
      const statements = [
        this.db
          .prepare(
            `
            INSERT INTO artist_payment_ledger (
              ledger_id, environment, booking_id, assignment_id, crm_record_id, crm_revision,
              artist_id, artist_name, event_name,
              event_date, closeout_verified_at, service, service_pay_cents, travel_pay_cents, bonus_cents,
              adjustment_cents, deduction_cents, total_approved_pay_cents, material_digest,
              closeout_controls_json, closeout_status, state, source_revision,
              owner_approval_status, owner_approval_revision, batch_eligibility_date,
              stripe_connected_account_id, payment_memo, reconciled, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              'NOT_REVIEWED', 0, ?, ?, ?, 0, ?, ?)
          `,
          )
          .bind(
            draft.ledgerId,
            this.environment,
            draft.bookingId,
            draft.assignmentId,
            draft.crmRecordId,
            draft.crmRevision,
            draft.artistId,
            draft.artistName,
            draft.eventName,
            draft.eventDate,
            draft.closeoutVerifiedAt,
            draft.service,
            draft.servicePayCents,
            draft.travelPayCents,
            draft.bonusCents,
            draft.adjustmentCents,
            draft.deductionCents,
            draft.totalApprovedPayCents,
            materialDigest,
            closeoutJson,
            closeoutStatus,
            input.state,
            draft.sourceRevision,
            input.batchEligibilityDate,
            draft.connectedAccountId,
            paymentMemo,
            input.now,
            input.now,
          ),
        this.auditStatement({
          auditId: input.auditId,
          timestamp: input.now,
          actor,
          action: "LEDGER_CREATED",
          bookingId: draft.bookingId,
          assignmentId: draft.assignmentId,
          artistId: draft.artistId,
          amountCents: draft.totalApprovedPayCents,
          currency: "usd",
          connectedAccountId: draft.connectedAccountId,
          previousState: null,
          newState: input.state,
          approvalRevision: 0,
          result: "SUCCESS",
          requestId: input.requestId,
          safeDetails: { sourceRevision: draft.sourceRevision, materialDigest },
        }),
      ];
      const results = await this.transaction(statements);
      if (changes(results[0]) !== 1 || changes(results[1]) !== 1) {
        throw new PayoutRepositoryError(
          "CONFLICT",
          "Ledger creation lost an identity or audit race",
        );
      }
      const record = await this.getLedger(draft.ledgerId);
      if (!record)
        throw new PayoutRepositoryError(
          "DATA_INTEGRITY",
          "Created ledger could not be read back",
        );
      return { record, created: true, approvalInvalidated: false };
    }

    if (existing.ledgerId !== draft.ledgerId) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Assignment is already bound to a different ledger ID",
      );
    }
    if (draft.sourceRevision < existing.sourceRevision) {
      throw new PayoutRepositoryError(
        "STALE_REVISION",
        "Incoming source revision is older than the stored ledger",
      );
    }
    if (draft.sourceRevision === existing.sourceRevision) {
      if (
        existing.materialDigest !== materialDigest ||
        existing.paymentMemo !== paymentMemo
      ) {
        throw new PayoutRepositoryError(
          "STALE_REVISION",
          "Material ledger data changed without a new source revision",
        );
      }
      if (JSON.stringify(existing.closeout) === closeoutJson) {
        return { record: existing, created: false, approvalInvalidated: false };
      }
      const refresh = this.db
        .prepare(
          `
          UPDATE artist_payment_ledger SET
            closeout_controls_json = ?, closeout_status = ?, state = ?,
            batch_eligibility_date = ?, failure_code = NULL,
            failure_reason = NULL, updated_at = ?
          WHERE ledger_id = ? AND assignment_id = ? AND environment = ?
            AND source_revision = ? AND material_digest = ? AND payment_memo = ?
            AND batch_id IS NULL AND stripe_transfer_id IS NULL
            AND stripe_destination_payment_id IS NULL
            AND manual_payment_recorded_at IS NULL
            AND manual_payment_claim_token IS NULL
            AND owner_approval_status IN ('NOT_REVIEWED', 'INVALIDATED')
            AND state IN ('NOT_ELIGIBLE', 'CLOSEOUT_PENDING', 'ISSUE_REVIEW',
                          'READY_FOR_OWNER_APPROVAL')
        `,
        )
        .bind(
          closeoutJson,
          closeoutStatus,
          input.state,
          input.batchEligibilityDate,
          input.now,
          draft.ledgerId,
          draft.assignmentId,
          this.environment,
          draft.sourceRevision,
          materialDigest,
          paymentMemo,
        );
      const audit = this.auditStatement(
        {
          auditId: input.auditId,
          timestamp: input.now,
          actor,
          action: "LEDGER_STRIPE_READINESS_REFRESHED",
          bookingId: draft.bookingId,
          assignmentId: draft.assignmentId,
          artistId: draft.artistId,
          amountCents: draft.totalApprovedPayCents,
          currency: "usd",
          connectedAccountId: draft.connectedAccountId,
          previousState: existing.state,
          newState: input.state,
          approvalRevision: existing.ownerApprovalRevision,
          result: "SUCCESS",
          requestId: input.requestId,
          safeDetails: {
            sourceRevision: draft.sourceRevision,
            finalControlClearedAt: input.now,
          },
        },
        `EXISTS (
          SELECT 1 FROM artist_payment_ledger
          WHERE ledger_id = ? AND environment = ? AND source_revision = ?
            AND material_digest = ? AND closeout_controls_json = ?
            AND updated_at = ?
        )`,
        [
          draft.ledgerId,
          this.environment,
          draft.sourceRevision,
          materialDigest,
          closeoutJson,
          input.now,
        ],
      );
      const results = await this.transaction([refresh, audit]);
      if (changes(results[0]) !== 1 || changes(results[1]) !== 1) {
        throw new PayoutRepositoryError(
          "CONFLICT",
          "Stripe readiness refresh lost an atomic ledger race",
        );
      }
      const record = await this.getLedger(draft.ledgerId);
      if (!record)
        throw new PayoutRepositoryError(
          "DATA_INTEGRITY",
          "Stripe readiness refresh could not be read back",
        );
      return { record, created: false, approvalInvalidated: false };
    }
    if (
      existing.manualPaymentRecordedAt !== null ||
      existing.manualPaymentClaimToken !== null
    ) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "A durable manual-payment intent must be reconciled before source revision changes",
      );
    }
    const sourceChangeRecovery =
      existing.state === "MANUAL_REVIEW" &&
      existing.failureCode === "AUTHORITATIVE_SOURCE_CHANGED" &&
      existing.stripeTransferId === null &&
      existing.stripeDestinationPaymentId === null &&
      existing.reconciled === false;
    if (
      !PRE_TRANSFER_STATES.includes(existing.state) &&
      !sourceChangeRecovery
    ) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "A new source revision cannot overwrite a ledger after transfer execution has begun",
      );
    }

    const approvalInvalidated =
      existing.approvalDigest !== null ||
      existing.state === "OWNER_APPROVED" ||
      sourceChangeRecovery;
    if (
      approvalInvalidated &&
      draft.sourceRevision !== existing.sourceRevision + 1
    ) {
      throw new PayoutRepositoryError(
        "STALE_REVISION",
        "An approved ledger must be invalidated by exactly the next source revision",
      );
    }
    const update = this.db
      .prepare(
        `
        UPDATE artist_payment_ledger SET
          booking_id = ?, crm_record_id = ?, crm_revision = ?, artist_id = ?, artist_name = ?, event_name = ?, event_date = ?, closeout_verified_at = ?, service = ?,
          service_pay_cents = ?, travel_pay_cents = ?, bonus_cents = ?, adjustment_cents = ?,
          deduction_cents = ?, total_approved_pay_cents = ?, material_digest = ?,
          closeout_controls_json = ?, closeout_status = ?, state = ?, source_revision = ?,
          owner_approval_status = ?, approval_digest = NULL, approved_by = NULL,
          approval_timestamp = NULL, batch_eligibility_date = ?, batch_id = NULL,
          crm_reconciled_revision = NULL, crm_correction_required = 0,
          stripe_connected_account_id = ?, payment_memo = ?, failure_code = NULL,
          failure_reason = NULL, updated_at = ?
        WHERE ledger_id = ? AND assignment_id = ? AND environment = ?
          AND source_revision = ?
          AND manual_payment_recorded_at IS NULL
          AND manual_payment_claim_token IS NULL
          AND state IN ('NOT_ELIGIBLE', 'CLOSEOUT_PENDING', 'ISSUE_REVIEW',
                        'READY_FOR_OWNER_APPROVAL', 'OWNER_APPROVED', 'MANUAL_REVIEW')
          AND (state <> 'MANUAL_REVIEW' OR (
            failure_code = 'AUTHORITATIVE_SOURCE_CHANGED'
            AND stripe_transfer_id IS NULL AND stripe_destination_payment_id IS NULL
            AND reconciled = 0
          ))
      `,
      )
      .bind(
        draft.bookingId,
        draft.crmRecordId,
        draft.crmRevision,
        draft.artistId,
        draft.artistName,
        draft.eventName,
        draft.eventDate,
        draft.closeoutVerifiedAt,
        draft.service,
        draft.servicePayCents,
        draft.travelPayCents,
        draft.bonusCents,
        draft.adjustmentCents,
        draft.deductionCents,
        draft.totalApprovedPayCents,
        materialDigest,
        closeoutJson,
        closeoutStatus,
        input.state,
        draft.sourceRevision,
        approvalInvalidated ? "INVALIDATED" : "NOT_REVIEWED",
        input.batchEligibilityDate,
        draft.connectedAccountId,
        paymentMemo,
        input.now,
        draft.ledgerId,
        draft.assignmentId,
        this.environment,
        existing.sourceRevision,
      );
    const statements: D1PreparedStatement[] = [update];
    if (existing.batchId) {
      statements.push(
        this.db
          .prepare(
            `
            UPDATE payout_batches SET status = 'BLOCKED',
              blocked_item_count = item_count, updated_at = ?
            WHERE batch_id = ? AND environment = ?
              AND EXISTS (
                SELECT 1 FROM artist_payment_ledger
                WHERE ledger_id = ? AND environment = ? AND source_revision = ? AND updated_at = ?
              )
              AND status IN ('PREPARED', 'OWNER_APPROVED')
          `,
          )
          .bind(
            input.now,
            existing.batchId,
            this.environment,
            draft.ledgerId,
            this.environment,
            draft.sourceRevision,
            input.now,
          ),
        this.db
          .prepare(
            `
            UPDATE payout_batch_items SET item_status = 'BLOCKED',
              failure_code = 'SOURCE_REVISION_CHANGED',
              failure_reason = 'Ledger source revision changed after batch preparation', updated_at = ?
            WHERE batch_id = ? AND ledger_id = ? AND environment = ?
              AND EXISTS (
                SELECT 1 FROM artist_payment_ledger
                WHERE ledger_id = ? AND environment = ? AND source_revision = ? AND updated_at = ?
              )
          `,
          )
          .bind(
            input.now,
            existing.batchId,
            draft.ledgerId,
            this.environment,
            draft.ledgerId,
            this.environment,
            draft.sourceRevision,
            input.now,
          ),
      );
    }
    statements.push(
      this.auditStatement(
        {
          auditId: input.auditId,
          timestamp: input.now,
          actor,
          action: approvalInvalidated
            ? "LEDGER_REVISION_APPROVAL_INVALIDATED"
            : "LEDGER_REVISION_UPDATED",
          bookingId: draft.bookingId,
          assignmentId: draft.assignmentId,
          artistId: draft.artistId,
          amountCents: draft.totalApprovedPayCents,
          currency: "usd",
          connectedAccountId: draft.connectedAccountId,
          previousState: existing.state,
          newState: input.state,
          approvalRevision: existing.ownerApprovalRevision,
          result: "SUCCESS",
          requestId: input.requestId,
          batchId: existing.batchId,
          safeDetails: {
            previousSourceRevision: existing.sourceRevision,
            sourceRevision: draft.sourceRevision,
            materialDigest,
          },
        },
        `EXISTS (
        SELECT 1 FROM artist_payment_ledger
        WHERE ledger_id = ? AND environment = ? AND source_revision = ? AND updated_at = ?
      )`,
        [draft.ledgerId, this.environment, draft.sourceRevision, input.now],
      ),
    );
    const results = await this.transaction(statements);
    if (
      changes(results[0]) !== 1 ||
      changes(results[results.length - 1]) !== 1
    ) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Ledger revision update lost an atomic race",
      );
    }
    const record = await this.getLedger(draft.ledgerId);
    if (!record)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Updated ledger could not be read back",
      );
    return { record, created: false, approvalInvalidated };
  }

  async listReadyLedgers(
    scheduledDate: string,
    limit = MAX_PAYOUT_BATCH_ASSIGNMENTS,
  ): Promise<{
    ledgers: LedgerRecord[];
    totalCandidateCount: number;
    remainingCandidateCount: number;
  }> {
    await this.ensureEnvironmentIdentity();
    if (!isIsoDate(scheduledDate))
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Scheduled date is malformed",
      );
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > MAX_PAYOUT_BATCH_ASSIGNMENTS
    ) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        `Ledger list limit must be between 1 and ${MAX_PAYOUT_BATCH_ASSIGNMENTS}`,
      );
    }
    const result = await this.db
      .prepare(
        `
        SELECT l.*, COUNT(*) OVER () AS total_candidate_count
        FROM artist_payment_ledger l
        JOIN artist_stripe_accounts a
          ON a.environment = l.environment
          AND a.artist_id = l.artist_id
          AND a.stripe_account_id = l.stripe_connected_account_id
        WHERE l.environment = ? AND l.state = 'READY_FOR_OWNER_APPROVAL'
          AND l.batch_id IS NULL AND l.batch_eligibility_date IS NOT NULL
          AND l.manual_payment_claim_token IS NULL
          AND l.manual_payment_recorded_at IS NULL
          AND l.batch_eligibility_date <= ?
          AND a.onboarding_status = 'PAYOUT_READY'
          AND a.requirements_status = 'complete'
          AND a.transfers_status = 'active'
          AND a.payouts_status = 'active'
          AND a.preferred_payout_type = 'automatic_standard'
          AND a.payout_destination_id IS NOT NULL
          AND a.payout_ready_approved_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM payout_exceptions e
            WHERE e.environment = l.environment AND e.ledger_id = l.ledger_id
              AND e.exception_type = 'RECIPIENT_BATCH_PREVIEW'
              AND e.status IN ('OPEN', 'ACKNOWLEDGED')
          )
        ORDER BY l.batch_eligibility_date, l.event_date, l.assignment_id
        LIMIT ?
      `,
      )
      .bind(this.environment, scheduledDate, limit)
      .all<LedgerRow & { total_candidate_count: number }>();
    const rows = result.results ?? [];
    const totalCandidateCount = Number(rows[0]?.total_candidate_count ?? 0);
    return {
      ledgers: rows.map(mapLedger),
      totalCandidateCount,
      remainingCandidateCount: Math.max(0, totalCandidateCount - rows.length),
    };
  }

  async prepareBatch(input: {
    batchId: string;
    scheduledDate: string;
    ledgerIds: string[];
    blockedItemCount: number;
    blockedExceptionIds: string[];
    remainingCandidateCount: number;
    createdBy: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<{
    batch: PayoutBatchRecord;
    snapshot: BatchApprovalSnapshot;
    approvalDigest: string;
  }> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.batchId, "Batch ID");
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.now, "Batch creation time");
    if (!isIsoDate(input.scheduledDate)) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Scheduled date is malformed",
      );
    }
    if (
      !Array.isArray(input.ledgerIds) ||
      input.ledgerIds.length < 1 ||
      input.ledgerIds.length > MAX_PAYOUT_BATCH_ASSIGNMENTS
    ) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        `A batch must contain between 1 and ${MAX_PAYOUT_BATCH_ASSIGNMENTS} ledgers`,
      );
    }
    if (
      !Number.isSafeInteger(input.blockedItemCount) ||
      input.blockedItemCount < 0 ||
      input.blockedItemCount + input.ledgerIds.length >
        MAX_PAYOUT_BATCH_ASSIGNMENTS
    ) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        `Prepared and blocked candidates must fit the ${MAX_PAYOUT_BATCH_ASSIGNMENTS}-item D1-safe review bound`,
      );
    }
    if (
      !Number.isSafeInteger(input.remainingCandidateCount) ||
      input.remainingCandidateCount < 0
    ) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Remaining candidate count must be a non-negative safe integer",
      );
    }
    if (
      !Array.isArray(input.blockedExceptionIds) ||
      input.blockedExceptionIds.length !== input.blockedItemCount ||
      new Set(input.blockedExceptionIds).size !==
        input.blockedExceptionIds.length
    ) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Blocked candidates must map one-to-one to unique open exceptions",
      );
    }
    input.blockedExceptionIds.forEach((id) =>
      assertSafeId(id, "Blocked exception ID"),
    );
    const uniqueLedgerIds = [...new Set(input.ledgerIds)];
    if (uniqueLedgerIds.length !== input.ledgerIds.length) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "A batch cannot contain duplicate ledger IDs",
      );
    }
    uniqueLedgerIds.forEach((id) => assertSafeId(id, "Ledger ID"));
    const createdBy = boundedText(input.createdBy, 254, "Batch creator");
    const ledgers = await Promise.all(
      uniqueLedgerIds.map((id) => this.getLedger(id)),
    );
    if (ledgers.some((ledger) => !ledger)) {
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "One or more selected ledgers do not exist in this environment",
      );
    }
    const records = ledgers as LedgerRecord[];
    for (const ledger of records) {
      if (
        ledger.state !== "READY_FOR_OWNER_APPROVAL" ||
        ledger.batchId !== null ||
        ledger.manualPaymentClaimToken !== null ||
        ledger.manualPaymentRecordedAt !== null ||
        ledger.batchEligibilityDate === null ||
        ledger.batchEligibilityDate > input.scheduledDate
      ) {
        throw new PayoutRepositoryError(
          "CONFLICT",
          `Ledger ${ledger.ledgerId} is not ready for this batch`,
        );
      }
      const recomputed = await digestLedgerMaterial(ledger);
      if (recomputed !== ledger.materialDigest) {
        throw new PayoutRepositoryError(
          "DATA_INTEGRITY",
          `Ledger ${ledger.ledgerId} material digest does not match its fields`,
        );
      }
    }
    const snapshot: BatchApprovalSnapshot = {
      batchId: input.batchId,
      environment: this.environment,
      scheduledDate: input.scheduledDate,
      currency: "usd",
      items: records.map(snapshotItem),
    };
    const approvalDigest = await digestBatchSnapshot(snapshot);
    const totalCents = records.reduce(
      (sum, ledger) => sum + ledger.totalApprovedPayCents,
      0,
    );
    if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Batch total is outside the safe integer range",
      );
    }
    const cte = valuesCte(snapshot.items);
    const count = snapshot.items.length;
    const batchInsert = this.db
      .prepare(
        `
        WITH ${cte.sql}
        INSERT INTO payout_batches (
          batch_id, environment, scheduled_date, status, currency, item_count,
          blocked_item_count, remaining_candidate_count, total_cents,
          approval_digest, approval_revision,
          created_by, created_at, updated_at
        )
        SELECT ?, ?, ?, 'PREPARED', 'usd', ?, ?, ?, ?, ?, 0, ?, ?, ?
        WHERE (SELECT COUNT(*) FROM expected) = ?
          AND NOT EXISTS (
            SELECT 1 FROM expected e
            LEFT JOIN artist_payment_ledger l
              ON l.ledger_id = e.ledger_id AND l.environment = ?
            WHERE l.ledger_id IS NULL OR NOT (${CURRENT_SNAPSHOT_MATCH})
              OR l.state <> 'READY_FOR_OWNER_APPROVAL'
              OR l.batch_id IS NOT NULL
              OR l.manual_payment_claim_token IS NOT NULL
              OR l.manual_payment_recorded_at IS NOT NULL
              OR l.batch_eligibility_date IS NULL
              OR l.batch_eligibility_date > ?
          )
      `,
      )
      .bind(
        ...cte.values,
        input.batchId,
        this.environment,
        input.scheduledDate,
        count,
        input.blockedItemCount,
        input.remainingCandidateCount,
        totalCents,
        approvalDigest,
        createdBy,
        input.now,
        input.now,
        count,
        this.environment,
        input.scheduledDate,
      );
    const itemInsert = this.db
      .prepare(
        `
        WITH ${cte.sql}
        INSERT INTO payout_batch_items (
          batch_id, environment, ledger_id, assignment_id_snapshot, artist_id_snapshot,
          connected_account_id_snapshot, amount_cents_snapshot, source_revision_snapshot,
          material_digest_snapshot, payment_memo_snapshot, item_status, created_at, updated_at
        )
        SELECT ?, ?, e.ledger_id, e.assignment_id, e.artist_id, e.connected_account_id,
          e.amount_cents, e.source_revision, e.material_digest, e.payment_memo,
          'PREPARED', ?, ?
        FROM expected e
        WHERE EXISTS (
          SELECT 1 FROM payout_batches b
          WHERE b.batch_id = ? AND b.environment = ? AND b.status = 'PREPARED'
            AND b.approval_digest = ?
        )
      `,
      )
      .bind(
        ...cte.values,
        input.batchId,
        this.environment,
        input.now,
        input.now,
        input.batchId,
        this.environment,
        approvalDigest,
      );
    const ledgerClaim = this.db
      .prepare(
        `
        WITH ${cte.sql}
        UPDATE artist_payment_ledger SET batch_id = ?, updated_at = ?
        WHERE environment = ?
          AND EXISTS (
            SELECT 1 FROM expected e
            WHERE e.ledger_id = artist_payment_ledger.ledger_id
              AND ${CURRENT_SNAPSHOT_MATCH.replaceAll("l.", "artist_payment_ledger.")}
          )
          AND state = 'READY_FOR_OWNER_APPROVAL' AND batch_id IS NULL
          AND manual_payment_claim_token IS NULL
          AND manual_payment_recorded_at IS NULL
          AND EXISTS (
            SELECT 1 FROM payout_batches b
            WHERE b.batch_id = ? AND b.environment = ? AND b.status = 'PREPARED'
              AND b.approval_digest = ?
          )
      `,
      )
      .bind(
        ...cte.values,
        input.batchId,
        input.now,
        this.environment,
        input.batchId,
        this.environment,
        approvalDigest,
      );
    const blockedExceptionAssignments = input.blockedExceptionIds.map(
      (exceptionId) =>
        this.db
          .prepare(
            `
            UPDATE payout_exceptions SET batch_id = ?
            WHERE exception_id = ? AND environment = ? AND batch_id IS NULL
              AND status IN ('OPEN', 'ACKNOWLEDGED')
          `,
          )
          .bind(input.batchId, exceptionId, this.environment),
    );
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor: createdBy,
        action: "PAYOUT_BATCH_PREPARED_SUMMARY",
        amountCents: totalCents,
        currency: "usd",
        approvalRevision: 0,
        result: "SUCCESS",
        requestId: input.requestId,
        batchId: input.batchId,
        safeDetails: {
          approvalDigest,
          itemCount: count,
          blockedItemCount: input.blockedItemCount,
          remainingCandidateCount: input.remainingCandidateCount,
          scheduledDate: input.scheduledDate,
        },
      },
      `EXISTS (SELECT 1 FROM payout_batches WHERE batch_id = ? AND environment = ? AND approval_digest = ?)`,
      [input.batchId, this.environment, approvalDigest],
    );
    const itemAudits = records.map((ledger, index) =>
      this.auditStatement(
        {
          auditId: `${input.auditId}_item_${index + 1}`,
          timestamp: input.now,
          actor: createdBy,
          action: "PAYOUT_BATCH_ITEM_PREPARED",
          bookingId: ledger.bookingId,
          assignmentId: ledger.assignmentId,
          artistId: ledger.artistId,
          amountCents: ledger.totalApprovedPayCents,
          currency: "usd",
          connectedAccountId: ledger.connectedAccountId,
          previousState: ledger.state,
          newState: ledger.state,
          approvalRevision: 0,
          result: "SUCCESS",
          requestId: input.requestId,
          batchId: input.batchId,
          safeDetails: {
            approvalDigest,
            sourceRevision: ledger.sourceRevision,
            materialDigest: ledger.materialDigest,
            scheduledDate: input.scheduledDate,
          },
        },
        `EXISTS (
          SELECT 1 FROM payout_batch_items WHERE batch_id = ? AND environment = ?
            AND ledger_id = ? AND item_status = 'PREPARED'
        )`,
        [input.batchId, this.environment, ledger.ledgerId],
      ),
    );
    const results = await this.transaction([
      batchInsert,
      itemInsert,
      ledgerClaim,
      ...blockedExceptionAssignments,
      audit,
      ...itemAudits,
    ]);
    const auditIndex = 3 + blockedExceptionAssignments.length;
    if (
      changes(results[0]) !== 1 ||
      changes(results[1]) !== count ||
      changes(results[2]) !== count ||
      results.slice(3, auditIndex).some((result) => changes(result) !== 1) ||
      changes(results[auditIndex]) !== 1 ||
      results.slice(auditIndex + 1).some((result) => changes(result) !== 1)
    ) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Batch preparation failed its atomic snapshot check",
      );
    }
    const batch = await this.getBatch(input.batchId);
    if (!batch)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Prepared batch could not be read back",
      );
    return { batch, snapshot, approvalDigest };
  }

  async getBatch(batchId: string): Promise<PayoutBatchRecord | null> {
    await this.ensureEnvironmentIdentity();
    assertSafeId(batchId, "Batch ID");
    const row = await this.db
      .prepare(
        "SELECT * FROM payout_batches WHERE batch_id = ? AND environment = ?",
      )
      .bind(batchId, this.environment)
      .first<BatchRow>();
    return row ? mapBatch(row) : null;
  }

  async getBatchItems(batchId: string): Promise<PayoutBatchItemRecord[]> {
    await this.ensureEnvironmentIdentity();
    assertSafeId(batchId, "Batch ID");
    const result = await this.db
      .prepare(
        `
        SELECT * FROM payout_batch_items
        WHERE batch_id = ? AND environment = ?
        ORDER BY assignment_id_snapshot, ledger_id
      `,
      )
      .bind(batchId, this.environment)
      .all<BatchItemRow>();
    return (result.results ?? []).map(mapBatchItem);
  }

  async approveBatch(input: {
    batchId: string;
    expectedDigest: string;
    expectedRevision: number;
    approvedBy: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<PayoutBatchRecord> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.batchId, "Batch ID");
    assertSafeId(input.auditId, "Audit ID");
    assertDigest(input.expectedDigest, "Expected approval digest");
    assertNonNegativeInteger(
      input.expectedRevision,
      "Expected approval revision",
    );
    assertInstant(input.now, "Approval time");
    const approvedBy = boundedText(input.approvedBy, 254, "Approver");
    const nextRevision = input.expectedRevision + 1;
    const reviewItems = await this.getBatchItems(input.batchId);
    const reviewLedgers = await Promise.all(
      reviewItems.map((item) => this.getLedger(item.ledgerId)),
    );
    if (reviewItems.length === 0 || reviewLedgers.some((ledger) => !ledger)) {
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Owner approval items could not be read for per-assignment audit",
      );
    }
    const batchUpdate = this.db
      .prepare(
        `
        UPDATE payout_batches SET status = 'OWNER_APPROVED', approval_revision = ?,
          approved_by = ?, approval_timestamp = ?, updated_at = ?
        WHERE batch_id = ? AND environment = ? AND status = 'PREPARED'
          AND approval_digest = ? AND approval_revision = ?
          AND item_count = (
            SELECT COUNT(*) FROM payout_batch_items i
            WHERE i.batch_id = payout_batches.batch_id AND i.environment = payout_batches.environment
          )
          AND NOT EXISTS (
            SELECT 1 FROM payout_batch_items i
            LEFT JOIN artist_payment_ledger l
              ON l.ledger_id = i.ledger_id AND l.environment = i.environment
            WHERE i.batch_id = payout_batches.batch_id AND i.environment = payout_batches.environment
              AND (
                l.ledger_id IS NULL OR l.state <> 'READY_FOR_OWNER_APPROVAL'
                OR l.batch_id <> payout_batches.batch_id
                OR l.assignment_id <> i.assignment_id_snapshot
                OR l.artist_id <> i.artist_id_snapshot
                OR l.stripe_connected_account_id <> i.connected_account_id_snapshot
                OR l.total_approved_pay_cents <> i.amount_cents_snapshot
                OR l.source_revision <> i.source_revision_snapshot
                OR l.material_digest <> i.material_digest_snapshot
                OR l.payment_memo <> i.payment_memo_snapshot
                OR i.item_status <> 'PREPARED'
              )
          )
      `,
      )
      .bind(
        nextRevision,
        approvedBy,
        input.now,
        input.now,
        input.batchId,
        this.environment,
        input.expectedDigest,
        input.expectedRevision,
      );
    const itemUpdate = this.db
      .prepare(
        `
        UPDATE payout_batch_items SET item_status = 'APPROVED', updated_at = ?
        WHERE batch_id = ? AND environment = ? AND item_status = 'PREPARED'
          AND EXISTS (
            SELECT 1 FROM payout_batches b
            WHERE b.batch_id = payout_batch_items.batch_id
              AND b.environment = payout_batch_items.environment
              AND b.status = 'OWNER_APPROVED' AND b.approval_digest = ?
              AND b.approval_revision = ?
          )
      `,
      )
      .bind(
        input.now,
        input.batchId,
        this.environment,
        input.expectedDigest,
        nextRevision,
      );
    const ledgerUpdate = this.db
      .prepare(
        `
        UPDATE artist_payment_ledger SET state = 'OWNER_APPROVED',
          owner_approval_status = 'APPROVED', owner_approval_revision = ?,
          approval_digest = ?, approved_by = ?, approval_timestamp = ?, updated_at = ?
        WHERE environment = ? AND state = 'READY_FOR_OWNER_APPROVAL' AND batch_id = ?
          AND EXISTS (
            SELECT 1 FROM payout_batch_items i
            WHERE i.batch_id = ? AND i.environment = artist_payment_ledger.environment
              AND i.ledger_id = artist_payment_ledger.ledger_id
              AND i.item_status = 'APPROVED'
              AND artist_payment_ledger.assignment_id = i.assignment_id_snapshot
              AND artist_payment_ledger.artist_id = i.artist_id_snapshot
              AND artist_payment_ledger.stripe_connected_account_id = i.connected_account_id_snapshot
              AND artist_payment_ledger.total_approved_pay_cents = i.amount_cents_snapshot
              AND artist_payment_ledger.source_revision = i.source_revision_snapshot
              AND artist_payment_ledger.material_digest = i.material_digest_snapshot
              AND artist_payment_ledger.payment_memo = i.payment_memo_snapshot
          )
          AND EXISTS (
            SELECT 1 FROM payout_batches b
            WHERE b.batch_id = ? AND b.environment = artist_payment_ledger.environment
              AND b.status = 'OWNER_APPROVED' AND b.approval_digest = ?
              AND b.approval_revision = ?
          )
      `,
      )
      .bind(
        nextRevision,
        input.expectedDigest,
        approvedBy,
        input.now,
        input.now,
        this.environment,
        input.batchId,
        input.batchId,
        input.batchId,
        input.expectedDigest,
        nextRevision,
      );
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor: approvedBy,
        action: "PAYOUT_BATCH_OWNER_APPROVAL_SUMMARY",
        previousState: "PREPARED",
        newState: "OWNER_APPROVED",
        approvalRevision: nextRevision,
        result: "SUCCESS",
        requestId: input.requestId,
        batchId: input.batchId,
        safeDetails: { approvalDigest: input.expectedDigest },
      },
      `EXISTS (
        SELECT 1 FROM payout_batches
        WHERE batch_id = ? AND environment = ? AND status = 'OWNER_APPROVED'
          AND approval_digest = ? AND approval_revision = ?
      )`,
      [input.batchId, this.environment, input.expectedDigest, nextRevision],
    );
    const itemAudits = (reviewLedgers as LedgerRecord[]).map((ledger, index) =>
      this.auditStatement(
        {
          auditId: `${input.auditId}_item_${index + 1}`,
          timestamp: input.now,
          actor: approvedBy,
          action: "PAYOUT_BATCH_ITEM_OWNER_APPROVED",
          bookingId: ledger.bookingId,
          assignmentId: ledger.assignmentId,
          artistId: ledger.artistId,
          amountCents: ledger.totalApprovedPayCents,
          currency: "usd",
          connectedAccountId: ledger.connectedAccountId,
          previousState: "READY_FOR_OWNER_APPROVAL",
          newState: "OWNER_APPROVED",
          approvalRevision: nextRevision,
          result: "SUCCESS",
          requestId: input.requestId,
          batchId: input.batchId,
          safeDetails: {
            approvalDigest: input.expectedDigest,
            sourceRevision: ledger.sourceRevision,
            materialDigest: ledger.materialDigest,
          },
        },
        `EXISTS (
          SELECT 1 FROM artist_payment_ledger WHERE ledger_id = ? AND environment = ?
            AND state = 'OWNER_APPROVED' AND batch_id = ?
            AND approval_digest = ? AND owner_approval_revision = ?
        )`,
        [
          ledger.ledgerId,
          this.environment,
          input.batchId,
          input.expectedDigest,
          nextRevision,
        ],
      ),
    );
    const results = await this.transaction([
      batchUpdate,
      itemUpdate,
      ledgerUpdate,
      audit,
      ...itemAudits,
    ]);
    const batch = await this.getBatch(input.batchId);
    if (
      changes(results[0]) !== 1 ||
      !batch ||
      changes(results[1]) !== batch.itemCount ||
      changes(results[2]) !== batch.itemCount ||
      changes(results[3]) !== 1 ||
      results.slice(4).some((result) => changes(result) !== 1)
    ) {
      throw new PayoutRepositoryError(
        "APPROVAL_INVALIDATED",
        "Approval snapshot changed or was already claimed",
      );
    }
    return batch;
  }

  async claimBatchExecution(input: {
    batchId: string;
    expectedDigest: string;
    expectedRevision: number;
    claimToken: string;
    availableBalanceCents: number;
    minimumReserveCents: number;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<PayoutBatchRecord> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.batchId, "Batch ID");
    assertSafeId(input.claimToken, "Execution claim token");
    assertSafeId(input.auditId, "Audit ID");
    assertDigest(input.expectedDigest, "Expected approval digest");
    assertNonNegativeInteger(
      input.expectedRevision,
      "Expected approval revision",
    );
    assertNonNegativeInteger(input.availableBalanceCents, "Available balance");
    assertNonNegativeInteger(input.minimumReserveCents, "Minimum reserve");
    assertInstant(input.now, "Execution claim time");
    const actor = boundedText(input.actor, 254, "Actor");
    const existing = await this.getBatch(input.batchId);
    if (!existing)
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Batch was not found in this environment",
      );
    if (
      existing.totalCents >
      Number.MAX_SAFE_INTEGER - input.minimumReserveCents
    ) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Required balance exceeds safe integer range",
      );
    }
    if (
      input.availableBalanceCents <
      existing.totalCents + input.minimumReserveCents
    ) {
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Available balance would breach the configured reserve",
      );
    }
    const projected = input.availableBalanceCents - existing.totalCents;
    const batchUpdate = this.db
      .prepare(
        `
        UPDATE payout_batches SET status = 'EXECUTING', execution_claim_token = ?,
          execution_started_at = ?, available_balance_cents = ?, minimum_reserve_cents = ?,
          projected_balance_cents = ?, updated_at = ?
        WHERE batch_id = ? AND environment = ? AND status = 'OWNER_APPROVED'
          AND approval_digest = ? AND approval_revision = ? AND execution_claim_token IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM payout_batches other
            WHERE other.environment = payout_batches.environment
              AND other.batch_id <> payout_batches.batch_id
              AND other.status = 'EXECUTING'
          )
          AND total_cents + ? <= ?
          AND item_count = (
            SELECT COUNT(*) FROM payout_batch_items i
            WHERE i.batch_id = payout_batches.batch_id AND i.environment = payout_batches.environment
              AND i.item_status = 'APPROVED'
          )
          AND NOT EXISTS (
            SELECT 1 FROM payout_batch_items i
            LEFT JOIN artist_payment_ledger l
              ON l.ledger_id = i.ledger_id AND l.environment = i.environment
            WHERE i.batch_id = payout_batches.batch_id AND i.environment = payout_batches.environment
              AND (
                l.ledger_id IS NULL OR l.state <> 'OWNER_APPROVED'
                OR l.owner_approval_status <> 'APPROVED'
                OR l.approval_digest <> payout_batches.approval_digest
                OR l.owner_approval_revision <> payout_batches.approval_revision
                OR l.batch_id <> payout_batches.batch_id
                OR l.assignment_id <> i.assignment_id_snapshot
                OR l.artist_id <> i.artist_id_snapshot
                OR l.stripe_connected_account_id <> i.connected_account_id_snapshot
                OR l.total_approved_pay_cents <> i.amount_cents_snapshot
                OR l.source_revision <> i.source_revision_snapshot
                OR l.material_digest <> i.material_digest_snapshot
                OR l.payment_memo <> i.payment_memo_snapshot
              )
          )
      `,
      )
      .bind(
        input.claimToken,
        input.now,
        input.availableBalanceCents,
        input.minimumReserveCents,
        projected,
        input.now,
        input.batchId,
        this.environment,
        input.expectedDigest,
        input.expectedRevision,
        input.minimumReserveCents,
        input.availableBalanceCents,
      );
    const itemUpdate = this.db
      .prepare(
        `
        UPDATE payout_batch_items SET item_status = 'TRANSFER_QUEUED', updated_at = ?
        WHERE batch_id = ? AND environment = ? AND item_status = 'APPROVED'
          AND EXISTS (
            SELECT 1 FROM payout_batches b
            WHERE b.batch_id = payout_batch_items.batch_id
              AND b.environment = payout_batch_items.environment
              AND b.status = 'EXECUTING' AND b.execution_claim_token = ?
              AND b.approval_digest = ? AND b.approval_revision = ?
          )
      `,
      )
      .bind(
        input.now,
        input.batchId,
        this.environment,
        input.claimToken,
        input.expectedDigest,
        input.expectedRevision,
      );
    const ledgerUpdate = this.db
      .prepare(
        `
        UPDATE artist_payment_ledger SET state = 'TRANSFER_QUEUED', updated_at = ?
        WHERE environment = ? AND batch_id = ? AND state = 'OWNER_APPROVED'
          AND owner_approval_status = 'APPROVED' AND approval_digest = ?
          AND owner_approval_revision = ?
          AND EXISTS (
            SELECT 1 FROM payout_batch_items i
            WHERE i.batch_id = ? AND i.environment = artist_payment_ledger.environment
              AND i.ledger_id = artist_payment_ledger.ledger_id
              AND i.item_status = 'TRANSFER_QUEUED'
              AND artist_payment_ledger.assignment_id = i.assignment_id_snapshot
              AND artist_payment_ledger.artist_id = i.artist_id_snapshot
              AND artist_payment_ledger.stripe_connected_account_id = i.connected_account_id_snapshot
              AND artist_payment_ledger.total_approved_pay_cents = i.amount_cents_snapshot
              AND artist_payment_ledger.source_revision = i.source_revision_snapshot
              AND artist_payment_ledger.material_digest = i.material_digest_snapshot
              AND artist_payment_ledger.payment_memo = i.payment_memo_snapshot
          )
      `,
      )
      .bind(
        input.now,
        this.environment,
        input.batchId,
        input.expectedDigest,
        input.expectedRevision,
        input.batchId,
      );
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: "PAYOUT_BATCH_EXECUTION_CLAIMED",
        amountCents: existing.totalCents,
        currency: "usd",
        previousState: "OWNER_APPROVED",
        newState: "EXECUTING",
        approvalRevision: input.expectedRevision,
        result: "SUCCESS",
        requestId: input.requestId,
        batchId: input.batchId,
        safeDetails: {
          approvalDigest: input.expectedDigest,
          availableBalanceCents: input.availableBalanceCents,
          minimumReserveCents: input.minimumReserveCents,
          projectedBalanceCents: projected,
        },
      },
      `EXISTS (
        SELECT 1 FROM payout_batches
        WHERE batch_id = ? AND environment = ? AND execution_claim_token = ?
      )`,
      [input.batchId, this.environment, input.claimToken],
    );
    const results = await this.transaction([
      batchUpdate,
      itemUpdate,
      ledgerUpdate,
      audit,
    ]);
    const batch = await this.getBatch(input.batchId);
    if (
      changes(results[0]) !== 1 ||
      !batch ||
      changes(results[1]) !== batch.itemCount ||
      changes(results[2]) !== batch.itemCount ||
      changes(results[3]) !== 1
    ) {
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Batch execution claim failed its atomic approval check",
      );
    }
    return batch;
  }

  async invalidateBatchForAuthoritativeSourceChange(input: {
    batchId: string;
    ledgerId: string;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<void> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.batchId, "Batch ID");
    assertSafeId(input.ledgerId, "Ledger ID");
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.now, "Source invalidation time");
    const actor = boundedText(input.actor, 254, "Actor");
    const ledger = await this.getLedger(input.ledgerId);
    if (!ledger || ledger.batchId !== input.batchId)
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Approved source-bound ledger was not found",
      );
    const ledgerUpdate = this.db
      .prepare(
        `
      UPDATE artist_payment_ledger
      SET state = 'MANUAL_REVIEW', owner_approval_status = 'INVALIDATED',
        approval_digest = NULL, approved_by = NULL, approval_timestamp = NULL,
        failure_code = 'AUTHORITATIVE_SOURCE_CHANGED',
        failure_reason = 'Authoritative CRM source changed after owner approval.', updated_at = ?
      WHERE ledger_id = ? AND environment = ? AND batch_id = ?
        AND state IN ('OWNER_APPROVED', 'TRANSFER_QUEUED')
        AND stripe_transfer_id IS NULL
    `,
      )
      .bind(input.now, input.ledgerId, this.environment, input.batchId);
    const itemUpdate = this.db
      .prepare(
        `
      UPDATE payout_batch_items
      SET item_status = 'BLOCKED', failure_code = 'AUTHORITATIVE_SOURCE_CHANGED',
        failure_reason = 'Authoritative CRM source changed after owner approval.', updated_at = ?
      WHERE batch_id = ? AND ledger_id = ? AND environment = ?
        AND item_status IN ('APPROVED', 'TRANSFER_QUEUED')
    `,
      )
      .bind(input.now, input.batchId, input.ledgerId, this.environment);
    const batchUpdate = this.db
      .prepare(
        `
      UPDATE payout_batches SET status = 'BLOCKED',
        blocked_item_count = (
          SELECT COUNT(*) FROM payout_batch_items i
          WHERE i.batch_id = payout_batches.batch_id AND i.environment = payout_batches.environment
            AND i.item_status IN ('FAILED', 'BLOCKED', 'REVERSED')
        ), updated_at = ?
      WHERE batch_id = ? AND environment = ?
        AND status IN ('OWNER_APPROVED', 'EXECUTING', 'PARTIALLY_COMPLETED')
    `,
      )
      .bind(input.now, input.batchId, this.environment);
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: "PAYOUT_APPROVAL_INVALIDATED_BY_AUTHORITATIVE_SOURCE",
        bookingId: ledger.bookingId,
        assignmentId: ledger.assignmentId,
        artistId: ledger.artistId,
        amountCents: ledger.totalApprovedPayCents,
        currency: "usd",
        connectedAccountId: ledger.connectedAccountId,
        previousState: ledger.state,
        newState: "MANUAL_REVIEW",
        approvalRevision: ledger.ownerApprovalRevision,
        result: "BLOCKED",
        requestId: input.requestId,
        batchId: input.batchId,
        safeDetails: { reasonCode: "AUTHORITATIVE_SOURCE_CHANGED" },
      },
      `EXISTS (
      SELECT 1 FROM artist_payment_ledger WHERE ledger_id = ? AND environment = ?
        AND state = 'MANUAL_REVIEW' AND owner_approval_status = 'INVALIDATED'
        AND updated_at = ?
    )`,
      [input.ledgerId, this.environment, input.now],
    );
    const results = await this.transaction([
      ledgerUpdate,
      itemUpdate,
      batchUpdate,
      audit,
    ]);
    if (
      changes(results[0]) !== 1 ||
      changes(results[1]) !== 1 ||
      changes(results[2]) !== 1 ||
      changes(results[3]) !== 1
    )
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Authoritative source invalidation lost an execution race",
      );
  }

  async releaseUnchangedLedgersFromBlockedBatch(input: {
    batchId: string;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<{ batch: PayoutBatchRecord; releasedLedgerIds: string[] }> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.batchId, "Batch ID");
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.now, "Blocked batch release time");
    const actor = boundedText(input.actor, 254, "Actor");
    const batch = await this.getBatch(input.batchId);
    if (!batch || batch.status !== "BLOCKED") {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Only an authoritatively blocked batch can release unchanged assignments",
      );
    }
    const items = await this.getBatchItems(input.batchId);
    const ledgers = (
      await Promise.all(items.map((item) => this.getLedger(item.ledgerId)))
    ).filter((ledger): ledger is LedgerRecord => ledger !== null);
    if (
      !items.some(
        (item) =>
          item.status === "BLOCKED" &&
          item.failureCode === "AUTHORITATIVE_SOURCE_CHANGED",
      )
    ) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Blocked batch has no authoritative source invalidation to recover",
      );
    }
    const releasable = ledgers.filter(
      (ledger) =>
        ledger.batchId === input.batchId &&
        ledger.stripeTransferId === null &&
        ledger.stripeDestinationPaymentId === null &&
        ledger.failureCode !== "AUTHORITATIVE_SOURCE_CHANGED" &&
        ["OWNER_APPROVED", "TRANSFER_QUEUED"].includes(ledger.state),
    );
    if (releasable.length === 0) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Blocked batch has no unchanged untransferred assignments to release",
      );
    }
    const hasTransferredItem = ledgers.some(
      (ledger) =>
        ledger.stripeTransferId !== null ||
        ledger.stripeDestinationPaymentId !== null,
    );
    const releasedIds = releasable.map((ledger) => ledger.ledgerId);
    const placeholders = releasedIds.map(() => "?").join(", ");
    const ledgerUpdate = this.db
      .prepare(
        `
        UPDATE artist_payment_ledger
        SET state = 'READY_FOR_OWNER_APPROVAL', owner_approval_status = 'INVALIDATED',
          approval_digest = NULL, approved_by = NULL, approval_timestamp = NULL,
          batch_id = NULL, failure_code = NULL, failure_reason = NULL, updated_at = ?
        WHERE environment = ? AND batch_id = ?
          AND ledger_id IN (${placeholders})
          AND state IN ('OWNER_APPROVED', 'TRANSFER_QUEUED')
          AND stripe_transfer_id IS NULL AND stripe_destination_payment_id IS NULL
          AND failure_code IS NOT 'AUTHORITATIVE_SOURCE_CHANGED'
      `,
      )
      .bind(input.now, this.environment, input.batchId, ...releasedIds);
    const itemUpdate = this.db
      .prepare(
        `
        UPDATE payout_batch_items
        SET item_status = 'BLOCKED', failure_code = 'REBATCH_REQUIRED',
          failure_reason = 'Unchanged assignment released for a new owner-reviewed batch.',
          updated_at = ?
        WHERE environment = ? AND batch_id = ? AND ledger_id IN (${placeholders})
          AND item_status IN ('APPROVED', 'TRANSFER_QUEUED')
      `,
      )
      .bind(input.now, this.environment, input.batchId, ...releasedIds);
    const batchUpdate = this.db
      .prepare(
        `
        UPDATE payout_batches
        SET status = ?, execution_claim_token = NULL, execution_started_at = NULL,
          execution_completed_at = ?, blocked_item_count = item_count, updated_at = ?
        WHERE batch_id = ? AND environment = ? AND status = 'BLOCKED'
          AND EXISTS (
            SELECT 1 FROM payout_batch_items i
            WHERE i.batch_id = payout_batches.batch_id
              AND i.environment = payout_batches.environment
              AND i.item_status = 'BLOCKED'
              AND i.failure_code = 'AUTHORITATIVE_SOURCE_CHANGED'
          )
      `,
      )
      .bind(
        hasTransferredItem ? "PARTIALLY_COMPLETED" : "CANCELED",
        input.now,
        input.now,
        input.batchId,
        this.environment,
      );
    const summaryAudit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: "AUTHORITATIVE_SOURCE_BATCH_RECOVERY_SUMMARY",
        amountCents: releasable.reduce(
          (sum, ledger) => sum + ledger.totalApprovedPayCents,
          0,
        ),
        currency: "usd",
        previousState: "BLOCKED",
        newState: hasTransferredItem ? "PARTIALLY_COMPLETED" : "CANCELED",
        approvalRevision: batch.approvalRevision,
        result: "SUCCESS",
        requestId: input.requestId,
        batchId: input.batchId,
        safeDetails: { releasedLedgerIds: releasedIds },
      },
      `EXISTS (
        SELECT 1 FROM payout_batches
        WHERE batch_id = ? AND environment = ? AND status = ? AND updated_at = ?
      )`,
      [
        input.batchId,
        this.environment,
        hasTransferredItem ? "PARTIALLY_COMPLETED" : "CANCELED",
        input.now,
      ],
    );
    const itemAudits = releasable.map((ledger, index) =>
      this.auditStatement(
        {
          auditId: `${input.auditId}_item_${index + 1}`,
          timestamp: input.now,
          actor,
          action: "AUTHORITATIVE_SOURCE_UNCHANGED_LEDGER_RELEASED",
          bookingId: ledger.bookingId,
          assignmentId: ledger.assignmentId,
          artistId: ledger.artistId,
          amountCents: ledger.totalApprovedPayCents,
          currency: "usd",
          connectedAccountId: ledger.connectedAccountId,
          previousState: ledger.state,
          newState: "READY_FOR_OWNER_APPROVAL",
          approvalRevision: ledger.ownerApprovalRevision,
          result: "SUCCESS",
          requestId: input.requestId,
          batchId: input.batchId,
          safeDetails: { reasonCode: "REBATCH_REQUIRED" },
        },
        `EXISTS (
          SELECT 1 FROM artist_payment_ledger
          WHERE ledger_id = ? AND environment = ?
            AND state = 'READY_FOR_OWNER_APPROVAL' AND batch_id IS NULL
            AND updated_at = ?
        )`,
        [ledger.ledgerId, this.environment, input.now],
      ),
    );
    const results = await this.transaction([
      ledgerUpdate,
      itemUpdate,
      batchUpdate,
      summaryAudit,
      ...itemAudits,
    ]);
    if (
      changes(results[0]) !== releasable.length ||
      changes(results[1]) !== releasable.length ||
      changes(results[2]) !== 1 ||
      changes(results[3]) !== 1 ||
      results.slice(4).some((result) => changes(result) !== 1)
    ) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Blocked batch recovery lost an atomic source or execution race",
      );
    }
    const recovered = await this.getBatch(input.batchId);
    if (!recovered)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Recovered batch disappeared",
      );
    return { batch: recovered, releasedLedgerIds: releasedIds };
  }

  async authorizeCrossDayBatchRecovery(input: {
    batchId: string;
    recoveryProcessingDate: string;
    expectedDigest: string;
    expectedRevision: number;
    reason: string;
    staleBefore: string;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<PayoutBatchRecord> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.batchId, "Batch ID");
    assertSafeId(input.auditId, "Audit ID");
    assertDigest(input.expectedDigest, "Expected approval digest");
    assertNonNegativeInteger(
      input.expectedRevision,
      "Expected approval revision",
    );
    if (!isIsoDate(input.recoveryProcessingDate)) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Recovery processing date is malformed",
      );
    }
    assertInstant(input.staleBefore, "Stale execution cutoff");
    assertInstant(input.now, "Recovery authorization time");
    const actor = boundedText(input.actor, 254, "Recovery authorizer");
    const reason = boundedText(input.reason, 240, "Recovery reason");
    if (reason.length < 12) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Cross-day recovery reason must contain at least 12 characters",
      );
    }
    const existing = await this.getBatch(input.batchId);
    if (
      !existing ||
      existing.scheduledDate >= input.recoveryProcessingDate ||
      existing.approvalDigest !== input.expectedDigest ||
      existing.approvalRevision !== input.expectedRevision
    ) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Cross-day recovery does not match the older owner-approved batch",
      );
    }
    const update = this.db
      .prepare(
        `
        UPDATE payout_batches
        SET recovery_processing_date = ?, recovery_authorized_by = ?,
          recovery_authorized_at = ?, recovery_reason = ?, updated_at = ?
        WHERE batch_id = ? AND environment = ?
          AND scheduled_date < ?
          AND approval_digest = ? AND approval_revision = ?
          AND (
            status = 'PARTIALLY_COMPLETED'
            OR (status = 'EXECUTING' AND execution_started_at IS NOT NULL
              AND execution_started_at <= ?)
          )
          AND NOT EXISTS (
            SELECT 1 FROM payout_batches other
            WHERE other.environment = payout_batches.environment
              AND other.batch_id <> payout_batches.batch_id
              AND other.status = 'EXECUTING'
          )
          AND EXISTS (
            SELECT 1 FROM payout_batch_items i
            WHERE i.batch_id = payout_batches.batch_id
              AND i.environment = payout_batches.environment
              AND i.item_status IN ('TRANSFER_QUEUED', 'FAILED')
          )
      `,
      )
      .bind(
        input.recoveryProcessingDate,
        actor,
        input.now,
        reason,
        input.now,
        input.batchId,
        this.environment,
        input.recoveryProcessingDate,
        input.expectedDigest,
        input.expectedRevision,
        input.staleBefore,
      );
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: "PAYOUT_BATCH_CROSS_DAY_RECOVERY_AUTHORIZED",
        amountCents: existing.totalCents,
        currency: "usd",
        previousState: existing.status,
        newState: existing.status,
        approvalRevision: existing.approvalRevision,
        result: "AUTHORIZED",
        requestId: input.requestId,
        batchId: input.batchId,
        safeDetails: {
          originalScheduledDate: existing.scheduledDate,
          recoveryProcessingDate: input.recoveryProcessingDate,
          reason,
        },
      },
      `EXISTS (
        SELECT 1 FROM payout_batches
        WHERE batch_id = ? AND environment = ?
          AND recovery_processing_date = ? AND recovery_authorized_by = ?
          AND recovery_authorized_at = ?
      )`,
      [
        input.batchId,
        this.environment,
        input.recoveryProcessingDate,
        actor,
        input.now,
      ],
    );
    const results = await this.transaction([update, audit]);
    if (changes(results[0]) !== 1 || changes(results[1]) !== 1) {
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Cross-day recovery authorization lost a batch or execution race",
      );
    }
    const authorized = await this.getBatch(input.batchId);
    if (!authorized)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Authorized batch disappeared",
      );
    return authorized;
  }

  async markBatchExecutionDate(input: {
    batchId: string;
    claimToken: string;
    processingDate: string;
    expectedDigest: string;
    expectedRevision: number;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<void> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.batchId, "Batch ID");
    assertSafeId(input.claimToken, "Execution claim token");
    assertSafeId(input.auditId, "Audit ID");
    assertDigest(input.expectedDigest, "Expected approval digest");
    if (!isIsoDate(input.processingDate))
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Execution processing date is malformed",
      );
    assertInstant(input.now, "Execution start time");
    const actor = boundedText(input.actor, 254, "Actor");
    const current = await this.getBatch(input.batchId);
    if (
      !current ||
      current.executionClaimToken !== input.claimToken ||
      !["EXECUTING", "PARTIALLY_COMPLETED"].includes(current.status)
    ) {
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Batch execution date requires the current execution claim",
      );
    }
    if (current?.lastExecutionDate === input.processingDate) return;
    const update = this.db
      .prepare(
        `
      UPDATE payout_batches SET last_execution_date = ?, updated_at = ?
      WHERE batch_id = ? AND environment = ?
        AND status IN ('EXECUTING', 'PARTIALLY_COMPLETED')
        AND execution_claim_token = ?
        AND approval_digest = ? AND approval_revision = ?
        AND (scheduled_date = ? OR (
          recovery_processing_date = ? AND recovery_authorized_by IS NOT NULL
          AND recovery_authorized_at IS NOT NULL AND recovery_reason IS NOT NULL
        ))
    `,
      )
      .bind(
        input.processingDate,
        input.now,
        input.batchId,
        this.environment,
        input.claimToken,
        input.expectedDigest,
        input.expectedRevision,
        input.processingDate,
        input.processingDate,
      );
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: "PAYOUT_BATCH_EXECUTION_DATE_RECORDED",
        amountCents: current?.totalCents ?? null,
        currency: "usd",
        previousState: current?.status ?? null,
        newState: current?.status ?? null,
        approvalRevision: input.expectedRevision,
        result: "SUCCESS",
        requestId: input.requestId,
        batchId: input.batchId,
        safeDetails: { processingDate: input.processingDate },
      },
      `EXISTS (
      SELECT 1 FROM payout_batches WHERE batch_id = ? AND environment = ?
        AND last_execution_date = ? AND updated_at = ?
        AND execution_claim_token = ?
    )`,
      [
        input.batchId,
        this.environment,
        input.processingDate,
        input.now,
        input.claimToken,
      ],
    );
    const results = await this.transaction([update, audit]);
    if (changes(results[0]) !== 1 || changes(results[1]) !== 1)
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Batch execution date was not authorized",
      );
  }

  async recoverStaleBatchExecution(input: {
    batchId: string;
    expectedClaimToken: string;
    newClaimToken: string;
    expectedDigest: string;
    expectedRevision: number;
    staleBefore: string;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<PayoutBatchRecord> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.batchId, "Batch ID");
    assertSafeId(input.expectedClaimToken, "Expected execution claim token");
    assertSafeId(input.newClaimToken, "New execution claim token");
    assertSafeId(input.auditId, "Audit ID");
    assertDigest(input.expectedDigest, "Expected approval digest");
    assertNonNegativeInteger(
      input.expectedRevision,
      "Expected approval revision",
    );
    assertInstant(input.staleBefore, "Stale claim cutoff");
    assertInstant(input.now, "Claim recovery time");
    if (input.newClaimToken === input.expectedClaimToken) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "A recovered execution claim must use a new token",
      );
    }
    if (input.staleBefore >= input.now) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Stale claim cutoff must precede recovery time",
      );
    }
    const actor = boundedText(input.actor, 254, "Actor");
    const update = this.db
      .prepare(
        `
        UPDATE payout_batches SET execution_claim_token = ?, execution_started_at = ?,
          execution_completed_at = NULL, updated_at = ?
        WHERE batch_id = ? AND environment = ? AND status = 'EXECUTING'
          AND execution_claim_token = ? AND execution_started_at IS NOT NULL
          AND execution_started_at <= ? AND approval_digest = ? AND approval_revision = ?
          AND NOT EXISTS (
            SELECT 1 FROM payout_batches other
            WHERE other.environment = payout_batches.environment
              AND other.batch_id <> payout_batches.batch_id
              AND other.status = 'EXECUTING'
          )
          AND NOT EXISTS (
            SELECT 1 FROM payout_batch_items i
            LEFT JOIN artist_payment_ledger l
              ON l.ledger_id = i.ledger_id AND l.environment = i.environment
            WHERE i.batch_id = payout_batches.batch_id AND i.environment = payout_batches.environment
              AND (
                l.ledger_id IS NULL OR l.batch_id <> payout_batches.batch_id
                OR l.assignment_id <> i.assignment_id_snapshot
                OR l.artist_id <> i.artist_id_snapshot
                OR l.stripe_connected_account_id <> i.connected_account_id_snapshot
                OR l.total_approved_pay_cents <> i.amount_cents_snapshot
                OR l.source_revision <> i.source_revision_snapshot
                OR l.material_digest <> i.material_digest_snapshot
                OR l.payment_memo <> i.payment_memo_snapshot
              )
          )
      `,
      )
      .bind(
        input.newClaimToken,
        input.now,
        input.now,
        input.batchId,
        this.environment,
        input.expectedClaimToken,
        input.staleBefore,
        input.expectedDigest,
        input.expectedRevision,
      );
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: "STALE_BATCH_EXECUTION_CLAIM_RECOVERED",
        previousState: "EXECUTING",
        newState: "EXECUTING",
        approvalRevision: input.expectedRevision,
        result: "SUCCESS",
        requestId: input.requestId,
        batchId: input.batchId,
        safeDetails: {
          approvalDigest: input.expectedDigest,
          staleBefore: input.staleBefore,
        },
      },
      `EXISTS (
        SELECT 1 FROM payout_batches
        WHERE batch_id = ? AND environment = ? AND execution_claim_token = ?
          AND execution_started_at = ?
      )`,
      [input.batchId, this.environment, input.newClaimToken, input.now],
    );
    const results = await this.transaction([update, audit]);
    if (changes(results[0]) !== 1 || changes(results[1]) !== 1) {
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Execution claim is not stale or no longer matches",
      );
    }
    const batch = await this.getBatch(input.batchId);
    if (!batch)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Recovered batch could not be read back",
      );
    return batch;
  }

  async claimTransferItem(input: {
    attemptId: string;
    batchId: string;
    ledgerId: string;
    claimToken: string;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<{ attempt: TransferAttemptRecord; claimed: boolean }> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.attemptId, "Transfer attempt ID");
    assertSafeId(input.batchId, "Batch ID");
    assertSafeId(input.ledgerId, "Ledger ID");
    assertSafeId(input.claimToken, "Execution claim token");
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.now, "Transfer claim time");
    const actor = boundedText(input.actor, 254, "Actor");
    const ledger = await this.getLedger(input.ledgerId);
    if (!ledger || ledger.batchId !== input.batchId) {
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Batch ledger was not found in this environment",
      );
    }
    const fingerprint = transferIdempotencyKey(
      ledger.assignmentId,
      ledger.sourceRevision,
    );
    const insert = this.db
      .prepare(
        `
        INSERT INTO payout_transfer_attempts (
          attempt_id, ledger_id, batch_id, environment, idempotency_fingerprint,
          source_revision, request_amount_cents, destination_account_id, attempt_status,
          retry_count, created_at, updated_at
        )
        SELECT ?, l.ledger_id, ?, ?, ?, l.source_revision, l.total_approved_pay_cents,
          l.stripe_connected_account_id, 'CLAIMED', 0, ?, ?
        FROM artist_payment_ledger l
        JOIN payout_batch_items i
          ON i.ledger_id = l.ledger_id AND i.batch_id = ? AND i.environment = l.environment
        JOIN payout_batches b
          ON b.batch_id = i.batch_id AND b.environment = i.environment
        WHERE l.ledger_id = ? AND l.environment = ? AND l.state = 'TRANSFER_QUEUED'
          AND l.batch_id = ? AND l.owner_approval_status = 'APPROVED'
          AND l.approval_digest = b.approval_digest
          AND l.owner_approval_revision = b.approval_revision
          AND i.item_status = 'TRANSFER_QUEUED'
          AND l.assignment_id = i.assignment_id_snapshot
          AND l.artist_id = i.artist_id_snapshot
          AND l.stripe_connected_account_id = i.connected_account_id_snapshot
          AND l.total_approved_pay_cents = i.amount_cents_snapshot
          AND l.source_revision = i.source_revision_snapshot
          AND l.material_digest = i.material_digest_snapshot
          AND l.payment_memo = i.payment_memo_snapshot
          AND b.status = 'EXECUTING' AND b.execution_claim_token = ?
          AND NOT EXISTS (
            SELECT 1 FROM payout_transfer_attempts prior
            WHERE prior.ledger_id = l.ledger_id AND prior.batch_id = b.batch_id
              AND prior.environment = l.environment
          )
      `,
      )
      .bind(
        input.attemptId,
        input.batchId,
        this.environment,
        fingerprint,
        input.now,
        input.now,
        input.batchId,
        input.ledgerId,
        this.environment,
        input.batchId,
        input.claimToken,
      );
    const claimAudit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: "TRANSFER_ITEM_CLAIMED",
        bookingId: ledger.bookingId,
        assignmentId: ledger.assignmentId,
        artistId: ledger.artistId,
        amountCents: ledger.totalApprovedPayCents,
        currency: "usd",
        connectedAccountId: ledger.connectedAccountId,
        previousState: "TRANSFER_QUEUED",
        newState: "TRANSFER_QUEUED",
        approvalRevision: ledger.ownerApprovalRevision,
        idempotencyFingerprint: fingerprint,
        result: "SUCCESS",
        requestId: input.requestId,
        batchId: input.batchId,
        safeDetails: {
          attemptId: input.attemptId,
          sourceRevision: ledger.sourceRevision,
        },
      },
      `EXISTS (
        SELECT 1 FROM payout_transfer_attempts
        WHERE attempt_id = ? AND environment = ? AND created_at = ?
      )`,
      [input.attemptId, this.environment, input.now],
    );
    const insertResults = await this.transaction([insert, claimAudit]);
    let attempt = await this.getTransferAttemptByFingerprint(fingerprint);
    if (!attempt) {
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Transfer item did not match the approved snapshot",
      );
    }
    if (
      attempt.ledgerId !== input.ledgerId ||
      attempt.batchId !== input.batchId ||
      attempt.requestAmountCents !== ledger.totalApprovedPayCents ||
      attempt.sourceRevision !== ledger.sourceRevision ||
      attempt.destinationAccountId !== ledger.connectedAccountId
    ) {
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Idempotency fingerprint is bound to different transfer data",
      );
    }
    if (changes(insertResults[0]) === 1) {
      if (changes(insertResults[1]) !== 1) {
        throw new PayoutRepositoryError(
          "DATA_INTEGRITY",
          "Transfer claim audit was not appended",
        );
      }
      return { attempt, claimed: true };
    }
    if (attempt.status !== "STRIPE_FAILED") return { attempt, claimed: false };

    const retryAuditId = `${input.auditId}:retry`;
    if (!isSafeBusinessId(retryAuditId)) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Retry audit ID is too long",
      );
    }
    const reopenBatch = this.db
      .prepare(
        `
        UPDATE payout_batches SET status = 'EXECUTING', execution_completed_at = NULL,
          execution_started_at = ?, updated_at = ?
        WHERE batch_id = ? AND environment = ? AND execution_claim_token = ?
          AND status IN ('EXECUTING', 'PARTIALLY_COMPLETED', 'BLOCKED')
          AND NOT EXISTS (
            SELECT 1 FROM payout_batches other
            WHERE other.environment = payout_batches.environment
              AND other.batch_id <> payout_batches.batch_id AND other.status = 'EXECUTING'
          )
      `,
      )
      .bind(
        input.now,
        input.now,
        input.batchId,
        this.environment,
        input.claimToken,
      );
    const retryAttempt = this.db
      .prepare(
        `
        UPDATE payout_transfer_attempts SET attempt_status = 'CLAIMED',
          safe_error_code = NULL, destination_resnapshot_authorized = 1,
          updated_at = ?
        WHERE attempt_id = ? AND ledger_id = ? AND batch_id = ? AND environment = ?
          AND idempotency_fingerprint = ? AND source_revision = ?
          AND request_amount_cents = ? AND destination_account_id = ?
          AND attempt_status = 'STRIPE_FAILED'
          AND EXISTS (
            SELECT 1 FROM payout_batches b
            WHERE b.batch_id = payout_transfer_attempts.batch_id
              AND b.environment = payout_transfer_attempts.environment
              AND b.status = 'EXECUTING' AND b.execution_claim_token = ?
          )
      `,
      )
      .bind(
        input.now,
        attempt.attemptId,
        input.ledgerId,
        input.batchId,
        this.environment,
        fingerprint,
        ledger.sourceRevision,
        ledger.totalApprovedPayCents,
        ledger.connectedAccountId,
        input.claimToken,
      );
    const retryItem = this.db
      .prepare(
        `
        UPDATE payout_batch_items SET item_status = 'TRANSFER_QUEUED',
          failure_code = NULL, failure_reason = NULL, updated_at = ?
        WHERE batch_id = ? AND ledger_id = ? AND environment = ? AND item_status = 'FAILED'
          AND source_revision_snapshot = ? AND material_digest_snapshot = ?
          AND EXISTS (
            SELECT 1 FROM payout_transfer_attempts a
            WHERE a.attempt_id = ? AND a.environment = payout_batch_items.environment
              AND a.attempt_status = 'CLAIMED'
          )
      `,
      )
      .bind(
        input.now,
        input.batchId,
        input.ledgerId,
        this.environment,
        ledger.sourceRevision,
        ledger.materialDigest,
        attempt.attemptId,
      );
    const retryLedger = this.db
      .prepare(
        `
        UPDATE artist_payment_ledger SET state = 'TRANSFER_QUEUED',
          failure_code = NULL, failure_reason = NULL, stripe_transfer_status = NULL, updated_at = ?
        WHERE ledger_id = ? AND batch_id = ? AND environment = ? AND state = 'TRANSFER_FAILED'
          AND source_revision = ? AND material_digest = ? AND stripe_transfer_id IS NULL
          AND EXISTS (
            SELECT 1 FROM payout_transfer_attempts a
            WHERE a.attempt_id = ? AND a.environment = artist_payment_ledger.environment
              AND a.attempt_status = 'CLAIMED'
          )
      `,
      )
      .bind(
        input.now,
        input.ledgerId,
        input.batchId,
        this.environment,
        ledger.sourceRevision,
        ledger.materialDigest,
        attempt.attemptId,
      );
    const retryAudit = this.auditStatement(
      {
        auditId: retryAuditId,
        timestamp: input.now,
        actor,
        action: "FAILED_TRANSFER_RETRY_CLAIMED",
        bookingId: ledger.bookingId,
        assignmentId: ledger.assignmentId,
        artistId: ledger.artistId,
        amountCents: ledger.totalApprovedPayCents,
        currency: "usd",
        connectedAccountId: ledger.connectedAccountId,
        previousState: "TRANSFER_FAILED",
        newState: "TRANSFER_QUEUED",
        approvalRevision: ledger.ownerApprovalRevision,
        idempotencyFingerprint: fingerprint,
        result: "SUCCESS",
        requestId: input.requestId,
        batchId: input.batchId,
        safeDetails: {
          attemptId: attempt.attemptId,
          retryCount: attempt.retryCount,
        },
      },
      `EXISTS (
        SELECT 1 FROM artist_payment_ledger
        WHERE ledger_id = ? AND environment = ? AND state = 'TRANSFER_QUEUED' AND updated_at = ?
      )`,
      [input.ledgerId, this.environment, input.now],
    );
    const retryResults = await this.transaction([
      reopenBatch,
      retryAttempt,
      retryItem,
      retryLedger,
      retryAudit,
    ]);
    if (retryResults.some((result) => changes(result) !== 1)) {
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Failed transfer retry lost its atomic claim",
      );
    }
    attempt = await this.getTransferAttemptByFingerprint(fingerprint);
    if (!attempt || attempt.status !== "CLAIMED") {
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Retried transfer claim could not be read back",
      );
    }
    return { attempt, claimed: true };
  }

  async getTransferAttemptByFingerprint(
    fingerprint: string,
  ): Promise<TransferAttemptRecord | null> {
    await this.ensureEnvironmentIdentity();
    const normalized = boundedText(fingerprint, 180, "Idempotency fingerprint");
    const row = await this.db
      .prepare(
        `
        SELECT * FROM payout_transfer_attempts
        WHERE idempotency_fingerprint = ? AND environment = ?
      `,
      )
      .bind(normalized, this.environment)
      .first<TransferAttemptRow>();
    return row ? mapAttempt(row) : null;
  }

  async getPayoutDestinationVarianceApproval(
    ledgerId: string,
    payoutId: string,
  ): Promise<PayoutDestinationVarianceApprovalRecord | null> {
    await this.ensureEnvironmentIdentity();
    assertSafeId(ledgerId, "Ledger ID");
    const normalizedPayoutId = assertStripeObjectId(
      payoutId,
      STRIPE_PAYOUT_RE,
      "Stripe payout ID",
    );
    const row = await this.db
      .prepare(
        `
        SELECT * FROM payout_destination_variance_approvals
        WHERE ledger_id = ? AND payout_id = ? AND environment = ?
      `,
      )
      .bind(ledgerId, normalizedPayoutId, this.environment)
      .first<PayoutDestinationVarianceApprovalRow>();
    return row ? mapPayoutDestinationVarianceApproval(row) : null;
  }

  async approvePayoutDestinationVariance(input: {
    approvalId: string;
    ledgerId: string;
    payoutId: string;
    originalDestinationId: string;
    approvedDestinationId: string;
    recipientApprovalAt: string;
    reason: string;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<PayoutDestinationVarianceApprovalRecord> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.approvalId, "Destination variance approval ID");
    assertSafeId(input.ledgerId, "Ledger ID");
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.recipientApprovalAt, "Recipient approval time");
    assertInstant(input.now, "Destination variance approval time");
    const payoutId = assertStripeObjectId(
      input.payoutId,
      STRIPE_PAYOUT_RE,
      "Stripe payout ID",
    );
    const originalDestinationId = assertStripeObjectId(
      input.originalDestinationId,
      STRIPE_BANK_ACCOUNT_RE,
      "Original payout destination ID",
    );
    const approvedDestinationId = assertStripeObjectId(
      input.approvedDestinationId,
      STRIPE_BANK_ACCOUNT_RE,
      "Approved payout destination ID",
    );
    if (originalDestinationId === approvedDestinationId) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Destination variance requires a different payout destination",
      );
    }
    const actor = boundedText(input.actor, 254, "Destination approver");
    const reason = boundedText(
      input.reason,
      240,
      "Destination variance reason",
    );
    if (reason.length < 12) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Destination variance reason must contain at least 12 characters",
      );
    }
    const [ledger, account, existing] = await Promise.all([
      this.getLedger(input.ledgerId),
      this.db
        .prepare(
          `
          SELECT a.* FROM artist_stripe_accounts a
          JOIN artist_payment_ledger l
            ON l.artist_id = a.artist_id AND l.environment = a.environment
              AND l.stripe_connected_account_id = a.stripe_account_id
          WHERE l.ledger_id = ? AND l.environment = ?
        `,
        )
        .bind(input.ledgerId, this.environment)
        .first<ArtistAccountRow>(),
      this.getPayoutDestinationVarianceApproval(input.ledgerId, payoutId),
    ]);
    if (existing) {
      if (
        existing.approvalId !== input.approvalId ||
        existing.originalDestinationId !== originalDestinationId ||
        existing.approvedDestinationId !== approvedDestinationId ||
        existing.recipientApprovalAt !== input.recipientApprovalAt ||
        existing.approvedBy !== actor ||
        existing.reason !== reason
      ) {
        throw new PayoutRepositoryError(
          "CONFLICT",
          "Payout destination variance is already bound to different evidence",
        );
      }
      return existing;
    }
    if (
      !ledger ||
      !account ||
      ![
        "TRANSFER_CREATED",
        "TRANSFER_PENDING",
        "TRANSFER_COMPLETED",
        "PAYOUT_PENDING",
        "PAYOUT_FAILED",
        "PAID",
      ].includes(ledger.state) ||
      !ledger.stripeTransferId ||
      !ledger.stripeDestinationPaymentId ||
      ledger.approvedPayoutDestinationId !== originalDestinationId ||
      ledger.approvedPayoutDestinationAt === null ||
      account.onboarding_status !== "PAYOUT_READY" ||
      account.preferred_payout_type !== "automatic_standard" ||
      account.payout_destination_id !== approvedDestinationId ||
      account.payout_ready_approved_at !== input.recipientApprovalAt
    ) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Destination variance does not match the durable transfer and current owner-approved recipient",
      );
    }
    const insert = this.db
      .prepare(
        `
        INSERT INTO payout_destination_variance_approvals (
          approval_id, environment, ledger_id, payout_id,
          original_destination_id, approved_destination_id,
          recipient_approval_at, approved_by, reason, created_at
        )
        SELECT ?, ?, l.ledger_id, ?, ?, ?, ?, ?, ?, ?
        FROM artist_payment_ledger l
        JOIN artist_stripe_accounts a
          ON a.artist_id = l.artist_id AND a.environment = l.environment
            AND a.stripe_account_id = l.stripe_connected_account_id
        WHERE l.ledger_id = ? AND l.environment = ?
          AND l.state IN ('TRANSFER_CREATED', 'TRANSFER_PENDING', 'TRANSFER_COMPLETED',
            'PAYOUT_PENDING', 'PAYOUT_FAILED', 'PAID')
          AND l.stripe_transfer_id IS NOT NULL
          AND l.stripe_destination_payment_id IS NOT NULL
          AND l.approved_payout_destination_id = ?
          AND l.approved_payout_destination_at IS NOT NULL
          AND a.onboarding_status = 'PAYOUT_READY'
          AND a.preferred_payout_type = 'automatic_standard'
          AND a.payout_destination_id = ? AND a.payout_ready_approved_at = ?
          AND NOT EXISTS (
            SELECT 1 FROM payout_destination_variance_approvals v
            WHERE v.ledger_id = l.ledger_id AND v.payout_id = ?
              AND v.environment = l.environment
          )
      `,
      )
      .bind(
        input.approvalId,
        this.environment,
        payoutId,
        originalDestinationId,
        approvedDestinationId,
        input.recipientApprovalAt,
        actor,
        reason,
        input.now,
        input.ledgerId,
        this.environment,
        originalDestinationId,
        approvedDestinationId,
        input.recipientApprovalAt,
        payoutId,
      );
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: "PAYOUT_DESTINATION_VARIANCE_OWNER_APPROVED",
        bookingId: ledger.bookingId,
        assignmentId: ledger.assignmentId,
        artistId: ledger.artistId,
        amountCents: ledger.totalApprovedPayCents,
        currency: "usd",
        connectedAccountId: ledger.connectedAccountId,
        transferId: ledger.stripeTransferId,
        payoutId,
        previousState: ledger.state,
        newState: ledger.state,
        approvalRevision: ledger.ownerApprovalRevision,
        result: "AUTHORIZED",
        requestId: input.requestId,
        batchId: ledger.batchId,
        safeDetails: {
          approvalId: input.approvalId,
          originalDestinationId,
          approvedDestinationId,
          recipientApprovalAt: input.recipientApprovalAt,
          reason,
        },
      },
      `EXISTS (
        SELECT 1 FROM payout_destination_variance_approvals
        WHERE approval_id = ? AND environment = ? AND ledger_id = ?
          AND payout_id = ?
      )`,
      [input.approvalId, this.environment, input.ledgerId, payoutId],
    );
    const resolveMismatchExceptions = this.db
      .prepare(
        `
        UPDATE payout_exceptions
        SET status = 'RESOLVED', resolved_at = ?, resolved_by = ?,
          resolution_evidence = ?
        WHERE environment = ? AND ledger_id = ?
          AND exception_type = 'PAYOUT_DESTINATION_MISMATCH'
          AND stripe_reference = ? AND status IN ('OPEN', 'ACKNOWLEDGED')
          AND EXISTS (
            SELECT 1 FROM payout_destination_variance_approvals v
            WHERE v.approval_id = ? AND v.environment = payout_exceptions.environment
              AND v.ledger_id = payout_exceptions.ledger_id
              AND v.payout_id = payout_exceptions.stripe_reference
          )
      `,
      )
      .bind(
        input.now,
        actor,
        `Exact payout destination variance approval ${input.approvalId}`,
        this.environment,
        input.ledgerId,
        payoutId,
        input.approvalId,
      );
    const results = await this.transaction([
      insert,
      resolveMismatchExceptions,
      audit,
    ]);
    if (changes(results[0]) !== 1 || changes(results[2]) !== 1) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Destination variance approval lost an atomic race",
      );
    }
    const stored = await this.getPayoutDestinationVarianceApproval(
      input.ledgerId,
      payoutId,
    );
    if (!stored || stored.approvalId !== input.approvalId) {
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Destination variance approval could not be read back",
      );
    }
    return stored;
  }

  async recordApprovedPayoutDestination(input: {
    attemptId: string;
    claimToken: string;
    payoutDestinationId: string;
    payoutDestinationApprovedAt: string;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<LedgerRecord> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.attemptId, "Transfer attempt ID");
    assertSafeId(input.claimToken, "Execution claim token");
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.payoutDestinationApprovedAt, "Payout approval time");
    assertInstant(input.now, "Payout destination snapshot time");
    const payoutDestinationId = assertStripeObjectId(
      input.payoutDestinationId,
      STRIPE_BANK_ACCOUNT_RE,
      "Approved payout destination ID",
    );
    const actor = boundedText(input.actor, 254, "Actor");
    const attempt = await this.db
      .prepare(
        `
        SELECT * FROM payout_transfer_attempts
        WHERE attempt_id = ? AND environment = ? AND attempt_status = 'CLAIMED'
          AND EXISTS (
            SELECT 1 FROM payout_batches b
            WHERE b.batch_id = payout_transfer_attempts.batch_id
              AND b.environment = payout_transfer_attempts.environment
              AND b.status = 'EXECUTING' AND b.execution_claim_token = ?
          )
      `,
      )
      .bind(input.attemptId, this.environment, input.claimToken)
      .first<TransferAttemptRow>();
    if (!attempt) {
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "A claimed transfer attempt is required before destination snapshotting",
      );
    }
    const ledger = await this.getLedger(attempt.ledger_id);
    if (!ledger || ledger.batchId !== attempt.batch_id) {
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Transfer attempt is not bound to its approved ledger",
      );
    }
    const canReplaceFailedPreStripeSnapshot =
      attempt.destination_resnapshot_authorized === 1 &&
      attempt.stripe_transfer_id === null &&
      ledger.stripeTransferId === null &&
      ledger.stripeDestinationPaymentId === null &&
      ledger.stripePayoutId === null;
    if (
      (ledger.approvedPayoutDestinationId !== null ||
        ledger.approvedPayoutDestinationAt !== null) &&
      (ledger.approvedPayoutDestinationId !== payoutDestinationId ||
        ledger.approvedPayoutDestinationAt !==
          input.payoutDestinationApprovedAt) &&
      !canReplaceFailedPreStripeSnapshot
    ) {
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Approved payout destination snapshot cannot be replaced",
      );
    }
    const update = this.db
      .prepare(
        `
        UPDATE artist_payment_ledger
        SET approved_payout_destination_id = ?,
          approved_payout_destination_at = ?, updated_at = ?
        WHERE ledger_id = ? AND environment = ? AND batch_id = ?
          AND state = 'TRANSFER_QUEUED'
          AND (
            (approved_payout_destination_id IS NULL AND approved_payout_destination_at IS NULL)
            OR (approved_payout_destination_id = ? AND approved_payout_destination_at = ?)
            OR (? = 1 AND stripe_transfer_id IS NULL
              AND stripe_destination_payment_id IS NULL AND stripe_payout_id IS NULL)
          )
          AND EXISTS (
            SELECT 1 FROM payout_transfer_attempts a
            WHERE a.attempt_id = ? AND a.ledger_id = artist_payment_ledger.ledger_id
              AND a.batch_id = artist_payment_ledger.batch_id
              AND a.environment = artist_payment_ledger.environment
              AND a.attempt_status = 'CLAIMED'
              AND a.destination_resnapshot_authorized = ?
              AND EXISTS (
                SELECT 1 FROM payout_batches b
                WHERE b.batch_id = a.batch_id AND b.environment = a.environment
                  AND b.status = 'EXECUTING' AND b.execution_claim_token = ?
              )
          )
      `,
      )
      .bind(
        payoutDestinationId,
        input.payoutDestinationApprovedAt,
        input.now,
        ledger.ledgerId,
        this.environment,
        ledger.batchId,
        payoutDestinationId,
        input.payoutDestinationApprovedAt,
        canReplaceFailedPreStripeSnapshot ? 1 : 0,
        input.attemptId,
        attempt.destination_resnapshot_authorized,
        input.claimToken,
      );
    const consumeResnapshotAuthorization = this.db
      .prepare(
        `
        UPDATE payout_transfer_attempts
        SET destination_resnapshot_authorized = 0, updated_at = ?
        WHERE attempt_id = ? AND ledger_id = ? AND batch_id = ?
          AND environment = ? AND attempt_status = 'CLAIMED'
          AND destination_resnapshot_authorized = ?
          AND stripe_transfer_id IS NULL
          AND EXISTS (
            SELECT 1 FROM payout_batches b
            WHERE b.batch_id = payout_transfer_attempts.batch_id
              AND b.environment = payout_transfer_attempts.environment
              AND b.status = 'EXECUTING' AND b.execution_claim_token = ?
          )
      `,
      )
      .bind(
        input.now,
        input.attemptId,
        ledger.ledgerId,
        ledger.batchId,
        this.environment,
        attempt.destination_resnapshot_authorized,
        input.claimToken,
      );
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: canReplaceFailedPreStripeSnapshot
          ? "PAYOUT_DESTINATION_APPROVAL_RESNAPSHOTTED_AFTER_SAFE_FAILURE"
          : "PAYOUT_DESTINATION_APPROVAL_SNAPSHOTTED",
        bookingId: ledger.bookingId,
        assignmentId: ledger.assignmentId,
        artistId: ledger.artistId,
        amountCents: ledger.totalApprovedPayCents,
        currency: "usd",
        connectedAccountId: ledger.connectedAccountId,
        previousState: ledger.state,
        newState: ledger.state,
        approvalRevision: ledger.ownerApprovalRevision,
        result: "SUCCESS",
        requestId: input.requestId,
        batchId: ledger.batchId,
        safeDetails: {
          attemptId: input.attemptId,
          payoutDestinationId,
          payoutDestinationApprovedAt: input.payoutDestinationApprovedAt,
          replacedPriorApproval: canReplaceFailedPreStripeSnapshot,
        },
      },
      `EXISTS (
        SELECT 1 FROM artist_payment_ledger
        WHERE ledger_id = ? AND environment = ?
          AND approved_payout_destination_id = ?
          AND approved_payout_destination_at = ? AND updated_at = ?
          AND EXISTS (
            SELECT 1 FROM payout_batches b
            WHERE b.batch_id = artist_payment_ledger.batch_id
              AND b.environment = artist_payment_ledger.environment
              AND b.status = 'EXECUTING' AND b.execution_claim_token = ?
          )
      )`,
      [
        ledger.ledgerId,
        this.environment,
        payoutDestinationId,
        input.payoutDestinationApprovedAt,
        input.now,
        input.claimToken,
      ],
    );
    const results = await this.transaction([
      update,
      consumeResnapshotAuthorization,
      audit,
    ]);
    if (
      changes(results[0]) !== 1 ||
      changes(results[1]) !== 1 ||
      changes(results[2]) !== 1
    ) {
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Payout destination approval snapshot lost an atomic race",
      );
    }
    const stored = await this.getLedger(ledger.ledgerId);
    if (
      !stored ||
      stored.approvedPayoutDestinationId !== payoutDestinationId ||
      stored.approvedPayoutDestinationAt !== input.payoutDestinationApprovedAt
    ) {
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Payout destination approval snapshot could not be read back",
      );
    }
    return stored;
  }

  async recordTransferSucceeded(input: {
    attemptId: string;
    claimToken: string;
    stripeTransferId: string;
    destinationPaymentId: string;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<LedgerRecord> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.attemptId, "Transfer attempt ID");
    assertSafeId(input.claimToken, "Execution claim token");
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.now, "Transfer result time");
    const transferId = assertStripeObjectId(
      input.stripeTransferId,
      STRIPE_TRANSFER_RE,
      "Stripe transfer ID",
    );
    const destinationPaymentId = assertStripeObjectId(
      input.destinationPaymentId,
      STRIPE_DESTINATION_PAYMENT_RE,
      "Destination payment ID",
    );
    const actor = boundedText(input.actor, 254, "Actor");
    const attempt = await this.db
      .prepare(
        `SELECT * FROM payout_transfer_attempts
         WHERE attempt_id = ? AND environment = ?
           AND EXISTS (
             SELECT 1 FROM payout_batches b
             WHERE b.batch_id = payout_transfer_attempts.batch_id
               AND b.environment = payout_transfer_attempts.environment
               AND b.status = 'EXECUTING' AND b.execution_claim_token = ?
           )`,
      )
      .bind(input.attemptId, this.environment, input.claimToken)
      .first<TransferAttemptRow>();
    if (!attempt)
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Transfer success requires the current batch execution claim",
      );
    const boundLedger = await this.getLedger(attempt.ledger_id);
    if (!boundLedger || boundLedger.batchId !== attempt.batch_id)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Transfer attempt is not bound to its approved ledger",
      );
    if (
      !boundLedger.approvedPayoutDestinationId ||
      !boundLedger.approvedPayoutDestinationAt
    ) {
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Transfer result is missing its durable approved payout destination snapshot",
      );
    }
    if (
      attempt.stripe_transfer_id &&
      attempt.stripe_transfer_id !== transferId
    ) {
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Transfer attempt is already bound to another Stripe transfer",
      );
    }
    if (
      attempt.attempt_status === "STRIPE_SUCCEEDED" ||
      attempt.attempt_status === "RECONCILED"
    ) {
      const stored = await this.getLedger(attempt.ledger_id);
      if (
        !stored ||
        stored.stripeTransferId !== transferId ||
        stored.stripeDestinationPaymentId !== destinationPaymentId
      ) {
        throw new PayoutRepositoryError(
          "DATA_INTEGRITY",
          "Successful transfer attempt and ledger disagree",
        );
      }
      return stored;
    }
    const attemptUpdate = this.db
      .prepare(
        `
        UPDATE payout_transfer_attempts SET attempt_status = 'STRIPE_SUCCEEDED',
          stripe_transfer_id = ?, safe_error_code = NULL, updated_at = ?
        WHERE attempt_id = ? AND environment = ?
          AND attempt_status IN ('CLAIMED', 'STRIPE_SUCCEEDED')
          AND (stripe_transfer_id IS NULL OR stripe_transfer_id = ?)
          AND EXISTS (
            SELECT 1 FROM payout_batches b
            WHERE b.batch_id = payout_transfer_attempts.batch_id
              AND b.environment = payout_transfer_attempts.environment
              AND b.status = 'EXECUTING' AND b.execution_claim_token = ?
          )
      `,
      )
      .bind(
        transferId,
        input.now,
        input.attemptId,
        this.environment,
        transferId,
        input.claimToken,
      );
    const itemUpdate = this.db
      .prepare(
        `
        UPDATE payout_batch_items SET item_status = 'TRANSFER_CREATED',
          failure_code = NULL, failure_reason = NULL, updated_at = ?
        WHERE batch_id = ? AND ledger_id = ? AND environment = ?
          AND item_status IN ('TRANSFER_QUEUED', 'TRANSFER_CREATED')
          AND EXISTS (
            SELECT 1 FROM payout_transfer_attempts a
            WHERE a.attempt_id = ? AND a.environment = payout_batch_items.environment
              AND a.attempt_status = 'STRIPE_SUCCEEDED' AND a.stripe_transfer_id = ?
              AND EXISTS (
                SELECT 1 FROM payout_batches b
                WHERE b.batch_id = a.batch_id AND b.environment = a.environment
                  AND b.status = 'EXECUTING' AND b.execution_claim_token = ?
              )
          )
      `,
      )
      .bind(
        input.now,
        attempt.batch_id,
        attempt.ledger_id,
        this.environment,
        input.attemptId,
        transferId,
        input.claimToken,
      );
    const ledgerUpdate = this.db
      .prepare(
        `
        UPDATE artist_payment_ledger SET state = 'TRANSFER_CREATED',
          stripe_transfer_id = ?, stripe_destination_payment_id = ?,
          stripe_transfer_status = 'created', failure_code = NULL,
          failure_reason = NULL, updated_at = ?
        WHERE ledger_id = ? AND environment = ? AND batch_id = ?
          AND state IN ('TRANSFER_QUEUED', 'TRANSFER_CREATED')
          AND total_approved_pay_cents = ? AND stripe_connected_account_id = ?
          AND approved_payout_destination_id IS NOT NULL
          AND approved_payout_destination_at IS NOT NULL
          AND (stripe_transfer_id IS NULL OR stripe_transfer_id = ?)
          AND EXISTS (
            SELECT 1 FROM payout_batches b
            WHERE b.batch_id = artist_payment_ledger.batch_id
              AND b.environment = artist_payment_ledger.environment
              AND b.status = 'EXECUTING' AND b.execution_claim_token = ?
          )
          AND EXISTS (
            SELECT 1 FROM payout_batch_items i
            WHERE i.batch_id = ? AND i.ledger_id = artist_payment_ledger.ledger_id
              AND i.environment = artist_payment_ledger.environment
              AND i.item_status = 'TRANSFER_CREATED'
              AND artist_payment_ledger.source_revision = i.source_revision_snapshot
              AND artist_payment_ledger.material_digest = i.material_digest_snapshot
              AND artist_payment_ledger.payment_memo = i.payment_memo_snapshot
          )
      `,
      )
      .bind(
        transferId,
        destinationPaymentId,
        input.now,
        attempt.ledger_id,
        this.environment,
        attempt.batch_id,
        attempt.request_amount_cents,
        attempt.destination_account_id,
        transferId,
        input.claimToken,
        attempt.batch_id,
      );
    const batchProgress = this.db
      .prepare(
        `
        UPDATE payout_batches SET status = 'PARTIALLY_COMPLETED',
          blocked_item_count = (
            SELECT COUNT(*) FROM payout_batch_items i
            WHERE i.batch_id = payout_batches.batch_id AND i.environment = payout_batches.environment
              AND i.item_status IN ('FAILED', 'BLOCKED', 'REVERSED')
          ),
          execution_completed_at = ?, updated_at = ?
        WHERE batch_id = ? AND environment = ? AND status = 'EXECUTING'
          AND execution_claim_token = ?
          AND NOT EXISTS (
            SELECT 1 FROM payout_batch_items i
            WHERE i.batch_id = payout_batches.batch_id AND i.environment = payout_batches.environment
              AND i.item_status IN ('PREPARED', 'APPROVED', 'TRANSFER_QUEUED')
          )
      `,
      )
      .bind(
        input.now,
        input.now,
        attempt.batch_id,
        this.environment,
        input.claimToken,
      );
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: "STRIPE_TRANSFER_CREATED",
        bookingId: boundLedger.bookingId,
        assignmentId: boundLedger.assignmentId,
        artistId: boundLedger.artistId,
        amountCents: attempt.request_amount_cents,
        currency: "usd",
        connectedAccountId: attempt.destination_account_id,
        transferId,
        previousState: "TRANSFER_QUEUED",
        newState: "TRANSFER_CREATED",
        approvalRevision: boundLedger.ownerApprovalRevision,
        idempotencyFingerprint: attempt.idempotency_fingerprint,
        result: "SUCCESS",
        requestId: input.requestId,
        batchId: attempt.batch_id,
        safeDetails: {
          attemptId: input.attemptId,
          destinationPaymentRecorded: Boolean(destinationPaymentId),
        },
      },
      `EXISTS (
        SELECT 1 FROM artist_payment_ledger
        WHERE ledger_id = ? AND environment = ? AND stripe_transfer_id = ?
          AND EXISTS (
            SELECT 1 FROM payout_batches b
            WHERE b.batch_id = artist_payment_ledger.batch_id
              AND b.environment = artist_payment_ledger.environment
              AND b.status IN ('EXECUTING', 'PARTIALLY_COMPLETED')
              AND b.execution_claim_token = ?
          )
      )`,
      [attempt.ledger_id, this.environment, transferId, input.claimToken],
    );
    const results = await this.transaction([
      attemptUpdate,
      itemUpdate,
      ledgerUpdate,
      batchProgress,
      audit,
    ]);
    if (
      changes(results[0]) !== 1 ||
      changes(results[1]) !== 1 ||
      changes(results[2]) !== 1 ||
      changes(results[4]) !== 1
    ) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Transfer result could not be atomically persisted",
      );
    }
    const ledger = await this.getLedger(attempt.ledger_id);
    if (!ledger)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Transfer ledger could not be read back",
      );
    return ledger;
  }

  async recordTransferFailed(input: {
    attemptId: string;
    claimToken: string;
    safeErrorCode: string;
    safeReason: string;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<LedgerRecord> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.attemptId, "Transfer attempt ID");
    assertSafeId(input.claimToken, "Execution claim token");
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.now, "Transfer failure time");
    const code = boundedText(input.safeErrorCode, 80, "Safe error code");
    if (!PROVEN_PRE_STRIPE_FAILURE_CODES.has(code)) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Only a proven pre-Stripe failure can enter the safe transfer retry path",
      );
    }
    const reason = boundedText(input.safeReason, 240, "Safe failure reason");
    const actor = boundedText(input.actor, 254, "Actor");
    const attempt = await this.db
      .prepare(
        `SELECT * FROM payout_transfer_attempts
         WHERE attempt_id = ? AND environment = ?
           AND EXISTS (
             SELECT 1 FROM payout_batches b
             WHERE b.batch_id = payout_transfer_attempts.batch_id
               AND b.environment = payout_transfer_attempts.environment
               AND b.status = 'EXECUTING' AND b.execution_claim_token = ?
           )`,
      )
      .bind(input.attemptId, this.environment, input.claimToken)
      .first<TransferAttemptRow>();
    if (!attempt)
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Transfer failure requires the current batch execution claim",
      );
    const boundLedger = await this.getLedger(attempt.ledger_id);
    if (!boundLedger || boundLedger.batchId !== attempt.batch_id)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Transfer attempt is not bound to its approved ledger",
      );
    if (
      attempt.attempt_status === "STRIPE_SUCCEEDED" ||
      attempt.attempt_status === "RECONCILED"
    ) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "A successful transfer cannot be overwritten as failed",
      );
    }
    if (attempt.attempt_status === "STRIPE_FAILED") {
      const stored = await this.getLedger(attempt.ledger_id);
      if (!stored || stored.state !== "TRANSFER_FAILED") {
        throw new PayoutRepositoryError(
          "DATA_INTEGRITY",
          "Failed transfer attempt and ledger disagree",
        );
      }
      return stored;
    }
    const statements = [
      this.db
        .prepare(
          `
          UPDATE payout_transfer_attempts SET attempt_status = 'STRIPE_FAILED',
            safe_error_code = ?, retry_count = retry_count + 1, updated_at = ?
          WHERE attempt_id = ? AND environment = ? AND attempt_status IN ('CLAIMED', 'STRIPE_FAILED')
            AND EXISTS (
              SELECT 1 FROM payout_batches b
              WHERE b.batch_id = payout_transfer_attempts.batch_id
                AND b.environment = payout_transfer_attempts.environment
                AND b.status = 'EXECUTING' AND b.execution_claim_token = ?
            )
        `,
        )
        .bind(
          code,
          input.now,
          input.attemptId,
          this.environment,
          input.claimToken,
        ),
      this.db
        .prepare(
          `
          UPDATE payout_batch_items SET item_status = 'FAILED', failure_code = ?,
            failure_reason = ?, updated_at = ?
          WHERE batch_id = ? AND ledger_id = ? AND environment = ?
            AND item_status IN ('TRANSFER_QUEUED', 'FAILED')
            AND EXISTS (
              SELECT 1 FROM payout_batches b
              WHERE b.batch_id = payout_batch_items.batch_id
                AND b.environment = payout_batch_items.environment
                AND b.status = 'EXECUTING' AND b.execution_claim_token = ?
            )
        `,
        )
        .bind(
          code,
          reason,
          input.now,
          attempt.batch_id,
          attempt.ledger_id,
          this.environment,
          input.claimToken,
        ),
      this.db
        .prepare(
          `
          UPDATE artist_payment_ledger SET state = 'TRANSFER_FAILED', failure_code = ?,
            failure_reason = ?, stripe_transfer_status = 'failed', updated_at = ?
          WHERE ledger_id = ? AND batch_id = ? AND environment = ?
            AND state IN ('TRANSFER_QUEUED', 'TRANSFER_FAILED')
            AND EXISTS (
              SELECT 1 FROM payout_batches b
              WHERE b.batch_id = artist_payment_ledger.batch_id
                AND b.environment = artist_payment_ledger.environment
                AND b.status = 'EXECUTING' AND b.execution_claim_token = ?
            )
        `,
        )
        .bind(
          code,
          reason,
          input.now,
          attempt.ledger_id,
          attempt.batch_id,
          this.environment,
          input.claimToken,
        ),
      this.db
        .prepare(
          `
          UPDATE payout_batches SET status = 'PARTIALLY_COMPLETED',
            blocked_item_count = (
              SELECT COUNT(*) FROM payout_batch_items i
              WHERE i.batch_id = payout_batches.batch_id AND i.environment = payout_batches.environment
                AND i.item_status IN ('FAILED', 'BLOCKED', 'REVERSED')
            ),
            execution_completed_at = ?, updated_at = ?
          WHERE batch_id = ? AND environment = ? AND status = 'EXECUTING'
            AND execution_claim_token = ?
            AND NOT EXISTS (
              SELECT 1 FROM payout_batch_items i
              WHERE i.batch_id = payout_batches.batch_id AND i.environment = payout_batches.environment
                AND i.item_status IN ('PREPARED', 'APPROVED', 'TRANSFER_QUEUED')
            )
        `,
        )
        .bind(
          input.now,
          input.now,
          attempt.batch_id,
          this.environment,
          input.claimToken,
        ),
      this.auditStatement(
        {
          auditId: input.auditId,
          timestamp: input.now,
          actor,
          action: "STRIPE_TRANSFER_FAILED",
          bookingId: boundLedger.bookingId,
          assignmentId: boundLedger.assignmentId,
          artistId: boundLedger.artistId,
          amountCents: attempt.request_amount_cents,
          currency: "usd",
          connectedAccountId: attempt.destination_account_id,
          previousState: "TRANSFER_QUEUED",
          newState: "TRANSFER_FAILED",
          approvalRevision: boundLedger.ownerApprovalRevision,
          idempotencyFingerprint: attempt.idempotency_fingerprint,
          result: "FAILED",
          failureReason: code,
          requestId: input.requestId,
          batchId: attempt.batch_id,
          safeDetails: { attemptId: input.attemptId },
        },
        `EXISTS (
          SELECT 1 FROM payout_batches
          WHERE batch_id = ? AND environment = ?
            AND status IN ('EXECUTING', 'PARTIALLY_COMPLETED')
            AND execution_claim_token = ?
        )`,
        [attempt.batch_id, this.environment, input.claimToken],
      ),
    ];
    const results = await this.transaction(statements);
    if (
      changes(results[0]) !== 1 ||
      changes(results[1]) !== 1 ||
      changes(results[2]) !== 1 ||
      changes(results[4]) !== 1
    ) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Transfer failure could not be atomically persisted",
      );
    }
    const ledger = await this.getLedger(attempt.ledger_id);
    if (!ledger)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Failed transfer ledger could not be read back",
      );
    return ledger;
  }

  async recordTransferLifecycle(input: {
    ledgerId: string;
    stripeTransferId: string;
    status: "pending" | "completed" | "reversed";
    safeFailureReason?: string | null;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<{ applied: boolean; ledger: LedgerRecord }> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.ledgerId, "Ledger ID");
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.now, "Transfer event time");
    const actor = boundedText(input.actor, 254, "Actor");
    const transferId = assertStripeObjectId(
      input.stripeTransferId,
      STRIPE_TRANSFER_RE,
      "Stripe transfer ID",
    );
    const existing = await this.getLedger(input.ledgerId);
    if (!existing || existing.stripeTransferId !== transferId) {
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Transfer ledger was not found in this environment",
      );
    }
    const target: PayoutState =
      input.status === "pending"
        ? "TRANSFER_PENDING"
        : input.status === "completed"
          ? "TRANSFER_COMPLETED"
          : "REVERSED";
    const allowed: PayoutState[] =
      input.status === "pending"
        ? ["TRANSFER_CREATED"]
        : input.status === "completed"
          ? ["TRANSFER_CREATED", "TRANSFER_PENDING"]
          : [
              "TRANSFER_CREATED",
              "TRANSFER_PENDING",
              "TRANSFER_COMPLETED",
              "PAYOUT_PENDING",
              "PAID",
            ];
    if (!allowed.includes(existing.state))
      return { applied: false, ledger: existing };
    assertTransition(existing.state, target);
    const reason = input.safeFailureReason
      ? boundedText(input.safeFailureReason, 240, "Safe reversal reason")
      : null;
    const update = this.db
      .prepare(
        `
        UPDATE artist_payment_ledger SET state = ?, stripe_transfer_status = ?,
          failure_reason = ?, reconciled = CASE WHEN ? = 'REVERSED' THEN 0 ELSE reconciled END,
          reconciled_at = CASE WHEN ? = 'REVERSED' THEN NULL ELSE reconciled_at END,
          crm_correction_required = CASE WHEN ? = 'REVERSED' THEN 1 ELSE crm_correction_required END,
          crm_correction_projection_at = CASE WHEN ? = 'REVERSED' THEN NULL ELSE crm_correction_projection_at END,
          updated_at = ?
        WHERE ledger_id = ? AND environment = ? AND stripe_transfer_id = ? AND state = ?
          AND (reconciliation_claim_token IS NULL OR reconciliation_claim_expires_at <= ?)
      `,
      )
      .bind(
        target,
        input.status,
        reason,
        target,
        target,
        target,
        target,
        input.now,
        input.ledgerId,
        this.environment,
        transferId,
        existing.state,
        input.now,
      );
    const statements: D1PreparedStatement[] = [update];
    if (target === "REVERSED") {
      statements.push(
        this.db
          .prepare(
            `
            UPDATE payout_batch_items SET item_status = 'REVERSED',
              failure_code = 'TRANSFER_REVERSED', failure_reason = ?, updated_at = ?
            WHERE batch_id = ? AND ledger_id = ? AND environment = ?
              AND item_status IN ('TRANSFER_CREATED', 'COMPLETED')
              AND EXISTS (
                SELECT 1 FROM artist_payment_ledger l
                WHERE l.ledger_id = payout_batch_items.ledger_id
                  AND l.environment = payout_batch_items.environment
                  AND l.state = 'REVERSED' AND l.stripe_transfer_id = ?
              )
          `,
          )
          .bind(
            reason ?? "Stripe transfer reversed",
            input.now,
            existing.batchId,
            input.ledgerId,
            this.environment,
            transferId,
          ),
        this.db
          .prepare(
            `
            UPDATE payout_batches SET status = 'PARTIALLY_COMPLETED',
              blocked_item_count = (
                SELECT COUNT(*) FROM payout_batch_items i
                WHERE i.batch_id = payout_batches.batch_id AND i.environment = payout_batches.environment
                  AND i.item_status IN ('FAILED', 'BLOCKED', 'REVERSED')
              ), updated_at = ?
            WHERE batch_id = ? AND environment = ?
              AND status IN ('EXECUTING', 'PARTIALLY_COMPLETED', 'COMPLETED')
          `,
          )
          .bind(input.now, existing.batchId, this.environment),
      );
    }
    statements.push(
      this.auditStatement(
        {
          auditId: input.auditId,
          timestamp: input.now,
          actor,
          action: `STRIPE_TRANSFER_${input.status.toUpperCase()}`,
          bookingId: existing.bookingId,
          assignmentId: existing.assignmentId,
          artistId: existing.artistId,
          amountCents: existing.totalApprovedPayCents,
          currency: "usd",
          connectedAccountId: existing.connectedAccountId,
          transferId,
          previousState: existing.state,
          newState: target,
          approvalRevision: existing.ownerApprovalRevision,
          result: "SUCCESS",
          requestId: input.requestId,
          batchId: existing.batchId,
          safeDetails: { stripeStatus: input.status },
        },
        `EXISTS (
          SELECT 1 FROM artist_payment_ledger
          WHERE ledger_id = ? AND environment = ? AND state = ? AND updated_at = ?
        )`,
        [input.ledgerId, this.environment, target, input.now],
      ),
    );
    const results = await this.transaction(statements);
    const ledger = await this.getLedger(input.ledgerId);
    if (!ledger)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Transfer ledger disappeared",
      );
    if (
      changes(results[0]) !== 1 ||
      changes(results[results.length - 1]) !== 1
    ) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Transfer lifecycle update lost its atomic audit race",
      );
    }
    return { applied: true, ledger };
  }

  async recordPayoutPending(input: {
    ledgerId: string;
    payoutId: string;
    payoutStatus: string;
    expectedArrival: string | null;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<{ applied: boolean; ledger: LedgerRecord }> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.ledgerId, "Ledger ID");
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.now, "Payout event time");
    const actor = boundedText(input.actor, 254, "Actor");
    const payoutId = assertStripeObjectId(
      input.payoutId,
      STRIPE_PAYOUT_RE,
      "Stripe payout ID",
    );
    const payoutStatus = boundedText(input.payoutStatus, 80, "Payout status");
    if (
      input.expectedArrival &&
      !isIsoDate(input.expectedArrival) &&
      !isIsoInstant(input.expectedArrival)
    ) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Expected arrival is malformed",
      );
    }
    const existing = await this.getLedger(input.ledgerId);
    if (!existing)
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Payout ledger was not found",
      );
    if (
      existing.state === "PAID" &&
      existing.stripePayoutId === payoutId &&
      existing.stripePayoutStatus === payoutStatus &&
      existing.expectedArrival === input.expectedArrival
    ) {
      return { applied: false, ledger: existing };
    }
    if (
      !["TRANSFER_COMPLETED", "PAYOUT_PENDING", "PAYOUT_FAILED"].includes(
        existing.state,
      )
    ) {
      return { applied: false, ledger: existing };
    }
    assertTransition(existing.state, "PAYOUT_PENDING");
    const update = this.db
      .prepare(
        `
        UPDATE artist_payment_ledger SET state = 'PAYOUT_PENDING', stripe_payout_id = ?,
          stripe_payout_status = ?, expected_arrival = ?, failure_code = NULL,
          failure_reason = NULL,
          reconciliation_projection_at = CASE
            WHEN state = 'PAYOUT_FAILED' THEN NULL ELSE reconciliation_projection_at END,
          updated_at = ?
        WHERE ledger_id = ? AND environment = ?
          AND state IN ('TRANSFER_COMPLETED', 'PAYOUT_PENDING', 'PAYOUT_FAILED')
          AND crm_correction_required = 0
          AND stripe_destination_payment_id IS NOT NULL
          AND (reconciliation_claim_token IS NULL OR reconciliation_claim_expires_at <= ?)
          AND (
            stripe_payout_id IS NULL OR stripe_payout_id = ?
            OR (state = 'PAYOUT_FAILED' AND stripe_payout_status IN ('failed', 'canceled'))
          )
      `,
      )
      .bind(
        payoutId,
        payoutStatus,
        input.expectedArrival,
        input.now,
        input.ledgerId,
        this.environment,
        input.now,
        payoutId,
      );
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: "STRIPE_PAYOUT_PENDING",
        bookingId: existing.bookingId,
        assignmentId: existing.assignmentId,
        artistId: existing.artistId,
        amountCents: existing.totalApprovedPayCents,
        currency: "usd",
        connectedAccountId: existing.connectedAccountId,
        transferId: existing.stripeTransferId,
        payoutId,
        previousState: existing.state,
        newState: "PAYOUT_PENDING",
        approvalRevision: existing.ownerApprovalRevision,
        result: "SUCCESS",
        requestId: input.requestId,
        batchId: existing.batchId,
        safeDetails: { payoutStatus, expectedArrival: input.expectedArrival },
      },
      `EXISTS (
        SELECT 1 FROM artist_payment_ledger
        WHERE ledger_id = ? AND environment = ? AND state = 'PAYOUT_PENDING'
          AND stripe_payout_id = ? AND updated_at = ?
      )`,
      [input.ledgerId, this.environment, payoutId, input.now],
    );
    const results = await this.transaction([update, audit]);
    const ledger = await this.getLedger(input.ledgerId);
    if (!ledger)
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Payout ledger was not found",
      );
    if (changes(results[0]) !== 1 || changes(results[1]) !== 1) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Payout pending evidence lost its atomic audit race",
      );
    }
    return { applied: true, ledger };
  }

  async recordStripePayoutPaidEvidence(input: {
    ledgerId: string;
    payoutId: string;
    payoutStatus: "paid";
    expectedArrival: string | null;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<{ applied: boolean; ledger: LedgerRecord }> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.ledgerId, "Ledger ID");
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.now, "Payout event time");
    const payoutId = assertStripeObjectId(
      input.payoutId,
      STRIPE_PAYOUT_RE,
      "Stripe payout ID",
    );
    if (input.payoutStatus !== "paid") {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Paid evidence requires Stripe payout status paid",
      );
    }
    if (
      input.expectedArrival &&
      !isIsoDate(input.expectedArrival) &&
      !isIsoInstant(input.expectedArrival)
    ) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Expected arrival is malformed",
      );
    }
    const actor = boundedText(input.actor, 254, "Actor");
    const existing = await this.getLedger(input.ledgerId);
    if (!existing)
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Payout ledger was not found",
      );
    if (
      existing.state === "PAID" &&
      existing.stripePayoutId === payoutId &&
      existing.stripePayoutStatus === "paid" &&
      existing.expectedArrival === input.expectedArrival
    ) {
      return { applied: false, ledger: existing };
    }
    if (existing.state === "PAID" || existing.state === "REVERSED")
      return { applied: false, ledger: existing };
    if (
      !["TRANSFER_COMPLETED", "PAYOUT_PENDING", "PAYOUT_FAILED"].includes(
        existing.state,
      )
    ) {
      return { applied: false, ledger: existing };
    }
    const update = this.db
      .prepare(
        `
        UPDATE artist_payment_ledger SET state = 'PAID', stripe_payout_id = ?,
          stripe_payout_status = 'paid', expected_arrival = ?, reconciled = 0,
          reconciled_at = NULL, failure_code = NULL, failure_reason = NULL,
          reconciliation_projection_at = CASE
            WHEN state = 'PAYOUT_FAILED' THEN NULL ELSE reconciliation_projection_at END,
          updated_at = ?
        WHERE ledger_id = ? AND environment = ?
          AND state IN ('TRANSFER_COMPLETED', 'PAYOUT_PENDING', 'PAYOUT_FAILED')
          AND crm_correction_required = 0
          AND stripe_destination_payment_id IS NOT NULL
          AND (reconciliation_claim_token IS NULL OR reconciliation_claim_expires_at <= ?)
          AND (
            stripe_payout_id IS NULL OR stripe_payout_id = ?
            OR (state = 'PAYOUT_FAILED' AND stripe_payout_status IN ('failed', 'canceled'))
          )
      `,
      )
      .bind(
        payoutId,
        input.expectedArrival,
        input.now,
        input.ledgerId,
        this.environment,
        input.now,
        payoutId,
      );
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: "STRIPE_PAYOUT_PAID_EVIDENCE_RECORDED",
        bookingId: existing.bookingId,
        assignmentId: existing.assignmentId,
        artistId: existing.artistId,
        amountCents: existing.totalApprovedPayCents,
        currency: "usd",
        connectedAccountId: existing.connectedAccountId,
        transferId: existing.stripeTransferId,
        payoutId,
        previousState: existing.state,
        newState: "PAID",
        approvalRevision: existing.ownerApprovalRevision,
        result: "AWAITING_CRM_READBACK",
        requestId: input.requestId,
        batchId: existing.batchId,
        safeDetails: {
          payoutStatus: "paid",
          expectedArrival: input.expectedArrival,
        },
      },
      `EXISTS (
        SELECT 1 FROM artist_payment_ledger
        WHERE ledger_id = ? AND environment = ? AND state = 'PAID'
          AND stripe_payout_id = ? AND stripe_payout_status = 'paid'
          AND reconciled = 0 AND updated_at = ?
      )`,
      [input.ledgerId, this.environment, payoutId, input.now],
    );
    const results = await this.transaction([update, audit]);
    const ledger = await this.getLedger(input.ledgerId);
    if (!ledger)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Payout ledger disappeared",
      );
    if (changes(results[0]) !== 1 || changes(results[1]) !== 1) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Stripe paid evidence lost its atomic audit race",
      );
    }
    return { applied: true, ledger };
  }

  async finalizePayoutReconciliation(input: {
    ledgerId: string;
    payoutId: string;
    claimToken: string;
    expectedCrmRecordId: string;
    expectedCrmRevision: string;
    crmReadbackRevision: string;
    actor: string;
    auditId: string;
    requestId: string | null;
    reconciledAt: string;
    now: string;
  }): Promise<{ applied: boolean; ledger: LedgerRecord }> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.ledgerId, "Ledger ID");
    assertSafeId(input.claimToken, "Reconciliation claim token");
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.reconciledAt, "Reconciliation time");
    assertInstant(input.now, "Reconciliation write time");
    const payoutId = assertStripeObjectId(
      input.payoutId,
      STRIPE_PAYOUT_RE,
      "Stripe payout ID",
    );
    assertSafeId(input.expectedCrmRecordId, "Expected CRM record ID");
    const expectedCrmRevision = boundedText(
      input.expectedCrmRevision,
      200,
      "Expected CRM source revision",
    );
    const crmReadbackRevision = boundedText(
      input.crmReadbackRevision,
      200,
      "CRM readback revision",
    );
    const actor = boundedText(input.actor, 254, "Actor");
    const existing = await this.getLedger(input.ledgerId);
    if (!existing)
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Payout ledger was not found",
      );
    if (
      existing.state === "PAID" &&
      existing.reconciled &&
      existing.stripePayoutId === payoutId
    ) {
      if (
        existing.crmRecordId === input.expectedCrmRecordId &&
        existing.crmRevision === expectedCrmRevision &&
        existing.crmReconciledRevision === crmReadbackRevision
      ) {
        return { applied: false, ledger: existing };
      }
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Reconciled payout CRM evidence does not match",
      );
    }
    if (
      existing.state !== "PAID" ||
      existing.stripePayoutId !== payoutId ||
      existing.stripePayoutStatus !== "paid" ||
      !existing.stripeDestinationPaymentId ||
      existing.crmRecordId !== input.expectedCrmRecordId ||
      existing.crmRevision !== expectedCrmRevision
    ) {
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Closed-loop reconciliation requires matching source-bound CRM and Stripe paid evidence first",
      );
    }
    const ledgerUpdate = this.db
      .prepare(
        `
        UPDATE artist_payment_ledger SET reconciled = 1,
          reconciled_at = ?, crm_reconciled_revision = ?, crm_correction_required = 0,
          reconciliation_claim_token = NULL, reconciliation_claim_expires_at = NULL,
          failure_code = NULL, failure_reason = NULL, updated_at = ?
        WHERE ledger_id = ? AND environment = ? AND state = 'PAID'
          AND stripe_payout_id = ? AND stripe_payout_status = 'paid'
          AND stripe_destination_payment_id IS NOT NULL AND reconciled = 0
          AND crm_record_id = ? AND crm_revision = ?
          AND reconciliation_claim_token = ? AND reconciliation_claim_expires_at > ?
      `,
      )
      .bind(
        input.reconciledAt,
        crmReadbackRevision,
        input.now,
        input.ledgerId,
        this.environment,
        payoutId,
        input.expectedCrmRecordId,
        expectedCrmRevision,
        input.claimToken,
        input.now,
      );
    const attemptUpdate = this.db
      .prepare(
        `
        UPDATE payout_transfer_attempts SET attempt_status = 'RECONCILED', updated_at = ?
        WHERE ledger_id = ? AND environment = ? AND source_revision = ?
          AND attempt_status = 'STRIPE_SUCCEEDED'
          AND EXISTS (
            SELECT 1 FROM artist_payment_ledger l
            WHERE l.ledger_id = payout_transfer_attempts.ledger_id
              AND l.environment = payout_transfer_attempts.environment
              AND l.state = 'PAID' AND l.stripe_payout_id = ? AND l.reconciled = 1
          )
      `,
      )
      .bind(
        input.now,
        input.ledgerId,
        this.environment,
        existing.sourceRevision,
        payoutId,
      );
    const itemUpdate = this.db
      .prepare(
        `
        UPDATE payout_batch_items SET item_status = 'COMPLETED',
          failure_code = NULL, failure_reason = NULL, updated_at = ?
        WHERE batch_id = ? AND ledger_id = ? AND environment = ?
          AND item_status IN ('TRANSFER_CREATED', 'FAILED')
          AND source_revision_snapshot = ? AND material_digest_snapshot = ?
          AND EXISTS (
            SELECT 1 FROM artist_payment_ledger l
            WHERE l.ledger_id = payout_batch_items.ledger_id
              AND l.environment = payout_batch_items.environment
              AND l.state = 'PAID' AND l.reconciled = 1 AND l.stripe_payout_id = ?
          )
      `,
      )
      .bind(
        input.now,
        existing.batchId,
        input.ledgerId,
        this.environment,
        existing.sourceRevision,
        existing.materialDigest,
        payoutId,
      );
    const batchUpdate = this.db
      .prepare(
        `
        UPDATE payout_batches SET
          status = CASE
            WHEN NOT EXISTS (
              SELECT 1 FROM payout_batch_items i
              WHERE i.batch_id = payout_batches.batch_id AND i.environment = payout_batches.environment
                AND i.item_status <> 'COMPLETED'
            ) THEN 'COMPLETED'
            ELSE 'PARTIALLY_COMPLETED'
          END,
          blocked_item_count = (
            SELECT COUNT(*) FROM payout_batch_items i
            WHERE i.batch_id = payout_batches.batch_id AND i.environment = payout_batches.environment
              AND i.item_status IN ('FAILED', 'BLOCKED', 'REVERSED')
          ),
          execution_completed_at = CASE
            WHEN NOT EXISTS (
              SELECT 1 FROM payout_batch_items i
              WHERE i.batch_id = payout_batches.batch_id AND i.environment = payout_batches.environment
                AND i.item_status <> 'COMPLETED'
            ) THEN ? ELSE execution_completed_at END,
          updated_at = ?
        WHERE batch_id = ? AND environment = ?
          AND status IN ('EXECUTING', 'PARTIALLY_COMPLETED', 'BLOCKED')
      `,
      )
      .bind(input.now, input.now, existing.batchId, this.environment);
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: "PAYOUT_CLOSED_LOOP_RECONCILED",
        bookingId: existing.bookingId,
        assignmentId: existing.assignmentId,
        artistId: existing.artistId,
        amountCents: existing.totalApprovedPayCents,
        currency: "usd",
        connectedAccountId: existing.connectedAccountId,
        transferId: existing.stripeTransferId,
        payoutId,
        previousState: existing.state,
        newState: "PAID",
        approvalRevision: existing.ownerApprovalRevision,
        result: "SUCCESS",
        requestId: input.requestId,
        batchId: existing.batchId,
        safeDetails: {
          crmRecordId: input.expectedCrmRecordId,
          crmSourceRevision: expectedCrmRevision,
          crmReadbackRevision,
        },
      },
      `EXISTS (
        SELECT 1 FROM artist_payment_ledger
        WHERE ledger_id = ? AND environment = ? AND state = 'PAID'
          AND stripe_payout_id = ? AND reconciled = 1 AND updated_at = ?
      )`,
      [input.ledgerId, this.environment, payoutId, input.now],
    );
    const results = await this.transaction([
      ledgerUpdate,
      attemptUpdate,
      itemUpdate,
      batchUpdate,
      audit,
    ]);
    if (
      changes(results[0]) !== 1 ||
      changes(results[1]) !== 1 ||
      changes(results[2]) !== 1 ||
      changes(results[3]) !== 1 ||
      changes(results[4]) !== 1
    ) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Closed-loop reconciliation was not atomically finalized",
      );
    }
    const ledger = await this.getLedger(input.ledgerId);
    if (!ledger)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Reconciled ledger disappeared",
      );
    return { applied: true, ledger };
  }

  async claimManualPaymentException(input: {
    ledgerId: string;
    claimToken: string;
    claimExpiresAt: string;
    expectedAmountCents: number;
    expectedSourceRevision: number;
    expectedMaterialDigest: string;
    method: string;
    reason: string;
    evidenceReference: string;
    memo: string;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<LedgerRecord> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.ledgerId, "Ledger ID");
    assertSafeId(input.claimToken, "Manual payment claim token");
    assertInstant(input.claimExpiresAt, "Manual payment claim expiry");
    assertInstant(input.now, "Manual payment claim time");
    assertNonNegativeInteger(
      input.expectedAmountCents,
      "Expected manual payment amount",
    );
    assertNonNegativeInteger(
      input.expectedSourceRevision,
      "Expected manual payment source revision",
    );
    assertDigest(
      input.expectedMaterialDigest,
      "Expected manual payment material digest",
    );
    const method = boundedText(input.method, 40, "Manual payment method");
    if (!["CASH", "ZELLE", "VENMO", "CHECK", "OTHER"].includes(method))
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Manual payment method is unsupported",
      );
    const reason = boundedText(input.reason, 240, "Manual payment reason");
    const evidence = boundedText(
      input.evidenceReference,
      200,
      "Manual payment evidence reference",
    );
    const memo = boundedText(input.memo, 240, "Manual payment memo");
    const actor = boundedText(input.actor, 254, "Manual payment recorder");
    assertSafeId(input.auditId, "Manual payment intent audit ID");
    if (reason.length < 12 || evidence.length < 3 || memo.length < 3)
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Manual payment evidence is incomplete",
      );
    if (input.claimExpiresAt <= input.now)
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Manual payment claim expiry must follow its claim time",
      );
    const existing = await this.getLedger(input.ledgerId);
    if (!existing)
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Manual payment ledger was not found",
      );
    const update = this.db
      .prepare(
        `
      UPDATE artist_payment_ledger
      SET state = 'MANUAL_REVIEW',
        manual_payment_claim_token = ?, manual_payment_claim_expires_at = ?,
        manual_payment_method = COALESCE(manual_payment_method, ?),
        manual_payment_amount_cents = COALESCE(manual_payment_amount_cents, ?),
        manual_payment_reason = COALESCE(manual_payment_reason, ?),
        manual_payment_evidence_reference = COALESCE(manual_payment_evidence_reference, ?),
        manual_payment_memo = COALESCE(manual_payment_memo, ?),
        manual_payment_recorded_by = COALESCE(manual_payment_recorded_by, ?),
        manual_payment_recorded_at = COALESCE(manual_payment_recorded_at, ?),
        updated_at = ?
      WHERE ledger_id = ? AND environment = ?
        AND state IN ('READY_FOR_OWNER_APPROVAL', 'MANUAL_REVIEW')
        AND batch_id IS NULL AND owner_approval_status <> 'APPROVED'
        AND stripe_transfer_id IS NULL AND stripe_destination_payment_id IS NULL
        AND stripe_payout_id IS NULL AND reconciled = 0
        AND total_approved_pay_cents = ?
        AND source_revision = ? AND material_digest = ?
        AND (manual_payment_claim_token IS NULL OR manual_payment_claim_expires_at <= ?)
        AND (manual_payment_method IS NULL OR manual_payment_method = ?)
        AND (manual_payment_amount_cents IS NULL OR manual_payment_amount_cents = ?)
        AND (manual_payment_reason IS NULL OR manual_payment_reason = ?)
        AND (manual_payment_evidence_reference IS NULL OR manual_payment_evidence_reference = ?)
        AND (manual_payment_memo IS NULL OR manual_payment_memo = ?)
    `,
      )
      .bind(
        input.claimToken,
        input.claimExpiresAt,
        method,
        input.expectedAmountCents,
        reason,
        evidence,
        memo,
        actor,
        input.now,
        input.now,
        input.ledgerId,
        this.environment,
        input.expectedAmountCents,
        input.expectedSourceRevision,
        input.expectedMaterialDigest,
        input.now,
        method,
        input.expectedAmountCents,
        reason,
        evidence,
        memo,
      );
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: "MANUAL_PAYMENT_INTENT_RECORDED",
        bookingId: existing.bookingId,
        assignmentId: existing.assignmentId,
        artistId: existing.artistId,
        amountCents: input.expectedAmountCents,
        currency: "usd",
        connectedAccountId: existing.connectedAccountId,
        previousState: existing.state,
        newState: "MANUAL_REVIEW",
        approvalRevision: existing.ownerApprovalRevision,
        result: existing.manualPaymentRecordedAt ? "RECLAIMED" : "RECORDED",
        requestId: input.requestId,
        batchId: null,
        safeDetails: {
          method,
          evidenceReference: evidence,
          claimExpiresAt: input.claimExpiresAt,
        },
      },
      `EXISTS (
        SELECT 1 FROM artist_payment_ledger
        WHERE ledger_id = ? AND environment = ? AND state = 'MANUAL_REVIEW'
          AND manual_payment_claim_token = ? AND updated_at = ?
      )`,
      [input.ledgerId, this.environment, input.claimToken, input.now],
    );
    const results = await this.transaction([update, audit]);
    if (changes(results[0]) !== 1 || changes(results[1]) !== 1)
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Manual payment exception requires an exact unbatched, untransferred ready ledger",
      );
    const claimed = await this.getLedger(input.ledgerId);
    if (!claimed || claimed.manualPaymentClaimToken !== input.claimToken)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Manual payment claim could not be read back",
      );
    if (
      claimed.manualPaymentMethod !== method ||
      claimed.manualPaymentAmountCents !== input.expectedAmountCents ||
      claimed.manualPaymentReason !== reason ||
      claimed.manualPaymentEvidenceReference !== evidence ||
      claimed.manualPaymentMemo !== memo ||
      !claimed.manualPaymentRecordedBy ||
      !claimed.manualPaymentRecordedAt
    ) {
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Manual payment intent readback is incomplete",
      );
    }
    return claimed;
  }

  async releaseManualPaymentClaim(input: {
    ledgerId: string;
    claimToken: string;
    now: string;
  }): Promise<void> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.ledgerId, "Ledger ID");
    assertSafeId(input.claimToken, "Manual payment claim token");
    assertInstant(input.now, "Manual payment claim release time");
    await this.db
      .prepare(
        `
      UPDATE artist_payment_ledger
      SET manual_payment_claim_token = NULL, manual_payment_claim_expires_at = NULL,
        updated_at = ?
      WHERE ledger_id = ? AND environment = ? AND manual_payment_claim_token = ?
    `,
      )
      .bind(input.now, input.ledgerId, this.environment, input.claimToken)
      .run();
  }

  async cancelManualPaymentIntent(input: {
    ledgerId: string;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<LedgerRecord> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.ledgerId, "Ledger ID");
    assertSafeId(input.auditId, "Manual payment cancellation audit ID");
    assertInstant(input.now, "Manual payment cancellation time");
    const actor = boundedText(
      input.actor,
      254,
      "Manual payment cancellation actor",
    );
    const existing = await this.getLedger(input.ledgerId);
    if (
      !existing ||
      existing.state !== "MANUAL_REVIEW" ||
      !existing.manualPaymentMethod ||
      !existing.manualPaymentEvidenceReference ||
      existing.manualPaymentCrmRevision !== null
    ) {
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "No cancelable manual payment intent exists",
      );
    }
    const update = this.db
      .prepare(
        `
        UPDATE artist_payment_ledger
        SET state = 'READY_FOR_OWNER_APPROVAL',
          manual_payment_claim_token = NULL,
          manual_payment_claim_expires_at = NULL,
          manual_payment_method = NULL,
          manual_payment_amount_cents = NULL,
          manual_payment_reason = NULL,
          manual_payment_evidence_reference = NULL,
          manual_payment_memo = NULL,
          manual_payment_recorded_by = NULL,
          manual_payment_recorded_at = NULL,
          updated_at = ?
        WHERE ledger_id = ? AND environment = ? AND state = 'MANUAL_REVIEW'
          AND batch_id IS NULL AND reconciled = 0
          AND stripe_transfer_id IS NULL AND stripe_payout_id IS NULL
          AND manual_payment_crm_revision IS NULL
          AND (manual_payment_claim_token IS NULL OR manual_payment_claim_expires_at <= ?)
      `,
      )
      .bind(input.now, input.ledgerId, this.environment, input.now);
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: "MANUAL_PAYMENT_INTENT_CANCELED",
        bookingId: existing.bookingId,
        assignmentId: existing.assignmentId,
        artistId: existing.artistId,
        amountCents: existing.totalApprovedPayCents,
        currency: "usd",
        connectedAccountId: existing.connectedAccountId,
        previousState: "MANUAL_REVIEW",
        newState: "READY_FOR_OWNER_APPROVAL",
        approvalRevision: existing.ownerApprovalRevision,
        result: "CRM_ABSENCE_VERIFIED",
        requestId: input.requestId,
        batchId: null,
        safeDetails: {
          method: existing.manualPaymentMethod,
          evidenceReference: existing.manualPaymentEvidenceReference,
        },
      },
      `EXISTS (
        SELECT 1 FROM artist_payment_ledger
        WHERE ledger_id = ? AND environment = ?
          AND state = 'READY_FOR_OWNER_APPROVAL'
          AND manual_payment_method IS NULL AND updated_at = ?
      )`,
      [input.ledgerId, this.environment, input.now],
    );
    const results = await this.transaction([update, audit]);
    if (changes(results[0]) !== 1 || changes(results[1]) !== 1)
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Manual payment intent cancellation lost its state race",
      );
    const ledger = await this.getLedger(input.ledgerId);
    if (!ledger)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Canceled manual payment ledger disappeared",
      );
    return ledger;
  }

  async finalizeManualPaymentException(input: {
    ledgerId: string;
    claimToken: string;
    expectedAmountCents: number;
    method: string;
    reason: string;
    evidenceReference: string;
    memo: string;
    crmReadbackRevision: string;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<LedgerRecord> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.ledgerId, "Ledger ID");
    assertSafeId(input.claimToken, "Manual payment claim token");
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.now, "Manual payment record time");
    assertNonNegativeInteger(
      input.expectedAmountCents,
      "Manual payment amount",
    );
    const method = boundedText(input.method, 40, "Manual payment method");
    if (!["CASH", "ZELLE", "VENMO", "CHECK", "OTHER"].includes(method))
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Manual payment method is unsupported",
      );
    const reason = boundedText(input.reason, 240, "Manual payment reason");
    const evidence = boundedText(
      input.evidenceReference,
      200,
      "Manual payment evidence reference",
    );
    const memo = boundedText(input.memo, 240, "Manual payment memo");
    const actor = boundedText(input.actor, 254, "Manual payment recorder");
    const crmRevision = boundedText(
      input.crmReadbackRevision,
      200,
      "Manual payment CRM revision",
    );
    if (reason.length < 12 || evidence.length < 3 || memo.length < 3)
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Manual payment evidence is incomplete",
      );
    const existing = await this.getLedger(input.ledgerId);
    if (!existing)
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Manual payment ledger was not found",
      );
    if (existing.state === "MANUAL_PAYMENT_EXCEPTION")
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Manual payment was already recorded",
      );
    if (
      existing.manualPaymentMethod !== method ||
      existing.manualPaymentAmountCents !== input.expectedAmountCents ||
      existing.manualPaymentReason !== reason ||
      existing.manualPaymentEvidenceReference !== evidence ||
      existing.manualPaymentMemo !== memo ||
      !existing.manualPaymentRecordedBy ||
      !existing.manualPaymentRecordedAt
    ) {
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Manual payment finalization does not match its durable intent",
      );
    }
    const recordedAt = existing.manualPaymentRecordedAt;
    const update = this.db
      .prepare(
        `
      UPDATE artist_payment_ledger
      SET state = 'MANUAL_PAYMENT_EXCEPTION', reconciled = 1, reconciled_at = ?,
        manual_payment_crm_revision = ?,
        manual_payment_claim_token = NULL, manual_payment_claim_expires_at = NULL,
        owner_approval_status = 'INVALIDATED', approval_digest = NULL,
        approved_by = NULL, approval_timestamp = NULL,
        failure_code = NULL, failure_reason = NULL, updated_at = ?
      WHERE ledger_id = ? AND environment = ?
        AND state = 'MANUAL_REVIEW' AND batch_id IS NULL
        AND total_approved_pay_cents = ?
        AND stripe_transfer_id IS NULL AND stripe_destination_payment_id IS NULL
        AND stripe_payout_id IS NULL AND reconciled = 0
        AND manual_payment_claim_token = ? AND manual_payment_claim_expires_at > ?
        AND manual_payment_method = ? AND manual_payment_amount_cents = ?
        AND manual_payment_reason = ? AND manual_payment_evidence_reference = ?
        AND manual_payment_memo = ? AND manual_payment_recorded_at = ?
    `,
      )
      .bind(
        recordedAt,
        crmRevision,
        input.now,
        input.ledgerId,
        this.environment,
        input.expectedAmountCents,
        input.claimToken,
        input.now,
        method,
        input.expectedAmountCents,
        reason,
        evidence,
        memo,
        recordedAt,
      );
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: "MANUAL_PAYMENT_EXCEPTION_RECORDED",
        bookingId: existing.bookingId,
        assignmentId: existing.assignmentId,
        artistId: existing.artistId,
        amountCents: input.expectedAmountCents,
        currency: "usd",
        connectedAccountId: existing.connectedAccountId,
        previousState: existing.state,
        newState: "MANUAL_PAYMENT_EXCEPTION",
        approvalRevision: existing.ownerApprovalRevision,
        result: "CRM_READBACK_VERIFIED",
        requestId: input.requestId,
        batchId: null,
        safeDetails: {
          method,
          evidenceReference: evidence,
          crmReadbackRevision: crmRevision,
        },
      },
      `EXISTS (
      SELECT 1 FROM artist_payment_ledger WHERE ledger_id = ? AND environment = ?
        AND state = 'MANUAL_PAYMENT_EXCEPTION' AND reconciled = 1
        AND manual_payment_crm_revision = ? AND updated_at = ?
    )`,
      [input.ledgerId, this.environment, crmRevision, input.now],
    );
    const results = await this.transaction([update, audit]);
    if (changes(results[0]) !== 1 || changes(results[1]) !== 1)
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Manual payment finalization lost a ledger or CRM race",
      );
    const finalized = await this.getLedger(input.ledgerId);
    if (!finalized)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Manual payment ledger disappeared",
      );
    return finalized;
  }

  async claimPayoutReconciliation(input: {
    ledgerId: string;
    payoutId: string;
    claimToken: string;
    claimExpiresAt: string;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<LedgerRecord> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.ledgerId, "Ledger ID");
    assertSafeId(input.claimToken, "Reconciliation claim token");
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.now, "Reconciliation claim time");
    assertInstant(input.claimExpiresAt, "Reconciliation claim expiry");
    if (input.claimExpiresAt <= input.now)
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Reconciliation claim must expire in the future",
      );
    const payoutId = assertStripeObjectId(
      input.payoutId,
      STRIPE_PAYOUT_RE,
      "Stripe payout ID",
    );
    const actor = boundedText(input.actor, 254, "Actor");
    const existing = await this.getLedger(input.ledgerId);
    if (!existing)
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Payout ledger was not found",
      );
    const update = this.db
      .prepare(
        `
      UPDATE artist_payment_ledger
      SET reconciliation_claim_token = ?, reconciliation_claim_expires_at = ?,
        reconciliation_projection_at = COALESCE(reconciliation_projection_at, ?),
        updated_at = ?
      WHERE ledger_id = ? AND environment = ? AND state = 'PAID'
        AND stripe_payout_id = ? AND stripe_payout_status = 'paid' AND reconciled = 0
        AND (reconciliation_claim_token IS NULL OR reconciliation_claim_expires_at <= ?)
    `,
      )
      .bind(
        input.claimToken,
        input.claimExpiresAt,
        input.now,
        input.now,
        input.ledgerId,
        this.environment,
        payoutId,
        input.now,
      );
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: "PAYOUT_RECONCILIATION_CLAIMED",
        bookingId: existing.bookingId,
        assignmentId: existing.assignmentId,
        artistId: existing.artistId,
        amountCents: existing.totalApprovedPayCents,
        currency: "usd",
        connectedAccountId: existing.connectedAccountId,
        transferId: existing.stripeTransferId,
        payoutId,
        previousState: existing.state,
        newState: existing.state,
        result: "CLAIMED",
        requestId: input.requestId,
        batchId: existing.batchId,
        safeDetails: { claimExpiresAt: input.claimExpiresAt },
      },
      `EXISTS (
      SELECT 1 FROM artist_payment_ledger WHERE ledger_id = ? AND environment = ?
        AND reconciliation_claim_token = ? AND reconciliation_claim_expires_at = ?
    )`,
      [
        input.ledgerId,
        this.environment,
        input.claimToken,
        input.claimExpiresAt,
      ],
    );
    const results = await this.transaction([update, audit]);
    if (changes(results[0]) !== 1 || changes(results[1]) !== 1)
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Payout reconciliation is already claimed or no longer eligible",
      );
    const ledger = await this.getLedger(input.ledgerId);
    if (!ledger)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Claimed ledger disappeared",
      );
    return ledger;
  }

  async releasePayoutReconciliationClaim(input: {
    ledgerId: string;
    claimToken: string;
    now: string;
  }): Promise<boolean> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.ledgerId, "Ledger ID");
    assertSafeId(input.claimToken, "Reconciliation claim token");
    assertInstant(input.now, "Reconciliation release time");
    const result = await this.db
      .prepare(
        `
      UPDATE artist_payment_ledger
      SET reconciliation_claim_token = NULL, reconciliation_claim_expires_at = NULL, updated_at = ?
      WHERE ledger_id = ? AND environment = ? AND reconciliation_claim_token = ?
    `,
      )
      .bind(input.now, input.ledgerId, this.environment, input.claimToken)
      .run();
    return changes(result) === 1;
  }

  async stageCrmReconciliationReadback(input: {
    ledgerId: string;
    claimToken: string;
    crmReadbackRevision: string;
    now: string;
  }): Promise<LedgerRecord> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.ledgerId, "Ledger ID");
    assertSafeId(input.claimToken, "Reconciliation claim token");
    assertInstant(input.now, "CRM readback staging time");
    const revision = boundedText(
      input.crmReadbackRevision,
      200,
      "CRM readback revision",
    );
    const result = await this.db
      .prepare(
        `
      UPDATE artist_payment_ledger SET crm_reconciled_revision = ?, updated_at = ?
      WHERE ledger_id = ? AND environment = ? AND state = 'PAID'
        AND reconciled = 0 AND reconciliation_claim_token = ?
        AND reconciliation_claim_expires_at > ?
    `,
      )
      .bind(
        revision,
        input.now,
        input.ledgerId,
        this.environment,
        input.claimToken,
        input.now,
      )
      .run();
    if (changes(result) !== 1)
      throw new PayoutRepositoryError(
        "CONFLICT",
        "CRM readback staging lost its reconciliation claim",
      );
    const ledger = await this.getLedger(input.ledgerId);
    if (!ledger)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Staged reconciliation ledger disappeared",
      );
    return ledger;
  }

  async claimCrmCorrection(input: {
    ledgerId: string;
    expectedState: "REVERSED" | "PAYOUT_FAILED";
    claimToken: string;
    claimExpiresAt: string;
    now: string;
  }): Promise<LedgerRecord> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.ledgerId, "Ledger ID");
    assertSafeId(input.claimToken, "CRM correction claim token");
    assertInstant(input.now, "CRM correction claim time");
    assertInstant(input.claimExpiresAt, "CRM correction claim expiry");
    if (input.claimExpiresAt <= input.now)
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "CRM correction claim must expire in the future",
      );
    const result = await this.db
      .prepare(
        `
      UPDATE artist_payment_ledger
      SET reconciliation_claim_token = ?, reconciliation_claim_expires_at = ?,
        crm_correction_projection_at = COALESCE(crm_correction_projection_at, ?),
        updated_at = ?
      WHERE ledger_id = ? AND environment = ? AND state = ?
        AND reconciled = 0 AND crm_correction_required = 1
        AND (reconciliation_claim_token IS NULL OR reconciliation_claim_expires_at <= ?)
    `,
      )
      .bind(
        input.claimToken,
        input.claimExpiresAt,
        input.now,
        input.now,
        input.ledgerId,
        this.environment,
        input.expectedState,
        input.now,
      )
      .run();
    if (changes(result) !== 1)
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "CRM correction is already claimed or no longer required",
      );
    const ledger = await this.getLedger(input.ledgerId);
    if (!ledger)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Claimed correction ledger disappeared",
      );
    return ledger;
  }

  async finalizeCrmCorrection(input: {
    ledgerId: string;
    expectedState: "REVERSED" | "PAYOUT_FAILED";
    claimToken: string;
    expectedCrmRecordId: string;
    expectedCrmRevision: string;
    crmReadbackRevision: string;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<LedgerRecord> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.ledgerId, "Ledger ID");
    assertSafeId(input.claimToken, "CRM correction claim token");
    assertSafeId(input.expectedCrmRecordId, "Expected CRM record ID");
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.now, "CRM correction time");
    const expectedRevision = boundedText(
      input.expectedCrmRevision,
      200,
      "Expected CRM revision",
    );
    const readbackRevision = boundedText(
      input.crmReadbackRevision,
      200,
      "CRM correction readback revision",
    );
    const actor = boundedText(input.actor, 254, "Actor");
    const existing = await this.getLedger(input.ledgerId);
    if (!existing)
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Correction ledger was not found",
      );
    const update = this.db
      .prepare(
        `
      UPDATE artist_payment_ledger
      SET crm_reconciled_revision = ?, crm_correction_required = 0,
        reconciliation_claim_token = NULL, reconciliation_claim_expires_at = NULL,
        updated_at = ?
      WHERE ledger_id = ? AND environment = ? AND state = ? AND reconciled = 0
        AND crm_correction_required = 1 AND crm_record_id = ?
        AND COALESCE(crm_reconciled_revision, crm_revision) = ?
        AND reconciliation_claim_token = ? AND reconciliation_claim_expires_at > ?
    `,
      )
      .bind(
        readbackRevision,
        input.now,
        input.ledgerId,
        this.environment,
        input.expectedState,
        input.expectedCrmRecordId,
        expectedRevision,
        input.claimToken,
        input.now,
      );
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: "CRM_CORRECTIVE_STATE_RECONCILED",
        bookingId: existing.bookingId,
        assignmentId: existing.assignmentId,
        artistId: existing.artistId,
        amountCents: existing.totalApprovedPayCents,
        currency: "usd",
        connectedAccountId: existing.connectedAccountId,
        transferId: existing.stripeTransferId,
        payoutId: existing.stripePayoutId,
        previousState: existing.state,
        newState: existing.state,
        result: "SUCCESS",
        requestId: input.requestId,
        batchId: existing.batchId,
        safeDetails: {
          crmRecordId: input.expectedCrmRecordId,
          crmReadbackRevision: readbackRevision,
        },
      },
      `EXISTS (
      SELECT 1 FROM artist_payment_ledger WHERE ledger_id = ? AND environment = ?
        AND state = ? AND crm_correction_required = 0
        AND crm_reconciled_revision = ? AND updated_at = ?
    )`,
      [
        input.ledgerId,
        this.environment,
        input.expectedState,
        readbackRevision,
        input.now,
      ],
    );
    const results = await this.transaction([update, audit]);
    if (changes(results[0]) !== 1 || changes(results[1]) !== 1)
      throw new PayoutRepositoryError(
        "CONFLICT",
        "CRM corrective readback lost its atomic state race",
      );
    const ledger = await this.getLedger(input.ledgerId);
    if (!ledger)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Corrected ledger disappeared",
      );
    return ledger;
  }

  async recordPayoutFailed(input: {
    ledgerId: string;
    payoutId: string;
    payoutStatus: string;
    safeErrorCode: string;
    safeReason: string;
    actor: string;
    auditId: string;
    requestId: string | null;
    now: string;
  }): Promise<{ applied: boolean; ledger: LedgerRecord }> {
    await this.assertEnvironmentIdentity(input.now);
    assertSafeId(input.ledgerId, "Ledger ID");
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.now, "Payout event time");
    const actor = boundedText(input.actor, 254, "Actor");
    const payoutId = assertStripeObjectId(
      input.payoutId,
      STRIPE_PAYOUT_RE,
      "Stripe payout ID",
    );
    const payoutStatus = boundedText(input.payoutStatus, 80, "Payout status");
    const code = boundedText(input.safeErrorCode, 80, "Safe payout error code");
    const reason = boundedText(
      input.safeReason,
      240,
      "Safe payout failure reason",
    );
    const existing = await this.getLedger(input.ledgerId);
    if (!existing)
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Payout ledger was not found",
      );
    if (
      !["TRANSFER_COMPLETED", "PAYOUT_PENDING", "PAID"].includes(existing.state)
    ) {
      return { applied: false, ledger: existing };
    }
    if (existing.state === "TRANSFER_COMPLETED") {
      assertTransition(existing.state, "PAYOUT_PENDING");
    } else {
      assertTransition(existing.state, "PAYOUT_FAILED");
    }
    const first = this.db
      .prepare(
        `
        UPDATE artist_payment_ledger SET state = 'PAYOUT_PENDING', stripe_payout_id = ?,
          stripe_payout_status = ?, updated_at = ?
        WHERE ledger_id = ? AND environment = ? AND state = 'TRANSFER_COMPLETED'
          AND stripe_destination_payment_id IS NOT NULL
          AND (stripe_payout_id IS NULL OR stripe_payout_id = ?)
      `,
      )
      .bind(
        payoutId,
        payoutStatus,
        input.now,
        input.ledgerId,
        this.environment,
        payoutId,
      );
    const failed = this.db
      .prepare(
        `
        UPDATE artist_payment_ledger SET state = 'PAYOUT_FAILED', stripe_payout_id = ?,
          stripe_payout_status = ?, failure_code = ?, failure_reason = ?,
          reconciled = 0, reconciled_at = NULL, crm_correction_required = 1,
          crm_correction_projection_at = NULL, updated_at = ?
        WHERE ledger_id = ? AND environment = ? AND state IN ('PAYOUT_PENDING', 'PAID')
          AND stripe_payout_id = ?
          AND (reconciliation_claim_token IS NULL OR reconciliation_claim_expires_at <= ?)
      `,
      )
      .bind(
        payoutId,
        payoutStatus,
        code,
        reason,
        input.now,
        input.ledgerId,
        this.environment,
        payoutId,
        input.now,
      );
    const itemUpdate = this.db
      .prepare(
        `
        UPDATE payout_batch_items SET item_status = 'FAILED', failure_code = ?,
          failure_reason = ?, updated_at = ?
        WHERE batch_id = ? AND ledger_id = ? AND environment = ?
          AND item_status IN ('TRANSFER_CREATED', 'COMPLETED', 'FAILED')
          AND EXISTS (
            SELECT 1 FROM artist_payment_ledger l
            WHERE l.ledger_id = payout_batch_items.ledger_id
              AND l.environment = payout_batch_items.environment
              AND l.state = 'PAYOUT_FAILED' AND l.stripe_payout_id = ?
          )
      `,
      )
      .bind(
        code,
        reason,
        input.now,
        existing.batchId,
        input.ledgerId,
        this.environment,
        payoutId,
      );
    const batchUpdate = this.db
      .prepare(
        `
        UPDATE payout_batches SET status = 'PARTIALLY_COMPLETED',
          blocked_item_count = (
            SELECT COUNT(*) FROM payout_batch_items i
            WHERE i.batch_id = payout_batches.batch_id AND i.environment = payout_batches.environment
              AND i.item_status IN ('FAILED', 'BLOCKED', 'REVERSED')
          ), updated_at = ?
        WHERE batch_id = ? AND environment = ?
          AND status IN ('EXECUTING', 'PARTIALLY_COMPLETED', 'COMPLETED')
      `,
      )
      .bind(input.now, existing.batchId, this.environment);
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.now,
        actor,
        action: "STRIPE_PAYOUT_FAILED",
        bookingId: existing.bookingId,
        assignmentId: existing.assignmentId,
        artistId: existing.artistId,
        amountCents: existing.totalApprovedPayCents,
        currency: "usd",
        connectedAccountId: existing.connectedAccountId,
        transferId: existing.stripeTransferId,
        payoutId,
        previousState: existing.state,
        newState: "PAYOUT_FAILED",
        approvalRevision: existing.ownerApprovalRevision,
        result: "FAILED",
        failureReason: code,
        requestId: input.requestId,
        batchId: existing.batchId,
        safeDetails: { payoutStatus },
      },
      `EXISTS (
        SELECT 1 FROM artist_payment_ledger
        WHERE ledger_id = ? AND environment = ? AND state = 'PAYOUT_FAILED'
          AND stripe_payout_id = ? AND updated_at = ?
      )`,
      [input.ledgerId, this.environment, payoutId, input.now],
    );
    const results = await this.transaction([
      first,
      failed,
      itemUpdate,
      batchUpdate,
      audit,
    ]);
    const ledger = await this.getLedger(input.ledgerId);
    if (!ledger)
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Payout ledger was not found",
      );
    if (
      changes(results[1]) !== 1 ||
      changes(results[2]) !== 1 ||
      changes(results[3]) !== 1 ||
      changes(results[4]) !== 1
    ) {
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Payout failure was not atomically recorded",
      );
    }
    return { applied: true, ledger };
  }

  async registerWebhookEvent(input: {
    stripeEventId: string;
    eventType: string;
    connectedAccountId: string | null;
    receivedAt: string;
  }): Promise<{ event: WebhookEventRecord; inserted: boolean }> {
    await this.assertEnvironmentIdentity(input.receivedAt);
    const eventId = assertStripeObjectId(
      input.stripeEventId,
      STRIPE_EVENT_RE,
      "Stripe event ID",
    );
    const eventType = boundedText(input.eventType, 180, "Stripe event type");
    if (
      input.connectedAccountId &&
      !isStripeAccountId(input.connectedAccountId)
    ) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Webhook connected account ID is malformed",
      );
    }
    assertInstant(input.receivedAt, "Webhook receive time");
    const result = await this.db
      .prepare(
        `
        INSERT INTO stripe_webhook_events (
          stripe_event_id, environment, event_type, connected_account_id,
          received_at, processing_status, retry_count
        ) VALUES (?, ?, ?, ?, ?, 'RECEIVED', 0)
        ON CONFLICT(stripe_event_id, environment) DO NOTHING
      `,
      )
      .bind(
        eventId,
        this.environment,
        eventType,
        input.connectedAccountId,
        input.receivedAt,
      )
      .run();
    const row = await this.db
      .prepare(
        `
        SELECT * FROM stripe_webhook_events
        WHERE stripe_event_id = ? AND environment = ?
      `,
      )
      .bind(eventId, this.environment)
      .first<WebhookEventRow>();
    if (!row)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Webhook receipt could not be read back",
      );
    if (
      row.event_type !== eventType ||
      row.connected_account_id !== input.connectedAccountId
    ) {
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Webhook event ID was reused with different event data",
      );
    }
    return { event: mapWebhook(row), inserted: changes(result) === 1 };
  }

  async claimWebhookEvent(input: {
    stripeEventId: string;
    claimToken: string;
    claimedAt: string;
    leaseExpiresAt: string;
  }): Promise<{ event: WebhookEventRecord; claimed: boolean }> {
    await this.assertEnvironmentIdentity(input.claimedAt);
    const eventId = assertStripeObjectId(
      input.stripeEventId,
      STRIPE_EVENT_RE,
      "Stripe event ID",
    );
    assertSafeId(input.claimToken, "Webhook claim token");
    assertInstant(input.claimedAt, "Webhook claim time");
    assertInstant(input.leaseExpiresAt, "Webhook lease expiry");
    if (input.leaseExpiresAt <= input.claimedAt) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Webhook lease expiry must follow claim time",
      );
    }
    const result = await this.db
      .prepare(
        `
        UPDATE stripe_webhook_events SET processing_status = 'PROCESSING',
          retry_count = retry_count + CASE WHEN processing_status = 'FAILED' THEN 1 ELSE 0 END,
          processing_claim_token = ?, processing_started_at = ?, processing_lease_expires_at = ?,
          safe_error_code = NULL
        WHERE stripe_event_id = ? AND environment = ?
          AND processing_status IN ('RECEIVED', 'FAILED')
      `,
      )
      .bind(
        input.claimToken,
        input.claimedAt,
        input.leaseExpiresAt,
        eventId,
        this.environment,
      )
      .run();
    const row = await this.db
      .prepare(
        "SELECT * FROM stripe_webhook_events WHERE stripe_event_id = ? AND environment = ?",
      )
      .bind(eventId, this.environment)
      .first<WebhookEventRow>();
    if (!row)
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Webhook event was not registered",
      );
    return { event: mapWebhook(row), claimed: changes(result) === 1 };
  }

  async recoverExpiredWebhookLease(input: {
    stripeEventId: string;
    expectedClaimToken: string;
    newClaimToken: string;
    recoveredAt: string;
    leaseExpiresAt: string;
  }): Promise<{ event: WebhookEventRecord; recovered: boolean }> {
    await this.assertEnvironmentIdentity(input.recoveredAt);
    const eventId = assertStripeObjectId(
      input.stripeEventId,
      STRIPE_EVENT_RE,
      "Stripe event ID",
    );
    assertSafeId(input.expectedClaimToken, "Expected webhook claim token");
    assertSafeId(input.newClaimToken, "New webhook claim token");
    assertInstant(input.recoveredAt, "Webhook recovery time");
    assertInstant(input.leaseExpiresAt, "Webhook lease expiry");
    if (input.expectedClaimToken === input.newClaimToken) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Webhook lease recovery requires a new claim token",
      );
    }
    if (input.leaseExpiresAt <= input.recoveredAt) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Recovered webhook lease must expire after recovery time",
      );
    }
    const result = await this.db
      .prepare(
        `
        UPDATE stripe_webhook_events SET processing_claim_token = ?, processing_started_at = ?,
          processing_lease_expires_at = ?, retry_count = retry_count + 1, safe_error_code = NULL
        WHERE stripe_event_id = ? AND environment = ? AND processing_status = 'PROCESSING'
          AND processing_claim_token = ? AND processing_lease_expires_at IS NOT NULL
          AND processing_lease_expires_at <= ?
      `,
      )
      .bind(
        input.newClaimToken,
        input.recoveredAt,
        input.leaseExpiresAt,
        eventId,
        this.environment,
        input.expectedClaimToken,
        input.recoveredAt,
      )
      .run();
    const row = await this.db
      .prepare(
        "SELECT * FROM stripe_webhook_events WHERE stripe_event_id = ? AND environment = ?",
      )
      .bind(eventId, this.environment)
      .first<WebhookEventRow>();
    if (!row)
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Webhook event was not registered",
      );
    return { event: mapWebhook(row), recovered: changes(result) === 1 };
  }

  async renewWebhookEventLease(input: {
    stripeEventId: string;
    claimToken: string;
    renewedAt: string;
    leaseExpiresAt: string;
  }): Promise<boolean> {
    await this.assertEnvironmentIdentity(input.renewedAt);
    const eventId = assertStripeObjectId(
      input.stripeEventId,
      STRIPE_EVENT_RE,
      "Stripe event ID",
    );
    assertSafeId(input.claimToken, "Webhook claim token");
    assertInstant(input.renewedAt, "Webhook lease renewal time");
    assertInstant(input.leaseExpiresAt, "Webhook renewed lease expiry");
    if (input.leaseExpiresAt <= input.renewedAt) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Renewed webhook lease must expire after renewal time",
      );
    }
    const result = await this.db
      .prepare(
        `
        UPDATE stripe_webhook_events SET processing_lease_expires_at = ?
        WHERE stripe_event_id = ? AND environment = ?
          AND processing_status = 'PROCESSING' AND processing_claim_token = ?
          AND processing_lease_expires_at IS NOT NULL
          AND processing_lease_expires_at > ?
      `,
      )
      .bind(
        input.leaseExpiresAt,
        eventId,
        this.environment,
        input.claimToken,
        input.renewedAt,
      )
      .run();
    return changes(result) === 1;
  }

  async completeWebhookEvent(
    stripeEventId: string,
    claimToken: string,
    status: "PROCESSED" | "IGNORED",
    processedAt: string,
  ): Promise<boolean> {
    await this.assertEnvironmentIdentity(processedAt);
    const eventId = assertStripeObjectId(
      stripeEventId,
      STRIPE_EVENT_RE,
      "Stripe event ID",
    );
    assertSafeId(claimToken, "Webhook claim token");
    assertInstant(processedAt, "Webhook completion time");
    const result = await this.db
      .prepare(
        `
        UPDATE stripe_webhook_events SET processing_status = ?, processed_at = ?,
          safe_error_code = NULL, processing_claim_token = NULL,
          processing_started_at = NULL, processing_lease_expires_at = NULL
        WHERE stripe_event_id = ? AND environment = ? AND processing_status = 'PROCESSING'
          AND processing_claim_token = ?
      `,
      )
      .bind(status, processedAt, eventId, this.environment, claimToken)
      .run();
    return changes(result) === 1;
  }

  async failWebhookEvent(
    stripeEventId: string,
    claimToken: string,
    safeErrorCode: string,
    failedAt: string,
  ): Promise<boolean> {
    await this.assertEnvironmentIdentity(failedAt);
    const eventId = assertStripeObjectId(
      stripeEventId,
      STRIPE_EVENT_RE,
      "Stripe event ID",
    );
    assertSafeId(claimToken, "Webhook claim token");
    const code = boundedText(safeErrorCode, 80, "Safe webhook error code");
    assertInstant(failedAt, "Webhook failure time");
    const result = await this.db
      .prepare(
        `
        UPDATE stripe_webhook_events SET processing_status = 'FAILED', safe_error_code = ?,
          processing_claim_token = NULL, processing_started_at = NULL,
          processing_lease_expires_at = NULL
        WHERE stripe_event_id = ? AND environment = ? AND processing_status = 'PROCESSING'
          AND processing_claim_token = ?
      `,
      )
      .bind(code, eventId, this.environment, claimToken)
      .run();
    return changes(result) === 1;
  }

  async openException(input: {
    exceptionId: string;
    ledgerId?: string | null;
    batchId?: string | null;
    artistId?: string | null;
    bookingId?: string | null;
    assignmentId?: string | null;
    exceptionType: string;
    reasonCode: string;
    safeReason: string;
    ownerActionRequired: string;
    lastAttemptAt?: string | null;
    nextAllowedAttemptAt?: string | null;
    stripeReference?: string | null;
    createdAt: string;
  }): Promise<PayoutExceptionRecord> {
    await this.assertEnvironmentIdentity(input.createdAt);
    assertSafeId(input.exceptionId, "Exception ID");
    for (const [label, value] of [
      ["Ledger ID", input.ledgerId],
      ["Batch ID", input.batchId],
      ["Artist ID", input.artistId],
      ["Booking ID", input.bookingId],
      ["Assignment ID", input.assignmentId],
    ] as const) {
      if (value) assertSafeId(value, label);
    }
    assertInstant(input.createdAt, "Exception creation time");
    if (input.lastAttemptAt)
      assertInstant(input.lastAttemptAt, "Last attempt time");
    if (input.nextAllowedAttemptAt)
      assertInstant(input.nextAllowedAttemptAt, "Next allowed attempt time");
    const exceptionType = boundedText(
      input.exceptionType,
      100,
      "Exception type",
    );
    const reasonCode = boundedText(input.reasonCode, 80, "Reason code");
    const safeReason = boundedText(input.safeReason, 500, "Safe reason");
    const ownerAction = boundedText(
      input.ownerActionRequired,
      500,
      "Owner action",
    );
    const stripeReference = input.stripeReference
      ? boundedText(input.stripeReference, 120, "Stripe reference")
      : null;
    await this.db
      .prepare(
        `
        INSERT INTO payout_exceptions (
          exception_id, environment, ledger_id, batch_id, artist_id, booking_id,
          assignment_id, exception_type, reason_code, safe_reason, status,
          owner_action_required, last_attempt_at, next_allowed_attempt_at,
          stripe_reference, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?)
        ON CONFLICT(exception_id) DO NOTHING
      `,
      )
      .bind(
        input.exceptionId,
        this.environment,
        input.ledgerId ?? null,
        input.batchId ?? null,
        input.artistId ?? null,
        input.bookingId ?? null,
        input.assignmentId ?? null,
        exceptionType,
        reasonCode,
        safeReason,
        ownerAction,
        input.lastAttemptAt ?? null,
        input.nextAllowedAttemptAt ?? null,
        stripeReference,
        input.createdAt,
      )
      .run();
    const row = await this.db
      .prepare(
        "SELECT * FROM payout_exceptions WHERE exception_id = ? AND environment = ?",
      )
      .bind(input.exceptionId, this.environment)
      .first<Record<string, unknown>>();
    if (!row)
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Exception ID belongs to another environment",
      );
    const stored = mapException(row);
    if (
      stored.exceptionType !== exceptionType ||
      stored.reasonCode !== reasonCode ||
      stored.ledgerId !== (input.ledgerId ?? null) ||
      stored.batchId !== (input.batchId ?? null)
    ) {
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Exception ID was reused with different data",
      );
    }
    return stored;
  }

  async resolveException(input: {
    exceptionId: string;
    evidence: string;
    actor: string;
    auditId: string;
    requestId: string | null;
    resolvedAt: string;
  }): Promise<PayoutExceptionRecord> {
    await this.assertEnvironmentIdentity(input.resolvedAt);
    assertSafeId(input.exceptionId, "Exception ID");
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.resolvedAt, "Exception resolution time");
    const actor = boundedText(input.actor, 254, "Resolver");
    const evidence = boundedText(input.evidence, 500, "Resolution evidence");
    if (evidence.length < 12)
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Resolution evidence must contain at least 12 characters",
      );
    const row = await this.db
      .prepare(
        "SELECT * FROM payout_exceptions WHERE exception_id = ? AND environment = ?",
      )
      .bind(input.exceptionId, this.environment)
      .first<Record<string, unknown>>();
    if (!row)
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Payout exception was not found",
      );
    const exception = mapException(row);
    if (exception.status === "RESOLVED")
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Payout exception is already resolved",
      );
    const ledger = exception.ledgerId
      ? await this.getLedger(exception.ledgerId)
      : null;
    const update = this.db
      .prepare(
        `
      UPDATE payout_exceptions
      SET status = 'RESOLVED', resolved_at = ?, resolved_by = ?, resolution_evidence = ?
      WHERE exception_id = ? AND environment = ? AND status IN ('OPEN', 'ACKNOWLEDGED')
        AND CASE
          WHEN exception_type IN ('CRM_CORRECTIVE_RECONCILIATION', 'RECONCILIATION_STATE_RACE')
            THEN NOT EXISTS (
              SELECT 1 FROM artist_payment_ledger l
              WHERE l.ledger_id = payout_exceptions.ledger_id
                AND l.environment = payout_exceptions.environment
                AND l.crm_correction_required = 1
            )
          WHEN exception_type = 'AUTHORITATIVE_SOURCE_CHANGE'
            THEN EXISTS (
              SELECT 1 FROM artist_payment_ledger l
              WHERE l.ledger_id = payout_exceptions.ledger_id
                AND l.environment = payout_exceptions.environment
                AND l.state <> 'MANUAL_REVIEW' AND l.batch_id IS NULL
                AND l.failure_code IS NULL
            )
          WHEN exception_type = 'TRANSFER_OUTCOME_RECONCILIATION'
            THEN EXISTS (
              SELECT 1 FROM artist_payment_ledger l
              WHERE l.ledger_id = payout_exceptions.ledger_id
                AND l.environment = payout_exceptions.environment
                AND l.stripe_transfer_id IS NOT NULL
                AND l.stripe_destination_payment_id IS NOT NULL
                AND l.state IN ('TRANSFER_CREATED', 'TRANSFER_PENDING', 'TRANSFER_COMPLETED',
                  'PAYOUT_PENDING', 'PAID', 'PAYOUT_FAILED', 'REVERSED')
            )
          WHEN exception_type IN ('TRANSFER_BLOCKED_BEFORE_STRIPE', 'RECIPIENT_EXECUTION_PREFLIGHT')
            THEN EXISTS (
              SELECT 1 FROM artist_payment_ledger l
              WHERE l.ledger_id = payout_exceptions.ledger_id
                AND l.environment = payout_exceptions.environment
                AND (l.stripe_transfer_id IS NOT NULL OR l.state <> 'TRANSFER_FAILED')
            )
          ELSE NOT EXISTS (
            SELECT 1 FROM artist_payment_ledger l
            WHERE l.ledger_id = payout_exceptions.ledger_id
              AND l.environment = payout_exceptions.environment
              AND (l.crm_correction_required = 1 OR l.state = 'MANUAL_REVIEW')
          )
        END
    `,
      )
      .bind(
        input.resolvedAt,
        actor,
        evidence,
        input.exceptionId,
        this.environment,
      );
    const audit = this.auditStatement(
      {
        auditId: input.auditId,
        timestamp: input.resolvedAt,
        actor,
        action: "PAYOUT_EXCEPTION_RESOLVED",
        bookingId: exception.bookingId ?? ledger?.bookingId ?? null,
        assignmentId: exception.assignmentId ?? ledger?.assignmentId ?? null,
        artistId: exception.artistId ?? ledger?.artistId ?? null,
        amountCents: ledger?.totalApprovedPayCents ?? null,
        currency: ledger ? "usd" : null,
        connectedAccountId: ledger?.connectedAccountId ?? null,
        transferId: ledger?.stripeTransferId ?? null,
        payoutId: ledger?.stripePayoutId ?? null,
        previousState: "OPEN",
        newState: "RESOLVED",
        approvalRevision: ledger?.ownerApprovalRevision ?? null,
        result: "SUCCESS",
        requestId: input.requestId,
        batchId: exception.batchId,
        safeDetails: { exceptionId: input.exceptionId, evidence },
      },
      `EXISTS (
      SELECT 1 FROM payout_exceptions WHERE exception_id = ? AND environment = ?
        AND status = 'RESOLVED' AND resolved_at = ? AND resolved_by = ?
        AND resolution_evidence = ?
    )`,
      [input.exceptionId, this.environment, input.resolvedAt, actor, evidence],
    );
    const results = await this.transaction([update, audit]);
    if (changes(results[0]) !== 1 || changes(results[1]) !== 1)
      throw new PayoutRepositoryError(
        "CLAIM_REJECTED",
        "Exception remediation prerequisite is not complete",
      );
    const resolved = await this.db
      .prepare(
        "SELECT * FROM payout_exceptions WHERE exception_id = ? AND environment = ?",
      )
      .bind(input.exceptionId, this.environment)
      .first<Record<string, unknown>>();
    if (!resolved)
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Resolved exception disappeared",
      );
    return mapException(resolved);
  }

  async listOpenExceptions(limit = 100): Promise<PayoutExceptionRecord[]> {
    await this.ensureEnvironmentIdentity();
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Exception list limit must be between 1 and 500",
      );
    }
    const result = await this.db
      .prepare(
        `
        SELECT * FROM payout_exceptions
        WHERE environment = ? AND status IN ('OPEN', 'ACKNOWLEDGED')
        ORDER BY created_at DESC LIMIT ?
      `,
      )
      .bind(this.environment, limit + 1)
      .all<Record<string, unknown>>();
    const rows = result.results ?? [];
    if (rows.length > limit) {
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Open exception count exceeds the bounded complete view",
      );
    }
    return rows.map(mapException);
  }

  private auditStatement(
    input: AuditWrite,
    condition = "1 = 1",
    conditionValues: D1Value[] = [],
  ): D1PreparedStatement {
    assertSafeId(input.auditId, "Audit ID");
    assertInstant(input.timestamp, "Audit timestamp");
    const actor = boundedText(input.actor, 254, "Audit actor");
    const action = boundedText(input.action, 100, "Audit action");
    const result = boundedText(input.result, 80, "Audit result");
    if (input.amountCents !== undefined && input.amountCents !== null) {
      assertNonNegativeInteger(input.amountCents, "Audit amount");
    }
    const safeDetailsJson = serializeSafeDetails(input.safeDetails);
    return this.db
      .prepare(
        `
        INSERT INTO financial_audit_log (
          audit_id, timestamp, environment, actor, action, booking_id, assignment_id,
          artist_id, amount_cents, currency, connected_account_id, transfer_id,
          payout_id, previous_state, new_state, approval_revision,
          idempotency_fingerprint, result, failure_reason, request_id, batch_id,
          safe_details_json
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE ${condition}
      `,
      )
      .bind(
        input.auditId,
        input.timestamp,
        this.environment,
        actor,
        action,
        input.bookingId ?? null,
        input.assignmentId ?? null,
        input.artistId ?? null,
        input.amountCents ?? null,
        input.currency ?? null,
        input.connectedAccountId ?? null,
        input.transferId ?? null,
        input.payoutId ?? null,
        input.previousState ?? null,
        input.newState ?? null,
        input.approvalRevision ?? null,
        input.idempotencyFingerprint ?? null,
        result,
        input.failureReason ?? null,
        input.requestId ?? null,
        input.batchId ?? null,
        safeDetailsJson,
        ...conditionValues,
      );
  }

  async appendAudit(input: AuditWrite): Promise<void> {
    await this.assertEnvironmentIdentity(input.timestamp);
    const result = await this.auditStatement(input).run();
    if (changes(result) !== 1)
      throw new PayoutRepositoryError(
        "CONFLICT",
        "Audit entry was not appended",
      );
  }

  async listAuditHistory(limit = 100): Promise<AuditHistoryRecord[]> {
    await this.ensureEnvironmentIdentity();
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Audit history limit must be between 1 and 500",
      );
    }
    const result = await this.db
      .prepare(
        `
        SELECT audit_id, timestamp, actor, action, booking_id, assignment_id, artist_id,
          amount_cents, currency, transfer_id, payout_id, previous_state, new_state,
          approval_revision, result, failure_reason, batch_id
        FROM financial_audit_log
        WHERE environment = ?
        ORDER BY timestamp DESC, audit_id DESC LIMIT ?
      `,
      )
      .bind(this.environment, limit + 1)
      .all<Record<string, unknown>>();
    const rows = result.results ?? [];
    if (rows.length > limit) {
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Audit history exceeds the bounded complete view",
      );
    }
    return rows.map((row) => ({
      auditId: String(row.audit_id),
      timestamp: String(row.timestamp),
      actor: String(row.actor),
      action: String(row.action),
      bookingId: (row.booking_id as string | null) ?? null,
      assignmentId: (row.assignment_id as string | null) ?? null,
      artistId: (row.artist_id as string | null) ?? null,
      amountCents: row.amount_cents === null ? null : Number(row.amount_cents),
      currency: (row.currency as string | null) ?? null,
      transferId: (row.transfer_id as string | null) ?? null,
      payoutId: (row.payout_id as string | null) ?? null,
      previousState: (row.previous_state as string | null) ?? null,
      newState: (row.new_state as string | null) ?? null,
      approvalRevision:
        row.approval_revision === null ? null : Number(row.approval_revision),
      result: String(row.result),
      failureReason: (row.failure_reason as string | null) ?? null,
      batchId: (row.batch_id as string | null) ?? null,
    }));
  }

  async getArtistProfile(input: {
    artistId: string;
    limit?: number;
    cursors?: Partial<Record<ArtistProfileCollectionKey, string>>;
  }): Promise<ArtistProfileSnapshot> {
    await this.ensureEnvironmentIdentity();
    assertSafeId(input.artistId, "Artist ID");
    const limit = input.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 250) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Artist profile limit must be between 1 and 250",
      );
    }
    const cursors = input.cursors ?? {};
    const unpaidCursor = assertArtistProfileCursorParts(
      decodeDashboardCursor(cursors.unpaidAssignments, "unpaidAssignments"),
      "unpaidAssignments",
      input.artistId,
    );
    const paymentCursor = assertArtistProfileCursorParts(
      decodeDashboardCursor(cursors.paymentHistory, "paymentHistory"),
      "paymentHistory",
      input.artistId,
    );
    const profileExceptionCursor = assertArtistProfileCursorParts(
      decodeDashboardCursor(cursors.openExceptions, "openExceptions"),
      "openExceptions",
      input.artistId,
    );
    const [, unpaidEventDate, unpaidAssignmentId, unpaidLedgerId] =
      unpaidCursor ?? [input.artistId, null, null, null];
    const [, paymentEventDate, paymentAssignmentId, paymentLedgerId] =
      paymentCursor ?? [input.artistId, null, null, null];
    const [, profileExceptionCreated, profileExceptionId] =
      profileExceptionCursor ?? [input.artistId, null, null];

    const [accountRow, countRow, unpaidResult, paymentResult, exceptionResult] =
      await Promise.all([
        this.db
          .prepare(
            `SELECT * FROM artist_stripe_accounts
             WHERE environment = ? AND artist_id = ?`,
          )
          .bind(this.environment, input.artistId)
          .first<ArtistAccountRow>(),
        this.db
          .prepare(
            `
            SELECT
              (SELECT COUNT(*) FROM artist_payment_ledger
                WHERE environment = ? AND artist_id = ?
                  AND state NOT IN ('PAID', 'MANUAL_PAYMENT_EXCEPTION'))
                AS unpaid_assignments,
              (SELECT COALESCE(SUM(total_approved_pay_cents), 0)
                FROM artist_payment_ledger
                WHERE environment = ? AND artist_id = ?
                  AND state NOT IN ('PAID', 'MANUAL_PAYMENT_EXCEPTION'))
                AS unpaid_amount_cents,
              (SELECT COUNT(*) FROM artist_payment_ledger
                WHERE environment = ? AND artist_id = ?) AS payment_history,
              (SELECT COUNT(*) FROM artist_payment_ledger
                WHERE environment = ? AND artist_id = ? AND state = 'PAID')
                AS paid_assignments,
              (SELECT COUNT(*) FROM payout_exceptions
                WHERE environment = ? AND artist_id = ?
                  AND status IN ('OPEN', 'ACKNOWLEDGED')) AS open_exceptions
          `,
          )
          .bind(
            this.environment,
            input.artistId,
            this.environment,
            input.artistId,
            this.environment,
            input.artistId,
            this.environment,
            input.artistId,
            this.environment,
            input.artistId,
          )
          .first<{
            unpaid_assignments: number;
            unpaid_amount_cents: number;
            payment_history: number;
            paid_assignments: number;
            open_exceptions: number;
          }>(),
        this.db
          .prepare(
            `
            SELECT * FROM artist_payment_ledger
            WHERE environment = ? AND artist_id = ?
              AND state NOT IN ('PAID', 'MANUAL_PAYMENT_EXCEPTION')
              AND (? IS NULL OR event_date < ?
                OR (event_date = ? AND assignment_id < ?)
                OR (event_date = ? AND assignment_id = ? AND ledger_id < ?))
            ORDER BY event_date DESC, assignment_id DESC, ledger_id DESC LIMIT ?
          `,
          )
          .bind(
            this.environment,
            input.artistId,
            unpaidEventDate,
            unpaidEventDate,
            unpaidEventDate,
            unpaidAssignmentId,
            unpaidEventDate,
            unpaidAssignmentId,
            unpaidLedgerId,
            limit + 1,
          )
          .all<LedgerRow>(),
        this.db
          .prepare(
            `
            SELECT * FROM artist_payment_ledger
            WHERE environment = ? AND artist_id = ?
              AND (? IS NULL OR event_date < ?
                OR (event_date = ? AND assignment_id < ?)
                OR (event_date = ? AND assignment_id = ? AND ledger_id < ?))
            ORDER BY event_date DESC, assignment_id DESC, ledger_id DESC LIMIT ?
          `,
          )
          .bind(
            this.environment,
            input.artistId,
            paymentEventDate,
            paymentEventDate,
            paymentEventDate,
            paymentAssignmentId,
            paymentEventDate,
            paymentAssignmentId,
            paymentLedgerId,
            limit + 1,
          )
          .all<LedgerRow>(),
        this.db
          .prepare(
            `
            SELECT * FROM payout_exceptions
            WHERE environment = ? AND artist_id = ?
              AND status IN ('OPEN', 'ACKNOWLEDGED')
              AND (? IS NULL OR created_at < ?
                OR (created_at = ? AND exception_id < ?))
            ORDER BY created_at DESC, exception_id DESC LIMIT ?
          `,
          )
          .bind(
            this.environment,
            input.artistId,
            profileExceptionCreated,
            profileExceptionCreated,
            profileExceptionCreated,
            profileExceptionId,
            limit + 1,
          )
          .all<Record<string, unknown>>(),
      ]);
    if (!accountRow) {
      throw new PayoutRepositoryError(
        "NOT_FOUND",
        "Artist payout profile was not found",
      );
    }
    if (!countRow) {
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Artist payout profile totals could not be read",
      );
    }
    const unpaidPage = dashboardPageMetadata(
      unpaidResult.results ?? [],
      limit,
      Number(countRow.unpaid_assignments),
      (row) => [
        input.artistId,
        row.event_date,
        row.assignment_id,
        row.ledger_id,
      ],
    );
    const paymentPage = dashboardPageMetadata(
      paymentResult.results ?? [],
      limit,
      Number(countRow.payment_history),
      (row) => [
        input.artistId,
        row.event_date,
        row.assignment_id,
        row.ledger_id,
      ],
    );
    const profileExceptionPage = dashboardPageMetadata(
      exceptionResult.results ?? [],
      limit,
      Number(countRow.open_exceptions),
      (row) => [
        input.artistId,
        String(row.created_at),
        String(row.exception_id),
      ],
    );
    return {
      artistId: input.artistId,
      account: mapArtist(accountRow),
      metrics: {
        unpaidAssignmentCount: Number(countRow.unpaid_assignments),
        unpaidAmountCents: Number(countRow.unpaid_amount_cents),
        assignmentCount: Number(countRow.payment_history),
        paidAssignmentCount: Number(countRow.paid_assignments),
        openExceptionCount: Number(countRow.open_exceptions),
      },
      collectionPages: {
        unpaidAssignments: unpaidPage.metadata,
        paymentHistory: paymentPage.metadata,
        openExceptions: profileExceptionPage.metadata,
      },
      unpaidAssignments: unpaidPage.rows.map(mapLedger),
      paymentHistory: paymentPage.rows.map(mapLedger),
      openExceptions: profileExceptionPage.rows.map(mapException),
    };
  }

  async getDashboard(
    query: number | DashboardQuery = {},
  ): Promise<DashboardSnapshot> {
    await this.ensureEnvironmentIdentity();
    const limit = typeof query === "number" ? query : (query.limit ?? 100);
    if (!Number.isInteger(limit) || limit < 1 || limit > 250) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Dashboard limit must be between 1 and 250",
      );
    }
    const selectedArtistId =
      typeof query === "number" ? undefined : query.artistId;
    const artistProfileCursors =
      typeof query === "number" ? {} : (query.artistProfileCursors ?? {});
    if (selectedArtistId !== undefined) {
      assertSafeId(selectedArtistId, "Dashboard artist ID");
    } else if (Object.keys(artistProfileCursors).length > 0) {
      throw new PayoutRepositoryError(
        "INVALID_INPUT",
        "Artist profile cursors require an exact artist ID",
      );
    }
    const cursors = typeof query === "number" ? {} : (query.cursors ?? {});
    const batchCursor = assertDashboardCursorParts(
      decodeDashboardCursor(cursors.batches, "batches"),
      "batches",
    );
    const ledgerCursor = assertDashboardCursorParts(
      decodeDashboardCursor(cursors.ledgers, "ledgers"),
      "ledgers",
    );
    const artistCursor = assertDashboardCursorParts(
      decodeDashboardCursor(cursors.artistAccounts, "artistAccounts"),
      "artistAccounts",
    );
    const exceptionCursor = assertDashboardCursorParts(
      decodeDashboardCursor(cursors.openExceptions, "openExceptions"),
      "openExceptions",
    );
    const auditCursor = assertDashboardCursorParts(
      decodeDashboardCursor(cursors.auditHistory, "auditHistory"),
      "auditHistory",
    );
    const blockedCursor = assertDashboardCursorParts(
      decodeDashboardCursor(cursors.batchBlockedItems, "batchBlockedItems"),
      "batchBlockedItems",
    );
    const failedWebhookCursor = assertDashboardCursorParts(
      decodeDashboardCursor(cursors.failedWebhookEvents, "failedWebhookEvents"),
      "failedWebhookEvents",
    );
    const [batchScheduled, batchCreated, batchId] = batchCursor ?? [
      null,
      null,
      null,
    ];
    const [ledgerEventDate, ledgerAssignmentId, ledgerId] = ledgerCursor ?? [
      null,
      null,
      null,
    ];
    const [exceptionCreated, exceptionId] = exceptionCursor ?? [null, null];
    const [auditTimestamp, auditId] = auditCursor ?? [null, null];
    const [blockedCreated, blockedExceptionId] = blockedCursor ?? [null, null];
    const [failedWebhookReceived, failedWebhookEventId] =
      failedWebhookCursor ?? [null, null];
    const artistId = artistCursor?.[0] ?? null;
    const [
      stateResult,
      onboardingResult,
      batchResult,
      ledgerResult,
      recentTransferResult,
      exceptionResult,
      auditResult,
      countResult,
      webhookResult,
      failedWebhookResult,
      reconciliationResult,
      artistAccountResult,
      batchReviewResult,
      batchBlockedResult,
    ] = await Promise.all([
      this.db
        .prepare(
          `
          SELECT state, COUNT(*) AS count, COALESCE(SUM(total_approved_pay_cents), 0) AS amount_cents
          FROM artist_payment_ledger WHERE environment = ? GROUP BY state ORDER BY state
        `,
        )
        .bind(this.environment)
        .all<{ state: PayoutState; count: number; amount_cents: number }>(),
      this.db
        .prepare(
          `
          SELECT onboarding_status AS status, COUNT(*) AS count
          FROM artist_stripe_accounts WHERE environment = ?
          GROUP BY onboarding_status ORDER BY onboarding_status
        `,
        )
        .bind(this.environment)
        .all<{ status: OnboardingState; count: number }>(),
      this.db
        .prepare(
          `
          SELECT * FROM payout_batches WHERE environment = ?
            AND (? IS NULL OR scheduled_date < ?
              OR (scheduled_date = ? AND created_at < ?)
              OR (scheduled_date = ? AND created_at = ? AND batch_id < ?))
          ORDER BY scheduled_date DESC, created_at DESC, batch_id DESC LIMIT ?
        `,
        )
        .bind(
          this.environment,
          batchScheduled,
          batchScheduled,
          batchScheduled,
          batchCreated,
          batchScheduled,
          batchCreated,
          batchId,
          limit + 1,
        )
        .all<BatchRow>(),
      this.db
        .prepare(
          `
          SELECT * FROM artist_payment_ledger WHERE environment = ?
            AND (? IS NULL OR event_date < ?
              OR (event_date = ? AND assignment_id < ?)
              OR (event_date = ? AND assignment_id = ? AND ledger_id < ?))
          ORDER BY event_date DESC, assignment_id DESC, ledger_id DESC LIMIT ?
        `,
        )
        .bind(
          this.environment,
          ledgerEventDate,
          ledgerEventDate,
          ledgerEventDate,
          ledgerAssignmentId,
          ledgerEventDate,
          ledgerAssignmentId,
          ledgerId,
          limit + 1,
        )
        .all<LedgerRow>(),
      this.db
        .prepare(
          `
          SELECT * FROM artist_payment_ledger
          WHERE environment = ? AND stripe_transfer_id IS NOT NULL
          ORDER BY updated_at DESC, ledger_id DESC LIMIT 5
        `,
        )
        .bind(this.environment)
        .all<LedgerRow>(),
      this.db
        .prepare(
          `
          SELECT * FROM payout_exceptions
          WHERE environment = ? AND status IN ('OPEN', 'ACKNOWLEDGED')
            AND (? IS NULL OR created_at < ?
              OR (created_at = ? AND exception_id < ?))
          ORDER BY created_at DESC, exception_id DESC LIMIT ?
        `,
        )
        .bind(
          this.environment,
          exceptionCreated,
          exceptionCreated,
          exceptionCreated,
          exceptionId,
          limit + 1,
        )
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `
          SELECT audit_id, timestamp, actor, action, booking_id, assignment_id,
            artist_id, amount_cents, currency, transfer_id, payout_id,
            previous_state, new_state, approval_revision, result,
            failure_reason, batch_id
          FROM financial_audit_log
          WHERE environment = ?
            AND (? IS NULL OR timestamp < ?
              OR (timestamp = ? AND audit_id < ?))
          ORDER BY timestamp DESC, audit_id DESC LIMIT ?
        `,
        )
        .bind(
          this.environment,
          auditTimestamp,
          auditTimestamp,
          auditTimestamp,
          auditId,
          limit + 1,
        )
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `
          SELECT
            (SELECT COUNT(*) FROM payout_batches WHERE environment = ?) AS batches,
            (SELECT COUNT(*) FROM artist_payment_ledger WHERE environment = ?) AS ledgers,
            (SELECT COUNT(*) FROM artist_stripe_accounts WHERE environment = ?) AS accounts,
            (SELECT COUNT(*) FROM payout_exceptions
              WHERE environment = ? AND status IN ('OPEN', 'ACKNOWLEDGED')) AS exceptions,
            (SELECT COUNT(*) FROM financial_audit_log WHERE environment = ?) AS audits,
            (SELECT COUNT(*) FROM payout_exceptions
              WHERE environment = ? AND exception_type = 'RECIPIENT_BATCH_PREVIEW'
                AND batch_id IS NOT NULL) AS blocked,
            (SELECT COUNT(*) FROM stripe_webhook_events
              WHERE environment = ? AND processing_status = 'FAILED') AS failed_webhooks
        `,
        )
        .bind(
          this.environment,
          this.environment,
          this.environment,
          this.environment,
          this.environment,
          this.environment,
          this.environment,
        )
        .first<{
          batches: number;
          ledgers: number;
          accounts: number;
          exceptions: number;
          audits: number;
          blocked: number;
          failed_webhooks: number;
        }>(),
      this.db
        .prepare(
          `
          SELECT
            SUM(CASE WHEN processing_status = 'RECEIVED' THEN 1 ELSE 0 END) AS received,
            SUM(CASE WHEN processing_status = 'PROCESSING' THEN 1 ELSE 0 END) AS processing,
            SUM(CASE WHEN processing_status = 'FAILED' THEN 1 ELSE 0 END) AS failed
          FROM stripe_webhook_events WHERE environment = ?
        `,
        )
        .bind(this.environment)
        .first<{
          received: number | null;
          processing: number | null;
          failed: number | null;
        }>(),
      this.db
        .prepare(
          `
          SELECT stripe_event_id, event_type, connected_account_id, received_at,
            safe_error_code, retry_count
          FROM stripe_webhook_events
          WHERE environment = ? AND processing_status = 'FAILED'
            AND (? IS NULL OR received_at < ?
              OR (received_at = ? AND stripe_event_id < ?))
          ORDER BY received_at DESC, stripe_event_id DESC LIMIT ?
        `,
        )
        .bind(
          this.environment,
          failedWebhookReceived,
          failedWebhookReceived,
          failedWebhookReceived,
          failedWebhookEventId,
          limit + 1,
        )
        .all<{
          stripe_event_id: string;
          event_type: string;
          connected_account_id: string | null;
          received_at: string;
          safe_error_code: string;
          retry_count: number;
        }>(),
      this.db
        .prepare(
          `
          SELECT MAX(reconciled_at) AS last_reconciliation_at
          FROM artist_payment_ledger WHERE environment = ? AND reconciled = 1
        `,
        )
        .bind(this.environment)
        .first<{ last_reconciliation_at: string | null }>(),
      this.db
        .prepare(
          `
          SELECT a.*,
            (SELECT COUNT(*) FROM artist_payment_ledger l
              WHERE l.environment = a.environment AND l.artist_id = a.artist_id
                AND l.state NOT IN ('PAID', 'MANUAL_PAYMENT_EXCEPTION'))
              AS unpaid_assignment_count,
            (SELECT COALESCE(SUM(l.total_approved_pay_cents), 0)
              FROM artist_payment_ledger l
              WHERE l.environment = a.environment AND l.artist_id = a.artist_id
                AND l.state NOT IN ('PAID', 'MANUAL_PAYMENT_EXCEPTION'))
              AS unpaid_amount_cents,
            (SELECT COUNT(*) FROM artist_payment_ledger l
              WHERE l.environment = a.environment AND l.artist_id = a.artist_id)
              AS assignment_count,
            (SELECT COUNT(*) FROM artist_payment_ledger l
              WHERE l.environment = a.environment AND l.artist_id = a.artist_id
                AND l.state = 'PAID') AS paid_assignment_count,
            (SELECT COUNT(*) FROM payout_exceptions e
              WHERE e.environment = a.environment AND e.artist_id = a.artist_id
                AND e.status IN ('OPEN', 'ACKNOWLEDGED')) AS open_exception_count
          FROM artist_stripe_accounts a WHERE a.environment = ?
            AND (? IS NULL OR artist_id > ?)
          ORDER BY artist_id ASC LIMIT ?
        `,
        )
        .bind(this.environment, artistId, artistId, limit + 1)
        .all<ArtistDashboardRow>(),
      this.db
        .prepare(
          `
          SELECT
            i.batch_id, i.ledger_id, i.item_status,
            l.artist_id, l.artist_name, l.booking_id, l.assignment_id,
            l.event_name, l.event_date, l.closeout_verified_at, l.service,
            l.service_pay_cents, l.travel_pay_cents,
            l.bonus_cents, l.adjustment_cents, l.deduction_cents,
            l.total_approved_pay_cents, l.stripe_connected_account_id,
            l.closeout_status, l.state, b.scheduled_date,
            CASE
              WHEN a.onboarding_status = 'PAYOUT_READY'
                AND a.requirements_status = 'complete'
                AND a.transfers_status = 'active'
                AND a.payouts_status = 'active'
              THEN 'PAYOUT_READY'
              ELSE a.onboarding_status || '/' || a.requirements_status || '/' ||
                a.transfers_status || '/' || a.payouts_status
            END AS stripe_readiness,
            (SELECT COUNT(*) FROM payout_exceptions e
              WHERE e.environment = i.environment AND e.ledger_id = i.ledger_id
                AND e.status IN ('OPEN', 'ACKNOWLEDGED')) AS exception_count,
            CASE WHEN
              i.assignment_id_snapshot = l.assignment_id AND
              i.artist_id_snapshot = l.artist_id AND
              i.connected_account_id_snapshot = l.stripe_connected_account_id AND
              i.amount_cents_snapshot = l.total_approved_pay_cents AND
              i.source_revision_snapshot = l.source_revision AND
              i.material_digest_snapshot = l.material_digest AND
              i.payment_memo_snapshot = l.payment_memo AND
              l.batch_id = i.batch_id
            THEN 1 ELSE 0 END AS snapshot_matches
          FROM payout_batch_items i
          JOIN payout_batches b
            ON b.batch_id = i.batch_id AND b.environment = i.environment
          JOIN artist_payment_ledger l
            ON l.ledger_id = i.ledger_id AND l.environment = i.environment
          JOIN artist_stripe_accounts a
            ON a.artist_id = l.artist_id AND a.environment = l.environment
              AND a.stripe_account_id = l.stripe_connected_account_id
          WHERE i.environment = ? AND i.batch_id IN (
            SELECT batch_id FROM payout_batches
            WHERE environment = ?
              AND (? IS NULL OR scheduled_date < ?
                OR (scheduled_date = ? AND created_at < ?)
                OR (scheduled_date = ? AND created_at = ? AND batch_id < ?))
            ORDER BY scheduled_date DESC, created_at DESC, batch_id DESC LIMIT ?
          )
          ORDER BY b.scheduled_date DESC, i.batch_id, l.artist_name, l.assignment_id
        `,
        )
        .bind(
          this.environment,
          this.environment,
          batchScheduled,
          batchScheduled,
          batchScheduled,
          batchCreated,
          batchScheduled,
          batchCreated,
          batchId,
          limit,
        )
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `
          SELECT
            e.exception_id, e.batch_id, e.ledger_id, e.reason_code, e.safe_reason,
            e.owner_action_required, e.created_at,
            l.artist_id, l.artist_name, l.event_name, l.booking_id,
            l.assignment_id, l.event_date, l.service,
            l.total_approved_pay_cents
          FROM payout_exceptions e
          JOIN artist_payment_ledger l
            ON l.ledger_id = e.ledger_id AND l.environment = e.environment
          WHERE e.environment = ?
            AND e.exception_type = 'RECIPIENT_BATCH_PREVIEW'
            AND e.batch_id IS NOT NULL
            AND (? IS NULL OR e.created_at < ?
              OR (e.created_at = ? AND e.exception_id < ?))
          ORDER BY e.created_at DESC, e.exception_id DESC LIMIT ?
        `,
        )
        .bind(
          this.environment,
          blockedCreated,
          blockedCreated,
          blockedCreated,
          blockedExceptionId,
          limit + 1,
        )
        .all<Record<string, unknown>>(),
    ]);
    const selectedArtistProfile = selectedArtistId
      ? await this.getArtistProfile({
          artistId: selectedArtistId,
          limit,
          cursors: artistProfileCursors,
        })
      : null;
    if (!countResult) {
      throw new PayoutRepositoryError(
        "DATA_INTEGRITY",
        "Dashboard totals could not be read",
      );
    }
    const batchPage = dashboardPageMetadata(
      batchResult.results ?? [],
      limit,
      Number(countResult.batches),
      (row) => [row.scheduled_date, row.created_at, row.batch_id],
    );
    const ledgerPage = dashboardPageMetadata(
      ledgerResult.results ?? [],
      limit,
      Number(countResult.ledgers),
      (row) => [row.event_date, row.assignment_id, row.ledger_id],
    );
    const artistPage = dashboardPageMetadata(
      artistAccountResult.results ?? [],
      limit,
      Number(countResult.accounts),
      (row) => [row.artist_id],
    );
    const exceptionPage = dashboardPageMetadata(
      exceptionResult.results ?? [],
      limit,
      Number(countResult.exceptions),
      (row) => [String(row.created_at), String(row.exception_id)],
    );
    const auditPage = dashboardPageMetadata(
      auditResult.results ?? [],
      limit,
      Number(countResult.audits),
      (row) => [String(row.timestamp), String(row.audit_id)],
    );
    const blockedPage = dashboardPageMetadata(
      batchBlockedResult.results ?? [],
      limit,
      Number(countResult.blocked),
      (row) => [String(row.created_at), String(row.exception_id)],
    );
    const failedWebhookPage = dashboardPageMetadata(
      failedWebhookResult.results ?? [],
      limit,
      Number(countResult.failed_webhooks),
      (row) => [row.received_at, row.stripe_event_id],
    );
    return {
      environment: this.environment,
      pageLimit: limit,
      collectionPages: {
        batches: batchPage.metadata,
        ledgers: ledgerPage.metadata,
        artistAccounts: artistPage.metadata,
        openExceptions: exceptionPage.metadata,
        auditHistory: auditPage.metadata,
        batchBlockedItems: blockedPage.metadata,
        failedWebhookEvents: failedWebhookPage.metadata,
      },
      fundingPreviewUnavailable: true,
      fundingPreviewError: null,
      stateTotals: (stateResult.results ?? []).map((row) => ({
        state: row.state,
        count: Number(row.count),
        amountCents: Number(row.amount_cents),
      })),
      onboardingTotals: (onboardingResult.results ?? []).map((row) => ({
        status: row.status,
        count: Number(row.count),
      })),
      batches: batchPage.rows.map(mapBatch),
      batchReviewItems: (batchReviewResult.results ?? []).map((row) => ({
        batchId: String(row.batch_id),
        ledgerId: String(row.ledger_id),
        artistId: String(row.artist_id),
        artistName: String(row.artist_name),
        eventName: String(row.event_name),
        bookingId: String(row.booking_id),
        assignmentId: String(row.assignment_id),
        eventDate: String(row.event_date),
        closeoutVerifiedAt: String(row.closeout_verified_at),
        service: String(row.service),
        servicePayCents: Number(row.service_pay_cents),
        travelPayCents: Number(row.travel_pay_cents),
        bonusCents: Number(row.bonus_cents),
        adjustmentCents: Number(row.adjustment_cents),
        deductionCents: Number(row.deduction_cents),
        totalCents: Number(row.total_approved_pay_cents),
        connectedAccountId: String(row.stripe_connected_account_id),
        closeoutStatus: String(row.closeout_status),
        stripeReadiness: String(row.stripe_readiness),
        eligibilityState: row.state as PayoutState,
        exceptionCount: Number(row.exception_count),
        scheduledDate: String(row.scheduled_date),
        snapshotMatches: Number(row.snapshot_matches) === 1,
        itemStatus: row.item_status as BatchItemStatus,
      })),
      batchBlockedItems: blockedPage.rows.map((row) => ({
        batchId: String(row.batch_id),
        ledgerId: String(row.ledger_id),
        artistId: String(row.artist_id),
        artistName: String(row.artist_name),
        eventName: String(row.event_name),
        bookingId: String(row.booking_id),
        assignmentId: String(row.assignment_id),
        eventDate: String(row.event_date),
        service: String(row.service),
        totalCents: Number(row.total_approved_pay_cents),
        reasonCode: String(row.reason_code),
        safeReason: String(row.safe_reason),
        ownerActionRequired: String(row.owner_action_required),
        createdAt: String(row.created_at),
      })),
      ledgers: ledgerPage.rows.map(mapLedger),
      recentTransfers: (recentTransferResult.results ?? []).map(mapLedger),
      openExceptions: exceptionPage.rows.map(mapException),
      artistAccounts: artistPage.rows.map(mapArtist),
      artistProfileMetrics: artistPage.rows.map((row) => ({
        artistId: row.artist_id,
        unpaidAssignmentCount: Number(row.unpaid_assignment_count),
        unpaidAmountCents: Number(row.unpaid_amount_cents),
        assignmentCount: Number(row.assignment_count),
        paidAssignmentCount: Number(row.paid_assignment_count),
        openExceptionCount: Number(row.open_exception_count),
      })),
      selectedArtistProfile,
      activeRosterCount: null,
      onboardingQueueUnavailable: true,
      onboardingQueue: [],
      auditHistory: auditPage.rows.map(mapAuditHistory),
      webhookBacklog: {
        received: Number(webhookResult?.received ?? 0),
        processing: Number(webhookResult?.processing ?? 0),
        failed: Number(webhookResult?.failed ?? 0),
      },
      failedWebhookEvents: failedWebhookPage.rows.map((row) => ({
        eventId: row.stripe_event_id,
        eventType: row.event_type,
        connectedAccountId: row.connected_account_id,
        receivedAt: row.received_at,
        safeErrorCode: row.safe_error_code,
        retryCount: Number(row.retry_count),
      })),
      lastReconciliationAt:
        reconciliationResult?.last_reconciliation_at ?? null,
    };
  }
}
