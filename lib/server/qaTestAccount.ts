import { ApiError } from "@/lib/server/http";
import { findAuthUserIdByEmail } from "@/lib/server/authBootstrap";
import { createAdminClient } from "@/lib/server/supabase";

/**
 * Permanent QA test account for exercising the sign-up / onboarding flow.
 *
 * Invariants:
 * - The account is never deleted; instead its onboarding state is reset.
 * - profiles.is_test_user = true, profiles.is_hidden = true, profiles.role = 'qa'.
 * - Every reset path checks is_test_user = true so a real user can never be affected.
 * - The account never earns XP, badges, or streaks and is excluded from all
 *   public surfaces (leaderboards, search, analytics) via is_hidden filters.
 */

export const QA_TEST_ACCOUNT_EMAIL = (
  process.env.QA_TEST_ACCOUNT_EMAIL ?? "qa-signup@campusquest.app"
).toLowerCase();

/** True only for rows explicitly flagged as test users. */
export function isTestUserProfile(
  profile: { is_test_user?: boolean | null } | null | undefined,
): boolean {
  return profile?.is_test_user === true;
}

type ClientLike = Pick<ReturnType<typeof createAdminClient>, "from">;

/**
 * IDs of profiles flagged is_hidden = true (QA/test accounts).
 * Used to exclude them from leaderboards, search, analytics, and other public
 * surfaces. Tolerates a pre-migration schema by returning an empty set.
 */
export async function listHiddenUserIds(client?: ClientLike): Promise<Set<string>> {
  try {
    const supabase = client ?? createAdminClient();
    const { data, error } = await supabase.from("profiles").select("id").eq("is_hidden", true);
    if (error || !data) return new Set();
    return new Set(data.map((row) => row.id as string));
  } catch {
    // Hidden-user filtering must never break the surface that uses it.
    return new Set();
  }
}

const IS_DEV = process.env.NODE_ENV !== "production";

function logQa(stage: string, detail: Record<string, unknown>): void {
  if (!IS_DEV) return;
  console.info(`[cq:qa-account] ${stage}`, detail);
}

/**
 * Onboarding-related profile columns restored to their brand-new-user values.
 * Auth credentials, id, username, display_name, and the QA flags are preserved.
 */
const PROFILE_ONBOARDING_RESET = {
  onboarding_completed: false,
  onboarding_completed_at: null,
  onboarding_character_completed: false,
  avatar_custom_json: null,
  avatar_url: null,
  character_class_id: null,
  starter_weapon: null,
  scholar_guild_id: null,
  starter_intro_seen_at: null,
  beginner_chain_completed_at: null,
  beginner_chain_celebration_seen_at: null,
  game_state_json: null,
  equipment_loadout_json: null,
  character_stats_json: null,
  guild_id: null,
  streak_days: 0,
  last_activity_date: null,
  major: null,
  class_year: null,
  bio: "",
} as const;

/** Columns that may not exist on older schemas — retried without on 42703. */
const OPTIONAL_RESET_COLUMNS = [
  "starter_intro_seen_at",
  "beginner_chain_completed_at",
  "beginner_chain_celebration_seen_at",
  "game_state_json",
  "equipment_loadout_json",
  "character_stats_json",
  "guild_id",
  "streak_days",
  "last_activity_date",
  "major",
  "class_year",
] as const;

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  return /column .* does not exist/i.test(error.message ?? "");
}

