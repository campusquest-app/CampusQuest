import { describe, expect, it } from "vitest";
import { buildUserStatePatchBodies } from "@/lib/client/gameStateSync";
import type { Character } from "@/lib/types";

function minimalCharacter(overrides: Partial<Character> = {}): Character {
  const base: Character = {
    id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
    name: "Sam",
    username: "sam_rpg",
    avatar: '{"v":2}',
    level: 5,
    totalXP: 1200,
    stats: { strength: 2, stamina: 3, knowledge: 4, social: 5, focus: 6 },
    streakDays: 0,
    lastActivityDate: null,
    achievements: [],
    unlockedCosmetics: [],
    createdAt: Date.now(),
    unlockedSkillNodes: [],
    streakFreezes: 0,
    quadAssistScore: 0,
    bossesDefeatedCount: 2,
    finalBossesDefeatedCount: 3,
    scholarGuildId: "engineering",
    equippedCosmetics: { hat: "h1" },
    guildIds: [],
  };
  return { ...base, ...overrides };
}

describe("buildUserStatePatchBodies", () => {
  it("includes stats, profile identity, bio, guild/class/weapons, equipment snapshot, and final boss count", () => {
    const c = minimalCharacter({
      bio: " URI rower ",
      classId: "knight",
      starterWeapon: "textbook",
      scholarGuildId: "arts",
    });
    const { stats, profile } = buildUserStatePatchBodies(c);

    expect(stats.totalXp).toBe(1200);
    expect(stats.finalBossesDefeated).toBe(3);
    expect(stats.bossesDefeated).toBe(2);
    expect(profile.displayName).toBe("Sam");
    expect(profile.username).toBe("sam_rpg");
    expect(profile.avatarCustomJson).toBe('{"v":2}');
    expect(profile.bio).toBe("URI rower");
    expect(profile.characterClassId).toBe("knight");
    expect(profile.starterWeapon).toBe("textbook");
    expect(profile.scholarGuildId).toBe("arts");
    const gs = profile.gameStateJson as Record<string, unknown>;
    expect(gs.equippedCosmetics).toEqual({ hat: "h1" });
    expect(gs.finalBossesDefeatedCount).toBe(3);
  });

  it("maps undecided scholar guild to null", () => {
    const c = minimalCharacter({ scholarGuildId: "undecided" });
    const { profile } = buildUserStatePatchBodies(c);
    expect(profile.scholarGuildId).toBeNull();
  });
});
