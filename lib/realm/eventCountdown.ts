import type { MapEventPin } from "@/lib/mapLocationGroups";

export const CAMPUS_TIME_ZONE = "America/New_York";

/** Grace window after starts_at during which an event with no ends_at counts as live. */
const DEFAULT_EVENT_DURATION_MS = 2 * 60 * 60 * 1000;

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

/** "6:30 PM" in campus time. */
export function formatCampusTime(instant: Date | string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

const CANCELLED_PATTERN = /\bcancell?ed\b/i;

/** Detect cancellation from title/status text (e.g. "Karaoke Night (Cancelled)"). */
export function isEventCancelled(event: { title: string; cancelled?: boolean }): boolean {
  if (event.cancelled) return true;
  return CANCELLED_PATTERN.test(event.title);
}

export type EventCountdownKind =
  | "upcoming" // > 60 min away
  | "soon" // 60–30 min
  | "closing" // 30–10 min
  | "hurry" // 10–2 min
  | "imminent" // < 2 min
  | "live"
  | "ended"
  | "cancelled";

/** 0 = calm … 4 = maximum urgency. Drives pulse speed/glow intensity. */
export type EventUrgencyLevel = 0 | 1 | 2 | 3 | 4;

export type EventCountdownState = {
  kind: EventCountdownKind;
  /** Short badge text ("Starts in 18m", "HURRY! 8m", "LIVE NOW", "CANCELLED"). */
  label: string;
  urgency: EventUrgencyLevel;
};

export function getEventCountdownState(
  startsAt: Date | string,
  endsAt: Date | string | null | undefined,
  now: Date,
  cancelled = false,
): EventCountdownState {
  if (cancelled) {
    return { kind: "cancelled", label: "CANCELLED", urgency: 0 };
  }

  const start = typeof startsAt === "string" ? new Date(startsAt) : startsAt;
  const end = endsAt
    ? typeof endsAt === "string"
      ? new Date(endsAt)
      : endsAt
    : new Date(start.getTime() + DEFAULT_EVENT_DURATION_MS);

  if (now >= end) {
    return { kind: "ended", label: "Ended", urgency: 0 };
  }
  if (now >= start) {
    return { kind: "live", label: "LIVE NOW", urgency: 4 };
  }

  const minutes = Math.ceil((start.getTime() - now.getTime()) / 60_000);
  if (minutes <= 2) {
    return { kind: "imminent", label: "STARTING NOW", urgency: 4 };
  }
  if (minutes <= 10) {
    return { kind: "hurry", label: `HURRY! ${minutes}m`, urgency: 3 };
  }
  if (minutes <= 30) {
    return { kind: "closing", label: `Starts in ${minutes}m`, urgency: 2 };
  }
  if (minutes <= 60) {
    return { kind: "soon", label: `Starts in ${minutes}m`, urgency: 1 };
  }
  return { kind: "upcoming", label: formatCampusTime(start), urgency: 0 };
}

export type GroupCountdown = {
  state: EventCountdownState;
  /** Non-cancelled event driving the countdown (soonest upcoming or live). */
  featuredEventId: string | null;
  eventCount: number;
  allCancelled: boolean;
};

/**
 * Countdown for a grouped location marker: the most urgent non-cancelled
 * event wins; "Next:" prefix when several events share the location.
 * Returns null when the group has no displayable (non-ended) events.
 */
export function getGroupCountdown(events: MapEventPin[], now: Date): GroupCountdown | null {
  if (events.length === 0) return null;

  const scored = events.map((event) => {
    const cancelled = isEventCancelled(event);
    return {
      event,
      cancelled,
      state: getEventCountdownState(event.startsAt, event.endsAt, now, cancelled),
    };
  });

  const active = scored.filter((entry) => entry.state.kind !== "ended");
  if (active.length === 0) return null;

  const runnable = active
    .filter((entry) => !entry.cancelled)
    .sort((a, b) => {
      // Live first, then soonest start.
      const aLive = a.state.kind === "live" ? 0 : 1;
      const bLive = b.state.kind === "live" ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      return new Date(a.event.startsAt).getTime() - new Date(b.event.startsAt).getTime();
    });

  if (runnable.length === 0) {
    return {
      state: { kind: "cancelled", label: "CANCELLED", urgency: 0 },
      featuredEventId: null,
      eventCount: active.length,
      allCancelled: true,
    };
  }

  const featured = runnable[0];
  let state = featured.state;
  if (active.length > 1 && state.kind !== "live") {
    const minutes = Math.ceil(
      (new Date(featured.event.startsAt).getTime() - now.getTime()) / 60_000,
    );
    if (state.kind === "hurry" || state.kind === "imminent") {
      state = { ...state, label: state.kind === "imminent" ? "STARTING NOW" : `HURRY! ${minutes}m` };
    } else if (state.kind === "soon" || state.kind === "closing") {
      state = { ...state, label: `Next: ${minutes}m` };
    }
  }

  return {
    state,
    featuredEventId: featured.event.id,
    eventCount: active.length,
    allCancelled: false,
  };
}

/** Sort events for the location sheet: live → soonest upcoming → ended, cancelled last. */
export function sortEventsForSheet(events: MapEventPin[], now: Date): MapEventPin[] {
  const rank = (event: MapEventPin): number => {
    if (isEventCancelled(event)) return 3;
    const state = getEventCountdownState(event.startsAt, event.endsAt, now, false);
    if (state.kind === "live") return 0;
    if (state.kind === "ended") return 2;
    return 1;
  };
  return [...events].sort((a, b) => {
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });
}
