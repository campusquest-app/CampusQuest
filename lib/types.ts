// Character + stats — one avatar, stats grow from real actions

export const STAT_KEYS = [
  "strength",
  "stamina",
  "knowledge",
  "social",
  "focus",
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

/** Maximum value for any single stat. Bars show gold/fancy when at cap. */
export const MAX_STAT = 1000;

export const STAT_LABELS: Record<StatKey, string> = {
  strength: "Strength",
  stamina: "Stamina",
  knowledge: "Knowledge",
  social: "Social",
  focus: "Focus",
};

export interface CharacterStats {
  strength: number;
  stamina: number;
  knowledge: number;
  social: number;
  focus: number;
}

/** Persisted state for stat mini-games (2 plays/day, weekly all-stats bonus). */
export interface MiniGameTrainingPersist {
  day: string;
  playsUsed: number;
  statsTrainedToday: StatKey[];
  dailyQuotaBonusClaimed: boolean;
  weekKey: string;
  weekStatsTrained: StatKey[];
  weekAllFiveBonusClaimed: boolean;
  /** Consecutive days the player used both daily plays */
  fullTrainingStreak: number;
  lastFullTrainingDay: string | null;
}

export interface Character {
  id: string;
  name: string;
  username: string; // for @handle in feed
  avatar: string;
  level: number;
  totalXP: number;
  stats: CharacterStats;
  streakDays: number;
  lastActivityDate: string | null; // YYYY-MM-DD
  achievements: string[]; // e.g. "First Quest Completed", "7-Day Streak"
  /** Cosmetic item ids unlocked (hats, glasses, backpacks). */
  unlockedCosmetics?: string[];
  createdAt: number;
  /** CampusQuest class: knight, gym, mage, bard, rogue */
  classId?: string;
  /** Starter weapon: textbook, dumbbell, laptop, coffee, guitar */
  starterWeapon?: string;
  /** Total bosses defeated (incremented when a defeated boss is removed). */
  bossesDefeatedCount?: number;
  /** Total final bosses (HP > 500) defeated. */
  finalBossesDefeatedCount?: number;
  /** Prestige count per stat (reset to 0 when prestiging; this number is shown next to stat name). */
  statPrestige?: Partial<Record<StatKey, number>>;
  /** IDs of completed special quests (one-time; claim grants XP). */
  completedSpecialQuests?: string[];
  /** Proof URL/text per completed special quest (questId -> proof). */
  specialQuestProofs?: Record<string, string>;
  /** Up to 2 guild ids the character belongs to. */
  guildIds?: string[];
  /** @deprecated Use guildIds. Kept for migration. */
  guildId?: string;
  /** Short bio shown on profile. */
  bio?: string;
  /** Unlocked skill tree node ids. */
  unlockedSkillNodes?: string[];
  /** Equipped boss-drop cosmetics (buffs apply when unlocked). */
  equippedCosmetics?: Partial<Record<"hat" | "glasses" | "backpack", string>>;
  /** Rare consumable: auto-saves streak once when you would lose it. */
  streakFreezes?: number;
  /** YYYY-MM-DD of last completed surprise quest day. */
  lastSurpriseQuestCompletedDay?: string;
  /** Partial progress toward today's surprise (optional). */
  surpriseQuestDay?: string;
  /** @deprecated Legacy single mini-game; use miniGameTraining */
  lastMiniGameXpDay?: string;
  /** Daily training plays (stat mini-games), quotas, and weekly ring. */
  miniGameTraining?: MiniGameTrainingPersist;
  /** Running tally from Quad "Assist" reactions (group quest vibe). */
  quadAssistScore?: number;
  /** XP toward daily streak minimum from sources other than activity logs (Quad, bosses, training, quests). Key: YYYY-MM-DD. */
  streakBonusXpByDate?: Record<string, number>;
  /** Optional: college-based Scholars Guild grouping for themed leaderboards. */
  scholarGuildId?: string;
  /** Catalog achievement ids showcased on profile (max 3). */
  featuredAchievementIds?: string[];
  /** Equipped title id from achievements catalog. */
  equippedTitleId?: string | null;
  /** ISO timestamps when catalog achievements were earned. */
  achievementEarnedAt?: Record<string, string>;
  /** ISO timestamps when an achievement unlock celebration was shown/dismissed (so it only plays once). */
  achievementCelebratedAt?: Record<string, string>;
  /** QR milestone unlock metadata from server. */
  qrMilestones?: Record<string, { unlockedAt: string; title: string }>;
  /** Campus events attended (future server sync). */
  eventsAttendedCount?: number;
  /** Special program flags for rare badges. */
  foundingMember?: boolean;
  betaTester?: boolean;
  talentPioneer?: boolean;
  /** Torch Bearer Badge — original beta founder program. */
  torchBearerBadge?: boolean;
  torchBearerFounderNumber?: number;
  /** Multi-step quest chain progress (chainId -> highest completed step index, 0-based). */
  questChainProgress?: Record<string, number>;
  /** @deprecated Legacy Quest Board accept list; quests are auto-available. */
  acceptedQuestIds?: string[];
  /** Quest Board: claimed quest ids mapped to ISO claim time. */
  questBoardClaims?: Record<string, string>;
}

// —— Guilds ——
export type GuildInterest = "study" | "fitness" | "networking" | "clubs";

export interface Guild {
  id: string;
  name: string;
  crest: string; // emoji or icon
  level: number;
  /** Guild XP (e.g. from member streaks). Level can be derived as 1 + floor(xp / 100). */
  xp?: number;
  memberIds: string[];
  weeklyQuestGoal: string;
  interest: GuildInterest;
  createdAt: number;
  /** Exactly one founder per guild. */
  createdByUserId: string;
  /** Required when the guild has more than 10 members. Only founder can set; must be a member (≠ founder). */
  cofounderUserId?: string;
}

export interface GuildInviteRequest {
  id: string;
  guildId: string;
  userId: string;
  status: "pending" | "approved" | "declined";
  createdAt: number;
}

// —— Find Friends (social) ——
export type FriendRequestStatus = "pending" | "accepted" | "declined";

export interface FriendRequest {
  id: string;
  fromUserId: string;
  fromUsername: string;
  fromName: string;
  fromAvatar: string;
  toUsername: string;
  status: FriendRequestStatus;
  createdAt: number;
}

/** Snapshot of a friend for display (level, stats). */
export interface Friend {
  userId: string;
  username: string;
  name: string;
  avatar: string;
  level: number;
  totalXP: number;
  stats: CharacterStats;
  streakDays: number;
  addedAt: number;
  bossesDefeatedCount?: number;
  /** Highest guild level among the friend's guilds (for leaderboard). */
  highestGuildLevel?: number;
  finalBossesDefeatedCount?: number;
}

/** A single direct message between two friends. */
export interface DirectMessage {
  id: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  text: string;
  createdAt: number;
}

export interface ActivityDefinition {
  id: string;
  label: string;
  description: string;
  stat: StatKey;
  /** Base XP before streak multiplier and minutes scaling */
  baseXp: number;
  /** Legacy: flat XP if no minutes (use baseXp for spec) */
  xp: number;
  statGain: number;
  icon: string;
  /** If true, XP scales with minutes (+5 per 10 min); stat scales with minutes too */
  usesMinutes?: boolean;
}

export interface ActivityLog {
  id: string;
  characterId: string;
  activityId: string;
  createdAt: number;
  /** Optional: for study/focus, used for XP and stat scaling */
  minutes?: number;
  proofUrl?: string;
  tags?: string[];
  /** XP actually awarded for this log (for streak daily minimum) */
  xpEarned?: number;
  /** When set (QR check-ins), recap cards can attribute stat gains without a catalog activity id. */
  qrStatContribution?: { stat: StatKey; gain: number };
  /** Profile activity feed type — drives icon/title rendering. */
  feedType?:
    | "qr_check_in"
    | "quest_completed"
    | "xp_reward"
    | "manual_log"
    | "post_created"
    | "memory_saved";
  /** Human-readable feed title (preferred over catalog label). */
  title?: string;
  /** Secondary line under the title in the Activity tab. */
  description?: string;
  qrCodeId?: string;
  questId?: string;
  locationName?: string;
}

// —— The Quad (social feed) ——
// RamMark: max 15 chars, up to 10 per Field Note, separate from 300-char limit
export const RAMMARK_MAX_LENGTH = 15;
export const RAMMARK_MAX_PER_POST = 10;
export const FIELD_NOTE_MAX_CHARS = 300;

export interface RamMark {
  id: string;
  tag: string; // normalized lowercase, no # in storage
}

/** Who can see this post: public = everyone on The Quad, friends = only you and your friends */
export type QuadPostVisibility = "public" | "friends";

/** Approved (or pending for author) entity tag attached to a FieldNote / Quad post. */
export type FieldNoteTag = {
  id: string;
  entityType: "user" | "organization" | "event" | "external_event";
  entityId: string;
  tagSource: "composer" | "photo" | "mention" | string;
  mediaKey?: string | null;
  positionX?: number | null;
  positionY?: number | null;
  displayLabel: string;
  status: "pending" | "approved" | "rejected" | "removed" | string;
};

/** Caption @mention span metadata. */
export type FieldNoteMention = {
  entityType: "user" | "organization" | "event" | "external_event";
  entityId: string;
  displayText: string;
  startIndex: number;
  endIndex: number;
};

export interface FieldNote {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  body: string;
  ramMarks: RamMark[];
  nodCount: number;
  /** @deprecated Prefer hypeCount; kept for migration */
  vouchCount: number;
  nodByUserIds: Set<string>;
  /** @deprecated Prefer hypeByUserIds */
  vouchByUserIds: Set<string>;
  hypeCount: number;
  verifyCount: number;
  assistCount: number;
  hypeByUserIds: Set<string>;
  verifyByUserIds: Set<string>;
  assistByUserIds: Set<string>;
  createdAt: number;
  proofUrl?: string; // optional proof image or video playback URL (cover)
  /** image | video | none — cover media type */
  mediaType?: "none" | "image" | "video";
  /** Poster/thumbnail for video cover */
  posterUrl?: string;
  mediaDurationSeconds?: number;
  mediaHasAudio?: boolean;
  mediaWidth?: number;
  mediaHeight?: number;
  /** Ordered carousel slides (1–15). Empty/undefined = legacy single proofUrl. */
  media?: import("./quadMedia").QuadCarouselMediaDto[];
  mediaCount?: number;
  coverMediaId?: string;
  /** public = show on Public Quad; friends = show only on Friends feed (you + your friends) */
  visibility?: QuadPostVisibility;
  /** Snapshot for feed badges (optional). */
  authorStreakDays?: number;
  /** Optional Realm location tag for future campus galleries. */
  locationId?: string;
  locationName?: string;
  /**
   * Seeded posts start with display counts before any real user ids exist in the Sets.
   * When hydrated into `feed`, reactions add on top: e.g. nodCount = baseline.nod + nodByUserIds.size.
   */
  reactionBaseline?: {
    nod: number;
    hype: number;
    verify: number;
    assist: number;
  };
  /** True when loaded from Supabase — counts are authoritative from DB. */
  isPersisted?: boolean;
  /** Server-backed comment count from quad_posts.comments_count. */
  commentCount?: number;
  /** Structured people/org/event tags on this post. */
  tags?: FieldNoteTag[];
  /** Caption @mention metadata. */
  mentions?: FieldNoteMention[];
  mediaId?: string;
  /** Up to 3 recent likers for Instagram-style "Liked by" (connections prioritized). */
  likedByPreview?: import("./quadFieldNote").QuadPostLikerPreview[];
}

// For serialization we store nod/rally as arrays
export interface FieldNoteSerialized {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  body: string;
  ramMarks: RamMark[];
  nodCount: number;
  vouchCount: number;
  nodByUserIds: string[];
  vouchByUserIds: string[];
  hypeCount?: number;
  verifyCount?: number;
  assistCount?: number;
  hypeByUserIds?: string[];
  verifyByUserIds?: string[];
  assistByUserIds?: string[];
  createdAt: number;
  proofUrl?: string;
  visibility?: QuadPostVisibility;
  authorStreakDays?: number;
  locationId?: string;
  locationName?: string;
}

/** Comment on a Quad post (field note). */
export const QUAD_COMMENT_MAX_CHARS = 200;

export interface QuadComment {
  id: string;
  noteId: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  body: string;
  createdAt: number;
  parentCommentId?: string | null;
  likeCount: number;
  viewerHasLiked: boolean;
}

/** Temporary campus moment tied to a location (24h default). */
export type CampusMemoryMediaType = "text" | "image" | "video";
export type CampusMemoryVisibility = "public" | "friends" | "campus";

export interface CampusMemory {
  id: string;
  userId: string;
  /** Canonical Realm location id (the-quad, library, …). */
  locationId: string;
  /** @deprecated Use locationId. Legacy snake_case key for admin/QR compat. */
  locationKey: string;
  locationName: string;
  eventId: string | null;
  mediaUrl: string | null;
  mediaType: CampusMemoryMediaType;
  body: string | null;
  visibility: CampusMemoryVisibility;
  expiresAt: string;
  savedToProfile: boolean;
  createdAt: string;
  updatedAt: string;
  username: string;
  displayName: string;
  authorAvatar: string;
  postedAgoLabel: string;
  likeCount: number;
  likedByMe: boolean;
  starCount: number;
  starredByMe: boolean;
}

export interface CampusMemoryGroup {
  locationId: string;
  /** @deprecated Use locationId. */
  locationKey: string;
  locationName: string;
  count: number;
  latestCreatedAt: string;
  latestPreview: string | null;
  latestMediaType: CampusMemoryMediaType | null;
  latestAuthorAvatar: string | null;
  hasRecent: boolean;
}

/** Per-location memory counts for Realm map pins. */
export interface CampusMemoryLocationStats {
  locationId: string;
  locationName: string;
  activeCount: number;
  archivedCount: number;
  totalCount: number;
}

export interface CampusMemoryArchiveSection {
  locationId: string;
  locationName: string;
  memories: CampusMemory[];
}

// —— Daily quests ——
export interface DailyQuest {
  id: string;
  title: string;
  description: string;
  stat: StatKey;
  targetCount: number;
  xpReward: number;
  icon: string;
}

/** One-time special campus quests (higher XP than daily). */
export interface SpecialQuest {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  icon: string;
}

export interface DailyQuestProgress {
  questId: string;
  currentCount: number;
  completed: boolean;
  claimedAt?: number;
}

// —— Boss battles (midterms, finals, group projects) ——
export type BossType = "midterm" | "final" | "group_project";

export interface Boss {
  id: string;
  type: BossType;
  name: string;
  description: string;
  dueDate: string; // YYYY-MM-DD
  xpReward: number;
  icon: string;
  /** Starting HP; study sessions deal damage until 0 */
  bossHp: number;
}

export interface BossProgress {
  bossId: string;
  currentHp: number;
  defeated: boolean;
  defeatedAt?: number;
}

/** Python-style current boss: one active boss (name + HP) that study sessions damage */
export interface CurrentBoss {
  name: string;
  hp: number;
  maxHp: number;
  active: boolean;
  startedAt: number;
}

/** User-created boss: custom name and HP; one can be "active" (receiving study damage). XP = 100 + (maxHp - 250) / 10 * 5. */
export interface UserBoss {
  id: string;
  name: string;
  maxHp: number;
  currentHp: number;
  defeated: boolean;
  defeatedAt?: number;
  createdAt: number;
  /** XP awarded on defeat (100 at 250 HP, +5 per 10 HP above 250) */
  xpReward: number;
  /** Weakness: activities matching this stat deal extra damage. */
  weaknessStat?: StatKey;
  /** Loot cosmetic ids dropped when defeated. */
  loot?: string[];
}
