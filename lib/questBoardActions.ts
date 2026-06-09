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
    void import("@/lib/achievementCelebration").then(({ queueAchievementCelebration }) => {
      for (const def of unlocked) queueAchievementCelebration(def);
    });
  });
}

export function acceptQuest(character: Character, questId: string): Character | null {
  const def = getQuestBoardDef(questId);
  if (!def) return null;
  if ((character.questBoardClaims ?? {})[questId]) return null;
  if (def.legacySpecialQuestId && (character.completedSpecialQuests ?? []).includes(def.legacySpecialQuestId)) {
    return null;
  }

  const accepted = character.acceptedQuestIds ?? [];
  if (accepted.includes(questId)) return character;

  if (def.chainId != null && def.chainStep != null) {
    const progress = character.questChainProgress?.[def.chainId] ?? -1;
    if (def.chainStep > progress + 1) return null;
  }

  character.acceptedQuestIds = [...accepted, questId];
  replaceLocalCharacter(character);
  return character;
}

export function claimQuest(
  character: Character,
  questId: string,
  proof?: string,
): { character: Character; celebration: QuestCelebrationPayload } | null {
  const def = getQuestBoardDef(questId);
  if (!def) return null;
  if ((character.questBoardClaims ?? {})[questId]) return null;

  const accepted = character.acceptedQuestIds ?? [];
  if (!accepted.includes(questId)) return null;

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
  character.acceptedQuestIds = (character.acceptedQuestIds ?? []).filter((id) => id !== questId);

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
