import { describe, expect, it } from "vitest";
import { buildApproximateCampusRoute, haversineMeters } from "./approximateCampusRoute";

describe("approximateCampusRoute", () => {
  it("computes haversine distance in meters", () => {
    const meters = haversineMeters(
      { lat: 41.4862, lng: -71.5309 },
      { lat: 41.4871, lng: -71.5305 },
    );
    expect(meters).toBeGreaterThan(50);
    expect(meters).toBeLessThan(500);
  });

  it("builds a two-point approximate walking route", () => {
    const route = buildApproximateCampusRoute({
      origin: {
        lat: 41.4862,
        lng: -71.5309,
        label: "The Quad",
        usedFallback: true,
        hint: null,
      },
      destination: { lat: 41.4871, lng: -71.5305, label: "Library" },
    });

    expect(route.path).toHaveLength(2);
    expect(route.summary.approximate).toBe(true);
    expect(route.summary.stepsCount).toBe(1);
    expect(route.summary.durationText.length).toBeGreaterThan(0);
  });
});
