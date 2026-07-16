import { describe, expect, it } from "vitest";
import type { MapEventPin } from "@/lib/mapLocationGroups";
import {
  formatCampusTime,
  getCampusDayWindow,
  getEventCountdownState,
  getGroupCountdown,
  isEventCancelled,
  isOnCampusDay,
  sortEventsForSheet,
} from "@/lib/realm/eventCountdown";

function pin(overrides: Partial<MapEventPin>): MapEventPin {
  return {
    id: "e1",
    title: "Event",
    startsAt: "2026-07-09T22:30:00.000Z",
    endsAt: null,
    organizationName: null,
    eventUrl: null,
    ...overrides,
  };
}

describe("getCampusDayWindow (America/New_York)", () => {
  it("covers the NY calendar day in July (EDT, UTC-4)", () => {
    // 2026-07-09 01:00 UTC = 2026-07-08 21:00 EDT → campus day is July 8.
    const now = new Date("2026-07-09T01:00:00.000Z");
    const { start, end } = getCampusDayWindow(now);
    expect(start.toISOString()).toBe("2026-07-08T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-09T04:00:00.000Z");
  });

  it("covers the NY calendar day in January (EST, UTC-5)", () => {
    const now = new Date("2026-01-15T12:00:00.000Z");
    const { start, end } = getCampusDayWindow(now);
    expect(start.toISOString()).toBe("2026-01-15T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-16T05:00:00.000Z");
  });

  it("isOnCampusDay matches events on today's NY date only", () => {
    const now = new Date("2026-07-09T15:00:00.000Z"); // July 9, 11:00 EDT
    expect(isOnCampusDay(new Date("2026-07-09T22:30:00.000Z"), now)).toBe(true); // 6:30 PM EDT
    expect(isOnCampusDay(new Date("2026-07-10T05:00:00.000Z"), now)).toBe(false); // July 10 1 AM EDT
  });
});

describe("formatCampusTime", () => {
  it("formats 22:30 UTC in July as 6:30 PM campus time", () => {
    expect(formatCampusTime("2026-07-09T22:30:00.000Z")).toBe("6:30 PM");
  });

  it("never throws on invalid or missing timestamps", () => {
    expect(formatCampusTime("not-a-date")).toBe("Time TBD");
    expect(formatCampusTime(null)).toBe("Time TBD");
    expect(formatCampusTime(undefined)).toBe("Time TBD");
    expect(formatCampusTime(new Date(Number.NaN))).toBe("Time TBD");
  });
});

describe("getEventCountdownState invalid starts", () => {
  it("returns a safe upcoming state instead of throwing", () => {
    const now = new Date("2026-07-16T18:00:00.000Z");
    expect(getEventCountdownState("bad", null, now).label).toBe("Time TBD");
    expect(getEventCountdownState(null, null, now).kind).toBe("upcoming");
  });
});

describe("isEventCancelled", () => {
  it("detects (Cancelled) and canceled in titles", () => {
    expect(isEventCancelled({ title: "Karaoke Night (Cancelled)" })).toBe(true);
    expect(isEventCancelled({ title: "Karaoke Night - CANCELED" })).toBe(true);
    expect(isEventCancelled({ title: "Karaoke Night" })).toBe(false);
    expect(isEventCancelled({ title: "Karaoke Night", cancelled: true })).toBe(true);
  });
});

