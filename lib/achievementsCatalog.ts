import type { Character } from "./types";
import { STAT_KEYS } from "./types";
import { getMiniGameTrainingSummary } from "./miniGameTraining";
import { getFriends } from "./friendsStore";

export type AchievementRarity = "common" | "rare" | "epic" | "legendary" | "mythic";
export type AchievementCategory = "milestones" | "challenges" | "academic" | "social" | "special" | "legendary";

export type AchievementDef = {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  icon: string;
  /** Legacy strings stored in character.achievements before catalog ids. */
  legacyKeys: string[];
  titleUnlock?: string;
  progressTarget: number;
  trophyKind: "trophy" | "medal" | "banner" | "relic" | "badge";
};

export const LEGEND_SCORE_BY_RARITY: Record<AchievementRarity, number> = {
  common: 10,
  rare: 25,
  epic: 50,
  legendary: 100,
  mythic: 250,
};

export const RARITY_LABELS: Record<AchievementRarity, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
  mythic: "Mythic",
};

export const CATEGORY_META: Record<
  AchievementCategory,
  { label: string; icon: string; blurb: string }
> = {
  milestones: { label: "Milestones", icon: "🏆", blurb: "Attend events, reach levels, earn XP" },
  challenges: { label: "Challenges", icon: "⚔️", blurb: "Boss battles, training mastery, streaks" },
  academic: { label: "Academic", icon: "🎓", blurb: "Study achievements and knowledge milestones" },
  social: { label: "Social", icon: "🤝", blurb: "Friends, guilds, and community" },
  special: { label: "Special", icon: "🌟", blurb: "Limited events and founding badges" },
  legendary: { label: "Legendary", icon: "👑", blurb: "Extremely rare accomplishments" },
};

export const TROPHY_ROOM_TITLE = "🏆 Trophy Room";
export const TROPHY_ROOM_SUBTITLE = "Your achievements, collectibles, and milestones.";

/** @deprecated Use TROPHY_ROOM_TITLE */
export const HALL_OF_LEGENDS_TITLE = TROPHY_ROOM_TITLE;
/** @deprecated Use TROPHY_ROOM_SUBTITLE */
export const HALL_OF_LEGENDS_SUBTITLE = TROPHY_ROOM_SUBTITLE;

