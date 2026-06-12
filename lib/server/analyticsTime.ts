export const PILOT_ANALYTICS_TIMEZONE = "America/New_York";

function zonedYmd(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: read("year"), month: read("month"), day: read("day") };
}

function offsetMinutesAtUtcInstant(instantMs: number, timeZone: string): number {
  const date = new Date(instantMs);
  const asUtc = Date.parse(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const asTz = Date.parse(date.toLocaleString("en-US", { timeZone }));
  return (asUtc - asTz) / 60_000;
}

/** Midnight at the start of the calendar day in `timeZone`, returned as UTC Date. */
export function startOfCalendarDayInTimeZone(timeZone: string, date = new Date()): Date {
  const { year, month, day } = zonedYmd(date, timeZone);
  const noonUtc = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
  const offsetMin = offsetMinutesAtUtcInstant(noonUtc, timeZone);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) + offsetMin * 60_000);
}

export function startOfCalendarMonthInTimeZone(timeZone: string, date = new Date()): Date {
  const { year, month } = zonedYmd(date, timeZone);
  return startOfCalendarDayInTimeZone(timeZone, new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0)));
}

export function rollingWindowStartMs(days: number, date = new Date()): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}
