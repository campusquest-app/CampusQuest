import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import type { ProfileRow, UserStatsRow } from "@/lib/server/types";
import {
  isKnownQaAccountEmail,
  QA_ACCOUNT_PROFILE_FLAGS,
} from "@/lib/internalAccount";

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

async function waitForAuthUser(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (!error && data?.user?.id === userId) {
      return;
    }
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 120 * attempt));
    }
  }
  throw new ApiError(
    400,
    "Auth account was created but is not available yet. Please try signing in again in a moment.",
    "AUTH_USER_NOT_READY",
  );
}

export async function ensurePlayerSetup(args: {
  userId: string;
  email?: string | null;
  displayName?: string;
  username?: string;
}) {
  const { userId, email, displayName, username: preferredUsername } = args;
  const admin = createAdminClient();
  await waitForAuthUser(admin, userId);

  const username = preferredUsername?.trim()
    ? sanitizeUsername(preferredUsername).slice(0, 24) || buildUsername(email ?? userId, userId)
    : buildUsername(email ?? userId, userId);
  const defaultName = displayName?.trim() || (email ? email.split("@")[0] : "CampusQuest Player");

  // role intentionally omitted for normal users: they choose Student /
  // Faculty-Staff on the account-type onboarding screen (NULL = not chosen).
  // Known QA emails are flagged immediately so they bypass campus-domain
  // gates, stay hidden from public surfaces, and never earn competitive rewards.
  const isQa = isKnownQaAccountEmail(email);
  const profileInsert: Record<string, unknown> = {
    id: userId,
    username,
    display_name: defaultName.slice(0, 50),
    bio: "",
    ...(isQa ? QA_ACCOUNT_PROFILE_FLAGS : {}),
  };

  const { error: profileError } = await admin.from("profiles").upsert(profileInsert, {
    onConflict: "id",
    ignoreDuplicates: true,
  });
  if (profileError) {
    throw new ApiError(400, profileError.message, "PROFILE_SETUP_FAILED");
  }

  if (isQa) {
    // ignoreDuplicates may leave an older unflagged row — force QA flags.
    const { error: flagError } = await admin
      .from("profiles")
      .update({ ...QA_ACCOUNT_PROFILE_FLAGS })
      .eq("id", userId);
    if (flagError && !/column .* does not exist/i.test(flagError.message ?? "")) {
      throw new ApiError(400, flagError.message, "QA_PROFILE_FLAGS_FAILED");
    }
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
    { onConflict: "user_id", ignoreDuplicates: true },
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

