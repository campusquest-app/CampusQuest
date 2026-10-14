import { describe, expect, it } from "vitest";
import { URI_MAP_CENTER, URI_MAP_DEFAULT_ZOOM } from "@/lib/realm/googleMapPose";
import { shouldShowBackToCampus } from "@/lib/realm/campusHomeCamera";

const home = {
  lat: URI_MAP_CENTER.lat,
  lng: URI_MAP_CENTER.lng,
  zoom: URI_MAP_DEFAULT_ZOOM,
  heading: 0,
  tilt: 0,
};

describe("shouldShowBackToCampus", () => {
  it("stays hidden on the default URI campus pose", () => {
    expect(shouldShowBackToCampus(home, false)).toBe(false);
  });

  it("appears after a real pan and stays up until the camera is home again", () => {
    const away = { ...home, lat: home.lat + 0.02 };
    expect(shouldShowBackToCampus(away, false)).toBe(true);
    const almostHome = { ...home, lat: home.lat + 0.001 };
    expect(shouldShowBackToCampus(almostHome, true)).toBe(true);
    expect(shouldShowBackToCampus(home, true)).toBe(false);
  });

  it("does not depend on a GPS fix", () => {
    expect(shouldShowBackToCampus({ ...home, zoom: 14 }, false)).toBe(true);
    expect(shouldShowBackToCampus({ ...home, heading: 40 }, false)).toBe(true);
  });
});
