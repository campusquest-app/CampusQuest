import { describe, expect, it } from "vitest";
import {
  REALM_HEART_OF_CAMPUS,
  REALM_DISCOVERY_OVERVIEW_CENTER,
  REALM_FIRST_OPEN_END_ZOOM,
  discoveryPriorityScore,
  distanceMeters,
  resolveFirstOpenCameraTarget,
} from "@/lib/realm/realmFirstOpen";

describe("resolveFirstOpenCameraTarget", () => {
  it("opens on a campus overview instead of a dining-hall close-up", () => {
    const target = resolveFirstOpenCameraTarget({ lat: 41.4891, lng: -71.5295 });
    expect(target.source).toBe("campus-heart");
    expect(target.lat).toBeCloseTo(REALM_DISCOVERY_OVERVIEW_CENTER.lat, 4);
    expect(target.lng).toBeCloseTo(REALM_DISCOVERY_OVERVIEW_CENTER.lng, 4);
    expect(target.lat).toBeGreaterThan(41.4849);
    expect(target.lat).toBeLessThan(41.4891);
  });

  it("uses the same overview when location is missing", () => {
    const target = resolveFirstOpenCameraTarget(null);
    expect(target.source).toBe("campus-heart");
    expect(target.lat).toBeCloseTo(REALM_DISCOVERY_OVERVIEW_CENTER.lat, 4);
  });

  it("does not follow off-campus GPS for the initial camera", () => {
    const target = resolveFirstOpenCameraTarget({ lat: 40.7, lng: -74.0 });
    expect(target.source).toBe("campus-heart");
  });

  it("keeps the first-open zoom in the campus-overview band", () => {
    expect(REALM_FIRST_OPEN_END_ZOOM).toBeGreaterThanOrEqual(15.4);
    expect(REALM_FIRST_OPEN_END_ZOOM).toBeLessThan(16.1);
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
