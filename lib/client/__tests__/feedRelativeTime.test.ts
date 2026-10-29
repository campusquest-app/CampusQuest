import { describe, expect, it } from "vitest";
import { formatFeedExactTime, formatFeedRelativeTime } from "@/lib/client/feedRelativeTime";

const NOW = Date.parse("2026-10-29T18:00:00.000Z");

describe("formatFeedRelativeTime", () => {
  it("uses compact relative units instead of a calendar date", () => {
    expect(formatFeedRelativeTime(NOW - 20_000, NOW)).toBe("now");
    expect(formatFeedRelativeTime(NOW - 2 * 60_000, NOW)).toBe("2m");
    expect(formatFeedRelativeTime(NOW - 2 * 60 * 60_000, NOW)).toBe("2h");
    expect(formatFeedRelativeTime(NOW - 3 * 24 * 60 * 60_000, NOW)).toBe("3d");
    expect(formatFeedRelativeTime(NOW - 14 * 24 * 60 * 60_000, NOW)).toBe("2w");
  });

  it("keeps an exact local date available", () => {
    const exact = formatFeedExactTime(NOW);
    expect(exact.length).toBeGreaterThan(8);
    expect(exact).not.toBe("2h");
  });
});