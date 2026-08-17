import { describe, expect, it } from "vitest";
import { buildLocationActivityStatus } from "@/lib/realm/locationActivityStatus";

describe("buildActivityStatus", () => {
  it("uses one clear empty status", () => {
    expect(buildLocationActivityStatus({ events: 0, quests: 0, memories: 0 })).toBe(
      "Nothing happening here right now",
    );
  });

  it("omits zero-value categories", () => {
    expect(buildLocationActivityStatus({ events: 2, quests: 0, memories: 0 })).toBe(
      "2 events happening here",
    );
    expect(buildLocationActivityStatus({ events: 0, quests: 1, memories: 0 })).toBe(
      "1 quest happening here",
    );
  });

  it("joins only useful activity counts", () => {
    expect(buildLocationActivityStatus({ events: 3, quests: 1, memories: 2 })).toBe(
      "3 events · 1 quest · 2 memories happening here",
    );
  });

  it("shows a single loading status while activity is resolving", () => {
    expect(buildLocationActivityStatus({ events: 0, quests: 0, loading: true })).toBe(
      "Checking what’s happening here…",
    );
  });
});
