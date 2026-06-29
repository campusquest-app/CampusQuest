import type { Character } from "./types";
import { xpToLevel } from "./level";
import { getQuestBoardDef, getQuestChain } from "./questBoardCatalog";
import { buildQuestProgressContext, getQuestProgress } from "./questBoardEngine";
import { completeSpecialQuest, grantBoardQuestXp, replaceLocalCharacter } from "./store";

export type QuestCelebrationPayload = {
  questId: string;
  questName: string;
  icon: string;
  xpReward: number;
  badge?: string;
  title?: string;
  legendScore?: number;
  chainComplete?: string;
  bonusXp?: number;
};

function ensureAchievementOnClaim(c: Character): void {
  if (typeof window === "undefined") return;
  void import("@/lib/achievementEngine").then(({ syncCatalogAchievements }) => {
    const unlocked = syncCatalogAchievements(c);
    if (unlocked.length === 0) return;
    replaceLocalCharacter(c);
    const celebrated = c.achievementCelebratedAt ?? {};
    const toCelebrate = unlocked.filter((def) => !celebrated[def.id]);
    if (toCelebrate.length === 0) return;
    void import("@/lib/achievementCelebration").then(({ queueAchievementCelebration }) => {
      for (const def of toCelebrate) queueAchievementCelebration(def);
    });
  });
}

export function claimQuest(
  character: Character,
  questId: string,
  proof?: string,
): { character: Character; celebration: QuestCelebrationPayload } | null {
  const def = getQuestBoardDef(questId);
  if (!def) return null;
  if ((character.questBoardClaims ?? {})[questId]) return null;

  const ctx = buildQuestProgressContext(character);
  let progress = getQuestProgress(def, ctx);

  if (def.requiresProof && def.legacySpecialQuestId) {
    const trimmed = typeof proof === "string" ? proof.trim() : "";
    if (!trimmed) return null;
    const updated = completeSpecialQuest(character.id, def.legacySpecialQuestId, trimmed);
    if (!updated) return null;
    Object.assign(character, updated);
    progress = { current: 1, max: def.progressTarget, percent: 100 };
  }

  if (progress.current < progress.max) return null;

  if (!character.questBoardClaims) character.questBoardClaims = {};
  character.questBoardClaims[questId] = new Date().toISOString();

  let totalXp = def.requiresProof ? 0 : def.xpReward;
  let chainComplete: string | undefined;
  let bonusXp: number | undefined;

  if (def.chainId != null && def.chainStep != null) {
    const chainProgress = character.questChainProgress ?? {};
    chainProgress[def.chainId] = Math.max(chainProgress[def.chainId] ?? -1, def.chainStep);
    character.questChainProgress = chainProgress;

    const chain = getQuestChain(def.chainId);
    if (chain && def.chainStep === chain.stepIds.length - 1) {
      bonusXp = chain.finalBonusXp;
      totalXp += chain.finalBonusXp;
      chainComplete = chain.name;
    }
  }

  if (totalXp > 0) grantBoardQuestXp(character, totalXp);
  if (character.acceptedQuestIds?.includes(questId)) {
    character.acceptedQuestIds = character.acceptedQuestIds.filter((id) => id !== questId);
  }

  replaceLocalCharacter(character);
  ensureAchievementOnClaim(character);

  const celebration: QuestCelebrationPayload = {
    questId: def.id,
    questName: def.name,
    icon: def.icon,
    xpReward: def.xpReward,
    badge: def.bonusRewards?.badge ?? (def.chainStep === 3 ? "Campus Explorer" : undefined),
    title: def.bonusRewards?.title,
    legendScore: def.bonusRewards?.legendScore,
    chainComplete,
    bonusXp,
  };

  return { character, celebration };
}
