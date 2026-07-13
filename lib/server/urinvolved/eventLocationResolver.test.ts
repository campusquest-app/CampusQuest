import { describe, expect, it } from "vitest";
import { resolveEventLocationFromRegistrySync } from "@/lib/server/urinvolved/eventLocationResolver";
import { upsertAutoPlacementOverride } from "@/lib/server/externalEventMapOverrides";
import type { CampusBuildingRegistryEntry } from "@/lib/server/urinvolved/campusBuildingRegistry";
import { dedupeLogicalMapEvents } from "@/lib/realm/dedupeLogicalEvents";
import type { MapEventPin } from "@/lib/mapLocationGroups";

const CATALOG = [
  { slug: "weldin-hall", name: "Weldin Hall" },
  { slug: "library", name: "Library" },
];

const WELDIN_REGISTRY: CampusBuildingRegistryEntry = {
  slug: "weldin-hall",
  canonicalName: "Weldin Hall",
  aliases: ["weldin hall first floor lounge"],
  latitude: 41.4908,
  longitude: -71.5294,
  googlePlaceId: "place-weldin",
  formattedAddress: "Weldin Hall, 2 Lippitt Rd, Kingston, RI",
  verified: false,
  geocodeSource: "google",
  updatedAt: new Date().toISOString(),
};

describe("resolveEventLocationFromRegistrySync", () => {
  it("resolves Weldin Hall First Floor Lounge to Weldin Hall", () => {
    const result = resolveEventLocationFromRegistrySync({
      fields: { venueName: "Weldin Hall First Floor Lounge" },
      registry: [WELDIN_REGISTRY],
      catalog: CATALOG,
    });
    expect(result.match?.kind).toBe("coords");
    if (result.match?.kind === "coords") {
      expect(result.match.locationName).toBe("Weldin Hall");
      expect(result.match.latitude).toBeCloseTo(41.4908, 3);
    }
    expect(result.debug.normalizedBuildingName).toBe("weldin hall");
  });

  it("uses verified registry coordinates with highest priority", () => {
    const result = resolveEventLocationFromRegistrySync({
      fields: { locationName: "Weldin Hall Lounge" },
      registry: [{ ...WELDIN_REGISTRY, verified: true }],
      catalog: CATALOG,
    });
    expect(result.meta?.matchReason).toBe("verified_registry");
    expect(result.meta?.confidence).toBe(1);
  });

  it("does not render unresolved low-confidence events on the map", () => {
    const result = resolveEventLocationFromRegistrySync({
      fields: { locationName: "Narragansett Beach" },
      registry: [],
      catalog: CATALOG,
    });
    expect(result.match).toBeNull();
    expect(result.debug.renderOnMap).toBe(false);
  });
});

describe("upsertAutoPlacementOverride protection", () => {
  it("never overwrites admin-verified placements automatically", async () => {
    const existing = {
      id: "1",
      externalEventId: "evt-1",
      realmLocationId: null,
      customLat: 41.4908,
      customLng: -71.5294,
      customLabel: "Weldin Hall",
      matchStatus: "verified" as const,
      matchConfidence: 1,
      matchReason: "admin_verified",
      rawLocationText: "Weldin Hall First Floor Lounge",
      normalizedLocationText: "weldin hall",
      googlePlaceId: "place-weldin",
      formattedAddress: "Weldin Hall, 2 Lippitt Rd, Kingston, RI",
      resolutionDebug: null,
      manuallyVerified: true,
      updatedBy: "admin",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const kept = await upsertAutoPlacementOverride({
      externalEventId: "evt-1",
      fields: { venueName: "Weldin Hall First Floor Lounge" },
      catalog: CATALOG,
      existing,
    });

    expect(kept).toEqual(existing);
  });
});

describe("dedupeLogicalMapEvents shared placement", () => {
  it("keeps active and cancelled duplicates on one merged pin", () => {
    const active: MapEventPin = {
      id: "ext:1",
      externalEventId: "1",
      title: "Karaoke Night",
      startsAt: "2026-07-01T20:00:00.000Z",
      endsAt: null,
      organizationName: "Talent",
      eventUrl: null,
      source: "urinvolved",
      cancelled: false,
      locationText: "Weldin Hall First Floor Lounge",
      placementStatus: "auto_matched",
      matchConfidence: 0.92,
      matchReason: "registry_match",
    };
    const cancelled: MapEventPin = {
      ...active,
      id: "ext:2",
      externalEventId: "2",
      cancelled: true,
      title: "Karaoke Night (Cancelled)",
    };

    const merged = dedupeLogicalMapEvents([active, cancelled]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.cancelled).toBe(true);
    expect(merged[0]?.locationText).toBe("Weldin Hall First Floor Lounge");
  });
});
