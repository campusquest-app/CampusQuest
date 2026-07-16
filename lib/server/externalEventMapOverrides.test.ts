import { describe, expect, it } from "vitest";
import { resolveExternalEventPlacement } from "@/lib/server/externalEventMapOverrides";

const CATALOG = [
  { slug: "memorial-union", name: "Memorial Union" },
  { slug: "library", name: "Library" },
];

const BASE_OVERRIDE = {
  source: "urinvolved",
  occurrenceStart: null,
  googlePlaceId: null,
  formattedAddress: null,
  resolutionDebug: null,
  manuallyVerified: false,
} as const;

describe("resolveExternalEventPlacement", () => {
  it("honors hidden manual overrides", () => {
    const resolved = resolveExternalEventPlacement({
      fields: { locationName: "Memorial Union" },
      catalog: CATALOG,
      override: {
        ...BASE_OVERRIDE,
        id: "o1",
        externalEventId: "e1",
        realmLocationId: "memorial-union",
        customLat: null,
        customLng: null,
        customLabel: null,
        matchStatus: "hidden",
        matchConfidence: 1,
        matchReason: "manual_override",
        rawLocationText: "Memorial Union",
        normalizedLocationText: "memorial union",
        updatedBy: null,
        createdAt: "",
        updatedAt: "",
      },
    });
    expect(resolved.renderOnMap).toBe(false);
    expect(resolved.appliedOverride).toBe(true);
  });

  it("uses explicit xp-style manual realm assignment", () => {
    const resolved = resolveExternalEventPlacement({
      fields: { locationName: "Unknown Building" },
      catalog: CATALOG,
      override: {
        ...BASE_OVERRIDE,
        id: "o2",
        externalEventId: "e2",
        realmLocationId: "library",
        customLat: null,
        customLng: null,
        customLabel: null,
        matchStatus: "manually_adjusted",
        matchConfidence: 1,
        matchReason: "manual_override",
        rawLocationText: "Unknown Building",
        normalizedLocationText: "unknown building",
        updatedBy: null,
        createdAt: "",
        updatedAt: "",
      },
    });
    expect(resolved.renderOnMap).toBe(true);
    expect(resolved.match?.kind).toBe("realm");
    if (resolved.match?.kind === "realm") {
      expect(resolved.match.realmLocationId).toBe("library");
    }
  });
});
