import { afterEach, describe, expect, it } from "vitest";
import {
  campusLocationIdFromLegacyKey,
  clearCampusLocationCatalogCache,
  getCampusLocation,
  getCampusLocationCatalogSnapshot,
  isCampusLocationCatalogStale,
  listCampusLocationRegistryEntries,
  realmLocationsFromCatalog,
  setCampusLocationCatalogCache,
  tryGetCampusLocation,
  type CampusLocationRecord,
} from "@/lib/locations/campusLocationCatalog";
import { REALM_LOCATION_GEO } from "@/lib/realm/locationGeo";
import { matchCampusLocation } from "@/lib/server/urinvolved/locationAliases";
import { resolveDiningLocationId } from "@/lib/dining/uriDiningLocations";

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
    const snapshot = getCampusLocationCatalogSnapshot();
    expect(snapshot.some((row) => row.slug === "custom-hall")).toBe(true);
    expect(getCampusLocation("custom-hall").name).toBe("Custom Hall");
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

  it("splits dining into Butterfield + Mainfare and hides generic Dining Hall", () => {
    const active = listCampusLocationRegistryEntries(false);
    const slugs = active.map((row) => row.slug);
    expect(slugs).toContain("butterfield-dining");
    expect(slugs).toContain("mainfare-dining");
    expect(slugs).not.toContain("dining-hall");

    const quad = slugs.indexOf("the-quad");
    const butterfield = slugs.indexOf("butterfield-dining");
    const mainfare = slugs.indexOf("mainfare-dining");
    const union = slugs.indexOf("memorial-union");
    expect(quad).toBeLessThan(butterfield);
    expect(butterfield).toBeLessThan(mainfare);
    expect(mainfare).toBeLessThan(union);

    expect(getCampusLocation("butterfield-dining").name).toBe("Butterfield Dining Hall");
    expect(getCampusLocation("mainfare-dining").name).toBe("Mainfare Dining Hall");
    expect(campusLocationIdFromLegacyKey("dining_hall")).toBe("butterfield-dining");

    const retired = listCampusLocationRegistryEntries(true).find((r) => r.slug === "dining-hall");
    expect(retired?.isActive).toBe(false);
  });

  it("exposes distinct coordinates and Walk Here destinations", () => {
    const bf = REALM_LOCATION_GEO["butterfield-dining"];
    const mf = REALM_LOCATION_GEO["mainfare-dining"];
    expect(bf).toEqual({ latitude: 41.4862, longitude: -71.5284 });
    expect(mf).toEqual({ latitude: 41.4891, longitude: -71.5295 });
    expect(bf.latitude).not.toEqual(mf.latitude);
    expect(bf.longitude).not.toEqual(mf.longitude);

    const mapPins = realmLocationsFromCatalog();
    expect(mapPins.some((l) => l.id === "dining-hall")).toBe(false);
    expect(mapPins.find((l) => l.id === "butterfield-dining")?.name).toBe("Butterfield Dining Hall");
    expect(mapPins.find((l) => l.id === "mainfare-dining")?.name).toBe("Mainfare Dining Hall");
  });
});

describe("dining event / search aliases", () => {
  it("matches Butterfield and Mainfare / Hope Commons separately", () => {
    expect(matchCampusLocation("Butterfield Dining Hall")?.realmLocationId).toBe("butterfield-dining");
    expect(matchCampusLocation("Mainfare")?.realmLocationId).toBe("mainfare-dining");
    expect(matchCampusLocation("Hope Commons")?.realmLocationId).toBe("mainfare-dining");
    expect(matchCampusLocation("Hope Commons Mainfare")?.realmLocationId).toBe("mainfare-dining");
  });

  it("does not force generic Dining Hall onto an active pin", () => {
    expect(matchCampusLocation("Dining Hall")).toBeNull();
    expect(listCampusLocationRegistryEntries(false).some((r) => r.slug === "dining-hall")).toBe(false);
  });

  it("maps NetNutrition dining ids from CampusQuest slugs", () => {
    expect(resolveDiningLocationId("butterfield-dining")).toBe("butterfield");
    expect(resolveDiningLocationId("mainfare-dining")).toBe("mainfare");
    expect(resolveDiningLocationId("dining-hall")).toBe("butterfield");
  });
});
