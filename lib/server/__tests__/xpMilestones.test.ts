import { describe, expect, it } from "vitest";
import { XP_UNLOCK_MILESTONES } from "@/lib/server/xpMilestones";

function crossed(previousTotalXp: number, currentTotalXp: number, threshold: number): boolean {
  return previousTotalXp < threshold && currentTotalXp >= threshold;
}

describe("xp milestone crossing", () => {
  it("unlocks only when crossing the threshold", () => {
    const threshold = XP_UNLOCK_MILESTONES[0].threshold;
    expect(crossed(299, 300, threshold)).toBe(true);
    expect(crossed(300, 350, threshold)).toBe(false);
    expect(crossed(350, 400, threshold)).toBe(false);
    expect(crossed(250, 299, threshold)).toBe(false);
  });
});
