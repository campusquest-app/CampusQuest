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
  const animationStartXP = opts.beforeTotalXP;
  const animationEndXP = opts.afterTotalXP;
  const rewardSnapshot = buildRewardAnimationSnapshot(animationStartXP, animationEndXP);
  return {
    sessionKey: createXpGainSessionKey("xp-qr"),
    beforeTotalXP: animationStartXP,
    afterTotalXP: animationEndXP,
    xpGained: Math.max(0, animationEndXP - animationStartXP),
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
