import { describe, expect, it } from "vitest";
import { resolveCanonicalLandmarkForExternalEvent } from "@/lib/server/groupedMapLocations";
import type { CampusBuildingRegistryEntry } from "@/lib/server/urinvolved/campusBuildingRegistry";
import type { TodayExternalMapEvent } from "@/lib/server/urinvolved/todayMapEvents";

const WELDIN: CampusBuildingRegistryEntry = {
  slug: "weldin-hall",
  canonicalName: "Weldin Hall",
  aliases: [
    "weldin hall first floor lounge",
    "weldin hall lounge",
    "weldin lounge",
    "weldin",
  ],
  latitude: 41.4908,
  longitude: -71.5294,
  googlePlaceId: null,
  formattedAddress: null,
  verified: true,
  geocodeSource: "seed",
  updatedAt: new Date().toISOString(),
};

const LIBRARY: CampusBuildingRegistryEntry = {
  slug: "library",
  canonicalName: "Library",
  aliases: ["carothers library", "uri library"],
  latitude: 41.486,
  longitude: -71.53,
  googlePlaceId: null,
  formattedAddress: null,
  verified: true,
  geocodeSource: "seed",
  updatedAt: new Date().toISOString(),
};

function eventItem(partial: {
  locationText: string;
  match:
    | { kind: "realm"; realmLocationId: string; locationName: string; matchedText: string }
    | {
        kind: "coords";
        locationName: string;
        latitude: number;
        longitude: number;
        matchedText: string;
      };
  placementStatus?: string;
}): TodayExternalMapEvent {
  return {
    match: partial.match,
    pin: {
      id: "ext:1",
      externalEventId: "evt-1",
      title: "Vision Board Night",
      startsAt: "2026-07-16T22:30:00.000Z",
      endsAt: null,
      organizationName: null,
      eventUrl: null,
      source: "urinvolved",
      cancelled: false,
      locationText: partial.locationText,
      placementStatus: partial.placementStatus ?? "manually_adjusted",
    },
  };
}

describe("resolveCanonicalLandmarkForExternalEvent", () => {
  it("keeps realm matches on the canonical slug", () => {
    const slug = resolveCanonicalLandmarkForExternalEvent(
      eventItem({
        locationText: "Weldin Hall First Floor Lounge",
        match: {
          kind: "realm",
          realmLocationId: "weldin-hall",
          locationName: "Weldin Hall",
          matchedText: "Weldin Hall First Floor Lounge",
        },
      }),
      [WELDIN, LIBRARY],
    );
    expect(slug).toBe("weldin-hall");
  });

  it("reattaches dragged coords pins whose venue text aliases to Weldin", () => {
    const slug = resolveCanonicalLandmarkForExternalEvent(
      eventItem({
        locationText: "Weldin Hall First Floor Lounge",
        placementStatus: "manually_adjusted",
        match: {
          kind: "coords",
          locationName: "Custom location",
          latitude: 41.483648,
          longitude: -71.532907,
          matchedText: "Weldin Hall First Floor Lounge",
        },
      }),
      [WELDIN, LIBRARY],
    );
    expect(slug).toBe("weldin-hall");
  });

  it("maps Weldin Lounge / Weldin aliases to one landmark", () => {
    for (const text of ["Weldin Lounge", "Weldin", "Weldin Hall"]) {
      const slug = resolveCanonicalLandmarkForExternalEvent(
        eventItem({
          locationText: text,
          match: {
            kind: "coords",
            locationName: text,
            latitude: 41.48,
            longitude: -71.53,
            matchedText: text,
          },
        }),
        [WELDIN, LIBRARY],
      );
      expect(slug).toBe("weldin-hall");
    }
  });

  it("does not force-attach unknown off-campus coords", () => {
    const slug = resolveCanonicalLandmarkForExternalEvent(
      eventItem({
        locationText: "Narragansett Beach",
        match: {
          kind: "coords",
          locationName: "Narragansett Beach",
          latitude: 41.43,
          longitude: -71.45,
          matchedText: "Narragansett Beach",
        },
      }),
      [WELDIN, LIBRARY],
    );
    expect(slug).toBeNull();
  });
});

describe("one grouped marker identity", () => {
  it("collapses event + landmark activity onto a single groupKey", () => {
    const aliases = ["Weldin Hall First Floor Lounge", "Weldin Lounge", "Weldin"];
    const slugs = aliases.map((text) =>
      resolveCanonicalLandmarkForExternalEvent(
        eventItem({
          locationText: text,
          match: {
            kind: "coords",
            locationName: text,
            latitude: 41.48,
            longitude: -71.53,
            matchedText: text,
          },
        }),
        [WELDIN, LIBRARY],
      ),
    );
    expect(new Set(slugs)).toEqual(new Set(["weldin-hall"]));
  });
});
