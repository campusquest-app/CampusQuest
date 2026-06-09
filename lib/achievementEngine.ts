import type { Character } from "./types";
import { getActivityLogs } from "./store";
import { getClassTitle } from "./characterClasses";
import {
  ACHIEVEMENT_CATALOG,
  buildAchievementProgressContext,
  getAchievementById,
  getAchievementProgress,
  isAchievementEarned,
  isAchievementEarnedByProgress,
  LEGEND_SCORE_BY_RARITY,
  resolveAchievement,
  resolveLegacyLevelAchievement,
  type AchievementDef,
  type AchievementProgressContext,
  type AchievementRarity,
} from "./achievementsCatalog";

export type AchievementView = {
  def: AchievementDef;
  earned: boolean;
  earnedAt: string | null;
  progress: ReturnType<typeof getAchievementProgress>;
};

const RARITY_RANK: Record<AchievementRarity, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
};

export function enrichAchievementContext(ctx: AchievementProgressContext): AchievementProgressContext {
  const logs = getActivityLogs(ctx.character.id);
  return {
    ...ctx,
    activityLogCount: logs.length,
    knowledgeActivityCount: logs.filter((l) => l.activityId?.includes("study") || l.activityId?.includes("library")).length,
  };
}

export function getAchievementViews(character: Character): AchievementView[] {
  const ctx = enrichAchievementContext(buildAchievementProgressContext(character));
  return ACHIEVEMENT_CATALOG.map((def) => ({
    def,
    earned: isAchievementEarnedByProgress(def, ctx),
    earnedAt: character.achievementEarnedAt?.[def.id] ?? null,
    progress: getAchievementProgress(def, ctx),
  }));
}

export function getEarnedAchievements(character: Character): AchievementView[] {
  return getAchievementViews(character).filter((v) => v.earned);
}

export function computeLegendScore(character: Character): number {
  return getEarnedAchievements(character).reduce((sum, v) => sum + LEGEND_SCORE_BY_RARITY[v.def.rarity], 0);
}

export function getRarestEarnedAchievement(character: Character): AchievementDef | null {
  const earned = getEarnedAchievements(character);
  if (earned.length === 0) return null;
  earned.sort((a, b) => RARITY_RANK[b.def.rarity] - RARITY_RANK[a.def.rarity]);
  return earned[0]!.def;
}

export function getAdventurerLabel(character: Character): string {
  const title = getClassTitle(character.classId);
  return title ? `Level ${character.level} ${title}` : `Level ${character.level} Adventurer`;
}

export function getEquippedTitleLabel(character: Character): string | null {
  if (!character.equippedTitleId) return null;
  const def = getAchievementById(character.equippedTitleId);
  return def?.titleUnlock ?? def?.name ?? null;
}

export function getFeaturedAchievementViews(character: Character): AchievementView[] {
  const ids = (character.featuredAchievementIds ?? []).slice(0, 3);
  const views = getAchievementViews(character);
  return ids
    .map((id) => views.find((v) => v.def.id === id && v.earned))
    .filter((v): v is AchievementView => Boolean(v));
}

/** Sync catalog ids + earned dates; returns newly unlocked defs for celebration. */
export function syncCatalogAchievements(character: Character): AchievementDef[] {
  if (!Array.isArray(character.achievements)) character.achievements = [];
  if (!character.achievementEarnedAt) character.achievementEarnedAt = {};

  const ctx = buildAchievementProgressContext(character);
  const newlyUnlocked: AchievementDef[] = [];

  for (const def of ACHIEVEMENT_CATALOG) {
    if (!isAchievementEarnedByProgress(def, ctx)) continue;

    const wasTracked = Boolean(character.achievementEarnedAt[def.id]);

    if (!character.achievements.includes(def.id)) character.achievements.push(def.id);
    for (const legacy of def.legacyKeys) {
      if (!character.achievements.includes(legacy)) character.achievements.push(legacy);
    }

    if (!character.achievementEarnedAt[def.id]) {
      character.achievementEarnedAt[def.id] = new Date().toISOString();
    }

    if (!wasTracked) newlyUnlocked.push(def);
  }

  const levelDef = resolveLegacyLevelAchievement(character.level);
  if (levelDef) {
    const wasTracked = Boolean(character.achievementEarnedAt[levelDef.id]);
    if (!character.achievements.includes(levelDef.id)) character.achievements.push(levelDef.id);
    const legacyKey = `Reached Level ${character.level}`;
    if (!character.achievements.includes(legacyKey)) character.achievements.push(legacyKey);
    if (!character.achievementEarnedAt[levelDef.id]) {
      character.achievementEarnedAt[levelDef.id] = new Date().toISOString();
    }
    if (!wasTracked && isAchievementEarnedByProgress(levelDef, ctx)) newlyUnlocked.push(levelDef);
  }

  return newlyUnlocked;
}

export function resolveAchievementFromLegacy(input: string): AchievementDef | undefined {
  if (input.startsWith("Reached Level ")) {
    const lvl = Number(input.replace("Reached Level ", "").trim());
    if (Number.isFinite(lvl)) return resolveLegacyLevelAchievement(lvl);
  }
  if (input.includes("Defeated") && input.includes("Boss")) {
    return getAchievementById("defeat_first_boss");
  }
  return resolveAchievement(input);
}

export { RARITY_RANK };
