import type { CharacterStats, StatKey } from "@/lib/types";
import { STAT_KEYS } from "@/lib/types";

/** Minimum bar width (%) for any non-zero stat so fills never look empty. */
export const STAT_BAR_MIN_VISIBLE_PCT = 9;

/**
 * Character-screen stat bar fill (visualization only).
 * Normalizes against the highest current stat so bars are comparable at a glance.
 */
export function getCharacterStatBarFillPercent(
  value: number,
  peerValues: readonly number[],
): number {
  if (value <= 0) return 0;
  const positivePeers = peerValues.filter((peer) => peer > 0);
  const peerMax = Math.max(1, ...positivePeers);
  const relative = (value / peerMax) * 100;
  return Math.min(100, Math.max(STAT_BAR_MIN_VISIBLE_PCT, relative));
}

export function getCharacterStatBarFills(stats: CharacterStats): Record<StatKey, number> {
  const values = STAT_KEYS.map((key) => stats[key] ?? 0);
  const fills = {} as Record<StatKey, number>;
  for (let i = 0; i < STAT_KEYS.length; i += 1) {
    const key = STAT_KEYS[i]!;
    fills[key] = getCharacterStatBarFillPercent(values[i]!, values);
  }
  return fills;
}
