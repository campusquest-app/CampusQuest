import type { StatKey } from "@/lib/types";
import { buildXpGainOverlayMetrics } from "@/lib/xpOverlayMath";

/** Payload captured when XP is earned; drives RPG overlay then top banner. */
export type ActivityXPGainSession = {
  beforeTotalXP: number;
  afterTotalXP: number;
  xpGained: number;
  title: string;
  stats: Partial<Record<StatKey, number>>;
  primaryStat?: StatKey;
  modifierLines?: { label: string; emoji?: string }[];
  leveledUp: boolean;
  activityLabel?: string;
  /** e.g. "Strength Quest" for gym QR */
  activityQuestType?: string;
  /** After overlay: return to The Quad and close scanner */
  afterQrScan?: boolean;
  /** Stable key so overlay is not remounted mid-animation */
  sessionKey: string;
};

export type XPGainRingTheme = {
  ring: string;
  track: string;
  glow: string;
  accentFlash: string;
};

export const defaultXPGainTheme: XPGainRingTheme = {
  ring: "#68ABE8",
  track: "rgba(15, 40, 82, 0.95)",
  glow: "rgba(104, 171, 232, 0.65)",
  accentFlash: "rgba(147, 197, 253, 0.85)",
};

export type LevelUpOverlayProps = {
  isOpen: boolean;
  activityTitle: string;
  xpGained: number;
  previousXP: number;
  newXP: number;
  previousLevel: number;
  newLevel: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  progressBefore: number;
  progressAfter: number;
  xpToNext: number;
  activityLabel?: string;
  activityQuestType?: string;
  stats?: Partial<Record<StatKey, number>>;
  primaryStat?: StatKey;
  modifierLines?: { label: string; emoji?: string }[];
  onComplete: () => void;
  minimumDurationMs?: number;
  theme?: XPGainRingTheme;
};

export function sessionToLevelUpOverlayProps(
  session: ActivityXPGainSession,
  onComplete: () => void,
  minimumDurationMs = 5000,
): LevelUpOverlayProps {
  const metrics = buildXpGainOverlayMetrics({
    previousXP: session.beforeTotalXP,
    newXP: session.afterTotalXP,
  });
  return {
    isOpen: true,
    activityTitle: session.title,
    xpGained: session.xpGained,
    previousXP: session.beforeTotalXP,
    newXP: session.afterTotalXP,
    previousLevel: metrics.previousLevel,
    newLevel: metrics.newLevel,
    xpForCurrentLevel: metrics.xpForCurrentLevel,
    xpForNextLevel: metrics.xpForNextLevel,
    progressBefore: metrics.progressBefore,
    progressAfter: metrics.progressAfter,
    xpToNext: metrics.xpToNext,
    activityLabel: session.activityLabel,
    activityQuestType: session.activityQuestType,
    stats: session.stats,
    primaryStat: session.primaryStat,
    modifierLines: session.modifierLines,
    onComplete,
    minimumDurationMs,
  };
}
