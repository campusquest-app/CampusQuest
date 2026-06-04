import { xpToLevel } from "@/lib/level";
import {
  computeXpRingFillPlan,
  getLevelThresholds,
  type XpRingFillSegment,
} from "@/lib/xpOverlayMath";
import { logXpAnimation, logXpMobile } from "@/lib/client/xpAnimationDebug";

/** Frozen XP values for reward overlay — never read from live profile during animation. */
export type RewardAnimationSnapshot = {
  previousXP: number;
  finalXP: number;
  xpGained: number;
  previousLevel: number;
  finalLevel: number;
  previousProgress: number;
  finalProgress: number;
  segments: XpRingFillSegment[];
};

export function buildRewardAnimationSnapshot(
  animationStartXP: number,
  animationEndXP: number,
): RewardAnimationSnapshot {
  const previousXP = Math.max(0, Math.floor(animationStartXP));
  const finalXP = Math.max(previousXP, Math.floor(animationEndXP));
  const xpGained = Math.max(0, finalXP - previousXP);
  const previousLevel = xpToLevel(previousXP);
  const finalLevel = xpToLevel(finalXP);
  const before = getLevelThresholds(previousXP);
  const after = getLevelThresholds(finalXP);
  const { segments, finalProgress } = computeXpRingFillPlan(previousXP, finalXP);

  const snapshot: RewardAnimationSnapshot = {
    previousXP,
    finalXP,
    xpGained,
    previousLevel,
    finalLevel,
    previousProgress: before.progressRatio,
    finalProgress,
    segments,
  };

  logXpAnimation("snapshot", {
    previousXP: snapshot.previousXP,
    finalXP: snapshot.finalXP,
    xpGained: snapshot.xpGained,
    segmentCount: snapshot.segments.length,
    segments: snapshot.segments,
  });
  logXpAnimation("previousProgress", { value: snapshot.previousProgress });
  logXpAnimation("finalProgress", { value: snapshot.finalProgress });
  logXpMobile("snapshot", {
    previousXP: snapshot.previousXP,
    finalXP: snapshot.finalXP,
    previousProgress: snapshot.previousProgress,
    finalProgress: snapshot.finalProgress,
    progressEqual: snapshot.previousProgress === snapshot.finalProgress,
  });

  return snapshot;
}
