import { getClassTitle } from "@/lib/characterClasses";
import { xpToLevel } from "@/lib/level";

const SCHOLAR_GUILD_LABELS: Record<string, string> = {
  arts_sciences: "Arts & Sciences Guild",
  business: "Business Guild",
  education: "Education Guild",
  engineering: "Engineering Guild",
  health_sciences: "Health Sciences Guild",
  environment_life_sciences: "Environment & Life Guild",
  nursing: "Nursing Guild",
  pharmacy: "Pharmacy Guild",
};

export type PlayerPublicStats = {
  level: number;
  xp: number;
  streakDays: number;
  title: string | null;
  guild: string | null;
  stats: {
    strength: number;
    stamina: number;
    knowledge: number;
    social: number;
    focus: number;
  };
  /** False when no `user_stats` row exists for this player. */
  statsAvailable: boolean;
};

type UserStatsSlice = {
  level?: number | null;
  total_xp?: number | null;
  strength?: number | null;
  stamina?: number | null;
  knowledge?: number | null;
  social?: number | null;
  focus?: number | null;
};

export type ProfileStatsSlice = {
  character_class_id?: string | null;
  scholar_guild_id?: string | null;
  streak_days?: number | null;
  game_state_json?: Record<string, unknown> | null;
  user_stats?: UserStatsSlice | UserStatsSlice[] | null;
};

export function guildLabelFromProfile(profile: {
  scholar_guild_id?: string | null;
  game_state_json?: Record<string, unknown> | null;
}): string | null {
  const scholarId = profile.scholar_guild_id;
  if (scholarId && scholarId !== "undecided") {
    return SCHOLAR_GUILD_LABELS[scholarId] ?? "Scholars Guild";
  }
  const gs = profile.game_state_json;
  const guildIds = gs && Array.isArray(gs.guildIds) ? (gs.guildIds as string[]) : [];
  if (guildIds.length > 0) return "Campus Guild";
  return null;
}

/** Same level/xp/stat source as leaderboards and profile views. */
export function mapPlayerPublicStats(profile: ProfileStatsSlice): PlayerPublicStats {
  const statsRow = Array.isArray(profile.user_stats) ? profile.user_stats[0] : profile.user_stats;
  const streakDays = Math.max(0, Number(profile.streak_days ?? 0));
  const title = getClassTitle(profile.character_class_id) ?? null;
  const guild = guildLabelFromProfile(profile);

  if (!statsRow) {
    return {
      level: 1,
      xp: 0,
      streakDays,
      title,
      guild,
      stats: { strength: 0, stamina: 0, knowledge: 0, social: 0, focus: 0 },
      statsAvailable: false,
    };
  }

  const xp = Math.max(0, Number(statsRow.total_xp ?? 0));
  const level = xpToLevel(xp);

  return {
    level,
    xp,
    streakDays,
    title,
    guild,
    stats: {
      strength: Math.max(0, Number(statsRow.strength ?? 0)),
      stamina: Math.max(0, Number(statsRow.stamina ?? 0)),
      knowledge: Math.max(0, Number(statsRow.knowledge ?? 0)),
      social: Math.max(0, Number(statsRow.social ?? 0)),
      focus: Math.max(0, Number(statsRow.focus ?? 0)),
    },
    statsAvailable: true,
  };
}