export const ACHIEVEMENT_CATALOG: AchievementDef[] = [
  {
    id: "first_quest",
    name: "First Quest Completed",
    description: "Complete your first campus quest.",
    category: "milestones",
    rarity: "common",
    icon: "🎯",
    legacyKeys: ["First Quest Completed"],
    progressTarget: 1,
    trophyKind: "badge",
  },
  {
    id: "reach_level_10",
    name: "Level 10 Pathfinder",
    description: "Reach level 10 on your CampusQuest journey.",
    category: "milestones",
    rarity: "rare",
    icon: "🧭",
    legacyKeys: ["Reached Level 10"],
    titleUnlock: "First-Year Explorer",
    progressTarget: 10,
    trophyKind: "medal",
  },
  {
    id: "reach_level_25",
    name: "Level 25 Vanguard",
    description: "Reach level 25 — a true campus veteran.",
    category: "milestones",
    rarity: "epic",
    icon: "⭐",
    legacyKeys: ["Reached Level 25"],
    titleUnlock: "Campus Pathfinder",
    progressTarget: 25,
    trophyKind: "trophy",
  },
  {
    id: "attend_first_event",
    name: "Event Explorer",
    description: "Attend your first campus event.",
    category: "milestones",
    rarity: "common",
    icon: "📅",
    legacyKeys: [],
    progressTarget: 1,
    trophyKind: "banner",
  },
  {
    id: "attend_10_events",
    name: "Campus Regular",
    description: "Attend 10 campus events.",
    category: "milestones",
    rarity: "epic",
    icon: "🎪",
    legacyKeys: [],
    progressTarget: 10,
    trophyKind: "banner",
  },
  {
    id: "streak_7",
    name: "7-Day Streak",
    description: "Maintain a 7-day activity streak.",
    category: "challenges",
    rarity: "rare",
    icon: "🔥",
    legacyKeys: ["7-Day Streak"],
    progressTarget: 7,
    trophyKind: "medal",
  },
  {
    id: "streak_30",
    name: "30-Day Streak",
    description: "Maintain a 30-day activity streak.",
    category: "challenges",
    rarity: "legendary",
    icon: "💫",
    legacyKeys: ["30-Day Streak"],
    titleUnlock: "Campus Legend",
    progressTarget: 30,
    trophyKind: "trophy",
  },
  {
    id: "defeat_first_boss",
    name: "Boss Slayer",
    description: "Defeat your first boss battle.",
    category: "challenges",
    rarity: "rare",
    icon: "⚔️",
    legacyKeys: [],
    titleUnlock: "Boss Slayer",
    progressTarget: 1,
    trophyKind: "trophy",
  },
  {
    id: "defeat_10_bosses",
    name: "Boss Hunter",
    description: "Defeat 10 bosses across campus.",
    category: "challenges",
    rarity: "epic",
    icon: "🗡️",
    legacyKeys: [],
    progressTarget: 10,
    trophyKind: "relic",
  },
  {
    id: "training_all_stats_week",
    name: "Training Master",
    description: "Train all five stats in one week at The Training Grounds.",
    category: "challenges",
    rarity: "epic",
    icon: "🏋️",
    legacyKeys: [],
    progressTarget: 5,
    trophyKind: "medal",
  },
  {
    id: "knowledge_100",
    name: "Scholar's Mark",
    description: "Reach 100 Knowledge stat.",
    category: "academic",
    rarity: "rare",
    icon: "📚",
    legacyKeys: [],
    progressTarget: 100,
    trophyKind: "badge",
  },
  {
    id: "study_sessions_10",
    name: "Archive Apprentice",
    description: "Log 10 study or knowledge activities.",
    category: "academic",
    rarity: "common",
    icon: "📝",
    legacyKeys: [],
    progressTarget: 10,
    trophyKind: "badge",
  },
  {
    id: "first_friend",
    name: "First Connection",
    description: "Add your first friend on CampusQuest.",
    category: "social",
    rarity: "common",
    icon: "👋",
    legacyKeys: [],
    progressTarget: 1,
    trophyKind: "badge",
  },
  {
    id: "guild_member",
    name: "Guild Initiate",
    description: "Join a guild and team up with Rams.",
    category: "social",
    rarity: "rare",
    icon: "🛡️",
    legacyKeys: [],
    titleUnlock: "Guild Champion",
    progressTarget: 1,
    trophyKind: "banner",
  },
  {
    id: "quad_assist_10",
    name: "Community Ally",
    description: "Earn 10 Quad assist reactions.",
    category: "social",
    rarity: "rare",
    icon: "🤝",
    legacyKeys: [],
    progressTarget: 10,
    trophyKind: "medal",
  },
  {
    id: "scan_50_qr",
    name: "QR Pathfinder",
    description: "Complete 50 successful campus QR scans.",
    category: "milestones",
    rarity: "epic",
    icon: "📱",
    legacyKeys: [],
    titleUnlock: "Campus Pathfinder",
    progressTarget: 50,
    trophyKind: "relic",
  },
  {
    id: "founding_student",
    name: "Founding Adventurer",
    description: "Joined CampusQuest during the founding semester.",
    category: "special",
    rarity: "legendary",
    icon: "🏛️",
    legacyKeys: [],
    progressTarget: 1,
    trophyKind: "banner",
  },
  {
    id: "beta_tester",
    name: "CampusQuest Beta Tester",
    description: "Helped shape CampusQuest during the beta program.",
    category: "special",
    rarity: "mythic",
    icon: "🧪",
    legacyKeys: [],
    progressTarget: 1,
    trophyKind: "relic",
  },
  {
    id: "talent_pioneer",
    name: "Talent Development Pioneer",
    description: "Recognized for advancing URI talent development.",
    category: "special",
    rarity: "legendary",
    icon: "🌟",
    legacyKeys: [],
    progressTarget: 1,
    trophyKind: "trophy",
  },
  {
    id: "campus_legend",
    name: "Campus Legend",
    description: "Reach level 25, a 30-day streak, and weekly training mastery.",
    category: "legendary",
    rarity: "mythic",
    icon: "👑",
    legacyKeys: [],
    titleUnlock: "Campus Legend",
    progressTarget: 3,
    trophyKind: "trophy",
  },
];

const CATALOG_BY_ID = new Map(ACHIEVEMENT_CATALOG.map((a) => [a.id, a]));

export function getAchievementById(id: string): AchievementDef | undefined {
  return CATALOG_BY_ID.get(id);
}

