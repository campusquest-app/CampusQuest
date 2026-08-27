import { describe, expect, it, vi } from "vitest";
import { isUpcomingEvent, matchesEventsSearch, matchesEventsTimeframe } from "@/lib/client/eventsFeedFilters";
import { scoreEventsSearch } from "@/lib/client/eventDiscovery";

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

    expect(matchesEventsTimeframe("2026-06-11T18:00:00.000Z", "for_you")).toBe(true);
    expect(matchesEventsTimeframe("2026-06-20T18:00:00.000Z", "for_you")).toBe(true);
    expect(matchesEventsTimeframe("2026-06-11T18:00:00.000Z", "all")).toBe(true);
    expect(matchesEventsTimeframe("2026-06-12T18:00:00.000Z", "today")).toBe(false);
    expect(matchesEventsTimeframe("2026-06-12T18:00:00.000Z", "tomorrow")).toBe(true);

    vi.useRealTimers();
  });

  it("treats recent past events as upcoming within grace window", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(isUpcomingEvent(oneHourAgo)).toBe(true);
  });

  it("keeps This Week on the campus calendar", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T15:00:00.000Z"));
    expect(matchesEventsTimeframe("2026-06-10T18:00:00.000Z", "this_week")).toBe(true);
    expect(matchesEventsTimeframe("2026-06-16T18:00:00.000Z", "this_week")).toBe(false);
    vi.useRealTimers();
  });

  it("keeps This Weekend on the campus Friday–Sunday window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T15:00:00.000Z")); // Thursday
    expect(matchesEventsTimeframe("2026-06-12T18:00:00.000Z", "this_weekend")).toBe(true);
    expect(matchesEventsTimeframe("2026-06-14T18:00:00.000Z", "this_weekend")).toBe(true);
    expect(matchesEventsTimeframe("2026-06-11T18:00:00.000Z", "this_weekend")).toBe(false);
    vi.useRealTimers();
  });

  it("does not let a description mention outrank an exact title search", () => {
    const exact = scoreEventsSearch(
      {
        title: "Career Fair",
        organizationName: "Career Services",
        location: "Union",
        category: "Career",
        tags: [],
        description: "Networking",
      },
      "Career Fair",
    );
    const loose = scoreEventsSearch(
      {
        title: "Club Meetup",
        organizationName: "Career Club",
        location: "Library",
        category: "Social",
        tags: ["career"],
        description: "Talk about the career fair",
      },
      "Career Fair",
    );
    expect(exact).toBeGreaterThan(loose);
  });
});
