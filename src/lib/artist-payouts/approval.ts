import type {
  BatchApprovalSnapshot,
  BatchSnapshotItem,
  LedgerDraft,
} from "./types.ts";

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function normalizedItem(item: BatchSnapshotItem): BatchSnapshotItem {
  return {
    ledgerId: item.ledgerId,
    assignmentId: item.assignmentId,
    artistId: item.artistId,
    connectedAccountId: item.connectedAccountId,
    totalApprovedPayCents: item.totalApprovedPayCents,
    sourceRevision: item.sourceRevision,
    materialDigest: item.materialDigest,
    paymentMemo: item.paymentMemo,
  };
}

export function canonicalLedgerMaterial(ledger: LedgerDraft): string {
  return JSON.stringify({
    environment: ledger.environment,
    ledgerId: ledger.ledgerId,
    bookingId: ledger.bookingId,
    assignmentId: ledger.assignmentId,
    crmRecordId: ledger.crmRecordId,
    crmRevision: ledger.crmRevision,
    artistId: ledger.artistId,
    artistName: ledger.artistName,
    eventName: ledger.eventName,
    eventDate: ledger.eventDate,
    closeoutVerifiedAt: ledger.closeoutVerifiedAt,
    service: ledger.service,
    servicePayCents: ledger.servicePayCents,
    travelPayCents: ledger.travelPayCents,
    bonusCents: ledger.bonusCents,
    adjustmentCents: ledger.adjustmentCents,
    deductionCents: ledger.deductionCents,
    totalApprovedPayCents: ledger.totalApprovedPayCents,
    connectedAccountId: ledger.connectedAccountId,
    sourceRevision: ledger.sourceRevision,
    closeout: {
      assignmentExists: ledger.closeout.assignmentExists,
      bookingIdValid: ledger.closeout.bookingIdValid,
      assignmentIdValid: ledger.closeout.assignmentIdValid,
      eventCompleted: ledger.closeout.eventCompleted,
      actualEndTime: ledger.closeout.actualEndTime,
      artistCompletionConfirmed: ledger.closeout.artistCompletionConfirmed,
      serviceCompleted: ledger.closeout.serviceCompleted,
      extraTimeReconciled: ledger.closeout.extraTimeReconciled,
      serviceChangeReconciled: ledger.closeout.serviceChangeReconciled,
      travelPayReconciled: ledger.closeout.travelPayReconciled,
      adjustmentsReconciled: ledger.closeout.adjustmentsReconciled,
      noCustomerComplaintAffectingPay:
        ledger.closeout.noCustomerComplaintAffectingPay,
      noRefundIssueAffectingPay: ledger.closeout.noRefundIssueAffectingPay,
      noDamageOrSupplyIssueAffectingPay:
        ledger.closeout.noDamageOrSupplyIssueAffectingPay,
      compensationApproved: ledger.closeout.compensationApproved,
      contractorControlSatisfied: ledger.closeout.contractorControlSatisfied,
    },
  });
}

export async function digestLedgerMaterial(
  ledger: LedgerDraft,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalLedgerMaterial(ledger)),
  );
  return `sha256:${base64Url(new Uint8Array(digest))}`;
}

export function canonicalBatchSnapshot(
  snapshot: BatchApprovalSnapshot,
): string {
  const normalized: BatchApprovalSnapshot = {
    batchId: snapshot.batchId,
    environment: snapshot.environment,
    scheduledDate: snapshot.scheduledDate,
    currency: "usd",
    items: [...snapshot.items]
      .map(normalizedItem)
      .sort(
        (a, b) =>
          a.assignmentId.localeCompare(b.assignmentId) ||
          a.ledgerId.localeCompare(b.ledgerId),
      ),
  };
  return JSON.stringify(normalized);
}

export async function digestBatchSnapshot(
  snapshot: BatchApprovalSnapshot,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalBatchSnapshot(snapshot)),
  );
  return `sha256:${base64Url(new Uint8Array(digest))}`;
}

export function transferIdempotencyKey(
  assignmentId: string,
  sourceRevision: number,
): string {
  return `hfl-artist-transfer:${assignmentId}:${sourceRevision}`;
}

export function canonicalManualPaymentIntent(input: {
  ledgerId: string;
  expectedAmountCents: number;
  method: string;
  reason: string;
  evidenceReference: string;
  memo: string;
}): string {
  return JSON.stringify({
    ledgerId: input.ledgerId,
    expectedAmountCents: input.expectedAmountCents,
    method: input.method,
    reason: input.reason,
    evidenceReference: input.evidenceReference,
    memo: input.memo,
  });
}

export async function manualPaymentIntentDigest(
  input: Parameters<typeof canonicalManualPaymentIntent>[0],
): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonicalManualPaymentIntent(input)),
    ),
  );
  const hex = Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256-hex:${hex}`;
}
