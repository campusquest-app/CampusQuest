import type { StatKey } from "@/lib/types";

/** Payload captured when an activity is logged (non-boss); drives RPG overlay then top banner. */
export type ActivityXPGainSession = {
  beforeTotalXP: number;
  afterTotalXP: number;
  xpGained: number;
  title: string;
  stats: Partial<Record<StatKey, number>>;
  primaryStat?: StatKey;
  modifierLines?: { label: string; emoji?: string }[];
  leveledUp: boolean;
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
