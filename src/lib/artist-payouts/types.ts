import type { D1Database } from "../booking/availability-types.ts";

export type { D1Database };

export const PAYOUT_ENVIRONMENTS = ["sandbox", "live"] as const;
export type PayoutEnvironment = (typeof PAYOUT_ENVIRONMENTS)[number];

export const PAYOUT_ROLES = ["admin", "owner"] as const;
export type PayoutRole = (typeof PAYOUT_ROLES)[number];

export interface PayoutActor {
  email: string;
  role: PayoutRole;
}

export const PAYOUT_STATES = [
  "NOT_ELIGIBLE",
  "CLOSEOUT_PENDING",
  "ISSUE_REVIEW",
  "READY_FOR_OWNER_APPROVAL",
  "OWNER_APPROVED",
  "TRANSFER_QUEUED",
  "TRANSFER_CREATED",
  "TRANSFER_PENDING",
  "TRANSFER_COMPLETED",
  "PAYOUT_PENDING",
  "PAID",
  "TRANSFER_FAILED",
  "PAYOUT_FAILED",
  "REVERSED",
  "MANUAL_REVIEW",
  "MANUAL_PAYMENT_EXCEPTION",
] as const;
export type PayoutState = (typeof PAYOUT_STATES)[number];

export const ONBOARDING_STATES = [
  "NOT_INVITED",
  "INVITE_READY",
  "LINK_CREATED",
  "INVITATION_DRAFTED",
  "ONBOARDING_STARTED",
  "REQUIREMENTS_PENDING",
  "RESTRICTED",
  "ONBOARDING_COMPLETE",
  "TRANSFERS_ENABLED",
  "PAYOUT_READY",
  "DISABLED",
] as const;
export type OnboardingState = (typeof ONBOARDING_STATES)[number];

export interface ArtistPayAmounts {
  servicePayCents: number;
  travelPayCents: number;
  bonusCents: number;
  adjustmentCents: number;
  deductionCents: number;
  totalApprovedPayCents: number;
}

export interface CloseoutControls {
  assignmentExists: boolean;
  bookingIdValid: boolean;
  assignmentIdValid: boolean;
  eventCompleted: boolean;
  actualEndTime: string | null;
  artistCompletionConfirmed: boolean;
  serviceCompleted: boolean;
  extraTimeReconciled: boolean;
  serviceChangeReconciled: boolean;
  travelPayReconciled: boolean;
  adjustmentsReconciled: boolean;
  noCustomerComplaintAffectingPay: boolean;
  noRefundIssueAffectingPay: boolean;
  noDamageOrSupplyIssueAffectingPay: boolean;
  compensationApproved: boolean;
  contractorControlSatisfied: boolean;
  stripeOnboardingComplete: boolean;
  stripeTransfersActive: boolean;
  stripePayoutsActive: boolean;
  connectedAccountMatchesArtist: boolean;
}

export interface LedgerDraft extends ArtistPayAmounts {
  ledgerId: string;
  bookingId: string;
  assignmentId: string;
  crmRecordId: string;
  crmRevision: string;
  artistId: string;
  artistName: string;
  eventName: string;
  eventDate: string;
  closeoutVerifiedAt: string;
  service: string;
  environment: PayoutEnvironment;
  sourceRevision: number;
  closeout: CloseoutControls;
  connectedAccountId: string;
}

