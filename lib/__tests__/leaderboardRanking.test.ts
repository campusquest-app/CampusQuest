import { describe, expect, it } from "vitest";
import {
  compareScholarGuildMemberEntries,
  compareXpLeaderboardEntries,
  sortAndRankXpEntries,
} from "@/lib/leaderboardRanking";

describe("compareXpLeaderboardEntries", () => {
  it("sorts by total XP descending", () => {
    expect(
      compareXpLeaderboardEntries(
        { userId: "a", username: "a", displayName: "A", level: 5, totalXp: 100 },
        { userId: "b", username: "b", displayName: "B", level: 5, totalXp: 200 },
      ),
    ).toBeGreaterThan(0);
  });

  it("breaks XP ties with higher level first", () => {
    expect(
      compareXpLeaderboardEntries(
        { userId: "a", username: "a", displayName: "A", level: 10, totalXp: 500 },
        { userId: "b", username: "b", displayName: "B", level: 12, totalXp: 500 },
      ),
    ).toBeGreaterThan(0);
  });

  it("breaks level ties with display name then username", () => {
    expect(
      compareXpLeaderboardEntries(
        { userId: "z", username: "zulu", displayName: "Zara", level: 3, totalXp: 100 },
        { userId: "a", username: "alpha", displayName: "Aaron", level: 3, totalXp: 100 },
      ),
    ).toBeGreaterThan(0);
  });
});

describe("sortAndRankXpEntries", () => {
  it("assigns ranks from sorted order", () => {
    const ranked = sortAndRankXpEntries([
      { userId: "low", username: "low", displayName: "Low", level: 1, totalXp: 10 },
      { userId: "high", username: "high", displayName: "High", level: 5, totalXp: 500 },
    ]);

    expect(ranked.map((row) => row.userId)).toEqual(["high", "low"]);
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[1]?.rank).toBe(2);
  });
});

describe("compareScholarGuildMemberEntries", () => {
  it("sorts scholar guild members by XP descending", () => {
    const members = [
      { name: "Chris", totalXP: 120 },
      { name: "Alex", totalXP: 440 },
      { name: "Sam", totalXP: 360 },
    ];
    members.sort(compareScholarGuildMemberEntries);
    expect(members.map((row) => row.name)).toEqual(["Alex", "Sam", "Chris"]);
  });
});
