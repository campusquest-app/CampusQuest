import { describe, expect, it } from "vitest";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import { emptyRecommendationProfile } from "@/lib/recommendations";
import {
  collectMapRecommendationSources,
  findMapFocusForEvent,
  forYouRecommendationLimit,
  rankMapRecommendations,
} from "@/lib/realm/mapRecommendations";
import { hasUsableMapCoords } from "@/lib/realm/mapCoords";
import {
  groupMatchesFilter,
  landmarkMatchesFilter,
  resolveForYouMarkerEmphasis,
} from "@/lib/realm/mapMarkerFilters";
import { campusEventToRecommendationEntity, mapEventPinToRecommendationEntity, scoreRecommendationEntity } from "@/lib/recommendations";

const NOW = new Date("2026-08-25T16:00:00.000Z");

function group(partial: Partial<GroupedMapLocation> & Pick<GroupedMapLocation, "groupKey" | "locationName">): GroupedMapLocation {
  return {
    locationKey: null,
    realmLocationId: null,
    locationAddress: null,
    x: 50,
    y: 50,
    lat: 41.4871,
    lng: -71.5305,
    attachToLandmark: false,
    qrCodes: [],
    quests: [],
    events: [],
    ...partial,
  };
}

describe("hasUsableMapCoords", () => {
  it("rejects null, NaN, and out-of-range coordinates", () => {
    expect(hasUsableMapCoords(null, -71.53)).toBe(false);
    expect(hasUsableMapCoords(41.48, Number.NaN)).toBe(false);
    expect(hasUsableMapCoords(91, -71.53)).toBe(false);
    expect(hasUsableMapCoords(41.4871, -71.5305)).toBe(true);
  });
});

