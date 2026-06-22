import { describe, expect, it } from "vitest";
import { mapPlayerPublicStats } from "@/lib/server/playerPublicStats";

describe("mapPlayerPublicStats", () => {
  it("maps user_stats into level, xp, and stat totals", () => {
    const result = mapPlayerPublicStats({
      character_class_id: "warrior",
      scholar_guild_id: "engineering",
      streak_days: 3,
      user_stats: {
        level: 14,
        total_xp: 3700,
        strength: 60,
        stamina: 85,
        knowledge: 72,
        social: 75,
        focus: 80,
      },
    });

    expect(result.statsAvailable).toBe(true);
    expect(result.xp).toBe(3700);
    expect(result.level).toBeGreaterThan(1);
    expect(result.stats.strength).toBe(60);
    expect(result.stats.focus).toBe(80);
    expect(result.streakDays).toBe(3);
    expect(result.guild).toBe("Engineering Guild");
  });

  it("falls back to level 1 / 0 xp when stats row is missing", () => {
    const result = mapPlayerPublicStats({
      streak_days: 0,
      user_stats: null,
    });

    expect(result.statsAvailable).toBe(false);
    expect(result.level).toBe(1);
    expect(result.xp).toBe(0);
  });
});
