import type { StatKey } from "@/lib/types";
import { MAX_STAT, STAT_KEYS } from "@/lib/types";

export const MANUAL_LOG_MAX_XP = 20;

export const STAT_TRAINING_COPY: Record<StatKey, string> = {
  strength: "Train your physical power",
  stamina: "Build endurance",
  knowledge: "Learn something new",
  social: "Make connections",
  focus: "Improve concentration",
};

/** Canonical activity per stat for simplified manual log submissions. */
export const MANUAL_LOG_ACTIVITY_BY_STAT: Record<StatKey, string> = {
  strength: "bodyweight",
  stamina: "run",
  knowledge: "flashcards",
  social: "club",
  focus: "meditate",
};

export const STAT_SKILL_LEVEL_STEP = 50;

/** Per-stat skill tier (used outside manual log UI). */
export function getStatSkillLevel(statValue: number, prestige = 0): number {
  const value = Math.max(0, Math.min(MAX_STAT, statValue));
  return Math.floor(value / STAT_SKILL_LEVEL_STEP) + 1 + prestige * 20;
}

/** Progress within the current stat skill tier (0–100). */
export function getStatSkillProgress(statValue: number): number {
  const value = Math.max(0, Math.min(MAX_STAT, statValue));
  if (value >= MAX_STAT) return 100;
  const inTier = value % STAT_SKILL_LEVEL_STEP;
  return Math.round((inTier / STAT_SKILL_LEVEL_STEP) * 100);
}

export function isManualLogStat(stat: string): stat is StatKey {
  return (STAT_KEYS as readonly string[]).includes(stat);
}
