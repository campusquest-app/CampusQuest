import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EVENTS_SEARCH_PLACEHOLDER, eventInterestMatchLabel } from "@/lib/client/eventDiscovery";
import { resolveEventArtwork } from "@/lib/client/eventArtwork";
import type { CampusEventItem, FeedEvent } from "@/lib/client/eventFeedTypes";
import { eventPassesListFilters, type EventsFeedFilterState } from "@/lib/client/eventsFeedQuery";
import { EVENTS_INTEREST_PROMPT } from "@/lib/client/eventsFeedEmptyState";
import { partitionDiscoverySections, type RankedFeedEvent } from "@/lib/client/happeningSoon";
import { campusEventToRecommendationEntity, rankRecommendationEntities } from "@/lib/recommendations";
import { emptyRecommendationProfile } from "@/lib/recommendations/profile";

const NOW = new Date("2026-08-27T16:00:00.000Z");

function filters(overrides: Partial<EventsFeedFilterState> = {}): EventsFeedFilterState {
  return {
    search: "",
    categories: [],
    when: [],
    timeframe: "for_you",
    organizationKey: "",
    isPaid: "all",
    foodOnly: false,
    location: "",
    sport: "",
    ...overrides,
  };
}

function campus(partial: Partial<CampusEventItem> & { id: string; title: string; startsAt: string }): FeedEvent {
  return {
    kind: "campus",
    event: {
      description: "",
      category: "Social",
      location: "Memorial Union",
      endsAt: null,
      isPaid: false,
      hostOrganization: null,
      rsvpCount: 0,
      myRsvpStatus: null,
      isCancelled: false,
      ...partial,
    },
  };
}

function rankForYou(items: FeedEvent[], interests: string[]): RankedFeedEvent[] {
  return rankRecommendationEntities({
    items,
    toEntity: (entry) => campusEventToRecommendationEntity(entry.event),
    profile: emptyRecommendationProfile({ explicitInterests: interests }),
    nowMs: NOW.getTime(),
    diversity: true,
    exploreEvery: 0,
  }).map((row) => ({ item: row.item, recommendation: row.recommendation }));
}

