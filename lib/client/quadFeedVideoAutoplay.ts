/**
 * Instagram-style feed video autoplay: hysteresis thresholds, single active
 * player, and visibility arbitration across mounted players.
 */

export const QUAD_VIDEO_PLAY_RATIO = 0.6;
export const QUAD_VIDEO_PAUSE_RATIO = 0.3;

/** Rough chrome insets so intersection accounts for fixed header + bottom nav. */
export const QUAD_VIDEO_IO_ROOT_MARGIN = "-72px 0px -88px 0px";

export const QUAD_VIDEO_IO_THRESHOLDS = [
  0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1,
] as const;

type VisibilityEntry = {
  ratio: number;
  eligible: boolean;
};

const visibility = new Map<string, VisibilityEntry>();
const playListeners = new Map<string, (shouldPlay: boolean) => void>();

let activeAutoplayId: string | null = null;

export function prefersReducedData(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean };
  }).connection;
  return conn?.saveData === true;
}

/**
 * Hysteresis: become eligible at ≥60% visible; lose eligibility below 30%.
 * Between those thresholds, keep the previous eligible state.
 */
export function nextAutoplayEligible(
  ratio: number,
  previouslyEligible: boolean,
): boolean {
  if (ratio >= QUAD_VIDEO_PLAY_RATIO) return true;
  if (ratio < QUAD_VIDEO_PAUSE_RATIO) return false;
  return previouslyEligible;
}

function recomputeActive(): void {
  let bestId: string | null = null;
  let bestRatio = -1;
  for (const [id, entry] of Array.from(visibility)) {
    if (!entry.eligible) continue;
    if (entry.ratio > bestRatio) {
      bestRatio = entry.ratio;
      bestId = id;
    }
  }

  const prev = activeAutoplayId;
  if (prev === bestId) return;
  activeAutoplayId = bestId;

  if (prev) {
    playListeners.get(prev)?.(false);
  }
  if (bestId) {
    playListeners.get(bestId)?.(true);
  }
}

/** Register a player; returns unsubscribe. */
export function registerFeedVideoAutoplay(
  playerId: string,
  onShouldPlay: (shouldPlay: boolean) => void,
): () => void {
  playListeners.set(playerId, onShouldPlay);
  visibility.set(playerId, { ratio: 0, eligible: false });
  return () => {
    playListeners.delete(playerId);
    visibility.delete(playerId);
    if (activeAutoplayId === playerId) {
      activeAutoplayId = null;
      recomputeActive();
    }
  };
}

/** Push latest intersection ratio; coordinator picks the most-visible eligible video. */
export function reportFeedVideoVisibility(playerId: string, ratio: number): void {
  const prev = visibility.get(playerId) ?? { ratio: 0, eligible: false };
  const eligible = nextAutoplayEligible(ratio, prev.eligible);
  visibility.set(playerId, { ratio, eligible });
  recomputeActive();
}

export function getActiveFeedVideoAutoplayId(): string | null {
  return activeAutoplayId;
}

/** Test helper — clears coordinator state between unit tests. */
export function resetFeedVideoAutoplayForTests(): void {
  visibility.clear();
  playListeners.clear();
  activeAutoplayId = null;
}
