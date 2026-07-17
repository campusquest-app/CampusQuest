import { describe, expect, it } from "vitest";
import type { GroupedMapLocation, MapEventPin } from "@/lib/mapLocationGroups";
import {
  collectDiscoveryOpportunities,
  countNearbyOpportunities,
  formatOpportunitiesBannerCopy,
  formatWalkingAwayLabel,
  isValidDiscoveryCoordinate,
  refreshSpotlightLabel,
  selectLiveEventSpotlight,
  selectNearestOpportunity,
} from "@/lib/realm/realmMapDiscovery";

const ORIGIN = { lat: 41.487, lng: -71.5305 };

function eventPin(partial: Partial<MapEventPin> & Pick<MapEventPin, "id" | "title" | "startsAt">): MapEventPin {
  return {
    endsAt: null,
    organizationName: "Test Org",
    eventUrl: null,
    cancelled: false,
    ...partial,
  };
}

function emptyGroup(overrides: Partial<GroupedMapLocation> & Pick<GroupedMapLocation, "groupKey" | "locationName">): GroupedMapLocation {
  return {
    locationKey: null,
    realmLocationId: null,
    locationAddress: null,
    x: 0,
    y: 0,
    lat: ORIGIN.lat,
    lng: ORIGIN.lng,
    attachToLandmark: false,
    qrCodes: [],
    quests: [],
    events: [],
    ...overrides,
  };
}

describe("isValidDiscoveryCoordinate", () => {
  it("accepts finite campus coords", () => {
    expect(isValidDiscoveryCoordinate(41.48, -71.53)).toBe(true);
  });

  it("rejects nullish, NaN, and 0,0", () => {
    expect(isValidDiscoveryCoordinate(null, -71)).toBe(false);
    expect(isValidDiscoveryCoordinate(41, Number.NaN)).toBe(false);
    expect(isValidDiscoveryCoordinate(0, 0)).toBe(false);
  });
});

describe("formatWalkingAwayLabel", () => {
  it("uses Less than 1 min for short distances", () => {
    expect(formatWalkingAwayLabel(20)).toBe("Less than 1 min away");
  });

  it("rounds estimated walking minutes", () => {
    // ~420m at 1.4 m/s ≈ 5 min
    expect(formatWalkingAwayLabel(420)).toBe("5 min away");
  });

  it("prefers a known route duration when provided", () => {
    expect(formatWalkingAwayLabel(5000, 90)).toBe("2 min away");
  });
});

describe("formatOpportunitiesBannerCopy", () => {
  it("handles zero, one, and many", () => {
    expect(formatOpportunitiesBannerCopy(0)).toBe("No nearby opportunities yet");
    expect(formatOpportunitiesBannerCopy(1)).toBe("1 opportunity around you");
    expect(formatOpportunitiesBannerCopy(7)).toBe("7 opportunities around you");
  });
});

describe("collectDiscoveryOpportunities + nearest", () => {
  const now = new Date("2026-07-17T15:00:00.000Z");

  it("skips missing coordinates and canceled events", () => {
    const opps = collectDiscoveryOpportunities({
      landmarks: [
        {
          id: "library",
          mapContent: {
            ...emptyGroup({ groupKey: "library", locationName: "Library" }),
            events: [
              eventPin({
                id: "e-cancel",
                title: "Cancelled Mixer",
                startsAt: "2026-07-17T15:30:00.000Z",
                cancelled: true,
              }),
            ],
            quests: [{ id: "q1", name: "Scan", description: "", xpReward: 10, difficulty: null, completionMethod: null, requiresQr: false, expiresAt: null, icon: "quest" }],
          },
        },
      ],
      geoPositions: {
        library: { lat: 41.4872, lng: -71.5302 },
        bad: { lat: Number.NaN, lng: -71 },
      },
      supplementaryPins: [
        emptyGroup({
          groupKey: "no-coords",
          locationName: "Nowhere",
          lat: null,
          lng: null,
          events: [
            eventPin({
              id: "e-orphan",
              title: "Orphan",
              startsAt: "2026-07-17T16:00:00.000Z",
            }),
          ],
        }),
      ],
      now,
    });

    expect(opps.every((o) => o.kind !== "event" || o.title !== "Cancelled Mixer")).toBe(true);
    expect(opps.some((o) => o.kind === "quest" && o.title === "Scan")).toBe(true);
    expect(opps.some((o) => o.title === "Orphan")).toBe(false);
  });

  it("dedupes duplicate synced events at the same logical key", () => {
    const shared = {
      title: "Vision Board Night",
      startsAt: "2026-07-17T22:30:00.000Z",
      organizationName: "Student Org",
      sourceExternalId: "ext-123",
      locationText: "Weldin Hall",
    };
    const opps = collectDiscoveryOpportunities({
      landmarks: [],
      geoPositions: {},
      supplementaryPins: [
        emptyGroup({
          groupKey: "g1",
          locationName: "Weldin",
          lat: 41.4865,
          lng: -71.529,
          events: [
            eventPin({
              id: "old",
              ...shared,
              updatedAt: "2026-07-17T10:00:00.000Z",
              cancelled: true,
            }),
            eventPin({
              id: "new",
              ...shared,
              updatedAt: "2026-07-17T14:00:00.000Z",
              cancelled: false,
            }),
          ],
        }),
      ],
      now,
    });

    // Cancelled sibling is excluded; active copy remains once.
    expect(opps.filter((o) => o.kind === "event")).toHaveLength(1);
    expect(opps[0]?.event?.cancelled).toBe(false);
  });

  it("selects the nearest opportunity by distance", () => {
    const opps = collectDiscoveryOpportunities({
      landmarks: [
        {
          id: "near",
          mapContent: {
            ...emptyGroup({ groupKey: "near", locationName: "Near" }),
            quests: [
              {
                id: "q-near",
                name: "Near Quest",
                description: "",
                xpReward: 5,
                difficulty: null,
                completionMethod: null,
                requiresQr: false,
                expiresAt: null,
                icon: "quest",
              },
            ],
          },
        },
        {
          id: "far",
          mapContent: {
            ...emptyGroup({ groupKey: "far", locationName: "Far" }),
            quests: [
              {
                id: "q-far",
                name: "Far Quest",
                description: "",
                xpReward: 5,
                difficulty: null,
                completionMethod: null,
                requiresQr: false,
                expiresAt: null,
                icon: "quest",
              },
            ],
          },
        },
      ],
      geoPositions: {
        near: { lat: 41.4871, lng: -71.5304 },
        far: { lat: 41.5, lng: -71.55 },
      },
      supplementaryPins: [],
      now,
    });

    const nearest = selectNearestOpportunity(opps, ORIGIN);
    expect(nearest?.opportunity.title).toBe("Near Quest");
    expect(countNearbyOpportunities(opps, ORIGIN, 500)).toBe(1);
    expect(countNearbyOpportunities(opps, ORIGIN, 5000)).toBe(2);
  });
});

