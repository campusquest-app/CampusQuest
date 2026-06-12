import type { StatKey } from "./types";

export type QuestCategory = "daily" | "academic" | "social" | "campus" | "legendary";
export type QuestDifficulty = "easy" | "medium" | "hard" | "legendary";
export type QuestFilter = QuestCategory | "all" | "active" | "completed";

export type QuestProgressKind =
  | "activity_today"
  | "activity_total"
  | "friends"
  | "guild"
  | "quad_posts_today"
  | "quad_posts_total"
  | "training_today"
  | "events"
  | "level"
  | "qr_scans"
  | "categories_complete"
  | "chain_step"
  | "special_proof";

export type QuestBonusReward = {
  badge?: string;
  title?: string;
  achievementId?: string;
  legendScore?: number;
  cosmetic?: string;
};

export type QuestBoardDef = {
  id: string;
  name: string;
  description: string;
  category: QuestCategory;
  difficulty: QuestDifficulty;
  icon: string;
  xpReward: number;
  progressTarget: number;
  progressKind: QuestProgressKind;
  activityIds?: string[];
  requiresProof?: boolean;
  legacySpecialQuestId?: string;
  chainId?: string;
  chainStep?: number;
  bonusRewards?: QuestBonusReward;
  expiresEndOfDay?: boolean;
  /** Links generated daily quest template key for rotation. */
  dailyTemplateKey?: string;
};

export type QuestChainDef = {
  id: string;
  name: string;
  description: string;
  icon: string;
  stepIds: string[];
  finalBonusXp: number;
  finalBonusRewards?: QuestBonusReward;
};

export const QUEST_BOARD_TITLE = "THE QUEST BOARD";
export const QUEST_BOARD_SUBTITLE = "Choose your next adventure.";

export const CATEGORY_META: Record<QuestCategory, { label: string; icon: string; blurb: string }> = {
  daily: { label: "Daily Quests", icon: "⚔️", blurb: "Simple repeatable adventures — reset each day" },
  academic: { label: "Academic Quests", icon: "📚", blurb: "Study halls, libraries, and scholarly pursuits" },
  social: { label: "Social Quests", icon: "🤝", blurb: "Friends, guilds, and campus community" },
  campus: { label: "Campus Quests", icon: "🎓", blurb: "Explore URI landmarks and real campus life" },
  legendary: { label: "Legendary Quests", icon: "🌟", blurb: "Rare story quests with extraordinary rewards" },
};

export const DIFFICULTY_LABELS: Record<QuestDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  legendary: "Legendary",
};

export const FILTER_OPTIONS: { id: QuestFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "daily", label: "Daily" },
  { id: "academic", label: "Academic" },
  { id: "social", label: "Social" },
  { id: "campus", label: "Campus" },
  { id: "legendary", label: "Legendary" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
];

