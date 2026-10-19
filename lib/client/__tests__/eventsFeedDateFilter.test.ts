import { describe, expect, it } from "vitest";
import { eventIsCancelled, eventIsCurrentOrUpcoming } from "@/lib/client/eventsFeedFilters";
import { isEventLiveNow } from "@/lib/realm/eventVisibility";

describe("events discovery date filtering", () => {
  const now = new Date("2026-10-18T18:00:00.000Z");

  it("excludes canceled events from upcoming discovery", () => {
    expect(eventIsCancelled({ isCancelled: true, title: "Club Night" })).toBe(true);
    expect(eventIsCancelled({ isCancelled: false, title: "Meeting CANCELLED" })).toBe(true);
    expect(
      eventIsCurrentOrUpcoming(
        {
          startsAt: "2026-10-19T20:00:00.000Z",
          endsAt: null,
          isCancelled: true,
          title: "Club Night",
        },
        now,
      ),
    ).toBe(false);
  });

  it("excludes already-ended events even when start was recent", () => {
    expect(
      eventIsCurrentOrUpcoming(
        {
          startsAt: "2026-10-18T15:00:00.000Z",
          endsAt: "2026-10-18T16:00:00.000Z",
          isCancelled: false,
          title: "Ended talk",
        },
        now,
      ),
    ).toBe(false);
  });

  it("keeps live events while they are still within start/end", () => {
    expect(
      eventIsCurrentOrUpcoming(
        {
          startsAt: "2026-10-18T17:00:00.000Z",
          endsAt: "2026-10-18T20:00:00.000Z",
          isCancelled: false,
          title: "Live workshop",
        },
        now,
      ),
    ).toBe(true);
    expect(
      isEventLiveNow("2026-10-18T17:00:00.000Z", "2026-10-18T20:00:00.000Z", now),
    ).toBe(true);
    expect(
      isEventLiveNow("2026-10-18T19:30:00.000Z", "2026-10-18T21:00:00.000Z", now),
    ).toBe(false);
  });
});
