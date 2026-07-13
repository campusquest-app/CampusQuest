import { describe, expect, it } from "vitest";
import {
  EVENT_MAP_RETENTION_MS,
  effectiveEventEndIso,
  filterVisibleMapEvents,
  isEventVisibleOnMap,
} from "@/lib/realm/eventVisibility";

const NOW = new Date("2026-07-13T18:00:00.000Z");

function hoursAgoIso(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function hoursFromNowIso(hours: number): string {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
}

describe("isEventVisibleOnMap", () => {
  it("keeps an upcoming event visible", () => {
    expect(
      isEventVisibleOnMap({ start_time: hoursFromNowIso(3), end_time: hoursFromNowIso(5) }, NOW),
    ).toBe(true);
  });

  it("keeps a live event visible", () => {
    expect(
      isEventVisibleOnMap({ start_time: hoursAgoIso(1), end_time: hoursFromNowIso(1) }, NOW),
    ).toBe(true);
  });

  it("keeps an event that ended 23 hours ago visible", () => {
    expect(isEventVisibleOnMap({ end_time: hoursAgoIso(23) }, NOW)).toBe(true);
  });

  it("hides an event that ended exactly 24 hours ago", () => {
    expect(isEventVisibleOnMap({ end_time: hoursAgoIso(24) }, NOW)).toBe(false);
  });

  it("hides an event that ended 25 hours ago", () => {
    expect(isEventVisibleOnMap({ end_time: hoursAgoIso(25) }, NOW)).toBe(false);
  });

  it("keeps a cancelled event visible until its 24-hour expiration", () => {
    const cancelled = { end_time: hoursAgoIso(23), cancelled: true };
    expect(isEventVisibleOnMap(cancelled, NOW)).toBe(true);

    const expiredCancelled = { end_time: hoursAgoIso(24), cancelled: true };
    expect(isEventVisibleOnMap(expiredCancelled, NOW)).toBe(false);
  });

  it("handles timezone-offset timestamps correctly", () => {
    // 2026-07-12T18:30:00-04:00 === 2026-07-12T22:30:00Z → ended 19.5h before NOW.
    expect(isEventVisibleOnMap({ end_time: "2026-07-12T18:30:00-04:00" }, NOW)).toBe(true);
    // 2026-07-12T13:00:00-04:00 === 2026-07-12T17:00:00Z → ended exactly 25h before NOW.
    expect(isEventVisibleOnMap({ end_time: "2026-07-12T13:00:00-04:00" }, NOW)).toBe(false);
    // Positive offsets too: 2026-07-13T09:00:00+02:00 === 07:00Z → ended 11h ago.
    expect(isEventVisibleOnMap({ end_time: "2026-07-13T09:00:00+02:00" }, NOW)).toBe(true);
  });

  it("treats events with no end time as visible", () => {
    expect(isEventVisibleOnMap({ start_time: hoursAgoIso(1), end_time: null }, NOW)).toBe(true);
    expect(isEventVisibleOnMap({}, NOW)).toBe(true);
  });

  it("hides events with unparseable end times", () => {
    expect(isEventVisibleOnMap({ end_time: "not-a-date" }, NOW)).toBe(false);
  });

  it("accepts camelCase pin fields (endsAt)", () => {
    expect(isEventVisibleOnMap({ endsAt: hoursAgoIso(23) }, NOW)).toBe(true);
    expect(isEventVisibleOnMap({ endsAt: hoursAgoIso(25) }, NOW)).toBe(false);
  });

  it("is exclusive at the removal boundary (one ms before 24h is visible)", () => {
    const endMs = NOW.getTime() - EVENT_MAP_RETENTION_MS + 1;
    expect(isEventVisibleOnMap({ end_time: new Date(endMs).toISOString() }, NOW)).toBe(true);
  });
});

describe("effectiveEventEndIso", () => {
  it("returns the real end time when present", () => {
    const end = hoursFromNowIso(2);
    expect(effectiveEventEndIso(hoursAgoIso(1), end)).toBe(end);
  });

  it("falls back to start + 2h when the end time is missing", () => {
    const start = hoursAgoIso(1);
    expect(effectiveEventEndIso(start, null)).toBe(hoursFromNowIso(1));
  });

  it("returns null when neither time is usable", () => {
    expect(effectiveEventEndIso(null, null)).toBeNull();
    expect(effectiveEventEndIso("garbage", null)).toBeNull();
  });
});

describe("filterVisibleMapEvents", () => {
  it("keeps upcoming/live/recently-ended pins and drops expired ones", () => {
    const events = [
      { id: "upcoming", startsAt: hoursFromNowIso(4), endsAt: hoursFromNowIso(6) },
      { id: "ended-23h", startsAt: hoursAgoIso(25), endsAt: hoursAgoIso(23) },
      { id: "ended-25h", startsAt: hoursAgoIso(27), endsAt: hoursAgoIso(25) },
      // No end time: assumed 2h duration → ended 26h - 2h = 24h ago → hidden.
      { id: "no-end-expired", startsAt: hoursAgoIso(26), endsAt: null },
      // No end time, started 1h ago: assumed live → visible.
      { id: "no-end-live", startsAt: hoursAgoIso(1), endsAt: null },
    ];
    expect(filterVisibleMapEvents(events, NOW).map((e) => e.id)).toEqual([
      "upcoming",
      "ended-23h",
      "no-end-live",
    ]);
  });
});
