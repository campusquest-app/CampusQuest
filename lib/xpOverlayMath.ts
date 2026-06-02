import { xpProgressInLevel, xpToLevel } from "@/lib/level";

export function getLevelThresholds(totalXP: number) {
  const level = xpToLevel(totalXP);
  const { current, needed } = xpProgressInLevel(totalXP);
  return {
    level,
    progressCurrent: current,
    progressNeeded: needed,
    progressRatio: needed > 0 ? current / needed : 0,
    xpToNext: Math.max(0, needed - current),
  };
}

/** Ring fill keyframes: exaggerate mid-animation for tiny gains, settle on true end. */
export function computeVisualProgressKeyframes(
  progressBefore: number,
  progressAfter: number,
  xpGained: number,
): { start: number; peak: number; end: number } {
  const start = Math.max(0, Math.min(1, progressBefore));
  const end = Math.max(0, Math.min(1, progressAfter));
  const delta = end - start;
  const needsBoost = delta < 0.045 || xpGained <= 20;
  if (!needsBoost || end >= 0.995) {
    return { start, peak: end, end };
  }
  const boost = Math.min(0.16, Math.max(0.075, delta * 2.8));
  const peak = Math.min(0.97, end + boost);
  return { start, peak, end };
}

export function interpolateVisualProgress(
  t: number,
  start: number,
  peak: number,
  end: number,
): number {
  const eased = (x: number) => 1 - (1 - x) ** 3;
  if (peak <= end + 0.001) {
    return start + (end - start) * eased(Math.max(0, Math.min(1, t)));
  }
  if (t < 0.72) {
    const t1 = t / 0.72;
    return start + (peak - start) * eased(t1);
  }
  const t2 = (t - 0.72) / 0.28;
  return peak + (end - peak) * eased(t2);
}

/** One ring segment: existing progress at baseStart, cyan fills through gainEnd. */
export type XpRingFillSegment = {
  baseStart: number;
  gainEnd: number;
};

/** Multi-segment plan for level-up (fill to 100%, reset, fill remainder). */
export function computeXpRingFillPlan(previousXP: number, newXP: number): {
  segments: XpRingFillSegment[];
  finalProgress: number;
} {
  const prevLevel = xpToLevel(previousXP);
  const newLevel = xpToLevel(newXP);
  const after = getLevelThresholds(newXP);

  if (newLevel <= prevLevel) {
    const before = getLevelThresholds(previousXP);
    return {
      segments: [{ baseStart: before.progressRatio, gainEnd: after.progressRatio }],
      finalProgress: after.progressRatio,
    };
  }

  const segments: XpRingFillSegment[] = [];
  const before = getLevelThresholds(previousXP);
  segments.push({ baseStart: before.progressRatio, gainEnd: 1 });

  for (let level = prevLevel + 1; level < newLevel; level++) {
    segments.push({ baseStart: 0, gainEnd: 1 });
  }

  segments.push({ baseStart: 0, gainEnd: after.progressRatio });
  return { segments, finalProgress: after.progressRatio };
}

export function buildXpGainOverlayMetrics(args: {
  previousXP: number;
  newXP: number;
}) {
  const previousLevel = xpToLevel(args.previousXP);
  const newLevel = xpToLevel(args.newXP);
  const before = getLevelThresholds(args.previousXP);
  const after = getLevelThresholds(args.newXP);
  return {
    previousLevel,
    newLevel,
    xpForCurrentLevel: after.progressCurrent,
    xpForNextLevel: after.progressNeeded,
    progressBefore: before.progressRatio,
    progressAfter: after.progressRatio,
    xpToNext: after.xpToNext,
    leveledUp: newLevel > previousLevel,
  };
}
