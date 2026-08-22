import type { CloseoutControls } from "./types.ts";
import { isIsoInstant } from "./validation.ts";

const REQUIRED_TRUE_CONTROLS: ReadonlyArray<keyof CloseoutControls> = [
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

export interface EligibilityAssessment {
  eligible: boolean;
  blockers: string[];
}

export function assessCloseoutEligibility(
  closeout: CloseoutControls,
): EligibilityAssessment {
  const blockers = REQUIRED_TRUE_CONTROLS.filter(
    (key) => closeout[key] !== true,
  ).map((key) => String(key));
  if (!isIsoInstant(closeout.actualEndTime)) blockers.push("actualEndTime");
  return { eligible: blockers.length === 0, blockers };
}
