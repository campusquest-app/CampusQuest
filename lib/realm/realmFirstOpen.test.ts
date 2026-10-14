import { describe, expect, it } from "vitest";
import { URI_MAP_CENTER, URI_MAP_DEFAULT_ZOOM } from "@/lib/realm/googleMapPose";
import {
  REALM_HEART_OF_CAMPUS,
  REALM_FIRST_OPEN_END_ZOOM,
  discoveryPriorityScore,
  distanceMeters,
  resolveFirstOpenCameraTarget,
} from "@/lib/realm/realmFirstOpen";

describe("resolveFirstOpenCameraTarget", () => {
  it("opens on the URI Kingston campus center", () => {
    const target = resolveFirstOpenCameraTarget({ lat: 41.4891, lng: -71.5295 });
    expect(target.source).toBe("campus-heart");
    expect(target.lat).toBeCloseTo(URI_MAP_CENTER.lat, 4);
    expect(target.lng).toBeCloseTo(URI_MAP_CENTER.lng, 4);
  });

  it("uses the same campus center when location is missing", () => {
    const target = resolveFirstOpenCameraTarget(null);
    expect(target.source).toBe("campus-heart");
    expect(target.lat).toBeCloseTo(URI_MAP_CENTER.lat, 4);
    expect(target.lng).toBeCloseTo(URI_MAP_CENTER.lng, 4);
  });

  it("does not follow off-campus GPS for the initial camera", () => {
    const target = resolveFirstOpenCameraTarget({ lat: 40.7, lng: -74.0 });
    expect(target.source).toBe("campus-heart");
    expect(target.lat).toBeCloseTo(URI_MAP_CENTER.lat, 4);
  });

  it("opens at the default campus zoom", () => {
    expect(REALM_FIRST_OPEN_END_ZOOM).toBe(URI_MAP_DEFAULT_ZOOM);
  });
});

describe("discoveryPriorityScore", () => {
  it("ranks live events and quests above idle majors", () => {
    const live = discoveryPriorityScore({
      hasEvents: true,
      hasQuests: false,
      hasMemories: false,
      major: false,
      distanceM: 400,
    });
    const idleMajor = discoveryPriorityScore({
      hasEvents: false,
      hasQuests: false,
      hasMemories: false,
      major: true,
      distanceM: 50,
    });
    expect(live).toBeGreaterThan(idleMajor);
  });

  it("prefers closer locations when content is equal", () => {
    const near = discoveryPriorityScore({
      hasEvents: false,
      hasQuests: true,
      hasMemories: false,
      major: true,
      distanceM: 80,
    });
    const far = discoveryPriorityScore({
      hasEvents: false,
      hasQuests: true,
      hasMemories: false,
      major: true,
      distanceM: 900,
    });
    expect(near).toBeGreaterThan(far);
  });
});

describe("distanceMeters", () => {
  it("returns ~0 for identical points", () => {
    expect(distanceMeters(REALM_HEART_OF_CAMPUS, REALM_HEART_OF_CAMPUS)).toBeLessThan(1);
  });
});
