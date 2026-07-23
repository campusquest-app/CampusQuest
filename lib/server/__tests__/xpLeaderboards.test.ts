import { describe, expect, it } from "vitest";
import {
  mapProfileToLeaderboardEntry,
  sortAndRank,
  type LeaderboardXpRow,
} from "@/lib/server/xpLeaderboards";

describe("sortAndRank", () => {
  const base = (overrides: Partial<Omit<LeaderboardXpRow, "rank">>): Omit<LeaderboardXpRow, "rank"> => ({
    userId: "u1",
    username: "alpha",
    displayName: "Alpha",
    level: 1,
    totalXp: 0,
    streakDays: 0,
    avatar: "🎓",
    profileImageUrl: null,
    avatarImageUrl: null,
    avatarType: "initials",
    strength: 0,
    stamina: 0,
    knowledge: 0,
    social: 0,
    focus: 0,
    bossesDefeated: 0,
    finalBossesDefeated: 0,
    ...overrides,
  });

  it("ranks by total XP desc, then level, then display name and username", () => {
    const ranked = sortAndRank(
      [
        base({ userId: "a", username: "a", level: 10, totalXp: 7000 }),
        base({ userId: "b", username: "b", level: 12, totalXp: 8000 }),
        base({ userId: "c", username: "c", level: 12, totalXp: 8000, streakDays: 3 }),
        base({ userId: "d", username: "d", level: 14, totalXp: 6000, streakDays: 5 }),
      ],
      "totalXp",
    );

    expect(ranked.map((row) => row.userId)).toEqual(["b", "c", "a", "d"]);
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[3]?.rank).toBe(4);
  });

  it("ranks by level desc when mode is level", () => {
    const ranked = sortAndRank(
      [
        base({ userId: "a", username: "a", level: 10, totalXp: 100, streakDays: 1 }),
        base({ userId: "b", username: "b", level: 12, totalXp: 50, streakDays: 0 }),
        base({ userId: "c", username: "c", level: 12, totalXp: 200, streakDays: 0 }),
        base({ userId: "d", username: "d", level: 12, totalXp: 200, streakDays: 5 }),
      ],
      "level",
    );

    expect(ranked.map((row) => row.userId)).toEqual(["c", "d", "b", "a"]);
  });
});

describe("mapProfileToLeaderboardEntry", () => {
  it("includes users without user_stats using safe defaults", () => {
    const entry = mapProfileToLeaderboardEntry({
      id: "user-1",
      username: "sam_rhody",
      display_name: "Sam",
      avatar_url: null,
      avatar_custom_json: null,
      streak_days: 4,
      user_stats: null,
    });

    expect(entry.level).toBe(1);
    expect(entry.totalXp).toBe(0);
    expect(entry.streakDays).toBe(4);
    expect(entry.displayName).toBe("Sam");
    expect(entry.profileImageUrl).toBeNull();
    expect(entry.avatarImageUrl).toBeNull();
    expect(entry.avatarType).toBe("initials");
  });

  it("exposes photo fields when avatar_url is valid", () => {
    const entry = mapProfileToLeaderboardEntry({
      id: "user-photo",
      username: "pat",
      display_name: "Pat",
      avatar_url: "https://cdn.example.com/pat.jpg",
      avatar_custom_json: null,
      streak_days: 0,
      user_stats: null,
    });
    expect(entry.profileImageUrl).toBe("https://cdn.example.com/pat.jpg");
    expect(entry.avatarType).toBe("photo");
  });

  it("derives level from total_xp", () => {
    const entry = mapProfileToLeaderboardEntry({
      id: "user-2",
      username: "alex",
      display_name: "Alex",
      avatar_url: null,
      avatar_custom_json: null,
      streak_days: 0,
      user_stats: { total_xp: 500, level: 1 },
    });

    expect(entry.totalXp).toBe(500);
    expect(entry.level).toBeGreaterThan(1);
  });
});
