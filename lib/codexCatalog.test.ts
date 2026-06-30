import { describe, expect, it } from "vitest";
import {
  getCodexCatalog,
  mapLootRarityToCodex,
  matchesCodexFilter,
} from "./codexCatalog";
import { computeCodexStats, buildCodexStates } from "./codexState";
import type { Character } from "./types";

const baseCharacter = {
  id: "test-char",
  name: "Test",
  username: "test",
  avatar: "🧑",
  level: 5,
  totalXP: 0,
  xp: 0,
  classId: "explorer",
  stats: { strength: 1, stamina: 1, knowledge: 1, social: 1, focus: 1 },
  streakDays: 0,
  lastActivityDate: null,
  unlockedCosmetics: ["hat:cap"],
  equippedCosmetics: {},
  achievements: [],
  createdAt: Date.now(),
  foundingMember: true,
  betaTester: false,
  talentPioneer: false,
} as Character;

describe("codexCatalog", () => {
  it("includes loot and achievements", () => {
    const catalog = getCodexCatalog();
    expect(catalog.some((e) => e.kind === "loot")).toBe(true);
    expect(catalog.some((e) => e.kind === "achievement")).toBe(true);
    expect(catalog.some((e) => e.achievementId === "founding_student")).toBe(true);
  });

  it("maps loot rarity to codex tiers", () => {
    expect(mapLootRarityToCodex("common")).toBe("common");
    expect(mapLootRarityToCodex("uncommon")).toBe("rare");
    expect(mapLootRarityToCodex("rare")).toBe("epic");
    expect(mapLootRarityToCodex("legendary")).toBe("legendary");
  });

  it("filters by rarity", () => {
    const legendary = getCodexCatalog().find((e) => e.rarity === "legendary")!;
    expect(matchesCodexFilter(legendary, "legendary")).toBe(true);
    expect(matchesCodexFilter(legendary, "common")).toBe(false);
    expect(matchesCodexFilter(legendary, null)).toBe(true);
  });
});

describe("codexState", () => {
  it("computes collection stats", () => {
    const states = buildCodexStates(baseCharacter);
    const stats = computeCodexStats(states);
    expect(stats.totalCount).toBeGreaterThan(50);
    expect(stats.discoveredCount).toBeGreaterThan(0);
    expect(stats.completionPct).toBeGreaterThanOrEqual(0);
    expect(stats.completionPct).toBeLessThanOrEqual(100);
  });
});
