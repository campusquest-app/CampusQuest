import type { ActivityXPGainSession } from "@/components/xp/xpGainTypes";
import type { StatKey } from "@/lib/types";

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
}): ActivityXPGainSession {
  return {
    sessionKey: createXpGainSessionKey("xp-qr"),
    beforeTotalXP: opts.beforeTotalXP,
    afterTotalXP: opts.afterTotalXP,
    xpGained: opts.xpGained,
    title: opts.title,
    stats: opts.stats,
    modifierLines: opts.modifierLines,
    leveledUp: opts.leveledUp,
    activityLabel: opts.activityLabel,
    activityQuestType: opts.activityQuestType,
    afterQrScan: true,
    primaryStat: opts.primaryStat,
  };
}
