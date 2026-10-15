import { describe, expect, it, vi, afterEach } from "vitest";
import { URI_MAP_CENTER, URI_MAP_3D_VIEW_TILT, URI_MAP_3D_VIEW_ZOOM } from "@/lib/realm/googleMapPose";
import {
  CAMPUS_HOME_TILT,
  CAMPUS_HOME_ZOOM,
  returnToCampusHome,
  shouldShowBackToCampus,
} from "@/lib/realm/campusHomeCamera";

const home = {
  lat: URI_MAP_CENTER.lat,
  lng: URI_MAP_CENTER.lng,
  zoom: CAMPUS_HOME_ZOOM,
  heading: 0,
  tilt: CAMPUS_HOME_TILT,
};

describe("campus home camera defaults", () => {
  it("targets a cinematic tilted campus frame", () => {
    expect(CAMPUS_HOME_TILT).toBe(URI_MAP_3D_VIEW_TILT);
    expect(CAMPUS_HOME_TILT).toBeGreaterThanOrEqual(55);
    expect(CAMPUS_HOME_TILT).toBeLessThanOrEqual(67.5);
    expect(CAMPUS_HOME_ZOOM).toBe(URI_MAP_3D_VIEW_ZOOM);
    expect(CAMPUS_HOME_ZOOM).toBeGreaterThanOrEqual(17);
  });
});

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

  it("appears when tilt leaves the cinematic home band", () => {
    expect(shouldShowBackToCampus({ ...home, tilt: 0 }, false)).toBe(true);
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
      getTilt: vi.fn(() => 0),
    };
  }

  it("animates to the canonical URI center, zoom, and cinematic tilt without GPS", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
      setTimeout: (fn: () => void) => {
        fn();
        return 0;
      },
      sessionStorage: { removeItem: vi.fn() },
    });
    const map = mockMap();
    returnToCampusHome(map as unknown as google.maps.Map);
    expect(map.panTo).toHaveBeenCalledWith(URI_MAP_CENTER);
    expect(map.setZoom).toHaveBeenCalledWith(CAMPUS_HOME_ZOOM);
    expect(map.setHeading).toHaveBeenCalledWith(0);
    expect(map.setTilt).toHaveBeenCalledWith(CAMPUS_HOME_TILT);
  });

  it("jumps instantly when reduced motion is preferred", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
      sessionStorage: { removeItem: vi.fn() },
    });
    const map = mockMap();
    returnToCampusHome(map as unknown as google.maps.Map);
    expect(map.moveCamera).toHaveBeenCalledWith(
      expect.objectContaining({
        center: URI_MAP_CENTER,
        zoom: CAMPUS_HOME_ZOOM,
        heading: 0,
        tilt: CAMPUS_HOME_TILT,
      }),
    );
    expect(map.panTo).not.toHaveBeenCalled();
  });
});
