import { CAMPUS_TIME_ZONE, formatCampusTime, getCampusDayWindow, isOnCampusDay } from "@/lib/realm/eventCountdown";

function campusWeekday(instant: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIME_ZONE,
    weekday: "long",
  }).format(instant);
}

function campusShortDate(instant: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(instant);
}

function daysUntilCampusDay(start: Date, now: Date): number {
  const today = getCampusDayWindow(now).start.getTime();
  const eventDay = getCampusDayWindow(start).start.getTime();
  return Math.round((eventDay - today) / (24 * 60 * 60 * 1000));
}

function dayPrefix(start: Date, now: Date): string {
  if (isOnCampusDay(start, now)) return "Today";
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (isOnCampusDay(start, tomorrow)) return "Tomorrow";
  const days = daysUntilCampusDay(start, now);
  if (days >= 2 && days <= 6) {
    return `This ${campusWeekday(start)}`;
  }
  return campusShortDate(start);
}

function parseInstant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Human-friendly campus-TZ range: "Today · 7:00 PM" / "Tue, Sep 8 · 10:00 AM–12:00 PM". */
export function formatEventDateTimeRange(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
  now: Date = new Date(),
): string {
  const start = parseInstant(startsAt);
  if (!start) return "Date TBA";

  const prefix = dayPrefix(start, now);
  const startTime = formatCampusTime(start);
  const end = parseInstant(endsAt);
  if (!end || end.getTime() <= start.getTime()) {
    return `${prefix} · ${startTime}`;
  }

  if (isOnCampusDay(end, start)) {
    return `${prefix} · ${startTime}–${formatCampusTime(end)}`;
  }

  return `${prefix} · ${startTime}–${dayPrefix(end, now)} · ${formatCampusTime(end)}`;
}

/** Date line for event detail: "Today" / "Mon, Sep 14". */
export function formatEventDateLine(startsAt: string | null | undefined, now: Date = new Date()): string {
  const start = parseInstant(startsAt);
  if (!start) return "Date TBA";
  return dayPrefix(start, now);
}

/** Time line for event detail: "7:00 PM–9:00 PM" / "7:00 PM". */
export function formatEventTimeLine(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
): string | null {
  const start = parseInstant(startsAt);
  if (!start) return null;
  const startTime = formatCampusTime(start);
  const end = parseInstant(endsAt);
  if (!end || end.getTime() <= start.getTime()) return startTime;
  if (isOnCampusDay(end, start)) return `${startTime}–${formatCampusTime(end)}`;
  return `${startTime}–${dayPrefix(end, start)} · ${formatCampusTime(end)}`;
}

export function eventDateTimeIso(startsAt: string | null | undefined): string | undefined {
  const start = parseInstant(startsAt);
  return start ? start.toISOString() : undefined;
}
