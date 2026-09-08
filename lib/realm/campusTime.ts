/** Campus (URI) wall-clock helpers — America/New_York. */

export const CAMPUS_TIME_ZONE = "America/New_York";

/**
 * UTC window covering "today" as experienced on campus (America/New_York),
 * regardless of the server/client timezone.
 */
export function getCampusDayWindow(now: Date = new Date()): { start: Date; end: Date } {
  const startMs = campusMidnightUtcMs(now);
  return { start: new Date(startMs), end: new Date(startMs + 24 * 60 * 60 * 1000) };
}

/** True when the instant falls on today's campus (NY) calendar day. */
export function isOnCampusDay(instant: Date, now: Date = new Date()): boolean {
  const { start, end } = getCampusDayWindow(now);
  return instant >= start && instant < end;
}

function campusMidnightUtcMs(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const year = get("year");
  const month = get("month");
  const day = get("day");

  // Two-pass: guess UTC midnight, then correct by the zone offset at that instant.
  let guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  for (let i = 0; i < 2; i += 1) {
    guess = Date.UTC(year, month - 1, day, 0, 0, 0) - zoneOffsetMs(new Date(guess));
  }
  return guess;
}

/** Offset of America/New_York from UTC at the given instant (negative = behind UTC). */
function zoneOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return wallAsUtc - instant.getTime();
}

/** "6:30 PM" in campus time. Never throws on invalid / missing timestamps. */
export function formatCampusTime(instant: Date | string | null | undefined): string {
  if (instant == null) return "Time TBD";
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "Time TBD";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: CAMPUS_TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "Time TBD";
  }
}

export function parseEventInstant(value: Date | string | number | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date;
}
