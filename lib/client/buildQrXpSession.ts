import type { ActivityXPGainSession } from "@/components/xp/xpGainTypes";
import { buildRewardAnimationSnapshot } from "@/lib/client/rewardAnimationSnapshot";
import type { Character, StatKey } from "@/lib/types";

function createXpGainSessionKey(prefix = "xp"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildQrXpSession(opts: {
  beforeTotalXP: number;
  afterTotalXP: number;
  xpGained: number;
  title: string;
  activityLabel: string;
  activityQuestType?: string;
  primaryStat?: StatKey;
  stats: Partial<Record<StatKey, number>>;
  leveledUp: boolean;
  modifierLines?: { label: string; emoji?: string }[];
  pendingCharacter?: {
    totalXP: number;
    level: number;
    stats: Character["stats"];
  };
}): ActivityXPGainSession {
  const animationStartXP = Math.max(0, Math.floor(opts.beforeTotalXP));
  const explicitXp = Math.max(0, Math.floor(opts.xpGained));
  const serverAfterXP = Math.max(0, Math.floor(opts.afterTotalXP));
  const diffXp = Math.max(0, serverAfterXP - animationStartXP);
  const xpGained = diffXp > 0 ? Math.max(diffXp, explicitXp) : explicitXp;
  const animationEndXP =
    diffXp > 0 ? serverAfterXP : explicitXp > 0 ? animationStartXP + explicitXp : animationStartXP;
  const rewardSnapshot = buildRewardAnimationSnapshot(animationStartXP, animationEndXP);
  return {
    sessionKey: createXpGainSessionKey("xp-qr"),
    beforeTotalXP: animationStartXP,
    afterTotalXP: animationEndXP,
    xpGained,
    rewardSnapshot,
    title: opts.title,
    stats: opts.stats,
    modifierLines: opts.modifierLines,
    leveledUp: opts.leveledUp,
    activityLabel: opts.activityLabel,
    activityQuestType: opts.activityQuestType,
    afterQrScan: true,
    primaryStat: opts.primaryStat,
    pendingCharacter: opts.pendingCharacter,
  };
}
