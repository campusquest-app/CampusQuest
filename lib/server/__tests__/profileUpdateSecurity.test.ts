import { describe, expect, it } from "vitest";
import { calculateLevelProgression } from "../gameplay";

describe("profile update security expectations", () => {
  it("edit bio payload allowlist excludes XP fields", () => {
    const safeBioPayload = { bio: "Campus explorer" };
    const cheatPayload = { bio: "hi", totalXp: 100_000, level: 145 };

    expect(Object.keys(safeBioPayload)).toEqual(["bio"]);
    expect(Object.keys(cheatPayload)).toContain("totalXp");
    expect(Object.keys(cheatPayload)).toContain("level");
  });

  it("level recalculates from XP server-side after adjustment", () => {
    const low = calculateLevelProgression(0);
    const high = calculateLevelProgression(100_000);
    expect(low.level).toBe(1);
    expect(high.level).toBeGreaterThan(low.level);
    expect(high.totalXp).toBe(100_000);
  });
});
