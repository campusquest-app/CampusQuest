import { describe, expect, it, vi } from "vitest";
import type { FeedEvent } from "@/lib/client/eventFeedTypes";
import { activeEventFilterChips, eventPassesListFilters, removeActiveEventFilter, type EventsFeedFilterState } from "@/lib/client/eventsFeedQuery";
import { matchesAnyEventsWhen, timeframeAfterWhenChange } from "@/lib/client/eventsFeedFilters";

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

function event(overrides: {
  id?: string;
  title?: string;
  description?: string;
  category?: string;
  startsAt?: string | null;
  isPaid?: boolean;
  source?: string;
  sport?: string;
  kind?: "campus" | "external";
}): FeedEvent {
  if (overrides.kind === "external") {
    return {
      kind: "external",
      event: {
        id: overrides.id ?? "ext-1",
        source: overrides.source ?? "athletics",
        title: overrides.title ?? "Game",
        description: overrides.description ?? "",
        category: overrides.category ?? "Athletics",
        location: "Ryan Center",
        venueName: "Ryan Center",
        address: null,
        startsAt: overrides.startsAt ?? "2026-06-11T22:00:00.000Z",
        endsAt: null,
        organizationName: "URI Athletics",
        imageUrl: null,
        eventUrl: null,
        tags: [],
        sport: overrides.sport ?? "Basketball",
        opponent: "Fordham",
        homeAway: "home",
        myRsvpStatus: null,
        imported: true,
      },
    };
  }
  return {
    kind: "campus",
    event: {
      id: overrides.id ?? "campus-1",
      title: overrides.title ?? "Club night",
      description: overrides.description ?? "",
      category: overrides.category ?? "Social",
      location: "Memorial Union",
      startsAt: overrides.startsAt ?? "2026-06-11T22:00:00.000Z",
      endsAt: null,
      isPaid: overrides.isPaid ?? false,
      hostOrganization: null,
      rsvpCount: 0,
      myRsvpStatus: null,
      isCancelled: false,
    },
  };
}

const now = new Date("2026-06-11T15:00:00.000Z");

describe("events feed query filters", () => {
  it("treats several When choices as a union", () => {
    const today = "2026-06-11T18:00:00.000Z";
    const tomorrow = "2026-06-12T18:00:00.000Z";
    const later = "2026-06-20T18:00:00.000Z";
    expect(matchesAnyEventsWhen(today, ["today", "tomorrow"], now)).toBe(true);
    expect(matchesAnyEventsWhen(tomorrow, ["today", "tomorrow"], now)).toBe(true);
    expect(matchesAnyEventsWhen(later, ["today", "tomorrow"], now)).toBe(false);
    expect(matchesAnyEventsWhen(later, [], now)).toBe(true);
  });

  it("keeps For You when date windows are cleared, and leaves browse-all alone", () => {
    expect(timeframeAfterWhenChange("today", [])).toBe("for_you");
    expect(timeframeAfterWhenChange("all", [])).toBe("all");
    expect(timeframeAfterWhenChange("for_you", ["today", "this_week"])).toBe("all");
    expect(timeframeAfterWhenChange("for_you", ["this_weekend"])).toBe("this_weekend");
  });

  it("matches any selected category and still requires the search", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const game = event({ kind: "external", title: "Football", category: "Athletics", sport: "Football" });
    const social = event({ title: "Football watch party", category: "Social" });
    const selected = filters({ categories: ["Athletics", "Social"], search: "football" });
    expect(eventPassesListFilters(game, selected, false, now)).toBe(true);
    expect(eventPassesListFilters(social, selected, false, now)).toBe(true);
    expect(eventPassesListFilters(event({ title: "Choir concert", category: "Fine Arts" }), selected, false, now)).toBe(
      false,
    );
    vi.useRealTimers();
  });

  it("uses the explicit food fact and the existing free flag", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const food = event({ description: "Free pizza will be served after the talk.", isPaid: false });
    const paid = event({ id: "paid", title: "Banquet", isPaid: true });
    expect(eventPassesListFilters(food, filters({ foodOnly: true }), false, now)).toBe(true);
    expect(eventPassesListFilters(paid, filters({ foodOnly: true }), false, now)).toBe(false);
    expect(eventPassesListFilters(paid, filters({ isPaid: "free" }), false, now)).toBe(false);
    expect(eventPassesListFilters(food, filters({ isPaid: "free" }), false, now)).toBe(true);
    vi.useRealTimers();
  });

  it("omits For You and the active quick date from chips, and removes one chip at a time", () => {
    expect(activeEventFilterChips(filters({ timeframe: "for_you" }))).toEqual([]);
    expect(activeEventFilterChips(filters({ when: ["today"], timeframe: "today" }))).toEqual([]);
    const applied = filters({
      categories: ["Athletics", "Social"],
      when: ["today", "tomorrow"],
      isPaid: "free",
      timeframe: "all",
    });
    expect(activeEventFilterChips(applied).map((chip) => chip.label)).toEqual([
      "Athletics",
      "Social",
      "Today",
      "Tomorrow",
      "Free",
    ]);
    const withoutSocial = removeActiveEventFilter(applied, "category:Social");
    expect(withoutSocial.categories).toEqual(["Athletics"]);
    expect(removeActiveEventFilter(applied, "free").isPaid).toBe("all");
  });
});
