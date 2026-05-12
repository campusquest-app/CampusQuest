import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import type { ProfileRow, UserStatsRow } from "@/lib/server/types";

function sanitizeUsername(seed: string) {
  const normalized = seed
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.slice(0, 20) || "player";
}

function buildUsername(email: string, userId: string) {
  const base = sanitizeUsername(email.split("@")[0] ?? "player");
  return `${base}_${userId.slice(0, 6)}`.slice(0, 24);
}

export async function ensurePlayerSetup(args: {
  userId: string;
  email?: string | null;
  displayName?: string;
}) {
  const { userId, email, displayName } = args;
  const admin = createAdminClient();

  const username = buildUsername(email ?? userId, userId);
  const defaultName = displayName?.trim() || (email ? email.split("@")[0] : "CampusQuest Player");

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      username,
      display_name: defaultName.slice(0, 50),
      bio: "",
    },
    { onConflict: "id" },
  );
  if (profileError) {
    throw new ApiError(400, profileError.message, "PROFILE_SETUP_FAILED");
  }

  const { error: statsError } = await admin.from("user_stats").upsert(
    {
      user_id: userId,
      level: 1,
      total_xp: 0,
      strength: 0,
      stamina: 0,
      knowledge: 0,
      social: 0,
      focus: 0,
    },
    { onConflict: "user_id" },
  );
  if (statsError) {
    throw new ApiError(400, statsError.message, "STATS_SETUP_FAILED");
  }

  const [{ data: profile, error: profileFetchError }, { data: stats, error: statsFetchError }] =
    await Promise.all([
      admin.from("profiles").select("*").eq("id", userId).single(),
      admin.from("user_stats").select("*").eq("user_id", userId).single(),
    ]);

  if (profileFetchError || !profile) {
    throw new ApiError(404, profileFetchError?.message ?? "Profile not found after setup.", "PROFILE_NOT_FOUND");
  }
  if (statsFetchError || !stats) {
    throw new ApiError(404, statsFetchError?.message ?? "Stats not found after setup.", "STATS_NOT_FOUND");
  }

  return {
    profile: profile as ProfileRow,
    stats: stats as UserStatsRow,
  };
}

