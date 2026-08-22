import type { ArtistPayAmounts } from "./types.ts";

const MAX_COMPONENT_CENTS = 100_000_000;

export function isMinorUnitAmount(
  value: unknown,
  allowNegative = false,
): value is number {
  return (
    Number.isSafeInteger(value) &&
    (allowNegative
      ? Math.abs(value as number) <= MAX_COMPONENT_CENTS
      : (value as number) >= 0) &&
    (value as number) <= MAX_COMPONENT_CENTS
  );
}

export function calculateArtistPayTotal(
  amounts: Omit<ArtistPayAmounts, "totalApprovedPayCents">,
): number {
  const values = [
    amounts.servicePayCents,
    amounts.travelPayCents,
    amounts.bonusCents,
    amounts.adjustmentCents,
    amounts.deductionCents,
  ];
  if (
    !isMinorUnitAmount(values[0]) ||
    !isMinorUnitAmount(values[1]) ||
    !isMinorUnitAmount(values[2]) ||
    !isMinorUnitAmount(values[3], true) ||
    !isMinorUnitAmount(values[4])
  ) {
    throw new Error("Artist pay components must be safe integer minor units");
  }
  const total =
    amounts.servicePayCents +
    amounts.travelPayCents +
    amounts.bonusCents +
    amounts.adjustmentCents -
    amounts.deductionCents;
  if (!isMinorUnitAmount(total) || total === 0) {
    throw new Error(
      "Total approved artist pay must be a positive safe integer minor-unit amount",
    );
  }
  return total;
}

export function validateArtistPayAmounts(amounts: ArtistPayAmounts): void {
  const calculated = calculateArtistPayTotal(amounts);
  if (calculated !== amounts.totalApprovedPayCents) {
    throw new Error(
      "Total approved artist pay does not match its component amounts",
    );
  }
}
