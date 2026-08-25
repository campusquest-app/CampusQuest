import { describe, expect, it } from "vitest";
import { buildEventIcs, eventCalendarFilename, resolveEventCalendarTimes } from "@/lib/client/eventCalendar";
import { DEFAULT_EVENT_DURATION_MS } from "@/lib/realm/eventVisibility";

describe("event calendar", () => {
  it("passes through explicit start and end", () => {
    const times = resolveEventCalendarTimes("2026-09-08T14:00:00.000Z", "2026-09-08T16:00:00.000Z");
    expect(times?.start.toISOString()).toBe("2026-09-08T14:00:00.000Z");
    expect(times?.end.toISOString()).toBe("2026-09-08T16:00:00.000Z");
  });

  it("uses the shared default duration when end is missing", () => {
    const times = resolveEventCalendarTimes("2026-09-08T14:00:00.000Z", null);
    expect(times?.start.toISOString()).toBe("2026-09-08T14:00:00.000Z");
    expect(times?.end.toISOString()).toBe(new Date(Date.parse("2026-09-08T14:00:00.000Z") + DEFAULT_EVENT_DURATION_MS).toISOString());
  });

  it("returns null without a start time", () => {
    expect(resolveEventCalendarTimes(null, "2026-09-08T16:00:00.000Z")).toBeNull();
    expect(buildEventIcs({ id: "e1", title: "Bingo", startsAt: null })).toBeNull();
  });

  it("builds a standards-based ICS payload", () => {
    const ics = buildEventIcs({
      id: "evt-1",
      title: "URI Men's Basketball",
      description: "Home opener",
      location: "Ryan Center",
      url: "https://urinvolved.example/events/1",
      startsAt: "2026-09-08T23:00:00.000Z",
      endsAt: "2026-09-09T01:00:00.000Z",
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART:20260908T230000Z");
    expect(ics).toContain("DTEND:20260909T010000Z");
    expect(ics).toContain("SUMMARY:URI Men's Basketball");
    expect(ics).toContain("LOCATION:Ryan Center");
    expect(ics).toContain("URL:https://urinvolved.example/events/1");
  });

  it("names the download file from the title", () => {
    expect(eventCalendarFilename("URI Men's Basketball")).toBe("uri-men-s-basketball.ics");
  });
});
