import { describe, expect, it } from "vitest";
import { connectionItemToFriend } from "@/lib/client/socialConnectionsClient";

describe("connectionItemToFriend", () => {
  it("uses server stats instead of hardcoded defaults", () => {
    const friend = connectionItemToFriend({
      connectionId: "c1",
      userId: "u1",
      username: "alex_rhody",
      displayName: "Alex",
      avatarUrl: null,
      avatarCustomJson: null,
      level: 14,
      xp: 3700,
      streakDays: 5,
      stats: {
        strength: 60,
        stamina: 85,
        knowledge: 72,
        social: 75,
        focus: 80,
      },
      statsAvailable: true,
    });

    expect(friend.level).toBe(14);
    expect(friend.totalXP).toBe(3700);
    expect(friend.streakDays).toBe(5);
    expect(friend.stats.strength).toBe(60);
    expect(friend.stats.focus).toBe(80);
  });

  it("falls back to level 1 / 0 xp only when fields are absent", () => {
    const friend = connectionItemToFriend({
      connectionId: "c1",
      userId: "u1",
      username: "new_ram",
      displayName: "New Ram",
      avatarUrl: null,
      avatarCustomJson: null,
    });

    expect(friend.level).toBe(1);
    expect(friend.totalXP).toBe(0);
  });
});
