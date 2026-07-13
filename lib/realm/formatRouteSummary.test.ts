import { describe, expect, it } from "vitest";
import {
  estimateFootsteps,
  formatArrivalTime,
  formatFootstepsLine,
  formatRouteStatsLine,
} from "@/lib/realm/formatRouteSummary";

describe("formatRouteSummary", () => {
  it("formats duration and distance without turns", () => {
    expect(
      formatRouteStatsLine({ durationText: "7 mins", distanceText: "0.4 mi", turnCount: 0 }),
    ).toBe("7 mins • 0.4 mi");
  });

  it("includes turn count, never steps", () => {
    expect(
      formatRouteStatsLine({ durationText: "7 mins", distanceText: "0.4 mi", turnCount: 9 }),
    ).toBe("7 mins • 0.4 mi • 9 turns");
  });

  it("estimates footsteps from distance", () => {
    expect(estimateFootsteps(643.7)).toBe(825); // ~0.4 mi
    expect(formatFootstepsLine(643.7)).toBe("~825 footsteps");
  });

  it("formats arrival time", () => {
    const now = new Date("2026-07-09T18:00:00.000Z");
    const label = formatArrivalTime(7 * 60, now);
    expect(label).toMatch(/\d+:\d{2}/);
  });
});
