import { describe, expect, it } from "vitest";
import { shouldFireMapMarkerTap } from "./mapMarkerTap";

describe("shouldFireMapMarkerTap", () => {
  it("accepts a short stationary tap", () => {
    expect(
      shouldFireMapMarkerTap(
        { x: 10, y: 10, t: 1000 },
        { x: 12, y: 11, now: 1100 },
      ),
    ).toBe(true);
  });

  it("rejects drags that move too far", () => {
    expect(
      shouldFireMapMarkerTap(
        { x: 10, y: 10, t: 1000 },
        { x: 40, y: 10, now: 1100 },
      ),
    ).toBe(false);
  });

  it("rejects long presses that exceed the tap window", () => {
    expect(
      shouldFireMapMarkerTap(
        { x: 10, y: 10, t: 1000 },
        { x: 10, y: 10, now: 2000 },
      ),
    ).toBe(false);
  });

  it("accepts small finger jitter within the tap threshold", () => {
    expect(
      shouldFireMapMarkerTap(
        { x: 100, y: 200, t: 500 },
        { x: 108, y: 205, now: 720 },
      ),
    ).toBe(true);
  });
});
