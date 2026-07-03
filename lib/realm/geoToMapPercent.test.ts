import { describe, expect, it } from "vitest";
import { geoToRealmMapPercent, isValidCampusCoordinate, realmMapPercentToGeo } from "@/lib/realm/geoToMapPercent";
import { REALM_LOCATION_GEO } from "@/lib/realm/locationGeo";

describe("geoToRealmMapPercent / realmMapPercentToGeo", () => {
  it("round-trips campus coordinates through percent space (away from clamp edges)", () => {
    const union = REALM_LOCATION_GEO["memorial-union"];
    const percent = geoToRealmMapPercent(union.latitude, union.longitude);
    const geo = realmMapPercentToGeo(percent.x, percent.y);
    expect(geo.latitude).toBeCloseTo(union.latitude, 4);
    expect(geo.longitude).toBeCloseTo(union.longitude, 4);
  });

  it("inverts percent positions to coordinates inside the campus bounding box", () => {
    const geo = realmMapPercentToGeo(50, 50);
    expect(isValidCampusCoordinate(geo.latitude, geo.longitude)).toBe(true);
    expect(geo.latitude).toBeGreaterThan(41.48);
    expect(geo.latitude).toBeLessThan(41.49);
    expect(geo.longitude).toBeGreaterThan(-71.54);
    expect(geo.longitude).toBeLessThan(-71.52);
  });

  it("rejects null-island and out-of-range coordinates", () => {
    expect(isValidCampusCoordinate(0, 0)).toBe(false);
    expect(isValidCampusCoordinate(91, 0)).toBe(false);
    expect(isValidCampusCoordinate(41.4862, -71.5309)).toBe(true);
  });
});
