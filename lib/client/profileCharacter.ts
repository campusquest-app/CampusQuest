"use client";

import { resolveProfileAvatar } from "@/lib/avatarSource";
import type { Character, CharacterStats } from "@/lib/types";
import { xpToLevel } from "@/lib/level";

export type MeProfileRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  bio?: string | null;
  major?: string | null;
  class_year?: number | null;
  game_state_json?: Record<string, unknown> | null;
  streak_days?: number | null;
  last_activity_date?: string | null;
  onboarding_completed?: boolean | null;
  onboarding_completed_at?: string | null;
  onboarding_character_completed?: boolean | null;
  /** Server: starter "New Player Protocol" overlay suppressed after first dismiss or backfill. */
  starter_intro_seen_at?: string | null;
  beginner_chain_completed_at?: string | null;
  beginner_chain_celebration_seen_at?: string | null;
  avatar_custom_json?: string | null;
  character_class_id?: string | null;
  starter_weapon?: string | null;
  scholar_guild_id?: string | null;
  /** When display/username last changed — used for client-side cooldown UX. */
  display_name_changed_at?: string | null;
  username_changed_at?: string | null;
  /** Present for allowlisted emails: rolling 7‑day caps on renames. */
  weekly_identity_budget?: {
    max_per_week: number;
    window_days: number;
    display_used: number;
    username_used: number;
  } | null;
};

export type MeStatsRow = {
  user_id: string;
  level: number;
  total_xp: number;
  strength: number;
  stamina: number;
  knowledge: number;
  social: number;
  focus: number;
  bosses_defeated?: number | null;
  final_bosses_defeated?: number | null;
};

function defaultStats(s: Partial<CharacterStats>): CharacterStats {
  return {
    strength: Math.max(0, Number(s.strength ?? 0)),
    stamina: Math.max(0, Number(s.stamina ?? 0)),
    knowledge: Math.max(0, Number(s.knowledge ?? 0)),
    social: Math.max(0, Number(s.social ?? 0)),
    focus: Math.max(0, Number(s.focus ?? 0)),
  };
}

