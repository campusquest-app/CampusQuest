/**
 * Shared map-event visibility rule: an event stays visible on the Realm map
 * (pins, counts, location sheets, stacked indicators) until exactly 24 hours
 * after its actual end time, then disappears from active map views. Database
 * rows are never deleted — this is a display rule only.
 *
 * All comparisons use epoch milliseconds from `Date.parse`, so ISO timestamps
 * with any timezone offset (Z, -04:00, +02:00, …) compare correctly.
 */

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
};

/**
 * True while the event should appear on the map: it has not ended yet, or it
 * ended less than 24 hours ago. Events with no end time are always visible
 * (callers that need a bounded lifetime should pass an effective end via
 * `effectiveEventEndIso`). Cancelled events follow the same rule — they show
 * as cancelled until 24 hours after their scheduled end, then disappear.
 */
export function isEventVisibleOnMap(event: EventTimeFields, now: Date = new Date()): boolean {
  const endRaw = event.end_time ?? event.endsAt ?? null;
  if (!endRaw) return true;

  const endTime = new Date(endRaw);
  if (Number.isNaN(endTime.getTime())) return false;

  const removalTime = new Date(endTime.getTime() + EVENT_MAP_RETENTION_MS);
  return now.getTime() < removalTime.getTime();
}

/**
 * End instant used for the retention window when the source feed omits
 * `ends_at`: the real end time, or start + 2 hours as a fallback so events
 * without an end time cannot linger on the map forever.
 */
export function effectiveEventEndIso(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
): string | null {
  if (endsAt) return endsAt;
  if (!startsAt) return null;
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + DEFAULT_EVENT_DURATION_MS).toISOString();
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
    isEventVisibleOnMap({ end_time: effectiveEventEndIso(event.startsAt, event.endsAt) }, now),
  );
}
