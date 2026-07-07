import { describe, expect, it } from "vitest";
import {
  findForbiddenProfileMutationFields,
  mergeSanitizedGameStateJson,
  sanitizeClientGameStateJson,
} from "../profileSecurity";

describe("profileSecurity", () => {
  it("detects forbidden XP and stat fields in profile payloads", () => {
    const blocked = findForbiddenProfileMutationFields({
      bio: "hello",
      totalXp: 100_000,
      level: 145,
      strength: 99,
    });
    expect(blocked).toContain("totalXp");
    expect(blocked).toContain("level");
    expect(blocked).toContain("strength");
    expect(blocked).not.toContain("bio");
  });

  it("strips untrusted game state keys while preserving server-owned values", () => {
    const merged = mergeSanitizedGameStateJson(
      {
        achievements: ["torch_bearer_badge"],
        foundingMember: true,
        equippedCosmetics: { hat: "old" },
      },
      {
        achievements: ["fake_badge"],
        totalXP: 99999,
        equippedCosmetics: { hat: "new" },
        unlockedCosmetics: ["c1"],
      },
    );
    expect(merged.achievements).toEqual(["torch_bearer_badge"]);
    expect(merged.equippedCosmetics).toEqual({ hat: "new" });
    expect(merged.unlockedCosmetics).toEqual(["c1"]);
    expect(merged).not.toHaveProperty("totalXP");
    expect(merged.foundingMember).toBe(true);
  });

  it("sanitizeClientGameStateJson only keeps cosmetic-safe keys", () => {
    expect(
      sanitizeClientGameStateJson({
        equippedCosmetics: { glasses: "g1" },
        questChainProgress: { q1: 5 },
        xp: 5000,
      }),
    ).toEqual({ equippedCosmetics: { glasses: "g1" } });
  });
});
