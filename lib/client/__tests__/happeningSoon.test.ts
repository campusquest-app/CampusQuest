import { describe, expect, it, vi } from "vitest";
import {
  dedupeFeedEvents,
  happeningSoonScore,
  partitionDiscoverySections,
  selectHappeningSoon,
  visibleCarouselIndex,
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

  it("orders by start time and drops cancelled, ended, and duplicate imports", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T16:00:00.000Z"));
    const soonerClub = event({
      id: "club",
      title: "Club meetup",
      startsAt: "2026-08-29T23:00:00.000Z",
    });
    const laterAthletics = event({
      id: "bball-later",
      title: "Basketball vs Fordham",
      startsAt: "2026-09-02T23:00:00.000Z",
      source: "athletics",
      category: "Athletics",
      imageUrl: "https://example.com/game.jpg",
    });
    const cancelled = event({
      id: "cancelled",
      title: "Cancelled mixer",
      startsAt: "2026-08-28T23:00:00.000Z",
      isCancelled: true,
    });
    const ended = event({
      id: "ended",
      title: "Morning yoga",
      startsAt: "2026-08-27T14:00:00.000Z",
      endsAt: "2026-08-27T15:00:00.000Z",
    });
    const inProgress = event({
      id: "live",
      title: "Campus concert",
      startsAt: "2026-08-27T15:00:00.000Z",
      endsAt: "2026-08-27T20:00:00.000Z",
    });
    const duplicate = event({
      id: "club-copy",
      title: "Club meetup",
      startsAt: "2026-08-29T23:00:00.000Z",
      source: "athletics",
      imageUrl: "https://example.com/club.jpg",
    });
    expect(happeningSoonScore(soonerClub.item, null)).toBeGreaterThan(happeningSoonScore(laterAthletics.item, null));
    expect(happeningSoonScore(cancelled.item, null)).toBe(-1);
    expect(happeningSoonScore(ended.item, null)).toBe(-1);
    expect(happeningSoonScore(inProgress.item, null)).toBeGreaterThan(0);
    const selected = selectHappeningSoon([
      laterAthletics,
      cancelled,
      ended,
      soonerClub,
      duplicate,
      inProgress,
    ]).map((row) => row.item.event.id);
    expect(selected[0]).toBe("live");
    expect(selected).toContain("club");
    expect(selected).not.toContain("club-copy");
    expect(selected).not.toContain("cancelled");
    expect(selected).not.toContain("ended");
    expect(selected.indexOf("club")).toBeLessThan(selected.indexOf("bball-later"));
    expect(dedupeFeedEvents([soonerClub.item, duplicate.item]).map((item) => item.event.id)).toEqual(["club-copy"]);
    expect(visibleCarouselIndex(0, 320, [0, 300, 600])).toBe(0);
    expect(visibleCarouselIndex(280, 320, [0, 300, 600])).toBe(1);
    vi.useRealTimers();
  });
});
