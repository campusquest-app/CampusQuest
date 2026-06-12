import { describe, expect, it, vi } from "vitest";
import {
  PILOT_ANALYTICS_TIMEZONE,
  startOfCalendarDayInTimeZone,
  startOfCalendarMonthInTimeZone,
} from "@/lib/server/analyticsTime";

describe("analyticsTime", () => {
  it("computes start of day in America/New_York", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T15:00:00.000Z"));

    const start = startOfCalendarDayInTimeZone(PILOT_ANALYTICS_TIMEZONE);
    expect(start.toISOString()).toBe("2026-06-11T04:00:00.000Z");

    vi.useRealTimers();
  });

  it("computes start of month in America/New_York", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));

    const start = startOfCalendarMonthInTimeZone(PILOT_ANALYTICS_TIMEZONE);
    expect(start.toISOString()).toBe("2026-06-01T04:00:00.000Z");

    vi.useRealTimers();
  });
});
