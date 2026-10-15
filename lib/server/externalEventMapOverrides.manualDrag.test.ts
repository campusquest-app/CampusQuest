import { describe, expect, it } from "vitest";
import { resolveExternalEventPlacement } from "@/lib/server/externalEventMapOverrides";
import type { CampusBuildingRegistryEntry } from "@/lib/server/urinvolved/campusBuildingRegistry";

const CATALOG = [
  { slug: "memorial-union", name: "Memorial Union" },
  { slug: "library", name: "Library" },
];

const REGISTRY: CampusBuildingRegistryEntry[] = [
  {
    slug: "memorial-union",
    canonicalName: "Memorial Union",
    aliases: ["memorial union", "the union"],
    latitude: 41.4865,
    longitude: -71.5302,
    googlePlaceId: null,
    formattedAddress: null,
    verified: true,
    geocodeSource: "seed",
    updatedAt: new Date().toISOString(),
  },
];

const BASE = {
  source: "urinvolved",
  occurrenceStart: null,
  googlePlaceId: null,
  formattedAddress: null,
  resolutionDebug: null,
  manuallyVerified: false,
  updatedBy: null,
  createdAt: "",
  updatedAt: "",
} as const;

describe("manual drag placement persistence", () => {
  it("keeps custom lat/lng after admin drag even when venue names a campus building", () => {
    const resolved = resolveExternalEventPlacement({
      fields: { locationName: "Memorial Union" },
      catalog: CATALOG,
      registry: REGISTRY,
      override: {
        ...BASE,
        id: "o-drag",
        externalEventId: "e-drag",
        realmLocationId: null,
        customLat: 41.4831,
        customLng: -71.5342,
        customLabel: "Custom location",
        matchStatus: "manually_adjusted",
        matchConfidence: 1,
        matchReason: "manual_drag",
        rawLocationText: "Memorial Union",
        normalizedLocationText: "memorial union",
      },
    });

    expect(resolved.renderOnMap).toBe(true);
    expect(resolved.appliedOverride).toBe(true);
    expect(resolved.match?.kind).toBe("coords");
    if (resolved.match?.kind === "coords") {
      expect(resolved.match.latitude).toBeCloseTo(41.4831, 4);
      expect(resolved.match.longitude).toBeCloseTo(-71.5342, 4);
    }
  });

  it("does not let a later auto-resolve path overwrite manual_drag coords", () => {
    const first = resolveExternalEventPlacement({
      fields: { locationName: "Memorial Union Ballroom" },
      catalog: CATALOG,
      registry: REGISTRY,
      override: {
        ...BASE,
        id: "o2",
        externalEventId: "e2",
        realmLocationId: null,
        customLat: 41.48,
        customLng: -71.535,
        customLabel: null,
        matchStatus: "manually_adjusted",
        matchConfidence: 1,
        matchReason: "manual_drag",
        rawLocationText: "Memorial Union Ballroom",
        normalizedLocationText: "memorial union ballroom",
      },
    });
    const second = resolveExternalEventPlacement({
      fields: { locationName: "Memorial Union Ballroom" },
      catalog: CATALOG,
      registry: REGISTRY,
      override: {
        ...BASE,
        id: "o2",
        externalEventId: "e2",
        realmLocationId: null,
        customLat: 41.48,
        customLng: -71.535,
        customLabel: null,
        matchStatus: "manually_adjusted",
        matchConfidence: 1,
        matchReason: "manual_drag",
        rawLocationText: "Memorial Union Ballroom",
        normalizedLocationText: "memorial union ballroom",
      },
    });
    expect(first.match).toEqual(second.match);
    expect(first.match?.kind).toBe("coords");
  });
});
