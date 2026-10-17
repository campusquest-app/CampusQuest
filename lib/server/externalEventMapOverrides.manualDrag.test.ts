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
      expect(resolved.match.locationName).toBe("Memorial Union");
      expect(resolved.match.locationName).not.toMatch(/custom location/i);
    }
  });

  it("labels a dragged soccer event with the canonical venue, not Custom location", () => {
    const resolved = resolveExternalEventPlacement({
      fields: { venueName: "URI Soccer Complex", locationName: "URI Soccer Complex" },
      catalog: CATALOG,
      registry: REGISTRY,
      override: {
        ...BASE,
        id: "o-soccer",
        externalEventId: "soccer-1",
        realmLocationId: null,
        customLat: 41.4838,
        customLng: -71.5348,
        customLabel: "Custom location",
        matchStatus: "manually_adjusted",
        matchConfidence: 1,
        matchReason: "manual_drag",
        rawLocationText: "URI Soccer Complex",
        normalizedLocationText: "uri soccer complex",
      },
    });
    expect(resolved.match?.kind).toBe("coords");
    if (resolved.match?.kind === "coords") {
      expect(resolved.match.locationName).toBe("URI Soccer Complex");
      expect(resolved.match.latitude).toBeCloseTo(41.4838, 4);
    }
  });

  it("does not give a similarly titled event the other event's override", () => {
    const shared = {
      fields: { venueName: "Keeney Gymnasium" },
      catalog: CATALOG,
      registry: REGISTRY,
    };
    const moved = resolveExternalEventPlacement({
      ...shared,
      override: {
        ...BASE,
        id: "o-a",
        externalEventId: "event-a",
        realmLocationId: null,
        customLat: 41.4901,
        customLng: -71.5201,
        customLabel: "Custom location",
        matchStatus: "manually_adjusted",
        matchConfidence: 1,
        matchReason: "manual_drag",
        rawLocationText: "Keeney Gymnasium",
        normalizedLocationText: "keeney gymnasium",
      },
    });
    const other = resolveExternalEventPlacement({
      ...shared,
      override: null,
    });
    expect(moved.match?.kind).toBe("coords");
    if (moved.match?.kind === "coords") {
      expect(moved.match.locationName).toBe("Keaney Gym");
      expect(moved.match.latitude).toBeCloseTo(41.4901, 4);
    }
    expect(other.appliedOverride).toBe(false);
    if (other.match?.kind === "coords") {
      expect(other.match.latitude).not.toBeCloseTo(41.4901, 3);
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
