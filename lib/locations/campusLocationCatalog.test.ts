import { afterEach, describe, expect, it } from "vitest";
import {
  clearCampusLocationCatalogCache,
  getCampusLocation,
  getCampusLocationCatalogSnapshot,
  isCampusLocationCatalogStale,
  setCampusLocationCatalogCache,
  tryGetCampusLocation,
  type CampusLocationRecord,
} from "@/lib/locations/campusLocationCatalog";

function customRow(slug: string): CampusLocationRecord {
  return {
    id: slug,
    slug,
    name: "Custom Hall",
    description: "",
    category: "building",
    latitude: 41.49,
    longitude: -71.53,
    mapX: 40,
    mapY: 40,
    markerEmoji: "🏛",
    shortLabel: "Custom",
    fantasyName: "Custom Hall",
    flavorText: "",
    major: false,
    legacyCampusKey: null,
    sortOrder: 50,
    isBuiltin: false,
    isActive: true,
  };
}

afterEach(() => {
  clearCampusLocationCatalogCache();
});

describe("campus location catalog marker safety", () => {
  it("keeps custom locations after TTL instead of dropping to builtins-only fallback", () => {
    setCampusLocationCatalogCache([customRow("custom-hall")]);
    // Snapshot must keep custom rows even when consumers would previously fall back.
    const snapshot = getCampusLocationCatalogSnapshot();
    expect(snapshot.some((row) => row.slug === "custom-hall")).toBe(true);
    expect(getCampusLocation("custom-hall").name).toBe("Custom Hall");
    // Clearing cache is the only way to drop to static builtins.
    clearCampusLocationCatalogCache();
    expect(getCampusLocationCatalogSnapshot().some((row) => row.slug === "custom-hall")).toBe(false);
  });

  it("never throws for unknown / deleted location ids", () => {
    expect(() => getCampusLocation("deleted-marker-xyz")).not.toThrow();
    expect(getCampusLocation("deleted-marker-xyz").slug).toBe("deleted-marker-xyz");
    expect(tryGetCampusLocation("deleted-marker-xyz")).toBeNull();
    expect(tryGetCampusLocation(null)).toBeNull();
    expect(tryGetCampusLocation("")).toBeNull();
  });

  it("reports stale when cache is empty", () => {
    expect(isCampusLocationCatalogStale()).toBe(true);
    setCampusLocationCatalogCache([customRow("custom-hall")]);
    expect(isCampusLocationCatalogStale()).toBe(false);
  });
});
