import { describe, expect, it, vi } from "vitest";
import {
  happeningSoonScore,
  partitionDiscoverySections,
  selectHappeningSoon,
  type RankedFeedEvent,
} from "@/lib/client/happeningSoon";
import type { ExternalFeedEventItem, FeedEvent } from "@/lib/client/eventFeedTypes";

function event(partial: Partial<ExternalFeedEventItem> & { id: string; title: string; startsAt: string }): RankedFeedEvent {
  const item: FeedEvent = {
    kind: "external",
    event: {
      source: "urinvolved",
      description: "",
      category: "Clubs",
      location: "Memorial Union",
      venueName: "Memorial Union",
      address: null,
      endsAt: null,
      organizationName: "Club",
      imageUrl: null,
      eventUrl: null,
      tags: [],
      myRsvpStatus: null,
      imported: true,
      ...partial,
    },
  };
  return { item, recommendation: null };
}

describe("happening soon ranking", () => {
  it("prefers sooner Athletics games over later club events", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T16:00:00.000Z"));
    const soonAthletics = event({
      id: "bball",
      title: "University of Rhode Island Men's Basketball vs Holy Cross",
      startsAt: "2026-08-29T23:00:00.000Z",
      source: "athletics",
      sport: "Men's Basketball",
      category: "Athletics",
      venueName: "Ryan Center",
      latitude: 41.48,
      longitude: -71.53,
      homeAway: "home",
    });
    const laterClub = event({
      id: "club",
      title: "Club meetup",
      startsAt: "2026-09-08T23:00:00.000Z",
    });
    expect(happeningSoonScore(soonAthletics.item, null)).toBeGreaterThan(happeningSoonScore(laterClub.item, null));
    expect(selectHappeningSoon([laterClub, soonAthletics]).map((row) => row.item.event.id)).toEqual(["bball", "club"]);
    const farFuture = event({
      id: "far",
      title: "Far future mixer",
      startsAt: "2026-12-01T23:00:00.000Z",
    });
    expect(happeningSoonScore(farFuture.item, null)).toBe(-1);
    vi.useRealTimers();
  });

  it("keeps For You from hiding the rest of campus", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T16:00:00.000Z"));
    const rows = Array.from({ length: 12 }, (_, index) =>
      event({
        id: `e${index}`,
        title: `Event ${index}`,
        startsAt: new Date(Date.now() + (index + 1) * 36 * 60 * 60 * 1000).toISOString(),
      }),
    );
    const sections = partitionDiscoverySections({
      ranked: rows,
      timeframe: "for_you",
      searchQuery: "",
      savedOnly: false,
      forYouLimit: 3,
    });
    expect(sections.happeningSoon.length).toBeGreaterThan(0);
    expect(sections.forYou.length).toBeGreaterThan(0);
    expect(sections.more.length).toBeGreaterThan(0);
    const ids = [...sections.happeningSoon, ...sections.forYou, ...sections.more].map((row) => row.item.event.id);
    expect(new Set(ids).size).toBe(rows.length);
    vi.useRealTimers();
  });
});
