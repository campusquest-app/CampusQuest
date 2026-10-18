import { CAMPUS_TIME_ZONE, getCampusDayWindow } from "@/lib/realm/eventCountdown";

export type EventsFeedTimeframe =
  | "for_you"
  | "all"
  | "today"
  | "tomorrow"
  | "this_week"
  | "this_weekend"
  | "this_month";

export const EVENTS_PAST_GRACE_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isUpcomingEvent(startsAt: string | null, graceMs = EVENTS_PAST_GRACE_MS): boolean {
  if (!startsAt) return true;
  return new Date(startsAt).getTime() >= Date.now() - graceMs;
}

export function eventIsCancelled(input: { isCancelled?: boolean | null; title?: string | null }): boolean {
  if (input.isCancelled) return true;
  return /\bcancell?ed\b/i.test(input.title ?? "");
}

/** Still on the calendar: not cancelled, and either still running or not past the start grace. */
export function eventIsCurrentOrUpcoming(
  input: { startsAt: string | null; endsAt?: string | null; isCancelled?: boolean | null; title?: string | null },
  now: Date = new Date(),
): boolean {
  if (eventIsCancelled(input)) return false;
  if (input.endsAt) {
    const end = new Date(input.endsAt).getTime();
    if (Number.isFinite(end)) return end >= now.getTime();
  }
  if (!input.startsAt) return true;
  const start = new Date(input.startsAt).getTime();
  if (!Number.isFinite(start)) return false;
  return start >= now.getTime() - EVENTS_PAST_GRACE_MS;
}

function campusWeekdayIndex(now: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIME_ZONE,
    weekday: "short",
  }).format(now);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** Friday 00:00 through Monday 00:00 on the campus calendar (current or upcoming weekend). */
export function getCampusWeekendWindow(now: Date = new Date()): { start: Date; end: Date } {
  const today = getCampusDayWindow(now);
  const weekday = campusWeekdayIndex(now);
  const offsetToFriday =
    weekday === 0 ? -2 : weekday === 6 ? -1 : weekday === 5 ? 0 : 5 - weekday;
  const start = new Date(today.start.getTime() + offsetToFriday * DAY_MS);
  const end = new Date(start.getTime() + 3 * DAY_MS);
  return { start, end };
}

function campusYearMonth(instant: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(instant);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? 0);
  const month = Number(parts.find((part) => part.type === "month")?.value ?? 0);
  return { year, month };
}

export function matchesEventsTimeframe(
  startsAt: string | null,
  timeframe: EventsFeedTimeframe,
  now: Date = new Date(),
): boolean {
  if (timeframe === "all" || timeframe === "for_you") return true;
  if (!startsAt) return false;

  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return false;
  const today = getCampusDayWindow(now);

  if (timeframe === "today") {
    return start >= today.start && start < today.end;
  }

  if (timeframe === "tomorrow") {
    const tomorrowStart = new Date(today.end);
    const dayAfter = new Date(today.end.getTime() + DAY_MS);
    return start >= tomorrowStart && start < dayAfter;
  }

  if (timeframe === "this_week") {
    const weekday = campusWeekdayIndex(now);
    const diffToMonday = weekday < 0 ? 0 : (weekday + 6) % 7;
    const weekStart = new Date(today.start.getTime() - diffToMonday * DAY_MS);
    const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
    return start >= weekStart && start < weekEnd;
  }

  if (timeframe === "this_weekend") {
    const weekend = getCampusWeekendWindow(now);
    return start >= weekend.start && start < weekend.end;
  }

  if (timeframe === "this_month") {
    const nowMonth = campusYearMonth(now);
    const startMonth = campusYearMonth(start);
    return startMonth.year === nowMonth.year && startMonth.month === nowMonth.month;
  }

  return true;
}

export type EventsWhenFilter = "today" | "tomorrow" | "this_weekend" | "this_week";

/** An event matches when it falls in any selected window. No selection means every date. */
export function matchesAnyEventsWhen(
  startsAt: string | null,
  when: readonly EventsWhenFilter[],
  now: Date = new Date(),
): boolean {
  if (when.length === 0) return true;
  return when.some((filter) => matchesEventsTimeframe(startsAt, filter, now));
}

/**
 * Date mode after the When checkboxes change.
 * One window uses that timeframe. Several windows browse without For You.
 * Clearing windows returns to For You, unless the user is already in browse-all.
 */
export function timeframeAfterWhenChange(
  current: EventsFeedTimeframe,
  when: readonly EventsWhenFilter[],
): EventsFeedTimeframe {
  if (when.length === 1) return when[0];
  if (when.length > 1) return "all";
  return current === "all" ? "all" : "for_you";
}

export function matchesEventsSearch(
  fields: {
    title: string;
    description: string;
    location: string;
    organizationName: string;
    category: string;
    tags: string[];
    sport?: string;
    opponent?: string;
  },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    fields.title,
    fields.description,
    fields.location,
    fields.organizationName,
    fields.category,
    fields.sport ?? "",
    fields.opponent ?? "",
    ...fields.tags,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
