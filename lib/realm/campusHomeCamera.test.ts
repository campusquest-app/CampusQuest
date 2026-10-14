import { describe, expect, it, vi, afterEach } from "vitest";
import { URI_MAP_CENTER, URI_MAP_DEFAULT_ZOOM } from "@/lib/realm/googleMapPose";
import { returnToCampusHome, shouldShowBackToCampus } from "@/lib/realm/campusHomeCamera";

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

  it("appears from Narragansett, Providence, or another state", () => {
    expect(shouldShowBackToCampus({ ...home, lat: 41.4501, lng: -71.4495 }, false)).toBe(true);
    expect(shouldShowBackToCampus({ ...home, lat: 41.8235, lng: -71.4128 }, false)).toBe(true);
    expect(shouldShowBackToCampus({ ...home, lat: 40.7128, lng: -74.006 }, false)).toBe(true);
  });

  it("appears when zoom leaves the campus overview", () => {
    expect(shouldShowBackToCampus({ ...home, zoom: 15 }, false)).toBe(true);
  });
});

describe("returnToCampusHome", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockMap() {
    return {
      panTo: vi.fn(),
      setZoom: vi.fn(),
      setHeading: vi.fn(),
      setTilt: vi.fn(),
      setCenter: vi.fn(),
      moveCamera: vi.fn(),
      getCenter: vi.fn(() => ({ lat: () => 41.82, lng: () => -71.41 })),
      getZoom: vi.fn(() => 12),
      getHeading: vi.fn(() => 40),
      getTilt: vi.fn(() => 45),
    };
  }

  it("animates to the canonical URI center and zoom without GPS", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    const map = mockMap();
    returnToCampusHome(map as unknown as google.maps.Map);
    expect(map.panTo).toHaveBeenCalledWith(URI_MAP_CENTER);
    expect(map.setZoom).toHaveBeenCalledWith(URI_MAP_DEFAULT_ZOOM);
    expect(map.setHeading).toHaveBeenCalledWith(0);
    expect(map.setTilt).toHaveBeenCalledWith(0);
    expect(map.moveCamera).not.toHaveBeenCalled();
  });

  it("jumps instantly when reduced motion is preferred", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    const map = mockMap();
    returnToCampusHome(map as unknown as google.maps.Map);
    expect(map.moveCamera).toHaveBeenCalledWith(
      expect.objectContaining({
        center: URI_MAP_CENTER,
        zoom: URI_MAP_DEFAULT_ZOOM,
        heading: 0,
        tilt: 0,
      }),
    );
    expect(map.panTo).not.toHaveBeenCalled();
  });
});
