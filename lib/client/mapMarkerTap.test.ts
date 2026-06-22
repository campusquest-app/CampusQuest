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
});
