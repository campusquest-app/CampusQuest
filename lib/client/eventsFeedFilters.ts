export type EventsFeedTimeframe = "all" | "today" | "tomorrow" | "this_week" | "this_month";

export const EVENTS_PAST_GRACE_MS = 2 * 60 * 60 * 1000;

export function isUpcomingEvent(startsAt: string | null, graceMs = EVENTS_PAST_GRACE_MS): boolean {
  if (!startsAt) return true;
  return new Date(startsAt).getTime() >= Date.now() - graceMs;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function matchesEventsTimeframe(startsAt: string | null, timeframe: EventsFeedTimeframe): boolean {
  if (timeframe === "all") return true;
  if (!startsAt) return false;

  const start = new Date(startsAt);
  const now = new Date();
  const today = startOfDay(now);

  if (timeframe === "today") {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return start >= today && start < tomorrow;
  }

  if (timeframe === "tomorrow") {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);
    return start >= tomorrow && start < dayAfter;
  }

  if (timeframe === "this_week") {
    const day = now.getDay();
    const diffToMonday = (day + 6) % 7;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - diffToMonday);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    return start >= weekStart && start < weekEnd;
  }

  if (timeframe === "this_month") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return start >= monthStart && start < monthEnd;
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
