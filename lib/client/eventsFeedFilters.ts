import { CAMPUS_TIME_ZONE, getCampusDayWindow } from "@/lib/realm/eventCountdown";

export type EventsFeedTimeframe = "for_you" | "all" | "today" | "tomorrow" | "this_week" | "this_month";

export const EVENTS_PAST_GRACE_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isUpcomingEvent(startsAt: string | null, graceMs = EVENTS_PAST_GRACE_MS): boolean {
  if (!startsAt) return true;
  return new Date(startsAt).getTime() >= Date.now() - graceMs;
}

function campusWeekdayIndex(now: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIME_ZONE,
    weekday: "short",
  }).format(now);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
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

  if (timeframe === "this_month") {
    const nowMonth = campusYearMonth(now);
    const startMonth = campusYearMonth(start);
    return startMonth.year === nowMonth.year && startMonth.month === nowMonth.month;
  }

  return true;
}

export function matchesEventsSearch(
  fields: {
    title: string;
    description: string;
    location: string;
    organizationName: string;
    category: string;
    tags: string[];
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
    ...fields.tags,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
