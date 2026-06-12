import { describe, expect, it, vi } from "vitest";
import { isUpcomingEvent, matchesEventsSearch, matchesEventsTimeframe } from "@/lib/client/eventsFeedFilters";

describe("eventsFeedFilters", () => {
  it("matches search across title, location, and tags", () => {
    expect(
      matchesEventsSearch(
        {
          title: "Bingo Night",
          description: "Fun games",
          location: "Memorial Union",
          organizationName: "Health Services",
          category: "Social",
          tags: ["wellness"],
        },
        "memorial",
      ),
    ).toBe(true);
    expect(
      matchesEventsSearch(
        {
          title: "Bingo Night",
          description: "Fun games",
          location: "Memorial Union",
          organizationName: "Health Services",
          category: "Social",
          tags: ["wellness"],
        },
        "career fair",
      ),
    ).toBe(false);
  });

  it("filters today and tomorrow windows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T15:00:00.000Z"));

    expect(matchesEventsTimeframe("2026-06-11T18:00:00.000Z", "today")).toBe(true);
    expect(matchesEventsTimeframe("2026-06-12T18:00:00.000Z", "today")).toBe(false);
    expect(matchesEventsTimeframe("2026-06-12T18:00:00.000Z", "tomorrow")).toBe(true);

    vi.useRealTimers();
  });

  it("treats recent past events as upcoming within grace window", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(isUpcomingEvent(oneHourAgo)).toBe(true);
  });
});
