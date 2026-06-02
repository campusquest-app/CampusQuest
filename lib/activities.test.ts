import { describe, expect, it } from "vitest";
import { getActivityById } from "@/lib/activities";

describe("gym activity rewards", () => {
  it("awards 80 XP for manual gym logs", () => {
    const gym = getActivityById("gym");
    expect(gym).toBeDefined();
    expect(gym?.xp).toBe(80);
    expect(gym?.baseXp).toBe(80);
  });

  it("does not change other activity XP values", () => {
    expect(getActivityById("club")?.xp).toBe(10);
    expect(getActivityById("study")?.xp).toBe(20);
    expect(getActivityById("weights")?.xp).toBe(28);
  });
});