async function updateProfileResetTolerant(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<void> {
  const patch: Record<string, unknown> = { ...PROFILE_ONBOARDING_RESET };
  // Try the full patch first; drop optional columns one by one if the schema lacks them.
  for (let attempt = 0; attempt <= OPTIONAL_RESET_COLUMNS.length; attempt += 1) {
    const { error } = await admin
      .from("profiles")
      .update(patch)
      .eq("id", userId)
      .eq("is_test_user", true);
    if (!error) return;
    if (!isMissingColumnError(error)) {
      throw new ApiError(400, error.message, "QA_RESET_PROFILE_FAILED");
    }
    const missing = OPTIONAL_RESET_COLUMNS.find(
      (col) => col in patch && (error.message ?? "").includes(col),
    );
    if (!missing) {
      throw new ApiError(400, error.message, "QA_RESET_PROFILE_FAILED");
    }
    delete patch[missing];
  }
  throw new ApiError(400, "Could not reset QA profile columns.", "QA_RESET_PROFILE_FAILED");
}

/** Best-effort delete of per-user rows in tables that feed onboarding state. */
async function deleteUserRows(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  column: string,
  userId: string,
): Promise<void> {
  const { error } = await admin.from(table).delete().eq(column, userId);
  // Missing tables/columns (older environments) are fine; anything else should surface in dev.
  if (error && !isMissingColumnError(error) && error.code !== "42P01") {
    logQa("reset_table_failed", { table, error: error.message });
  }
}

/**
 * Restore the QA account to a brand-new-user state without touching auth
 * credentials. Throws if the target user is not flagged is_test_user = true.
 */
export async function resetQaOnboardingState(userId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: profile, error: loadError } = await admin
    .from("profiles")
    .select("id, is_test_user")
    .eq("id", userId)
    .maybeSingle();

  if (loadError) {
    throw new ApiError(400, loadError.message, "QA_RESET_LOOKUP_FAILED");
  }
  if (!profile || profile.is_test_user !== true) {
    throw new ApiError(
      403,
      "Onboarding reset is only allowed for QA test accounts (is_test_user = true).",
      "QA_RESET_NOT_TEST_USER",
    );
  }

  await updateProfileResetTolerant(admin, userId);

  // Onboarding-adjacent state: discovery prefs, legal consents (so the consent
  // screens show again), tutorial/beginner progress, and any earned rewards.
  await deleteUserRows(admin, "user_onboarding_preferences", "user_id", userId);
  await deleteUserRows(admin, "user_legal_consents", "user_id", userId);
  await deleteUserRows(admin, "beginner_quest_claims", "user_id", userId);
  await deleteUserRows(admin, "xp_logs", "user_id", userId);
  await deleteUserRows(admin, "user_quests", "user_id", userId);
  await deleteUserRows(admin, "quest_completions", "user_id", userId);
  await deleteUserRows(admin, "user_equipment", "user_id", userId);
  await deleteUserRows(admin, "user_activity_events", "user_id", userId);
  await deleteUserRows(admin, "guild_members", "user_id", userId);
  await deleteUserRows(admin, "unlocked_milestones", "user_id", userId);
  await deleteUserRows(admin, "quad_posts", "user_id", userId);
  await deleteUserRows(admin, "quad_post_comments", "user_id", userId);
  await deleteUserRows(admin, "quad_post_reactions", "user_id", userId);
  await deleteUserRows(admin, "campus_memories", "user_id", userId);
  await deleteUserRows(admin, "qr_scans", "user_id", userId);
  await deleteUserRows(admin, "event_rsvps", "user_id", userId);
  await deleteUserRows(admin, "notifications", "user_id", userId);
  await deleteUserRows(admin, "student_connections", "requester_id", userId);
  await deleteUserRows(admin, "student_connections", "addressee_id", userId);

  const { error: statsError } = await admin
    .from("user_stats")
    .update({
      level: 1,
      total_xp: 0,
      strength: 0,
      stamina: 0,
      knowledge: 0,
      social: 0,
      focus: 0,
    })
    .eq("user_id", userId);
  if (statsError && !isMissingColumnError(statsError)) {
    logQa("reset_stats_failed", { error: statsError.message });
  }

  logQa("reset_complete", { userId });
}

export type EnsureQaAccountResult = {
  userId: string;
  email: string;
  created: boolean;
};

/**
 * Create the permanent QA auth user + flagged profile if missing (idempotent).
 * Requires QA_TEST_ACCOUNT_PASSWORD when the auth user does not exist yet.
 */
export async function ensureQaTestAccount(): Promise<EnsureQaAccountResult> {
  const admin = createAdminClient();
  const email = QA_TEST_ACCOUNT_EMAIL;

  let created = false;
  let userId = await findAuthUserIdByEmail(email);

  if (!userId) {
    const password = process.env.QA_TEST_ACCOUNT_PASSWORD;
    if (!password) {
      throw new ApiError(
        400,
        "QA_TEST_ACCOUNT_PASSWORD env var is required to create the QA account.",
        "QA_ACCOUNT_PASSWORD_MISSING",
      );
    }
    const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: "QA Signup Tester", is_test_user: true },
    });
    if (createError || !createdUser.user) {
      throw new ApiError(400, createError?.message ?? "Could not create QA auth user.", "QA_ACCOUNT_CREATE_FAILED");
    }
    userId = createdUser.user.id;
    created = true;
  }

  const qaProfile: Record<string, unknown> = {
    id: userId,
    username: "qa_signup_tester",
    display_name: "QA Signup Tester",
    bio: "",
    role: "qa",
    is_test_user: true,
    is_hidden: true,
    is_internal_tester: true,
  };
  let { error: profileError } = await admin.from("profiles").upsert(qaProfile, { onConflict: "id" });
  if (profileError && isMissingColumnError(profileError)) {
    // Pre-migration schema without is_internal_tester — role 'qa' still grants the bypass.
    delete qaProfile.is_internal_tester;
    ({ error: profileError } = await admin.from("profiles").upsert(qaProfile, { onConflict: "id" }));
  }
  if (profileError) {
    throw new ApiError(400, profileError.message, "QA_ACCOUNT_PROFILE_FAILED");
  }

  const { error: statsError } = await admin.from("user_stats").upsert(
    { user_id: userId, level: 1, total_xp: 0, strength: 0, stamina: 0, knowledge: 0, social: 0, focus: 0 },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
  if (statsError) {
    logQa("ensure_stats_failed", { error: statsError.message });
  }

  logQa("ensure_complete", { userId, created });
  return { userId, email, created };
}

/**
 * Login hook: when a test user signs in, wipe onboarding state so the app
 * routes them to the first sign-up screen. No-op (and safe) for real users.
 */
export async function resetQaOnboardingOnLoginIfTestUser(profile: {
  id: string;
  is_test_user?: boolean | null;
}): Promise<boolean> {
  if (!isTestUserProfile(profile)) return false;
  await resetQaOnboardingState(profile.id);
  return true;
}