/** Build local gameplay character from authoritative profile + stats (Supabase uuid as id). */
export function buildLocalCharacterFromServer(profile: MeProfileRow, stats: MeStatsRow): Character {
  const totalXP = Math.max(0, Number(stats.total_xp ?? 0));
  const avatar = resolveProfileAvatar(profile);

  const gs = profile.game_state_json;
  const achievements =
    gs && Array.isArray((gs as { achievements?: unknown }).achievements)
      ? ((gs as { achievements: string[] }).achievements)
      : [];
  const unlockedCosmetics =
    gs && Array.isArray((gs as { unlockedCosmetics?: unknown }).unlockedCosmetics)
      ? ((gs as { unlockedCosmetics: string[] }).unlockedCosmetics)
      : [];
  const guildIds =
    gs && Array.isArray((gs as { guildIds?: unknown }).guildIds)
      ? ((gs as { guildIds: string[] }).guildIds)
      : [];
  const unlockedSkillNodes =
    gs && Array.isArray((gs as { unlockedSkillNodes?: unknown }).unlockedSkillNodes)
      ? ((gs as { unlockedSkillNodes: string[] }).unlockedSkillNodes)
      : [];

  const equipped =
    gs && typeof (gs as { equippedCosmetics?: unknown }).equippedCosmetics === "object" && (gs as { equippedCosmetics?: unknown }).equippedCosmetics != null
      ? ((gs as { equippedCosmetics: Character["equippedCosmetics"] }).equippedCosmetics)
      : undefined;

  const base: Character = {
    id: profile.id,
    name: profile.display_name?.trim() || "Student",
    username: profile.username?.trim().toLowerCase().replace(/\s+/g, "_") || "student",
    avatar,
    level: Math.max(1, xpToLevel(totalXP)),
    totalXP,
    stats: defaultStats({
      strength: stats.strength,
      stamina: stats.stamina,
      knowledge: stats.knowledge,
      social: stats.social,
      focus: stats.focus,
    }),
    streakDays: Math.max(0, Number(profile.streak_days ?? 0)),
    lastActivityDate: profile.last_activity_date ?? null,
    achievements,
    unlockedCosmetics,
    createdAt: Date.now(),
    classId: profile.character_class_id ?? undefined,
    starterWeapon: profile.starter_weapon ?? undefined,
    scholarGuildId: profile.scholar_guild_id ?? undefined,
    unlockedSkillNodes,
    streakFreezes: typeof (gs as { streakFreezes?: unknown })?.streakFreezes === "number" ? Number((gs as { streakFreezes: number }).streakFreezes) : 0,
    quadAssistScore:
      typeof (gs as { quadAssistScore?: unknown })?.quadAssistScore === "number" ? Number((gs as { quadAssistScore: number }).quadAssistScore) : 0,
    guildIds,
    bossesDefeatedCount: Math.max(0, Number(stats.bosses_defeated ?? 0)),
    finalBossesDefeatedCount: (() => {
      const fromStats =
        stats.final_bosses_defeated != null ? Math.max(0, Number(stats.final_bosses_defeated)) : null;
      const fromGs =
        typeof (gs as { finalBossesDefeatedCount?: unknown })?.finalBossesDefeatedCount === "number"
          ? Math.max(0, Number((gs as { finalBossesDefeatedCount: number }).finalBossesDefeatedCount))
          : 0;
      return fromStats != null ? Math.max(fromStats, fromGs) : fromGs;
    })(),
    equippedCosmetics: equipped,
    miniGameTraining:
      gs && typeof gs === "object"
        ? (gs as { miniGameTraining?: Character["miniGameTraining"] }).miniGameTraining
        : undefined,
    statPrestige:
      gs && typeof gs === "object"
        ? (gs as { statPrestige?: Character["statPrestige"] }).statPrestige
        : undefined,
    streakBonusXpByDate:
      gs && typeof gs === "object"
        ? (gs as { streakBonusXpByDate?: Character["streakBonusXpByDate"] }).streakBonusXpByDate
        : undefined,
    lastSurpriseQuestCompletedDay:
      gs && typeof gs === "object"
        ? (gs as { lastSurpriseQuestCompletedDay?: string }).lastSurpriseQuestCompletedDay
        : undefined,
    surpriseQuestDay: gs && typeof gs === "object" ? (gs as { surpriseQuestDay?: string }).surpriseQuestDay : undefined,
    completedSpecialQuests:
      gs && Array.isArray((gs as { completedSpecialQuests?: unknown }).completedSpecialQuests)
        ? ((gs as { completedSpecialQuests: string[] }).completedSpecialQuests)
        : undefined,
    specialQuestProofs:
      gs && typeof (gs as { specialQuestProofs?: unknown }).specialQuestProofs === "object"
        ? ((gs as { specialQuestProofs: Character["specialQuestProofs"] }).specialQuestProofs)
        : undefined,
    featuredAchievementIds:
      gs && Array.isArray((gs as { featuredAchievementIds?: unknown }).featuredAchievementIds)
        ? ((gs as { featuredAchievementIds: string[] }).featuredAchievementIds)
        : undefined,
    equippedTitleId:
      typeof (gs as { equippedTitleId?: unknown })?.equippedTitleId === "string"
        ? (gs as { equippedTitleId: string }).equippedTitleId
        : (gs as { equippedTitleId?: null })?.equippedTitleId === null
          ? null
          : undefined,
    achievementEarnedAt:
      gs && typeof (gs as { achievementEarnedAt?: unknown }).achievementEarnedAt === "object"
        ? ((gs as { achievementEarnedAt: Character["achievementEarnedAt"] }).achievementEarnedAt)
        : undefined,
    qrMilestones:
      gs && typeof (gs as { qrMilestones?: unknown }).qrMilestones === "object"
        ? ((gs as { qrMilestones: Character["qrMilestones"] }).qrMilestones)
        : undefined,
    eventsAttendedCount:
      typeof (gs as { eventsAttendedCount?: unknown })?.eventsAttendedCount === "number"
        ? Number((gs as { eventsAttendedCount: number }).eventsAttendedCount)
        : undefined,
    foundingMember: Boolean((gs as { foundingMember?: unknown })?.foundingMember),
    betaTester: Boolean((gs as { betaTester?: unknown })?.betaTester),
    talentPioneer: Boolean((gs as { talentPioneer?: unknown })?.talentPioneer),
    torchBearerBadge: Boolean((gs as { torchBearerBadge?: unknown })?.torchBearerBadge),
    torchBearerFounderNumber:
      typeof (gs as { torchBearerFounderNumber?: unknown })?.torchBearerFounderNumber === "number"
        ? Math.max(1, Math.floor(Number((gs as { torchBearerFounderNumber: number }).torchBearerFounderNumber)))
        : undefined,
    acceptedQuestIds:
      gs && Array.isArray((gs as { acceptedQuestIds?: unknown }).acceptedQuestIds)
        ? ((gs as { acceptedQuestIds: string[] }).acceptedQuestIds)
        : undefined,
    questBoardClaims:
      gs && typeof (gs as { questBoardClaims?: unknown }).questBoardClaims === "object"
        ? ((gs as { questBoardClaims: Character["questBoardClaims"] }).questBoardClaims)
        : undefined,
    questChainProgress:
      gs && typeof (gs as { questChainProgress?: unknown }).questChainProgress === "object"
        ? ((gs as { questChainProgress: Character["questChainProgress"] }).questChainProgress)
        : undefined,
  };

  const bioTrim = typeof profile.bio === "string" ? profile.bio.trim() : "";
  if (bioTrim) base.bio = bioTrim;

  return base;
}