describe("selectLiveEventSpotlight", () => {
  it("prioritizes a live event over a soon-starting one", () => {
    const now = new Date("2026-07-17T15:00:00.000Z");
    const opps = collectDiscoveryOpportunities({
      landmarks: [],
      geoPositions: {},
      supplementaryPins: [
        emptyGroup({
          groupKey: "live",
          locationName: "Live Spot",
          lat: 41.488,
          lng: -71.531,
          events: [
            eventPin({
              id: "live",
              title: "Live Now Event",
              startsAt: "2026-07-17T14:30:00.000Z",
              endsAt: "2026-07-17T16:00:00.000Z",
            }),
          ],
        }),
        emptyGroup({
          groupKey: "soon",
          locationName: "Soon Spot",
          lat: 41.48705,
          lng: -71.53055,
          events: [
            eventPin({
              id: "soon",
              title: "Starts Soon",
              startsAt: "2026-07-17T15:20:00.000Z",
              endsAt: "2026-07-17T16:20:00.000Z",
            }),
          ],
        }),
      ],
      now,
    });

    const spotlight = selectLiveEventSpotlight(opps, ORIGIN, now);
    expect(spotlight?.kind).toBe("live");
    expect(spotlight?.label).toBe("Live now");
    expect(spotlight?.opportunity.title).toBe("Live Now Event");
  });

  it("picks the soonest starting event within 60 minutes", () => {
    const now = new Date("2026-07-17T15:00:00.000Z");
    const opps = collectDiscoveryOpportunities({
      landmarks: [],
      geoPositions: {},
      supplementaryPins: [
        emptyGroup({
          groupKey: "a",
          locationName: "A",
          lat: 41.4872,
          lng: -71.5302,
          events: [
            eventPin({
              id: "later",
              title: "Later",
              startsAt: "2026-07-17T15:45:00.000Z",
            }),
            eventPin({
              id: "sooner",
              title: "Sooner",
              startsAt: "2026-07-17T15:12:00.000Z",
            }),
          ],
        }),
      ],
      now,
    });

    const spotlight = selectLiveEventSpotlight(opps, ORIGIN, now);
    expect(spotlight?.kind).toBe("soon");
    expect(spotlight?.opportunity.title).toBe("Sooner");
    expect(spotlight?.label).toMatch(/Starts in \d+ min/);
  });

  it("ignores canceled and far-future events", () => {
    const now = new Date("2026-07-17T15:00:00.000Z");
    const opps = collectDiscoveryOpportunities({
      landmarks: [],
      geoPositions: {},
      supplementaryPins: [
        emptyGroup({
          groupKey: "x",
          locationName: "X",
          lat: 41.487,
          lng: -71.5305,
          events: [
            eventPin({
              id: "c",
              title: "Cancelled",
              startsAt: "2026-07-17T15:10:00.000Z",
              cancelled: true,
            }),
            eventPin({
              id: "far",
              title: "Tomorrow",
              startsAt: "2026-07-18T15:10:00.000Z",
            }),
          ],
        }),
      ],
      now,
    });

    expect(selectLiveEventSpotlight(opps, ORIGIN, now)).toBeNull();
  });
});

describe("refreshSpotlightLabel", () => {
  it("returns Live now once the event has started", () => {
    const event = eventPin({
      id: "e",
      title: "Talk",
      startsAt: "2026-07-17T15:00:00.000Z",
      endsAt: "2026-07-17T16:00:00.000Z",
    });
    expect(refreshSpotlightLabel(event, new Date("2026-07-17T15:05:00.000Z"))).toBe("Live now");
  });

  it("clears when the event has ended", () => {
    const event = eventPin({
      id: "e",
      title: "Talk",
      startsAt: "2026-07-17T14:00:00.000Z",
      endsAt: "2026-07-17T14:30:00.000Z",
    });
    expect(refreshSpotlightLabel(event, new Date("2026-07-17T15:00:00.000Z"))).toBeNull();
  });
});
