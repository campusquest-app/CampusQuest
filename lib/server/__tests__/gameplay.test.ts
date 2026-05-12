import { describe, expect, it } from "vitest";
import {
  calculateActivityXp,
  calculateBossDamage,
  calculateLevelProgression,
  updateStreak,
} from "../gameplay";

describe("gameplay helpers", () => {
  it("calculates level progression deterministically", () => {
    const result = calculateLevelProgression(1080);
    expect(result.level).toBeGreaterThan(1);
    expect(result.totalXp).toBe(1080);
    expect(result.progress).toBeGreaterThanOrEqual(0);
    expect(result.progress).toBeLessThanOrEqual(1);
  });

  it("applies streak and minute bonuses to activity xp", () => {
    const xp = calculateActivityXp(40, 5, 50);
    expect(xp).toBeGreaterThan(40);
  });

  it("increments streak on consecutive day", () => {
    const next = updateStreak("2026-05-10", new Date("2026-05-11T14:00:00.000Z"));
    expect(next.streakDays).toBe("increment");
    expect(next.lastActivityDate).toBe("2026-05-11");
  });

  it("returns positive boss damage", () => {
    const result = calculateBossDamage({
      level: 6,
      stats: { strength: 60, stamina: 70, knowledge: 65, social: 30, focus: 55 },
      activityStat: "knowledge",
    });
    expect(result.damage).toBeGreaterThan(0);
  });
});

