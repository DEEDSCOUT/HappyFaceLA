import type { PayoutState } from "./types.ts";

const LEGAL_TRANSITIONS: Readonly<Record<PayoutState, readonly PayoutState[]>> =
  {
    NOT_ELIGIBLE: ["CLOSEOUT_PENDING", "ISSUE_REVIEW", "MANUAL_REVIEW"],
    CLOSEOUT_PENDING: [
      "ISSUE_REVIEW",
      "READY_FOR_OWNER_APPROVAL",
      "MANUAL_REVIEW",
    ],
    ISSUE_REVIEW: [
      "CLOSEOUT_PENDING",
      "READY_FOR_OWNER_APPROVAL",
      "MANUAL_REVIEW",
    ],
    READY_FOR_OWNER_APPROVAL: [
      "OWNER_APPROVED",
      "CLOSEOUT_PENDING",
      "ISSUE_REVIEW",
      "MANUAL_REVIEW",
    ],
    OWNER_APPROVED: ["TRANSFER_QUEUED", "CLOSEOUT_PENDING", "ISSUE_REVIEW"],
    TRANSFER_QUEUED: ["TRANSFER_CREATED", "TRANSFER_FAILED", "MANUAL_REVIEW"],
    TRANSFER_CREATED: [
      "TRANSFER_PENDING",
      "TRANSFER_COMPLETED",
      "TRANSFER_FAILED",
      "REVERSED",
    ],
    TRANSFER_PENDING: ["TRANSFER_COMPLETED", "TRANSFER_FAILED", "REVERSED"],
    TRANSFER_COMPLETED: ["PAYOUT_PENDING", "REVERSED", "MANUAL_REVIEW"],
    PAYOUT_PENDING: ["PAID", "PAYOUT_FAILED", "REVERSED", "MANUAL_REVIEW"],
    PAID: ["PAYOUT_FAILED", "REVERSED", "MANUAL_REVIEW"],
    TRANSFER_FAILED: ["TRANSFER_QUEUED", "MANUAL_REVIEW"],
    PAYOUT_FAILED: ["PAYOUT_PENDING", "PAID", "MANUAL_REVIEW"],
    REVERSED: ["MANUAL_REVIEW", "READY_FOR_OWNER_APPROVAL"],
    MANUAL_REVIEW: [
      "CLOSEOUT_PENDING",
      "READY_FOR_OWNER_APPROVAL",
      "MANUAL_PAYMENT_EXCEPTION",
    ],
    MANUAL_PAYMENT_EXCEPTION: ["PAID", "MANUAL_REVIEW"],
  };

export function canTransition(from: PayoutState, to: PayoutState): boolean {
  return from === to || LEGAL_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: PayoutState, to: PayoutState): void {
  if (!canTransition(from, to))
    throw new Error(`Illegal payout state transition: ${from} -> ${to}`);
}

export function legalTransitionsFrom(
  state: PayoutState,
): readonly PayoutState[] {
  return LEGAL_TRANSITIONS[state];
}