describe("For You map recommendations", () => {
  const athleticsProfile = {
    ...emptyRecommendationProfile(),
    interests: ["athletics"],
    communities: ["athletes"],
  };

  const landmarks = [
    {
      id: "the-quad",
      name: "The Quad",
      major: true,
      lat: 41.4871,
      lng: -71.5305,
      mapContent: group({
        groupKey: "the-quad",
        locationName: "The Quad",
        realmLocationId: "the-quad",
        attachToLandmark: true,
        events: [
          {
            id: "ram-rally",
            title: "Ram Athletics Rally",
            startsAt: "2026-08-25T18:00:00.000Z",
            endsAt: "2026-08-25T20:00:00.000Z",
            organizationName: "Athletics",
            eventUrl: null,
            category: "Athletics",
          },
        ],
      }),
    },
    {
      id: "library",
      name: "Library",
      major: true,
      lat: 41.4876,
      lng: -71.5312,
      mapContent: group({
        groupKey: "library",
        locationName: "Library",
        realmLocationId: "library",
        attachToLandmark: true,
        events: [
          {
            id: "study-slam",
            title: "Quiet Study Hours",
            startsAt: "2026-08-28T18:00:00.000Z",
            endsAt: "2026-08-28T20:00:00.000Z",
            organizationName: null,
            eventUrl: null,
            category: "Academic",
          },
        ],
      }),
    },
  ];

  it("surfaces recommended events and skips invalid coordinates", () => {
    const groups: GroupedMapLocation[] = [
      group({
        groupKey: "ghost",
        locationName: "Nowhere",
        lat: null,
        lng: null,
        events: [
          {
            id: "ghost-event",
            title: "Athletics Ghost Game",
            startsAt: "2026-08-25T19:00:00.000Z",
            endsAt: null,
            organizationName: null,
            eventUrl: null,
            category: "Athletics",
          },
        ],
      }),
    ];

    const sources = collectMapRecommendationSources({ landmarks, groups, now: NOW });
    expect(sources.some((row) => row.event?.id === "ghost-event")).toBe(false);
    expect(sources.some((row) => row.event?.id === "ram-rally")).toBe(true);

    const ranked = rankMapRecommendations({
      landmarks,
      groups,
      profile: athleticsProfile,
      now: NOW,
      limit: forYouRecommendationLimit(390),
    });
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.length).toBeLessThanOrEqual(8);
    expect(ranked[0]?.title).toMatch(/Ram Athletics Rally/);
    expect(ranked.filter((row) => row.eventId === "ram-rally")).toHaveLength(1);
  });

  it("uses the same event scoring as Events For You", () => {
    const event = {
      id: "ram-rally",
      title: "Ram Athletics Rally",
      category: "Athletics",
      location: "The Quad",
      startsAt: "2026-08-25T18:00:00.000Z",
      endsAt: "2026-08-25T20:00:00.000Z",
      hostOrganization: { id: "Athletics", name: "Athletics" },
    };
    const nowMs = NOW.getTime();
    const eventsScore = scoreRecommendationEntity(campusEventToRecommendationEntity(event), athleticsProfile, nowMs);
    const mapScore = scoreRecommendationEntity(
      mapEventPinToRecommendationEntity(
        {
          id: event.id,
          title: event.title,
          category: event.category,
          locationText: event.location,
          organizationName: "Athletics",
          startsAt: event.startsAt,
          endsAt: event.endsAt,
        },
        "The Quad",
      ),
      athleticsProfile,
      nowMs,
    );
    expect(mapScore.score).toBe(eventsScore.score);
  });

  it("deemphasizes unrelated optional markers while keeping major context", () => {
    const recommended = new Set(["the-quad"]);
    expect(resolveForYouMarkerEmphasis({ markerId: "the-quad", major: true, selected: true, recommendedMarkerIds: recommended })).toBe(
      "selected",
    );
    expect(
      resolveForYouMarkerEmphasis({ markerId: "the-quad", major: true, selected: false, recommendedMarkerIds: recommended }),
    ).toBe("recommended");
    expect(
      resolveForYouMarkerEmphasis({ markerId: "library", major: true, selected: false, recommendedMarkerIds: recommended }),
    ).toBe("context");
    expect(
      resolveForYouMarkerEmphasis({ markerId: "side-pin", major: false, selected: false, recommendedMarkerIds: recommended }),
    ).toBe("hidden");
  });

  it("focuses the matching marker for an event id and ignores unmapped events", () => {
    const sources = collectMapRecommendationSources({ landmarks, groups: [], now: NOW });
    const found = findMapFocusForEvent("ram-rally", sources);
    expect(found?.markerId).toBe("the-quad");
    expect(findMapFocusForEvent("no-coords", sources)).toBeNull();
  });

  it("can re-rank locally when filters change without extra fetches", () => {
    const first = rankMapRecommendations({
      landmarks,
      groups: [],
      profile: athleticsProfile,
      now: NOW,
      limit: 6,
    });
    const second = rankMapRecommendations({
      landmarks,
      groups: [],
      profile: athleticsProfile,
      now: NOW,
      limit: 6,
    });
    expect(second.map((row) => row.id)).toEqual(first.map((row) => row.id));
    expect(second.map((row) => row.score)).toEqual(first.map((row) => row.score));
  });

  it("keeps Live Now to currently happening events only", () => {
    const liveLandmark = {
      id: "the-quad",
      major: true,
      upcomingEvents: 1,
      activeMomentCount: 0,
      mapContent: group({
        groupKey: "the-quad",
        locationName: "The Quad",
        events: [
          {
            id: "now",
            title: "Live Set",
            startsAt: "2026-08-25T15:00:00.000Z",
            endsAt: "2026-08-25T18:00:00.000Z",
            organizationName: null,
            eventUrl: null,
          },
        ],
      }),
    };
    const upcomingOnly = {
      id: "library",
      major: true,
      upcomingEvents: 1,
      activeMomentCount: 0,
      mapContent: group({
        groupKey: "library",
        locationName: "Library",
        events: [
          {
            id: "later",
            title: "Tonight Lecture",
            startsAt: "2026-08-25T22:00:00.000Z",
            endsAt: "2026-08-25T23:00:00.000Z",
            organizationName: null,
            eventUrl: null,
          },
        ],
      }),
    };
    expect(landmarkMatchesFilter(liveLandmark, "live", NOW)).toBe(true);
    expect(landmarkMatchesFilter(upcomingOnly, "live", NOW)).toBe(false);
    expect(landmarkMatchesFilter(upcomingOnly, "events", NOW)).toBe(true);
    expect(landmarkMatchesFilter(upcomingOnly, "places", NOW)).toBe(true);
    expect(groupMatchesFilter(upcomingOnly.mapContent, "places", NOW)).toBe(false);
  });
});
