import { describe, expect, it } from "vitest";
import type { FeedEvent } from "@/lib/client/eventFeedTypes";
import { eventOverlapsCampusDate } from "@/lib/client/eventsFeedFilters";
import { eventsEmptyStateCopy } from "@/lib/client/eventsFeedEmptyState";
import {
  activeEventFilterChips,
  eventPassesListFilters,
  removeActiveEventFilter,
  selectEventsCalendarDate,
  toggleEventsWhenFilter,
  type EventsFeedFilterState,
} from "@/lib/client/eventsFeedQuery";
import { campusDateKey, campusDateWindow } from "@/lib/realm/campusTime";

const NOW = new Date("2026-11-12T21:00:00-05:00");

function filters(overrides: Partial<EventsFeedFilterState> = {}): EventsFeedFilterState {
  return {
    search: "",
    categories: [],
    when: [],
    timeframe: "all",
    organizationKey: "",
    isPaid: "all",
    foodOnly: false,
    location: "",
    sport: "",
    ...overrides,
  };
}

function campusEvent(id: string, title: string, startsAt: string, endsAt: string | null = null): FeedEvent {
  return {
    kind: "campus",
    event: {
      id,
      title,
      description: "",
      category: "Social",
      location: "Memorial Union",
      startsAt,
      endsAt,
      isPaid: false,
      hostOrganization: null,
      rsvpCount: 0,
      myRsvpStatus: null,
      isCancelled: false,
      source: "manual",
    },
  };
}

describe("campus calendar dates", () => {
  it("keeps a late evening event on the campus day, not the next UTC day", () => {
    const evening = new Date("2026-11-20T22:30:00-05:00");
    expect(evening.toISOString().startsWith("2026-11-21")).toBe(true);
    expect(campusDateKey(evening)).toBe("2026-11-20");
  });

  it("uses the real campus day length across daylight saving changes", () => {
    const spring = campusDateWindow("2026-03-08");
    const fall = campusDateWindow("2026-11-01");
    expect(spring).not.toBeNull();
    expect(fall).not.toBeNull();
    expect(spring!.end.getTime() - spring!.start.getTime()).toBe(23 * 60 * 60 * 1000);
    expect(fall!.end.getTime() - fall!.start.getTime()).toBe(25 * 60 * 60 * 1000);
  });
});

describe("event date overlap", () => {
  it("matches a single-day event only on its campus day", () => {
    const start = "2026-11-20T19:00:00-05:00";
    expect(eventOverlapsCampusDate(start, "2026-11-20T21:00:00-05:00", "2026-11-20")).toBe(true);
    expect(eventOverlapsCampusDate(start, null, "2026-11-20")).toBe(true);
    expect(eventOverlapsCampusDate(start, "2026-11-20T21:00:00-05:00", "2026-11-21")).toBe(false);
  });

  it("includes a middle day of a multi-day event", () => {
    const start = "2026-11-18T10:00:00-05:00";
    const end = "2026-11-20T17:00:00-05:00";
    expect(eventOverlapsCampusDate(start, end, "2026-11-18")).toBe(true);
    expect(eventOverlapsCampusDate(start, end, "2026-11-19")).toBe(true);
    expect(eventOverlapsCampusDate(start, end, "2026-11-20")).toBe(true);
    expect(eventOverlapsCampusDate(start, end, "2026-11-21")).toBe(false);
  });

  it("matches both campus days of a cross-midnight event and stops at an exact midnight end", () => {
    expect(
      eventOverlapsCampusDate("2026-11-20T23:30:00-05:00", "2026-11-21T01:00:00-05:00", "2026-11-20"),
    ).toBe(true);
    expect(
      eventOverlapsCampusDate("2026-11-20T23:30:00-05:00", "2026-11-21T01:00:00-05:00", "2026-11-21"),
    ).toBe(true);
    expect(
      eventOverlapsCampusDate("2026-11-20T20:00:00-05:00", "2026-11-21T00:00:00-05:00", "2026-11-21"),
    ).toBe(false);
  });

  it("filters each stored occurrence of a recurring event on its own date", () => {
    const first = campusEvent("series-1", "Club night", "2026-11-20T15:00:00-05:00", "2026-11-20T17:00:00-05:00");
    const second = campusEvent("series-2", "Club night", "2026-11-27T15:00:00-05:00", "2026-11-27T17:00:00-05:00");
    const chosen = filters({ date: "2026-11-20" });
    expect(eventPassesListFilters(first, chosen, false, NOW)).toBe(true);
    expect(eventPassesListFilters(second, chosen, false, NOW)).toBe(false);
  });

  it("keeps category and free filters when a date is selected and ignores a leftover preset", () => {
    const paid = campusEvent("paid", "Ticketed show", "2026-11-20T19:00:00-05:00");
    if (paid.kind === "campus") paid.event.isPaid = true;
    const free = campusEvent("free", "Open mic", "2026-11-20T19:00:00-05:00");
    const otherDay = campusEvent("later", "Open mic", "2026-11-22T19:00:00-05:00");
    const chosen = filters({ date: "2026-11-20", when: ["today"], isPaid: "free", categories: ["Social"] });
    expect(eventPassesListFilters(free, chosen, false, NOW)).toBe(true);
    expect(eventPassesListFilters(paid, chosen, false, NOW)).toBe(false);
    expect(eventPassesListFilters(otherDay, chosen, false, NOW)).toBe(false);
  });

  it("replaces When presets with a date, and a later preset clears the date", () => {
    const dated = selectEventsCalendarDate(filters({ when: ["today", "this_week"] }), "2026-11-20");
    expect(dated.date).toBe("2026-11-20");
    expect(dated.when).toEqual([]);
    const preset = toggleEventsWhenFilter(dated, "tomorrow");
    expect(preset.date).toBe("");
    expect(preset.when).toEqual(["tomorrow"]);
  });

  it("shows the chosen date as a chip and clears it without restoring a preset", () => {
    const chosen = filters({ date: "2026-11-20", timeframe: "all" });
    expect(activeEventFilterChips(chosen).map((chip) => chip.label)).toEqual(["Nov 20"]);
    expect(removeActiveEventFilter(chosen, "date")).toMatchObject({ date: "", timeframe: "for_you" });
  });

  it("offers a clear-date empty state only for that date", () => {
    expect(eventsEmptyStateCopy({ hasLoadedEvents: true, date: "2026-11-20", timeframe: "all" })).toMatchObject({
      title: "No events on Nov 20",
      action: "clear_filters",
      actionLabel: "Clear date",
    });
    expect(
      eventsEmptyStateCopy({ hasLoadedEvents: true, date: "2026-11-20", category: "Social", timeframe: "all" }).title,
    ).toBe("No events match these filters");
  });
});
