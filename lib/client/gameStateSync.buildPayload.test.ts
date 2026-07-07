process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

import { vi } from "vitest";

vi.mock("@/lib/client/dashboardApi", () => ({
  patchAuthed: vi.fn(),
  fetchAuthed: vi.fn(),
}));
vi.mock("@/lib/client/apiSession", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/client/logoutPrepare", () => ({
  runLogoutPrepares: vi.fn(),
}));

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
  it("never includes stats, XP, bio, or streak fields in profile sync payload", () => {
    const c = minimalCharacter({
      bio: " URI rower ",
      classId: "knight",
      starterWeapon: "textbook",
      scholarGuildId: "arts",
      streakDays: 9,
      lastActivityDate: "2026-07-01",
    });
    const { profile } = buildUserStatePatchBodies(c);

    expect(profile).not.toHaveProperty("totalXp");
    expect(profile).not.toHaveProperty("stats");
    expect(profile).not.toHaveProperty("bio");
    expect(profile).not.toHaveProperty("streakDays");
    expect(profile).not.toHaveProperty("lastActivityDate");
    expect(profile.displayName).toBeUndefined();
    expect(profile.username).toBeUndefined();
    expect(profile.avatarCustomJson).toBe('{"v":2}');
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
