import type { Character, StatKey } from "./types";
import { MAX_STAT, STAT_ICONS } from "./types";
import { getClassTitle } from "./characterClasses";

export type TrainingGameCardState = "ready" | "played-today" | "locked" | "weekly-complete";

export type TrainingGameDefinition = {
  stat: StatKey;
  icon: string;
  gameName: string;
  theme: string;
  description: string;
  statEffect: string;
  howToPlay: string;
  rewards: string;
  accent: string;
  borderGlow: string;
  bgGradient: string;
};

export const TRAINING_GROUNDS_TITLE = "THE TRAINING GROUNDS";
export const TRAINING_GROUNDS_SUBTITLE = "Sharpen your stats. Forge your legend.";

export const TRAINING_GAMES: TrainingGameDefinition[] = [
  {
    stat: "strength",
    icon: STAT_ICONS.strength,
    gameName: "Forge of Strength",
    theme: "Blacksmith forge · hammer timing",
    description: "Strike the anvil at the perfect moment to forge power.",
    statEffect: "Higher Strength increases perfect-hit bonus and boss damage.",
    howToPlay: "Watch the golden marker. Tap REP when it sits in the green forge zone — nail four reps for max XP.",
    rewards: "8–25 base XP · streak multiplier · counts toward weekly mastery",
    accent: "text-amber-300",
    borderGlow: "border-amber-400/45 shadow-[0_0_28px_rgba(251,191,36,0.18)]",
    bgGradient: "from-amber-950/40 via-uri-navy/80 to-black/60",
  },
  {
    stat: "stamina",
    icon: STAT_ICONS.stamina,
    gameName: "Path of Stamina",
    theme: "Endurance runner · campus trail",
    description: "Survive the campus trail and keep your streak alive.",
    statEffect: "Higher Stamina improves training streak bonuses.",
    howToPlay: "Tap as fast as you can for three seconds. More taps = more XP.",
    rewards: "8–28 base XP · streak multiplier · endurance bonus from Stamina",
    accent: "text-teal-300",
    borderGlow: "border-teal-400/45 shadow-[0_0_28px_rgba(45,212,191,0.18)]",
    bgGradient: "from-teal-950/40 via-uri-navy/80 to-black/60",
  },
  {
    stat: "knowledge",
    icon: STAT_ICONS.knowledge,
    gameName: "Archives of Knowledge",
    theme: "Ancient library · quick quiz",
    description: "Answer campus and quest questions before the timer fades.",
    statEffect: "Higher Knowledge gives more time and better quiz rewards.",
    howToPlay: "Answer two quick questions. Correct picks earn big XP; wrong answers still grant participation XP.",
    rewards: "5–40 base XP · Knowledge boosts correct-answer payout",
    accent: "text-sky-300",
    borderGlow: "border-sky-400/45 shadow-[0_0_28px_rgba(56,189,248,0.18)]",
    bgGradient: "from-sky-950/40 via-uri-navy/80 to-black/60",
  },
  {
    stat: "social",
    icon: STAT_ICONS.social,
    gameName: "Hall of Influence",
    theme: "Guild diplomacy · social choices",
    description: "Choose the best response and build your campus reputation.",
    statEffect: "Higher Social improves friend, guild, and event bonuses.",
    howToPlay: "Read the scenario and pick the strongest social response.",
    rewards: "8–25 base XP · Social amplifies diplomacy rewards",
    accent: "text-emerald-300",
    borderGlow: "border-emerald-400/45 shadow-[0_0_28px_rgba(52,211,153,0.18)]",
    bgGradient: "from-emerald-950/40 via-uri-navy/80 to-black/60",
  },
  {
    stat: "focus",
    icon: STAT_ICONS.focus,
    gameName: "Focus Sanctum",
    theme: "Memory · reaction · pattern",
    description: "Follow the glowing sequence and keep your mind sharp.",
    statEffect: "Higher Focus slows challenge difficulty and improves accuracy bonuses.",
    howToPlay: "Dodge obstacles for six seconds. Fewer hits = higher XP.",
    rewards: "12–30 base XP · Focus grants extra mistake forgiveness",
    accent: "text-violet-300",
    borderGlow: "border-violet-400/45 shadow-[0_0_28px_rgba(167,139,250,0.18)]",
    bgGradient: "from-violet-950/40 via-uri-navy/80 to-black/60",
  },
];

export function getTrainingGame(stat: StatKey): TrainingGameDefinition {
  return TRAINING_GAMES.find((g) => g.stat === stat)!;
}

/** Percent bonus shown in tooltips (0–25). */
export function getStatTrainingPercent(stat: StatKey, statValue: number): number {
  const v = Math.max(0, Math.min(MAX_STAT, statValue));
  return Math.round((v / MAX_STAT) * 25 * 10) / 10;
}

export function getStatTrainingTooltip(stat: StatKey, statValue: number): string {
  const pct = getStatTrainingPercent(stat, statValue);
  switch (stat) {
    case "strength":
      return `Your current Strength gives +${pct}% forge score.`;
    case "stamina":
      return `Your current Stamina adds +${pct}% to endurance training rewards.`;
    case "knowledge":
      return `Your current Knowledge adds +${pct}% quiz reward bonus.`;
    case "social":
      return `Your current Social adds +${pct}% diplomacy XP.`;
    case "focus":
      return `Your current Focus grants +${Math.max(1, Math.floor(pct / 4))} extra mistake${Math.floor(pct / 4) === 1 ? "" : "s"} in the sanctum.`;
    default:
      return "";
  }
}

export function applyStatTrainingXpBonus(stat: StatKey, baseXp: number, statValue: number): number {
  const pct = getStatTrainingPercent(stat, statValue);
  return Math.max(1, Math.round(baseXp * (1 + pct / 100)));
}

export function getAdventurerLabel(character: Character): string {
  const title = getClassTitle(character.classId);
  return title ? `Level ${character.level} ${title}` : `Level ${character.level} Adventurer`;
}

export function getTrainingCardState(args: {
  stat: StatKey;
  canPlay: boolean;
  statsTrainedToday: StatKey[];
  weekStats: StatKey[];
}): TrainingGameCardState {
  const { stat, canPlay, statsTrainedToday, weekStats } = args;
  if (!canPlay) return "locked";
  if (statsTrainedToday.includes(stat)) return "played-today";
  if (weekStats.includes(stat)) return "weekly-complete";
  return "ready";
}

export function getCardStateLabel(state: TrainingGameCardState): string {
  switch (state) {
    case "ready":
      return "Ready";
    case "played-today":
      return "Played Today";
    case "locked":
      return "Locked Until Tomorrow";
    case "weekly-complete":
      return "Weekly Complete";
    default:
      return "";
  }
}
