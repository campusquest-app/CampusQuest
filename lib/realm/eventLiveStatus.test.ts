import { describe, expect, it } from "vitest";
import { getEventCountdownState, isEventLiveNow } from "@/lib/realm/eventCountdown";
import { filterVisibleMapEvents, resolveEventEndMs } from "@/lib/realm/eventVisibility";

/**
 * Fri Sep 4, 2026 8:00 AM America/New_York (EDT, UTC-4).
 * Mon Sep 7, 2026 8:33 PM America/New_York.
 */
const SEP4_8AM_ET = "2026-09-04T12:00:00.000Z";
const SEP7_833PM_ET = "2026-09-08T00:33:00.000Z";

describe("isEventLiveNow regression (LIVE status)", () => {
  it("Sep 4 8:00 AM event is NOT live on Sep 7", () => {
    const now = new Date(SEP7_833PM_ET);
    expect(isEventLiveNow(SEP4_8AM_ET, null, now)).toBe(false);
    expect(isEventLiveNow(SEP4_8AM_ET, "2026-09-04T14:00:00.000Z", now)).toBe(false);
    expect(getEventCountdownState(SEP4_8AM_ET, null, now).kind).not.toBe("live");
    expect(getEventCountdownState(SEP4_8AM_ET, null, now).kind).toBe("ended");
  });

  it("future event is NOT live", () => {
    const now = new Date(SEP7_833PM_ET);
    const starts = "2026-09-10T16:00:00.000Z";
    expect(isEventLiveNow(starts, "2026-09-10T18:00:00.000Z", now)).toBe(false);
    expect(getEventCountdownState(starts, "2026-09-10T18:00:00.000Z", now).kind).not.toBe("live");
  });

  it("currently-running event IS live", () => {
    const now = new Date("2026-09-07T18:00:00.000Z"); // 2:00 PM ET
    const starts = "2026-09-07T16:00:00.000Z"; // 12:00 PM ET
    const ends = "2026-09-07T20:00:00.000Z"; // 4:00 PM ET
    expect(isEventLiveNow(starts, ends, now)).toBe(true);
    expect(getEventCountdownState(starts, ends, now).kind).toBe("live");
    expect(getEventCountdownState(starts, ends, now).label).toBe("LIVE NOW");
  });

  it("completed event is NOT live", () => {
    const now = new Date("2026-09-07T21:00:00.000Z"); // 5:00 PM ET
    const starts = "2026-09-07T16:00:00.000Z";
    const ends = "2026-09-07T20:00:00.000Z";
    expect(isEventLiveNow(starts, ends, now)).toBe(false);
    expect(getEventCountdownState(starts, ends, now).kind).toBe("ended");
  });

  it("event with missing end time cannot stay live on following days", () => {
    const start = SEP4_8AM_ET;
    // Same campus day, one hour after start → live via assumed 2h duration.
    expect(isEventLiveNow(start, null, new Date("2026-09-04T13:00:00.000Z"))).toBe(true);
    // After assumed 2h on the same day → not live.
    expect(isEventLiveNow(start, null, new Date("2026-09-04T15:00:00.000Z"))).toBe(false);
    // Next campus morning → not live.
    expect(isEventLiveNow(start, null, new Date("2026-09-05T12:00:00.000Z"))).toBe(false);
    // Three days later → not live.
    expect(isEventLiveNow(start, null, new Date(SEP7_833PM_ET))).toBe(false);

    const endMs = resolveEventEndMs(start, null);
    expect(endMs).not.toBeNull();
    // Assumed end must not cross into the next America/New_York calendar day.
    expect(endMs!).toBeLessThanOrEqual(new Date("2026-09-05T04:00:00.000Z").getTime());
  });

  it("events that ended more than 24 hours ago leave active map/location displays", () => {
    const now = new Date(SEP7_833PM_ET);
    const events = [
      { id: "sep4", startsAt: SEP4_8AM_ET, endsAt: null as string | null },
      {
        id: "live",
        startsAt: "2026-09-07T23:00:00.000Z",
        endsAt: "2026-09-08T01:00:00.000Z",
      },
    ];
    expect(filterVisibleMapEvents(events, now).map((e) => e.id)).toEqual(["live"]);
  });
});