describe("getEventCountdownState", () => {
  const start = new Date("2026-07-09T22:30:00.000Z");

  it("returns time label when more than 60 minutes away", () => {
    const state = getEventCountdownState(start, null, new Date("2026-07-09T20:00:00.000Z"));
    expect(state.kind).toBe("upcoming");
    expect(state.label).toBe("6:30 PM");
    expect(state.urgency).toBe(0);
  });

  it("returns Starts in Nm at 45 minutes", () => {
    const state = getEventCountdownState(start, null, new Date("2026-07-09T21:45:00.000Z"));
    expect(state.kind).toBe("soon");
    expect(state.label).toBe("Starts in 45m");
  });

  it("returns stronger pulse at 18 minutes", () => {
    const state = getEventCountdownState(start, null, new Date("2026-07-09T22:12:00.000Z"));
    expect(state.kind).toBe("closing");
    expect(state.label).toBe("Starts in 18m");
    expect(state.urgency).toBe(2);
  });

  it("returns HURRY at 8 minutes", () => {
    const state = getEventCountdownState(start, null, new Date("2026-07-09T22:22:00.000Z"));
    expect(state.kind).toBe("hurry");
    expect(state.label).toBe("HURRY! 8m");
    expect(state.urgency).toBe(3);
  });

  it("returns STARTING NOW under 2 minutes", () => {
    const state = getEventCountdownState(start, null, new Date("2026-07-09T22:28:30.000Z"));
    expect(state.kind).toBe("imminent");
    expect(state.label).toBe("STARTING NOW");
    expect(state.urgency).toBe(4);
  });

  it("returns LIVE NOW during the event", () => {
    const state = getEventCountdownState(start, null, new Date("2026-07-09T23:00:00.000Z"));
    expect(state.kind).toBe("live");
    expect(state.label).toBe("LIVE NOW");
  });

  it("returns ended after end time", () => {
    const state = getEventCountdownState(
      start,
      "2026-07-09T23:30:00.000Z",
      new Date("2026-07-09T23:45:00.000Z"),
    );
    expect(state.kind).toBe("ended");
  });

  it("cancelled events show CANCELLED with no urgency", () => {
    const state = getEventCountdownState(start, null, new Date("2026-07-09T22:25:00.000Z"), true);
    expect(state.kind).toBe("cancelled");
    expect(state.label).toBe("CANCELLED");
    expect(state.urgency).toBe(0);
  });
});

describe("getGroupCountdown", () => {
  const now = new Date("2026-07-09T22:00:00.000Z");

  it("uses the soonest non-cancelled event with Next: prefix for multiples", () => {
    const events = [
      pin({ id: "a", startsAt: "2026-07-09T22:12:00.000Z" }), // 12m
      pin({ id: "b", startsAt: "2026-07-09T23:30:00.000Z" }),
      pin({ id: "c", title: "Thing (Cancelled)", startsAt: "2026-07-09T22:05:00.000Z" }),
    ];
    const group = getGroupCountdown(events, now);
    expect(group?.featuredEventId).toBe("a");
    expect(group?.state.label).toBe("Next: 12m");
    expect(group?.eventCount).toBe(3);
    expect(group?.allCancelled).toBe(false);
  });

  it("keeps HURRY wording for urgent multiples", () => {
    const events = [
      pin({ id: "a", startsAt: "2026-07-09T22:05:00.000Z" }), // 5m
      pin({ id: "b", startsAt: "2026-07-09T23:30:00.000Z" }),
    ];
    const group = getGroupCountdown(events, now);
    expect(group?.state.label).toBe("HURRY! 5m");
  });

  it("live event wins over sooner upcoming", () => {
    const events = [
      pin({ id: "live", startsAt: "2026-07-09T21:30:00.000Z", endsAt: "2026-07-09T23:30:00.000Z" }),
      pin({ id: "up", startsAt: "2026-07-09T22:10:00.000Z" }),
    ];
    const group = getGroupCountdown(events, now);
    expect(group?.featuredEventId).toBe("live");
    expect(group?.state.label).toBe("LIVE NOW");
  });

  it("all-cancelled group shows CANCELLED", () => {
    const events = [
      pin({ id: "a", title: "A (Cancelled)" }),
      pin({ id: "b", title: "B", cancelled: true }),
    ];
    const group = getGroupCountdown(events, now);
    expect(group?.state.kind).toBe("cancelled");
    expect(group?.allCancelled).toBe(true);
  });

  it("returns null when every event has ended", () => {
    const events = [
      pin({ id: "a", startsAt: "2026-07-09T15:00:00.000Z", endsAt: "2026-07-09T16:00:00.000Z" }),
    ];
    expect(getGroupCountdown(events, now)).toBeNull();
  });
});

describe("sortEventsForSheet", () => {
  it("orders live first, then upcoming by time, cancelled last", () => {
    const now = new Date("2026-07-09T22:00:00.000Z");
    const events = [
      pin({ id: "cancelled", title: "X (Cancelled)", startsAt: "2026-07-09T21:00:00.000Z" }),
      pin({ id: "later", startsAt: "2026-07-09T23:30:00.000Z" }),
      pin({ id: "live", startsAt: "2026-07-09T21:30:00.000Z", endsAt: "2026-07-09T23:00:00.000Z" }),
      pin({ id: "soon", startsAt: "2026-07-09T22:15:00.000Z" }),
    ];
    expect(sortEventsForSheet(events, now).map((e) => e.id)).toEqual([
      "live",
      "soon",
      "later",
      "cancelled",
    ]);
  });
});
