/**
 * Shared map-event visibility + LIVE status rules.
 *
 * LIVE: starts_at <= now <= effective end.
 * Missing ends_at: assume start + 2h, clamped to the end of the start's
 * America/New_York calendar day so events never stay LIVE on later days.
 *
 * Map visibility: remain until 24h after the effective end. Database rows are
 * never deleted — display rules only.
 */

import { getCampusDayWindow, parseEventInstant } from "@/lib/realm/campusTime";

/** How long an ended event remains visible on the map. */
export const EVENT_MAP_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Assumed duration for events whose feed omits an end time. */
export const DEFAULT_EVENT_DURATION_MS = 2 * 60 * 60 * 1000;

type EventTimeFields = {
  start_time?: string | null;
  end_time?: string | null;
  /** Camel-case aliases used by MapEventPin and normalized DB rows. */
  startsAt?: string | null;
  endsAt?: string | null;
  title?: string | null;
  cancelled?: boolean;
};

const CANCELLED_PATTERN = /\bcancell?ed\b/i;

/** True when the feed marked the event cancelled or the title says so. Rows are never deleted. */
export function isMapEventCancelled(event: { title?: string | null; cancelled?: boolean }): boolean {
  if (event.cancelled) return true;
  return CANCELLED_PATTERN.test(event.title ?? "");
}

/**
 * Live or still-upcoming (not ended, not cancelled). Default map pins, counts,
 * and "upcoming" lists use this — cancelled events stay in history views only.
 */
export function isLiveOrUpcomingMapEvent(event: EventTimeFields, now: Date = new Date()): boolean {
  if (isMapEventCancelled(event)) return false;
  const startRaw = event.start_time ?? event.startsAt ?? null;
  const endRaw = event.end_time ?? event.endsAt ?? null;
  const endMs = resolveEventEndMs(startRaw, endRaw);
  if (endMs == null) return false;
  return now.getTime() <= endMs;
}

export function filterLiveOrUpcomingMapEvents<T extends EventTimeFields>(
  events: T[],
  now: Date = new Date(),
): T[] {
  return events.filter((event) => isLiveOrUpcomingMapEvent(event, now));
}

/**
 * Resolve the effective end instant (epoch ms) for LIVE + visibility.
 * Prefers a real ends_at when it is parseable and not before starts_at.
 * Otherwise uses start + 2h, never past the end of the start's campus day.
 */
export function resolveEventEndMs(
  startsAt: Date | string | number | null | undefined,
  endsAt: Date | string | number | null | undefined,
): number | null {
  const start = parseEventInstant(startsAt);
  if (!start) return null;

  const parsedEnd = parseEventInstant(endsAt);
  if (parsedEnd && parsedEnd.getTime() >= start.getTime()) {
    return parsedEnd.getTime();
  }

  const assumedEnd = start.getTime() + DEFAULT_EVENT_DURATION_MS;
  const campusDayEndMs = getCampusDayWindow(start).end.getTime();
  return Math.min(assumedEnd, campusDayEndMs);
}

/**
 * Canonical LIVE check for Realm badges, What's Happening, and recommendations.
 * An event is LIVE only while starts_at <= now <= effective end.
 */
export function isEventLiveNow(
  startsAt: Date | string | number | null | undefined,
  endsAt: Date | string | number | null | undefined,
  now: Date = new Date(),
): boolean {
  const start = parseEventInstant(startsAt);
  if (!start) return false;
  const endMs = resolveEventEndMs(startsAt, endsAt);
  if (endMs == null) return false;
  const t = now.getTime();
  return start.getTime() <= t && t <= endMs;
}

/**
 * True while the event is still in the 24h retention window (including
 * cancelled and recently ended). Default live/upcoming map markers use
 * {@link isLiveOrUpcomingMapEvent} instead so cancelled events are not pins.
 */
export function isEventVisibleOnMap(event: EventTimeFields, now: Date = new Date()): boolean {
  const startRaw = event.start_time ?? event.startsAt ?? null;
  const endRaw = event.end_time ?? event.endsAt ?? null;
  const endMs = resolveEventEndMs(startRaw, endRaw) ?? parseEventInstant(endRaw)?.getTime() ?? null;
  if (endMs == null) return false;

  const removalTime = endMs + EVENT_MAP_RETENTION_MS;
  return now.getTime() < removalTime;
}

/**
 * End instant used for the retention window when the source feed omits
 * `ends_at`: the real end time, or start + 2h clamped to the campus day.
 */
export function effectiveEventEndIso(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
): string | null {
  const endMs = resolveEventEndMs(startsAt, endsAt);
  return endMs == null ? null : new Date(endMs).toISOString();
}

/**
 * Filter a pin/event list down to entries still inside the visibility window.
 * Uses the effective end (real end, or start + default duration) so items
 * without an end time still expire 24h after their assumed end.
 */
export function filterVisibleMapEvents<T extends { startsAt?: string | null; endsAt?: string | null }>(
  events: T[],
  now: Date = new Date(),
): T[] {
  return events.filter((event) =>
    isEventVisibleOnMap({ startsAt: event.startsAt, endsAt: event.endsAt }, now),
  );
}