/** Static quest board entries (daily rotation merged at runtime). */
export const QUEST_BOARD_CATALOG: QuestBoardDef[] = [
  // —— Daily templates (instantiated per day in engine) ——
  {
    id: "qb-daily-gym",
    name: "Gym Challenger",
    description: "Visit the Rec Center and log a workout.",
    category: "daily",
    difficulty: "easy",
    icon: "🏋️",
    xpReward: 80,
    progressTarget: 1,
    progressKind: "activity_today",
    activityIds: ["gym"],
    expiresEndOfDay: true,
    dailyTemplateKey: "gym",
  },
  {
    id: "qb-daily-event",
    name: "Event Explorer",
    description: "Attend a campus event and show up for Rams life.",
    category: "daily",
    difficulty: "medium",
    icon: "📅",
    xpReward: 90,
    progressTarget: 1,
    progressKind: "events",
    expiresEndOfDay: true,
    dailyTemplateKey: "event",
  },
  {
    id: "qb-daily-quad",
    name: "Quad Herald",
    description: "Post on The Quad today.",
    category: "daily",
    difficulty: "easy",
    icon: "📣",
    xpReward: 70,
    progressTarget: 1,
    progressKind: "quad_posts_today",
    expiresEndOfDay: true,
    dailyTemplateKey: "quad",
  },
  {
    id: "qb-daily-training",
    name: "Training Grounds",
    description: "Complete a session at The Training Grounds.",
    category: "daily",
    difficulty: "easy",
    icon: "⚔️",
    xpReward: 75,
    progressTarget: 1,
    progressKind: "training_today",
    expiresEndOfDay: true,
    dailyTemplateKey: "training",
  },
  // —— Academic ——
  {
    id: "qb-study-session",
    name: "Study Session",
    description: "Log a focused study session on campus.",
    category: "academic",
    difficulty: "easy",
    icon: "📖",
    xpReward: 60,
    progressTarget: 1,
    progressKind: "activity_total",
    activityIds: ["study", "exam-prep", "group-study"],
  },
  {
    id: "qb-library-visit",
    name: "Library Scholar",
    description: "Visit the library and log a knowledge activity.",
    category: "academic",
    difficulty: "medium",
    icon: "📚",
    xpReward: 85,
    progressTarget: 1,
    progressKind: "activity_total",
    activityIds: ["study", "exam-prep"],
  },
  {
    id: "qb-academic-workshop",
    name: "Academic Workshop",
    description: "Join a group study or workshop session.",
    category: "academic",
    difficulty: "medium",
    icon: "🎓",
    xpReward: 95,
    progressTarget: 1,
    progressKind: "activity_total",
    activityIds: ["group-study"],
  },
  // —— Social ——
  {
    id: "qb-add-friend",
    name: "First Connection",
    description: "Add a friend and expand your party.",
    category: "social",
    difficulty: "easy",
    icon: "👋",
    xpReward: 50,
    progressTarget: 1,
    progressKind: "friends",
  },
  {
    id: "qb-join-guild",
    name: "Guild Recruit",
    description: "Join a guild and team up with fellow Rams.",
    category: "social",
    difficulty: "medium",
    icon: "🛡️",
    xpReward: 100,
    progressTarget: 1,
    progressKind: "guild",
    bonusRewards: { achievementId: "guild_member" },
  },
  {
    id: "qb-club-meeting",
    name: "Club Gathering",
    description: "Attend a club meeting or social hangout.",
    category: "social",
    difficulty: "easy",
    icon: "👥",
    xpReward: 65,
    progressTarget: 1,
    progressKind: "activity_total",
    activityIds: ["club", "group-study"],
  },
  {
    id: "qb-quad-comment",
    name: "Community Voice",
    description: "Engage with campus — earn Quad assists from the community.",
    category: "social",
    difficulty: "medium",
    icon: "💬",
    xpReward: 80,
    progressTarget: 3,
    progressKind: "activity_total",
    activityIds: ["club"],
  },
  // —— Campus ——
  {
    id: "qb-memorial-union",
    name: "Union Explorer",
    description: "Explore Memorial Union — scan a campus QR or log social activity.",
    category: "campus",
    difficulty: "medium",
    icon: "🏛️",
    xpReward: 110,
    progressTarget: 1,
    progressKind: "qr_scans",
  },
  {
    id: "qb-career-fair",
    name: "Career Fair Champion",
    description: "Attend a career fair or employer info session.",
    category: "campus",
    difficulty: "hard",
    icon: "💼",
    xpReward: 75,
    progressTarget: 1,
    progressKind: "special_proof",
    requiresProof: true,
    legacySpecialQuestId: "sq-career-fair",
  },
  {
    id: "qb-student-involvement",
    name: "Student Involvement",
    description: "Get involved — club activity or campus event.",
    category: "campus",
    difficulty: "medium",
    icon: "🎪",
    xpReward: 90,
    progressTarget: 1,
    progressKind: "activity_total",
    activityIds: ["club"],
  },
  {
    id: "qb-lecture-event",
    name: "Campus Lecture",
    description: "Attend a campus lecture or signature event.",
    category: "campus",
    difficulty: "hard",
    icon: "🎓",
    xpReward: 100,
    progressTarget: 1,
    progressKind: "special_proof",
    requiresProof: true,
    legacySpecialQuestId: "sq-lecture-event",
  },
  // —— Legendary ——
  {
    id: "qb-campus-pathfinder",
    name: "Campus Pathfinder",
    description: "Visit every major building — complete 5 campus QR milestones.",
    category: "legendary",
    difficulty: "legendary",
    icon: "🧭",
    xpReward: 250,
    progressTarget: 5,
    progressKind: "qr_scans",
    bonusRewards: { badge: "Campus Pathfinder", achievementId: "scan_50_qr", legendScore: 50 },
  },
  {
    id: "qb-founders-trial",
    name: "The Founder's Trial",
    description: "Reach Level 25 and prove yourself a campus veteran.",
    category: "legendary",
    difficulty: "legendary",
    icon: "👑",
    xpReward: 500,
    progressTarget: 25,
    progressKind: "level",
    bonusRewards: { title: "Campus Legend", achievementId: "reach_level_25", legendScore: 100 },
  },
  {
    id: "qb-master-realm",
    name: "Master of the Realm",
    description: "Complete at least one quest from every category on the board.",
    category: "legendary",
    difficulty: "legendary",
    icon: "🌟",
    xpReward: 750,
    progressTarget: 4,
    progressKind: "categories_complete",
    bonusRewards: { badge: "Realm Master", legendScore: 250, title: "Campus Legend" },
  },
  // —— Chain steps: Explorer's Journey ——
  {
    id: "qb-chain-library",
    name: "Explorer's Journey · Library",
    description: "Step 1 — Log a study session at the library.",
    category: "campus",
    difficulty: "easy",
    icon: "📚",
    xpReward: 40,
    progressTarget: 1,
    progressKind: "activity_total",
    activityIds: ["study", "exam-prep"],
    chainId: "explorers_journey",
    chainStep: 0,
  },
  {
    id: "qb-chain-union",
    name: "Explorer's Journey · Memorial Union",
    description: "Step 2 — Log a social activity on campus.",
    category: "campus",
    difficulty: "easy",
    icon: "🏛️",
    xpReward: 40,
    progressTarget: 1,
    progressKind: "activity_total",
    activityIds: ["club", "group-study"],
    chainId: "explorers_journey",
    chainStep: 1,
  },
  {
    id: "qb-chain-event",
    name: "Explorer's Journey · Event",
    description: "Step 3 — Attend a campus event.",
    category: "campus",
    difficulty: "medium",
    icon: "📅",
    xpReward: 50,
    progressTarget: 1,
    progressKind: "events",
    chainId: "explorers_journey",
    chainStep: 2,
  },
  {
    id: "qb-chain-memory",
    name: "Explorer's Journey · Memory",
    description: "Step 4 — Share a memory in The Quad.",
    category: "campus",
    difficulty: "medium",
    icon: "📸",
    xpReward: 50,
    progressTarget: 1,
    progressKind: "quad_posts_total",
    chainId: "explorers_journey",
    chainStep: 3,
    bonusRewards: { badge: "Campus Explorer" },
  },
];

export const QUEST_CHAINS: QuestChainDef[] = [
  {
    id: "explorers_journey",
    name: "The Explorer's Journey",
    description: "A four-step adventure across library, union, events, and memories.",
    icon: "🗺️",
    stepIds: ["qb-chain-library", "qb-chain-union", "qb-chain-event", "qb-chain-memory"],
    finalBonusXp: 500,
    finalBonusRewards: { badge: "Campus Explorer", legendScore: 50 },
  },
];

const CATALOG_BY_ID = new Map(QUEST_BOARD_CATALOG.map((q) => [q.id, q]));

export function getQuestBoardDef(id: string): QuestBoardDef | undefined {
  return CATALOG_BY_ID.get(id);
}

export function getQuestChain(chainId: string): QuestChainDef | undefined {
  return QUEST_CHAINS.find((c) => c.id === chainId);
}

/** Map legacy daily quest stat to board daily template. */
export function statToDailyTemplate(stat: StatKey): string {
  const map: Partial<Record<StatKey, string>> = {
    strength: "gym",
    stamina: "training",
    knowledge: "study",
    social: "quad",
    focus: "training",
  };
  return map[stat] ?? "gym";
}
