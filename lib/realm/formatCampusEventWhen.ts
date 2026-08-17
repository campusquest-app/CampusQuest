import { CAMPUS_TIME_ZONE, formatCampusTime, isOnCampusDay } from "@/lib/realm/eventCountdown";

/** "Today • 12:00 PM" / "Tomorrow • 12:00 PM" / "Mon, Aug 18 • 12:00 PM" */
export function formatCampusEventWhen(startsAt: string | null | undefined, now: Date = new Date()): string {
  if (!startsAt) return "Time TBD";
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "Time TBD";

  const time = formatCampusTime(start);
  if (isOnCampusDay(start, now)) return `Today • ${time}`;

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (isOnCampusDay(start, tomorrow)) return `Tomorrow • ${time}`;

  try {
    const day = new Intl.DateTimeFormat("en-US", {
      timeZone: CAMPUS_TIME_ZONE,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(start);
    return `${day} • ${time}`;
  } catch {
    return time;
  }
}
