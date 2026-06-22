import type { Character } from "./types";
import { getEarnedAchievements } from "./achievementEngine";
import { describeCosmeticEquipEffect } from "./gameBuffs";
import { getCosmeticById } from "./cosmetics";
import { getLootLogForCharacter } from "./lootLog";
import {
  CODEX_SCORE_BY_RARITY,
  CODEX_RARITY_ORDER,
  getCodexCatalog,
  type CodexEntry,
  type CodexRarity,
} from "./codexCatalog";

export type CodexItemState = {
  entry: CodexEntry;
  discovered: boolean;
  earnedAt: number | null;
  whereEarned: string | null;
  isEquipped: boolean;
  equipEffect: string | null;
};

export type CodexStats = {
  collectionScore: number;
  discoveredCount: number;
  totalCount: number;
  completionPct: number;
  byRarity: Record<CodexRarity, { discovered: number; total: number }>;
};

export function buildCodexStates(character: Character): CodexItemState[] {
  const catalog = getCodexCatalog();
  const lootLog = getLootLogForCharacter(character.id);
  const discoveredLoot = new Set<string>();
  const firstLootDrop = new Map<string, { bossName: string; obtainedAt: number }>();

  for (const entry of lootLog) {
    discoveredLoot.add(entry.cosmeticId);
    if (!firstLootDrop.has(entry.cosmeticId)) {
      firstLootDrop.set(entry.cosmeticId, { bossName: entry.bossName, obtainedAt: entry.obtainedAt });
    }
  }
  for (const id of character.unlockedCosmetics ?? []) {
    discoveredLoot.add(id);
  }

  const earnedAchievements = new Map(
    getEarnedAchievements(character).map((v) => [
      v.def.id,
      { earnedAt: v.earnedAt, name: v.def.name },
    ]),
  );

  return catalog.map((entry) => {
    if (entry.kind === "loot" && entry.cosmeticId) {
      const drop = firstLootDrop.get(entry.cosmeticId);
      const discovered = discoveredLoot.has(entry.cosmeticId);
      const cosmetic = getCosmeticById(entry.cosmeticId);
      return {
        entry,
        discovered,
        earnedAt: drop?.obtainedAt ?? null,
        whereEarned: drop?.bossName ?? (discovered ? "Campus adventure" : null),
        isEquipped: cosmetic ? character.equippedCosmetics?.[cosmetic.slot] === entry.cosmeticId : false,
        equipEffect: discovered ? describeCosmeticEquipEffect(entry.cosmeticId) : null,
      };
    }

    const earned = entry.achievementId ? earnedAchievements.get(entry.achievementId) : undefined;
    const discovered = Boolean(earned);
    const earnedAtIso = earned?.earnedAt;
    return {
      entry,
      discovered,
      earnedAt: earnedAtIso ? Date.parse(earnedAtIso) : null,
      whereEarned: discovered ? "Trophy Room" : null,
      isEquipped: false,
      equipEffect: null,
    };
  });
}

export function computeCodexStats(states: CodexItemState[]): CodexStats {
  const byRarity = Object.fromEntries(
    CODEX_RARITY_ORDER.map((r) => [r, { discovered: 0, total: 0 }]),
  ) as CodexStats["byRarity"];

  let collectionScore = 0;
  let discoveredCount = 0;

  for (const state of states) {
    const { rarity } = state.entry;
    byRarity[rarity].total += 1;
    if (state.discovered) {
      byRarity[rarity].discovered += 1;
      discoveredCount += 1;
      collectionScore += CODEX_SCORE_BY_RARITY[rarity];
    }
  }

  const totalCount = states.length;
  const completionPct = totalCount > 0 ? Math.round((discoveredCount / totalCount) * 100) : 0;

  return {
    collectionScore,
    discoveredCount,
    totalCount,
    completionPct,
    byRarity,
  };
}
