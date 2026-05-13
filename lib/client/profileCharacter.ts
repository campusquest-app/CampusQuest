"use client";

import type { Character, CharacterStats } from "@/lib/types";
import { xpToLevel } from "@/lib/level";

export type MeProfileRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  streak_days?: number | null;
  last_activity_date?: string | null;
  onboarding_completed?: boolean | null;
  onboarding_completed_at?: string | null;
  onboarding_character_completed?: boolean | null;
  avatar_custom_json?: string | null;
  character_class_id?: string | null;
  starter_weapon?: string | null;
  scholar_guild_id?: string | null;
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
  const avatar =
    typeof profile.avatar_custom_json === "string" && profile.avatar_custom_json.trim().length > 0
      ? profile.avatar_custom_json.trim()
      : profile.avatar_url && profile.avatar_url.trim().length > 0
        ? profile.avatar_url.trim()
        : "🎓";

  return {
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
    achievements: [],
    unlockedCosmetics: [],
    createdAt: Date.now(),
    classId: profile.character_class_id ?? undefined,
    starterWeapon: profile.starter_weapon ?? undefined,
    scholarGuildId: profile.scholar_guild_id ?? undefined,
    unlockedSkillNodes: [],
    streakFreezes: 0,
    quadAssistScore: 0,
  };
}
