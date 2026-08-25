import { describe, expect, it } from "vitest";
import {
  countActiveEventFilters,
  eventCardRecommendationReason,
  eventHasMappedLocation,
  eventsSyncBanner,
  scoreEventsSearch,
} from "@/lib/client/eventDiscovery";
import { EVENTS_STALE_NOTICE } from "@/lib/client/eventsFeedEmptyState";

describe("event discovery helpers", () => {
  it("does not warn when sync is healthy", () => {
    expect(
      eventsSyncBanner({
        stale: false,
        lastSuccessfulSync: "2026-09-08T16:00:00.000Z",
        warningText: EVENTS_STALE_NOTICE,
        now: new Date("2026-09-08T16:18:00.000Z"),
      }),
    ).toEqual({ kind: "fresh", text: "Updated 18 min ago" });
  });

  it("warns only when sync is stale or failed", () => {
    expect(
      eventsSyncBanner({
        stale: true,
        lastSuccessfulSync: "2026-09-08T16:00:00.000Z",
        warningText: EVENTS_STALE_NOTICE,
      }),
    ).toEqual({ kind: "warning", text: EVENTS_STALE_NOTICE });
    expect(
      eventsSyncBanner({
        stale: false,
        fetchFailed: true,
        warningText: EVENTS_STALE_NOTICE,
      }),
    ).toEqual({ kind: "warning", text: EVENTS_STALE_NOTICE });
    expect(eventsSyncBanner({ stale: false, warningText: EVENTS_STALE_NOTICE })).toBeNull();
  });

  it("counts extra filters but not the top For You/Today chips", () => {
    expect(
      countActiveEventFilters({
        category: "",
        organizationKey: "",
        isPaid: "all",
        location: "",
        timeframe: "for_you",
      }),
    ).toBe(0);
    expect(
      countActiveEventFilters({
        category: "Athletics",
        organizationKey: "ext:rec",
        isPaid: "free",
        location: "",
        timeframe: "tomorrow",
      }),
    ).toBe(4);
  });

  it("scores exact title matches above organization or description hits", () => {
    const fields = {
      title: "URI Men's Basketball",
      organizationName: "Athletics",
      location: "Ryan Center",
      category: "Athletics",
      tags: ["sports"],
      description: "Come support the Rams.",
    };
    expect(scoreEventsSearch(fields, "URI Men's Basketball")).toBeGreaterThan(scoreEventsSearch(fields, "Athletics"));
    expect(scoreEventsSearch(fields, "Ryan Center")).toBeGreaterThan(scoreEventsSearch(fields, "Rams"));
  });

  it("only treats mapped venue/coords as map-action eligible", () => {
    expect(eventHasMappedLocation({ latitude: 41.49, longitude: -71.53 })).toBe(true);
    expect(eventHasMappedLocation({ venueName: "Memorial Union" })).toBe(true);
    expect(eventHasMappedLocation({ location: "Ryan Center" })).toBe(true);
    expect(eventHasMappedLocation({ address: "1 Rhody Way, Kingston, RI" })).toBe(false);
    expect(eventHasMappedLocation({ location: "Location TBA" })).toBe(false);
  });

  it("keeps recommendation reasons optional and labeled", () => {
    expect(eventCardRecommendationReason(null)).toBeNull();
    expect(eventCardRecommendationReason({ code: "interest", label: "Because you're interested in Athletics" })).toBe(
      "Because you're interested in Athletics",
    );
  });
});