export interface LedgerRecord extends LedgerDraft {
  crmReconciledRevision: string | null;
  crmCorrectionRequired: boolean;
  reconciliationClaimToken: string | null;
  reconciliationClaimExpiresAt: string | null;
  reconciliationProjectionAt: string | null;
  crmCorrectionProjectionAt: string | null;
  manualPaymentClaimToken: string | null;
  manualPaymentClaimExpiresAt: string | null;
  materialDigest: string;
  state: PayoutState;
  ownerApprovalRevision: number;
  approvalDigest: string | null;
  approvedBy: string | null;
  approvalTimestamp: string | null;
  batchEligibilityDate: string | null;
  batchId: string | null;
  approvedPayoutDestinationId: string | null;
  approvedPayoutDestinationAt: string | null;
  stripeTransferId: string | null;
  stripeDestinationPaymentId: string | null;
  stripePayoutId: string | null;
  stripePayoutStatus: string | null;
  expectedArrival: string | null;
  failureCode: string | null;
  failureReason: string | null;
  paymentMemo: string;
  manualPaymentMethod: string | null;
  manualPaymentAmountCents: number | null;
  manualPaymentReason: string | null;
  manualPaymentEvidenceReference: string | null;
  manualPaymentMemo: string | null;
  manualPaymentRecordedBy: string | null;
  manualPaymentRecordedAt: string | null;
  manualPaymentCrmRevision: string | null;
  reconciled: boolean;
  reconciledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BatchSnapshotItem {
  ledgerId: string;
  assignmentId: string;
  artistId: string;
  connectedAccountId: string;
  totalApprovedPayCents: number;
  sourceRevision: number;
  materialDigest: string;
  paymentMemo: string;
}

export interface BatchApprovalSnapshot {
  batchId: string;
  environment: PayoutEnvironment;
  scheduledDate: string;
  currency: "usd";
  items: BatchSnapshotItem[];
}

export interface StripeTransferResult {
  id: string;
  amount: number;
  currency: string;
  destination: string;
  destinationPaymentId: string | null;
  reversed: boolean;
  transferGroup: string | null;
  metadata: Record<string, string>;
}

export interface StripeRecipientStatus {
  accountId: string;
  transfersStatus: string;
  payoutsStatus: string;
  automaticPayoutsEnabled: boolean;
  payoutScheduleInterval: "daily" | "weekly" | "monthly" | null;
  payoutDestinationId: string | null;
  requirementsStatus: string;
  currentlyDue: string[];
  disabledReason: string | null;
}

export interface StripePayoutResult {
  id: string;
  destinationId: string;
  status: string;
  arrivalDate: number;
  reconciliationStatus: string;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface PayoutRuntimeEnv {
  PAYOUTS_D1?: D1Database;
  STRIPE_ARTIST_PAYOUTS_ENABLED?: string;
  STRIPE_ARTIST_INTAKE_ENABLED?: string;
  STRIPE_ARTIST_ONBOARDING_ENABLED?: string;
  STRIPE_ARTIST_TRANSFERS_ENABLED?: string;
  STRIPE_ARTIST_PAYOUTS_ENV?: string;
  STRIPE_PAYOUTS_SANDBOX_SECRET_KEY?: string;
  STRIPE_PAYOUTS_LIVE_SECRET_KEY?: string;
  STRIPE_PAYOUTS_SANDBOX_PLATFORM_ACCOUNT_ID?: string;
  STRIPE_PAYOUTS_LIVE_PLATFORM_ACCOUNT_ID?: string;
  STRIPE_PAYOUTS_SANDBOX_ACCOUNT_WEBHOOK_SECRET?: string;
  STRIPE_PAYOUTS_LIVE_ACCOUNT_WEBHOOK_SECRET?: string;
  STRIPE_PAYOUTS_SANDBOX_PAYOUT_WEBHOOK_SECRET?: string;
  STRIPE_PAYOUTS_LIVE_PAYOUT_WEBHOOK_SECRET?: string;
  PAYOUT_MIN_RESERVE_CENTS?: string;
  PAYOUT_PUBLIC_BASE_URL?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  PAYOUT_OWNER_EMAILS?: string;
  PAYOUT_ADMIN_EMAILS?: string;
  PAYOUT_SANDBOX_CRM_WRITE_URL?: string;
  PAYOUT_SANDBOX_CRM_READ_URL?: string;
  PAYOUT_SANDBOX_CRM_ALLOWED_ORIGIN?: string;
  PAYOUT_SANDBOX_CRM_WEBHOOK_SECRET?: string;
  PAYOUT_LIVE_CRM_WRITE_URL?: string;
  PAYOUT_LIVE_CRM_READ_URL?: string;
  PAYOUT_LIVE_CRM_ALLOWED_ORIGIN?: string;
  PAYOUT_LIVE_CRM_WEBHOOK_SECRET?: string;
  PAYOUT_SANDBOX_ROSTER_READ_URL?: string;
  PAYOUT_SANDBOX_ROSTER_LIST_URL?: string;
  PAYOUT_SANDBOX_ROSTER_ALLOWED_ORIGIN?: string;
  PAYOUT_SANDBOX_ROSTER_READ_SECRET?: string;
  PAYOUT_LIVE_ROSTER_READ_URL?: string;
  PAYOUT_LIVE_ROSTER_LIST_URL?: string;
  PAYOUT_LIVE_ROSTER_ALLOWED_ORIGIN?: string;
  PAYOUT_LIVE_ROSTER_READ_SECRET?: string;
  PAYOUT_SANDBOX_ROSTER_PROJECTION_WRITE_URL?: string;
  PAYOUT_SANDBOX_ROSTER_PROJECTION_READ_URL?: string;
  PAYOUT_SANDBOX_ROSTER_PROJECTION_ALLOWED_ORIGIN?: string;
  PAYOUT_SANDBOX_ROSTER_PROJECTION_SECRET?: string;
  PAYOUT_LIVE_ROSTER_PROJECTION_WRITE_URL?: string;
  PAYOUT_LIVE_ROSTER_PROJECTION_READ_URL?: string;
  PAYOUT_LIVE_ROSTER_PROJECTION_ALLOWED_ORIGIN?: string;
  PAYOUT_LIVE_ROSTER_PROJECTION_SECRET?: string;
  PAYOUT_SANDBOX_CRM_SOURCE_READ_URL?: string;
  PAYOUT_SANDBOX_CRM_SOURCE_ALLOWED_ORIGIN?: string;
  PAYOUT_SANDBOX_CRM_SOURCE_READ_SECRET?: string;
  PAYOUT_LIVE_CRM_SOURCE_READ_URL?: string;
  PAYOUT_LIVE_CRM_SOURCE_ALLOWED_ORIGIN?: string;
  PAYOUT_LIVE_CRM_SOURCE_READ_SECRET?: string;
  PAYOUT_SANDBOX_ONBOARDING_CLAIM_SECRET?: string;
  PAYOUT_LIVE_ONBOARDING_CLAIM_SECRET?: string;
}

export interface StripeRecipientCandidate {
  accountId: string;
  contactEmailMatches: boolean;
  environmentMetadataMatches: boolean;
  purposeMatches: boolean;
  provenanceMatches: boolean;
}

export interface StripePayoutGateway {
  findRecipientsByArtist(input: {
    artistId: string;
    contactEmail: string;
    provenanceFingerprint: string;
  }): Promise<StripeRecipientCandidate[]>;
  createRecipient(input: {
    artistId: string;
    displayName: string;
    contactEmail: string;
    country: string;
    legalEntityType:
      "individual" | "company" | "non_profit" | "government_entity";
    environment: PayoutEnvironment;
    provenanceFingerprint: string;
  }): Promise<{ accountId: string }>;
  createOnboardingLink(input: {
    accountId: string;
    returnUrl: string;
    refreshUrl: string;
  }): Promise<{ url: string; expiresAt: number }>;
  retrieveRecipientStatus(
    accountId: string,
    expectedArtistId: string,
  ): Promise<StripeRecipientStatus>;
  retrieveAvailableBalance(currency: "usd"): Promise<number>;
  createTransfer(input: {
    amount: number;
    currency: "usd";
    destination: string;
    description: string;
    transferGroup: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<StripeTransferResult>;
  retrieveTransfer(transferId: string): Promise<StripeTransferResult>;
  findTransfersByRecoveryFingerprint(input: {
    destinationAccountId: string;
    idempotencyFingerprint: string;
  }): Promise<StripeTransferResult[]>;
  retrievePayout(
    accountId: string,
    payoutId: string,
  ): Promise<StripePayoutResult>;
  payoutContainsDestinationPayment(input: {
    accountId: string;
    payoutId: string;
    destinationPaymentId: string;
  }): Promise<boolean>;
}
