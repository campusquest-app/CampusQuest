import type { MapEventPin } from "@/lib/mapLocationGroups";
import {
  CAMPUS_TIME_ZONE,
  formatCampusTime,
  getCampusDayWindow,
  isOnCampusDay,
  parseEventInstant,
} from "@/lib/realm/campusTime";
import { filterVisibleMapEvents, isEventLiveNow, resolveEventEndMs } from "@/lib/realm/eventVisibility";

export { CAMPUS_TIME_ZONE, formatCampusTime, getCampusDayWindow, isOnCampusDay, isEventLiveNow, resolveEventEndMs };

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
  startsAt: Date | string | null | undefined,
  endsAt: Date | string | null | undefined,
  now: Date,
  cancelled = false,
): EventCountdownState {
  if (cancelled) {
    return { kind: "cancelled", label: "CANCELLED", urgency: 0 };
  }

  const start = parseEventInstant(startsAt);
  if (!start) {
    return { kind: "upcoming", label: "Time TBD", urgency: 0 };
  }

  const endMs = resolveEventEndMs(startsAt, endsAt);
  if (endMs == null) {
    return { kind: "upcoming", label: "Time TBD", urgency: 0 };
  }

  const t = now.getTime();
  if (t > endMs) {
    return { kind: "ended", label: "Ended", urgency: 0 };
  }
  if (isEventLiveNow(startsAt, endsAt, now)) {
    return { kind: "live", label: "LIVE NOW", urgency: 4 };
  }

  const minutes = Math.ceil((start.getTime() - t) / 60_000);
  if (!Number.isFinite(minutes)) {
    return { kind: "upcoming", label: "Time TBD", urgency: 0 };
  }
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
 * Events past their 24h post-end visibility window are excluded entirely
 * (they no longer count toward stacked-event indicators).
 */
export function getGroupCountdown(events: MapEventPin[], now: Date): GroupCountdown | null {
  const visible = filterVisibleMapEvents(events, now);
  if (visible.length === 0) return null;

  const scored = visible.map((event) => {
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
      const aStart = Date.parse(a.event.startsAt);
      const bStart = Date.parse(b.event.startsAt);
      return (Number.isFinite(aStart) ? aStart : Number.POSITIVE_INFINITY) -
        (Number.isFinite(bStart) ? bStart : Number.POSITIVE_INFINITY);
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
    const startMs = Date.parse(featured.event.startsAt);
    const minutes = Number.isFinite(startMs)
      ? Math.ceil((startMs - now.getTime()) / 60_000)
      : NaN;
    if (Number.isFinite(minutes)) {
      if (state.kind === "hurry" || state.kind === "imminent") {
        state = { ...state, label: state.kind === "imminent" ? "STARTING NOW" : `HURRY! ${minutes}m` };
      } else if (state.kind === "soon" || state.kind === "closing") {
        state = { ...state, label: `Next: ${minutes}m` };
      }
    }
  }

  return {
    state,
    featuredEventId: featured.event.id,
    eventCount: active.length,
    allCancelled: false,
  };
}

/**
 * Sort events for the location sheet: live → soonest upcoming → ended,
 * cancelled last. Events past their 24h post-end visibility window are
 * excluded from the list entirely.
 */
export function sortEventsForSheet(events: MapEventPin[], now: Date): MapEventPin[] {
  const rank = (event: MapEventPin): number => {
    if (isEventCancelled(event)) return 3;
    const state = getEventCountdownState(event.startsAt, event.endsAt, now, false);
    if (state.kind === "live") return 0;
    if (state.kind === "ended") return 2;
    return 1;
  };
  return filterVisibleMapEvents(events, now).sort((a, b) => {
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    const aStart = Date.parse(a.startsAt);
    const bStart = Date.parse(b.startsAt);
    return (Number.isFinite(aStart) ? aStart : Number.POSITIVE_INFINITY) -
      (Number.isFinite(bStart) ? bStart : Number.POSITIVE_INFINITY);
  });
}

/**
 * True when any visible event at the location has already ended or is
 * cancelled — the sheet then titles the section "Events" instead of
 * "Active Events".
 */
export function hasEndedOrCancelledEvents(events: MapEventPin[], now: Date): boolean {
  return filterVisibleMapEvents(events, now).some((event) => {
    if (isEventCancelled(event)) return true;
    return getEventCountdownState(event.startsAt, event.endsAt, now, false).kind === "ended";
  });
}
