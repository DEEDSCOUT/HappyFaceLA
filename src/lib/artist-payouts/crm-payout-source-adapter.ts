import { validateArtistPayAmounts } from "./money.ts";
import {
  assertBoundedOperationalText,
  assertExactObject,
  signedJsonRead,
  type SignedReadAdapterConfig,
  type SignedReadAdapterOptions,
} from "./signed-read-adapter.ts";
import type {
  ArtistPayAmounts,
  CloseoutControls,
  PayoutEnvironment,
} from "./types.ts";
import { isIsoDate, isIsoInstant, isSafeBusinessId } from "./validation.ts";

export interface AuthoritativeCrmPayoutSource extends ArtistPayAmounts {
  environment: PayoutEnvironment;
  recordId: string;
  revision: string;
  sourceRevision: number;
  bookingId: string;
  assignmentId: string;
  artistId: string;
  artistName: string;
  eventName: string;
  eventDate: string;
  closeoutVerifiedAt: string;
  service: string;
  priorPayment: PriorPaymentDisposition;
  closeout: CloseoutControls;
}

export const PRIOR_PAYMENT_REASON_CODES = [
  "LEGACY_STATUS_NOT_EXPLICITLY_UNPAID",
  "LEGACY_PAID_DATE_PRESENT",
  "LEGACY_PAYMENT_MEMO_PRESENT",
  "LEGACY_RECEIPT_REFERENCE_PRESENT",
  "LEGACY_RECONCILED",
  "EXISTING_PAYOUT_PROJECTION_PRESENT",
] as const;

export interface PriorPaymentDisposition {
  disposition: "CLEAR" | "OWNER_REVIEW_REQUIRED";
  reasonCodes: Array<(typeof PRIOR_PAYMENT_REASON_CODES)[number]>;
  legacyPaymentMethodPresent: boolean;
  legacyPaymentHandlePresent: boolean;
}

export type CrmPayoutSourceAdapterConfig = SignedReadAdapterConfig;

const RESPONSE_KEYS = ["ok", "requestId", "environment", "source"] as const;
const SOURCE_KEYS = [
  "recordId",
  "revision",
  "sourceRevision",
  "bookingId",
  "assignmentId",
  "artistId",
  "artistName",
  "eventName",
  "eventDate",
  "closeoutVerifiedAt",
  "service",
  "servicePayCents",
  "travelPayCents",
  "bonusCents",
  "adjustmentCents",
  "deductionCents",
  "totalApprovedPayCents",
  "priorPayment",
  "closeout",
] as const;
const PRIOR_PAYMENT_KEYS = [
  "disposition",
  "reasonCodes",
  "legacyPaymentMethodPresent",
  "legacyPaymentHandlePresent",
] as const;
const CLOSEOUT_KEYS = [
  "assignmentExists",
  "bookingIdValid",
  "assignmentIdValid",
  "eventCompleted",
  "actualEndTime",
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
] as const satisfies readonly (keyof CloseoutControls)[];

function parseCloseout(value: unknown): CloseoutControls {
  assertExactObject(value, CLOSEOUT_KEYS, "CRM closeout controls");
  const actualEndTime = value.actualEndTime;
  if (actualEndTime !== null && !isIsoInstant(actualEndTime)) {
    throw new Error("CRM closeout actual end time is malformed");
  }
  for (const key of CLOSEOUT_KEYS) {
    if (key === "actualEndTime") continue;
    if (typeof value[key] !== "boolean") {
      throw new Error(`CRM closeout control ${key} must be boolean`);
    }
  }
  return value as unknown as CloseoutControls;
}

function parsePriorPayment(value: unknown): PriorPaymentDisposition {
  assertExactObject(value, PRIOR_PAYMENT_KEYS, "CRM prior-payment disposition");
  if (
    value.disposition !== "CLEAR" &&
    value.disposition !== "OWNER_REVIEW_REQUIRED"
  ) {
    throw new Error("CRM prior-payment disposition is unsupported");
  }
  if (
    typeof value.legacyPaymentMethodPresent !== "boolean" ||
    typeof value.legacyPaymentHandlePresent !== "boolean" ||
    !Array.isArray(value.reasonCodes) ||
    value.reasonCodes.some(
      (code) =>
        typeof code !== "string" ||
        !PRIOR_PAYMENT_REASON_CODES.includes(
          code as (typeof PRIOR_PAYMENT_REASON_CODES)[number],
        ),
    ) ||
    new Set(value.reasonCodes).size !== value.reasonCodes.length
  ) {
    throw new Error("CRM prior-payment evidence classification is malformed");
  }
  const reasonCodes =
    value.reasonCodes as PriorPaymentDisposition["reasonCodes"];
  if (
    (value.disposition === "CLEAR" && reasonCodes.length !== 0) ||
    (value.disposition === "OWNER_REVIEW_REQUIRED" && reasonCodes.length === 0)
  ) {
    throw new Error("CRM prior-payment disposition contradicts its reasons");
  }
  return {
    disposition: value.disposition,
    reasonCodes: [...reasonCodes],
    legacyPaymentMethodPresent: value.legacyPaymentMethodPresent,
    legacyPaymentHandlePresent: value.legacyPaymentHandlePresent,
  };
}

