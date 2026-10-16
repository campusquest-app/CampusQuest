import { describe, expect, it } from "vitest";
import {
  campusLocationGeoFromMarkerPosition,
  isMissingRealmConfigTableError,
  MARKER_POSITIONS_CONFIG_KEY,
} from "@/lib/server/realmMarkerPositions";

describe("realmMarkerPositions", () => {
  it("uses marker_positions config key", () => {
    expect(MARKER_POSITIONS_CONFIG_KEY).toBe("marker_positions");
  });

  it("detects missing campus_realm_config table errors", () => {
    expect(
      isMissingRealmConfigTableError({
        message: "Could not find the table 'public.campus_realm_config' in the schema cache",
      }),
    ).toBe(true);
    expect(isMissingRealmConfigTableError({ code: "42P01", message: "undefined_table" })).toBe(true);
    expect(isMissingRealmConfigTableError({ message: "permission denied" })).toBe(false);
  });

  it("persists Edit Map geo onto campus_locations fields", () => {
    const withGeo = campusLocationGeoFromMarkerPosition({
      x: 42.5,
      y: 61.2,
      lat: 41.4853,
      lng: -71.5319,
    });
    expect(withGeo).toEqual({
      latitude: 41.4853,
      longitude: -71.5319,
      mapX: 42.5,
      mapY: 61.2,
    });

    const percentOnly = campusLocationGeoFromMarkerPosition({ x: 50, y: 50 });
    expect(percentOnly.mapX).toBe(50);
    expect(percentOnly.mapY).toBe(50);
    expect(percentOnly.latitude).toBeGreaterThan(41);
    expect(percentOnly.longitude).toBeLessThan(-71);
  });
});
