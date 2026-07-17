import { describe, expect, it } from "vitest";
import {
  REALM_HEART_OF_CAMPUS,
  discoveryPriorityScore,
  distanceMeters,
  resolveFirstOpenCameraTarget,
} from "@/lib/realm/realmFirstOpen";

describe("resolveFirstOpenCameraTarget", () => {
  it("uses the user position when it is on campus", () => {
    const target = resolveFirstOpenCameraTarget({ lat: 41.487, lng: -71.5305 });
    expect(target.source).toBe("user");
    expect(target.lat).toBeCloseTo(41.487, 3);
  });

  it("falls back to the campus heart when location is missing", () => {
    const target = resolveFirstOpenCameraTarget(null);
    expect(target.source).toBe("campus-heart");
    expect(target.lat).toBeCloseTo(REALM_HEART_OF_CAMPUS.lat, 4);
    expect(target.lng).toBeCloseTo(REALM_HEART_OF_CAMPUS.lng, 4);
  });

  it("rejects fixes far from Kingston campus", () => {
    const target = resolveFirstOpenCameraTarget({ lat: 40.7, lng: -74.0 });
    expect(target.source).toBe("campus-heart");
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