function parseSourceResponse(
  value: unknown,
  expectedRecordId: string,
  requestId: string,
  expectedEnvironment: PayoutEnvironment,
): AuthoritativeCrmPayoutSource {
  assertExactObject(value, RESPONSE_KEYS, "CRM payout source response");
  if (value.ok !== true || value.requestId !== requestId) {
    throw new Error(
      "CRM payout source response authentication context does not match the request",
    );
  }
  if (value.environment !== expectedEnvironment) {
    throw new Error(
      "CRM payout source environment does not match the payout environment",
    );
  }
  assertExactObject(value.source, SOURCE_KEYS, "CRM payout source");
  const source = value.source;
  if (
    !isSafeBusinessId(source.recordId) ||
    source.recordId !== expectedRecordId
  ) {
    throw new Error("CRM payout source returned a substituted record identity");
  }
  const bookingId = source.bookingId;
  const assignmentId = source.assignmentId;
  const artistId = source.artistId;
  if (!isSafeBusinessId(bookingId))
    throw new Error("CRM payout source booking ID is malformed");
  if (!isSafeBusinessId(assignmentId))
    throw new Error("CRM payout source assignment ID is malformed");
  if (!isSafeBusinessId(artistId))
    throw new Error("CRM payout source artist ID is malformed");
  const revision = assertBoundedOperationalText(
    source.revision,
    200,
    "CRM payout source revision",
  );
  if (
    !Number.isSafeInteger(source.sourceRevision) ||
    (source.sourceRevision as number) < 1
  ) {
    throw new Error("CRM payout source revision number is malformed");
  }
  const artistName = assertBoundedOperationalText(
    source.artistName,
    160,
    "CRM payout source artist name",
  );
  const eventName = assertBoundedOperationalText(
    source.eventName,
    240,
    "CRM payout source event name",
  );
  const service = assertBoundedOperationalText(
    source.service,
    240,
    "CRM payout source service",
  );
  if (!isIsoDate(source.eventDate))
    throw new Error("CRM payout source event date is malformed");
  if (!isIsoInstant(source.closeoutVerifiedAt)) {
    throw new Error(
      "CRM payout source closeout verification time is malformed",
    );
  }

  const amounts: ArtistPayAmounts = {
    servicePayCents: source.servicePayCents as number,
    travelPayCents: source.travelPayCents as number,
    bonusCents: source.bonusCents as number,
    adjustmentCents: source.adjustmentCents as number,
    deductionCents: source.deductionCents as number,
    totalApprovedPayCents: source.totalApprovedPayCents as number,
  };
  validateArtistPayAmounts(amounts);
  const priorPayment = parsePriorPayment(source.priorPayment);
  const closeout = parseCloseout(source.closeout);
  return {
    environment: expectedEnvironment,
    recordId: source.recordId,
    revision,
    sourceRevision: source.sourceRevision as number,
    bookingId,
    assignmentId,
    artistId,
    artistName,
    eventName,
    eventDate: source.eventDate,
    closeoutVerifiedAt: source.closeoutVerifiedAt,
    service,
    ...amounts,
    priorPayment,
    closeout,
  };
}

export async function resolveCrmPayoutSource(
  crmRecordId: string,
  config: CrmPayoutSourceAdapterConfig,
  fetcher: typeof fetch = fetch,
  options?: SignedReadAdapterOptions,
): Promise<AuthoritativeCrmPayoutSource> {
  if (!isSafeBusinessId(crmRecordId))
    throw new Error("CRM payout source record ID is malformed");
  const response = await signedJsonRead(
    {
      operation: "crm_payout_source_read_v1",
      queryName: "crmRecordId",
      queryValue: crmRecordId,
      config,
      options,
      maxResponseBytes: 32 * 1024,
    },
    fetcher,
  );
  return parseSourceResponse(
    response.value,
    crmRecordId,
    response.requestId,
    config.environment,
  );
}
