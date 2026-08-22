const PROCESSING_WEEKDAYS = new Set([1, 3]); // Monday and Wednesday, ISO weekday numbers.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const PAYOUT_PROCESSING_TIME_ZONE = "America/Los_Angeles";

function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

export function nextProcessingDate(afterDate: string): string {
  if (!isRealIsoDate(afterDate))
    throw new Error("Processing reference date must be a real YYYY-MM-DD date");
  const [year, month, day] = afterDate.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  for (let offset = 1; offset <= 7; offset += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const isoWeekday = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
    if (PROCESSING_WEEKDAYS.has(isoWeekday))
      return cursor.toISOString().slice(0, 10);
  }
  throw new Error("Unable to determine the next payout processing date");
}

export function dateInTimeZone(
  instant: Date,
  timeZone = PAYOUT_PROCESSING_TIME_ZONE,
): string {
  if (Number.isNaN(instant.valueOf())) throw new Error("Invalid instant");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Fail-closed processing-day gate for every action that can create or execute
 * a payout batch. The batch date must be today in Los Angeles and today must
 * be an approved Monday or Wednesday processing day.
 */
export function assertCurrentLosAngelesProcessingDay(
  scheduledDate: string,
  now: Date,
): void {
  if (!isRealIsoDate(scheduledDate))
    throw new Error("Payout processing date must be a real YYYY-MM-DD date");
  if (Number.isNaN(now.valueOf()))
    throw new Error("Payout processing clock returned an invalid instant");
  const weekday = new Date(`${scheduledDate}T00:00:00.000Z`).getUTCDay();
  if (weekday !== 1 && weekday !== 3)
    throw new Error("Payout processing is allowed only on Monday or Wednesday");
  if (scheduledDate !== dateInTimeZone(now, PAYOUT_PROCESSING_TIME_ZONE))
    throw new Error(
      "Payout batch date must equal the current America/Los_Angeles date",
    );
}

export function nextProcessingDateAfterEligibility(
  eventDate: string,
  closeoutCompletedAt: Date,
  timeZone = PAYOUT_PROCESSING_TIME_ZONE,
): string {
  if (!isRealIsoDate(eventDate))
    throw new Error("Event date must be a real YYYY-MM-DD date");
  const closeoutDate = dateInTimeZone(closeoutCompletedAt, timeZone);
  return nextProcessingDate(
    closeoutDate > eventDate ? closeoutDate : eventDate,
  );
}