export function resolveAchievement(input: string): AchievementDef | undefined {
  const direct = CATALOG_BY_ID.get(input);
  if (direct) return direct;
  return ACHIEVEMENT_CATALOG.find(
    (a) => a.legacyKeys.includes(input) || a.name === input || input.startsWith(`Reached Level `) && a.id.startsWith("reach_level_"),
  );
}

export function resolveLegacyLevelAchievement(level: number): AchievementDef | undefined {
  if (level >= 25) return getAchievementById("reach_level_25");
  if (level >= 10) return getAchievementById("reach_level_10");
  return undefined;
}

export type AchievementProgressContext = {
  character: Character;
  activityLogCount: number;
  knowledgeActivityCount: number;
  qrScanCount: number;
  eventsAttended: number;
};

export function buildAchievementProgressContext(character: Character): AchievementProgressContext {
  return {
    character,
    activityLogCount: 0,
    knowledgeActivityCount: 0,
    qrScanCount: Object.keys(character.qrMilestones ?? {}).length,
    eventsAttended: character.eventsAttendedCount ?? 0,
  };
}

export function getAchievementProgress(
  def: AchievementDef,
  ctx: AchievementProgressContext,
): { current: number; max: number; percent: number } {
  const c = ctx.character;
  let current = 0;
  const max = def.progressTarget;

  switch (def.id) {
    case "first_quest":
      current = (c.completedSpecialQuests?.length ?? 0) > 0 || c.achievements.some((a) => a.includes("Quest")) ? 1 : 0;
      break;
    case "reach_level_10":
    case "reach_level_25":
      current = c.level;
      break;
    case "attend_first_event":
    case "attend_10_events":
      current = ctx.eventsAttended;
      break;
    case "streak_7":
    case "streak_30":
      current = c.streakDays;
      break;
    case "defeat_first_boss":
    case "defeat_10_bosses":
      current = c.bossesDefeatedCount ?? 0;
      break;
    case "training_all_stats_week": {
      const summary = getMiniGameTrainingSummary(c);
      current = summary.weekStats.length;
      break;
    }
    case "knowledge_100":
      current = c.stats.knowledge;
      break;
    case "study_sessions_10":
      current = ctx.knowledgeActivityCount;
      break;
    case "first_friend":
      current = getFriends(c.id).length;
      break;
    case "guild_member":
      current = (c.guildIds ?? []).length;
      break;
    case "quad_assist_10":
      current = c.quadAssistScore ?? 0;
      break;
    case "scan_50_qr":
      current = ctx.qrScanCount;
      break;
    case "founding_student":
      current = c.foundingMember ? 1 : 0;
      break;
    case "beta_tester":
      current = c.betaTester ? 1 : 0;
      break;
    case "talent_pioneer":
      current = c.talentPioneer ? 1 : 0;
      break;
    case "campus_legend": {
      const summary = getMiniGameTrainingSummary(c);
      const checks = [
        c.level >= 25 ? 1 : 0,
        c.streakDays >= 30 ? 1 : 0,
        STAT_KEYS.every((s) => summary.weekStats.includes(s)) ? 1 : 0,
      ];
      current = checks.reduce((a, b) => a + b, 0);
      break;
    }
    default:
      current = 0;
  }

  const clamped = Math.min(max, Math.max(0, current));
  return {
    current: clamped,
    max,
    percent: max > 0 ? Math.round((clamped / max) * 100) : 0,
  };
}

export function isAchievementEarned(def: AchievementDef, character: Character): boolean {
  if (character.achievements.includes(def.id)) return true;
  if (def.legacyKeys.some((k) => character.achievements.includes(k))) return true;
  if (def.id.startsWith("reach_level_")) {
    const legacy = character.achievements.some((a) => a === `Reached Level ${character.level}` || a.startsWith("Reached Level "));
    if (legacy && character.level >= def.progressTarget) return true;
  }
  if (def.id === "defeat_first_boss" || def.id === "defeat_10_bosses") {
    if (character.achievements.some((a) => a.includes("Defeated") && a.includes("Boss"))) {
      return (character.bossesDefeatedCount ?? 0) >= def.progressTarget;
    }
  }
  return false;
}

export function isAchievementEarnedByProgress(
  def: AchievementDef,
  ctx: AchievementProgressContext,
): boolean {
  if (isAchievementEarned(def, ctx.character)) return true;
  const { current, max } = getAchievementProgress(def, ctx);
  return current >= max;
}
