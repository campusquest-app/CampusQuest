import type { CharacterStats, StatKey } from "@/lib/types";
import { STAT_KEYS } from "@/lib/types";

/** Fixed ceiling for Character-screen stat bar visualization (display only). */
export const CHARACTER_STAT_BAR_MAX = 350;

/**
 * Character-screen stat bar fill (visualization only).
 * Normalized against a fixed max so no stat appears full unless it reaches that ceiling.
 */
export function getCharacterStatBarFillPercent(value: number): number {
  if (value <= 0) return 0;
  return Math.min(100, (value / CHARACTER_STAT_BAR_MAX) * 100);
}

export function getCharacterStatBarFills(stats: CharacterStats): Record<StatKey, number> {
  const fills = {} as Record<StatKey, number>;
  for (const key of STAT_KEYS) {
    fills[key] = getCharacterStatBarFillPercent(stats[key] ?? 0);
  }
  return fills;
}