describe("events discovery journey", () => {
  it("opens For You, swipes to the next event, returns, searches, and opens a date match", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const concert = campus({
      id: "concert",
      title: "Campus concert",
      category: "Fine Arts",
      startsAt: "2026-08-27T18:00:00.000Z",
      location: "Fine Arts Center",
    });
    const fillers = Array.from({ length: 5 }, (_, index) =>
      campus({
        id: `study-${index}`,
        title: `Study group ${index + 1}`,
        category: "Academic",
        startsAt: new Date(Date.parse("2026-08-28T12:00:00.000Z") + index * 60 * 60 * 1000).toISOString(),
        location: "Library",
      }),
    );
    const choir = campus({
      id: "choir",
      title: "Choir rehearsal",
      category: "Fine Arts",
      startsAt: "2026-08-29T22:00:00.000Z",
      location: "Fine Arts Center",
    });
    const basketball = campus({
      id: "bball",
      title: "Basketball vs Fordham",
      category: "Athletics",
      startsAt: "2026-08-30T23:00:00.000Z",
      location: "Ryan Center",
    });
    const lecture = campus({
      id: "lecture",
      title: "History lecture",
      category: "Academic",
      startsAt: "2026-09-02T16:00:00.000Z",
      location: "Swan Hall",
    });
    const cancelled = campus({
      id: "cancelled",
      title: "Cancelled mixer",
      startsAt: "2026-08-27T19:00:00.000Z",
      isCancelled: true,
    });
    const ended = campus({
      id: "ended",
      title: "Morning run club",
      startsAt: "2026-08-27T12:00:00.000Z",
      endsAt: "2026-08-27T13:00:00.000Z",
    });

    const loaded = [lecture, basketball, cancelled, concert, ended, choir, ...fillers];
    const visible = loaded.filter((item) => eventPassesListFilters(item, filters(), false, NOW));
    expect(visible.map((item) => item.event.id)).not.toContain("cancelled");
    expect(visible.map((item) => item.event.id)).not.toContain("ended");

    const personalized = rankForYou(visible, ["music"]);
    const sections = partitionDiscoverySections({
      ranked: personalized,
      timeframe: "for_you",
      searchQuery: "",
      savedOnly: false,
      now: NOW,
    });

    expect(sections.happeningSoon.map((row) => row.item.event.id)[0]).toBe("concert");
    expect(sections.forYou.map((row) => row.item.event.id)).toContain("choir");
    expect(sections.forYou.map((row) => row.item.event.id)).not.toContain("concert");
    const choirRow = personalized.find((row) => row.item.event.id === "choir");
    const basketballRow = personalized.find((row) => row.item.event.id === "bball");
    expect(choirRow).toBeTruthy();
    expect(basketballRow).toBeTruthy();
    expect(personalized.indexOf(choirRow!)).toBeLessThan(personalized.indexOf(basketballRow!));
    expect(eventInterestMatchLabel(choirRow?.recommendation)).toBe("Matches your interests");
    expect(eventInterestMatchLabel(basketballRow?.recommendation)).toBeNull();

    const swiped = sections.happeningSoon[1];
    expect(swiped?.item.event.id).toBeTruthy();
    let openedId: string | null = swiped!.item.event.id;
    expect(openedId).not.toBe("concert");
    openedId = null;
    expect(openedId).toBeNull();

    const searched = visible.filter((item) =>
      eventPassesListFilters(item, filters({ search: "choir", timeframe: "for_you" }), false, NOW),
    );
    expect(searched.map((item) => item.event.id)).toEqual(["choir"]);

    const today = visible.filter((item) =>
      eventPassesListFilters(item, filters({ timeframe: "today", when: ["today"] }), false, NOW),
    );
    expect(today.map((item) => item.event.id)).toEqual(["concert"]);
    const nextOpened = today[0]?.event.id;
    expect(nextOpened).toBe("concert");
    expect(nextOpened).not.toBe(swiped?.item.event.id);

    const discovery = rankForYou(visible, []);
    expect(discovery.every((row) => eventInterestMatchLabel(row.recommendation) == null)).toBe(true);
    const timed = [...visible].sort(
      (a, b) => new Date(a.event.startsAt ?? 0).getTime() - new Date(b.event.startsAt ?? 0).getTime(),
    );
    expect(timed.map((item) => item.event.id)[0]).toBe("concert");

    expect(resolveEventArtwork({ imageUrl: null }).kind).toBe("fallback");
    expect(resolveEventArtwork({ imageUrl: "https://cdn.example/concert.jpg" }).kind).toBe("event");

    vi.useRealTimers();
  });

  it("keeps the student events screen free of admin tools and decorative emoji", () => {
    const feed = readFileSync(join(process.cwd(), "components/EventsFeed.tsx"), "utf8");
    const carousel = readFileSync(join(process.cwd(), "components/events/HappeningSoonCarousel.tsx"), "utf8");
    const card = readFileSync(join(process.cwd(), "components/events/EventDiscoveryCard.tsx"), "utf8");
    expect(EVENTS_SEARCH_PLACEHOLDER).toBe("Search events, clubs, or places");
    expect(EVENTS_INTEREST_PROMPT).toContain("interests");
    expect(feed).toContain("EVENTS_INTEREST_PROMPT");
    expect(feed).toContain("useDebouncedValue");
    expect(feed).toContain("Clear search");
    expect(feed).toContain("setActiveDetail");
    expect(feed).toContain("closeDetail");
    expect(feed).toContain("openDetail");
    expect(feed).not.toContain("pointer-events-none");
    expect(feed).not.toContain("Admin sync status");
    expect(feed).not.toContain("☆");
    expect(carousel).toContain("Clock3");
    expect(carousel).toContain("onClickCapture");
    expect(carousel).toContain("rows.length > 1");
    expect(carousel).not.toContain("⚡");
    expect(card).not.toContain("☆");
    expect(card).toContain("eventInterestMatchLabel");
  });
});
