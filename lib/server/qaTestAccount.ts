import { ApiError } from "@/lib/server/http";
import { findAuthUserIdByEmail } from "@/lib/server/authBootstrap";
import { createAdminClient } from "@/lib/server/supabase";
import {
  isInternalAccount,
  isKnownQaAccountEmail,
  isPermanentQaEmail,
  QA_ACCOUNT_PROFILE_FLAGS,
  resolveQaTestAccountEmail,
  PERMANENT_QA_SIGNUP_EMAIL,
} from "@/lib/internalAccount";
import { isProtectedAccountEmail } from "@/lib/server/protectedAccounts";
import { isOnboardingQaEmail, logOnboardingQa } from "@/lib/onboardingQa";

export {
  isInternalAccount,
  isKnownQaAccountEmail,
  isPermanentQaEmail,
  PERMANENT_QA_SIGNUP_EMAIL,
  resolveQaTestAccountEmail,
} from "@/lib/internalAccount";

/**
 * Permanent QA test account for exercising the sign-up / onboarding flow.
 *
 * Invariants:
 * - The account is never deleted; instead its onboarding state is reset.
 * - profiles.is_test_user = true, profiles.is_hidden = true, profiles.role = 'qa'.
 * - Every reset path checks is_test_user = true so a real user can never be affected.
 * - The account never earns XP, badges, or streaks and is excluded from all
 *   public surfaces (leaderboards, search, analytics) via is_hidden filters.
 * - Campus-domain bypass is granted via {@link isInternalAccount} (exact email
 *   + profile flags). Random @campusquestapp.com addresses are never included.
 */

export const QA_TEST_ACCOUNT_EMAIL = resolveQaTestAccountEmail();

/** True only for rows explicitly flagged as test users. */
export function isTestUserProfile(
  profile: { is_test_user?: boolean | null } | null | undefined,
): boolean {
  return profile?.is_test_user === true;
}

type ClientLike = Pick<ReturnType<typeof createAdminClient>, "from">;

/**
 * IDs of profiles that must never appear on public surfaces:
 * is_hidden = true OR is_test_user = true OR role = 'qa'.
 * Used to exclude them from leaderboards, search, analytics, and other public
 * surfaces. Tolerates a pre-migration schema by falling back to is_hidden only.
 */
export async function listHiddenUserIds(client?: ClientLike): Promise<Set<string>> {
  try {
    const supabase = client ?? createAdminClient();
    let { data, error } = await supabase
      .from("profiles")
      .select("id")
      .or("is_hidden.eq.true,is_test_user.eq.true,role.eq.qa");
    if (error) {
      // Pre-migration schema: retry on the oldest flag only.
      ({ data, error } = await supabase.from("profiles").select("id").eq("is_hidden", true));
    }
    if (error || !data) return new Set();
    return new Set(data.map((row) => row.id as string));
  } catch {
    // Hidden-user filtering must never break the surface that uses it.
    return new Set();
  }
}

/**
 * Profiles excluded from university-facing engagement analytics.
 * Uses existing profile flags/roles only — no hardcoded emails in analytics queries.
 *
 * Excludes: is_test_user, is_hidden, is_internal_tester, role qa|beta_internal.
 * Throws on query failure so analytics never silently include test accounts.
 */
export async function listAnalyticsExcludedUserIds(client?: ClientLike): Promise<Set<string>> {
  const supabase = client ?? createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .or(
      "is_hidden.eq.true,is_test_user.eq.true,is_internal_tester.eq.true,role.eq.qa,role.eq.beta_internal",
    );
  if (error) {
    // Older DBs without is_internal_tester: fall back to the public-surface exclusion set,
    // but still fail closed if that also errors.
    const fallback = await listHiddenUserIds(supabase);
    if (fallback.size === 0) {
      // Distinguish empty vs failure: re-query is_hidden strictly and require success.
      const strict = await supabase.from("profiles").select("id").eq("is_hidden", true);
      if (strict.error) {
        throw new ApiError(
          500,
          `Could not load analytics exclusion set: ${error.message}`,
          "ANALYTICS_EXCLUSION_FAILED",
        );
      }
      return new Set((strict.data ?? []).map((row) => row.id as string));
    }
    return fallback;
  }
  return new Set((data ?? []).map((row) => row.id as string));
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
  realm_welcome_seen_at: null,
  nav_hints_seen_at: null,
  beginner_chain_completed_at: null,
  beginner_chain_celebration_seen_at: null,
  game_state_json: null,
  equipment_loadout_json: null,
  character_stats_json: null,
  guild_id: null,
  streak_days: 0,
  last_activity_date: null,
  major: null,
  academic_area: null,
  requested_school_name: null,
  requested_school_at: null,
  realm_intro_completed_at: null,
  class_year: null,
  bio: "",
  // Role-selection test state: cleared so the QA account sees the "I am a..."
  // screen again. The protected role = 'qa' itself is never touched.
  qa_selected_role: null,
  campus_email_verified_at: null,
} as const;

/** Columns that may not exist on older schemas — retried without on 42703. */
const OPTIONAL_RESET_COLUMNS = [
  "starter_intro_seen_at",
  "realm_welcome_seen_at",
  "nav_hints_seen_at",
  "beginner_chain_completed_at",
  "beginner_chain_celebration_seen_at",
  "game_state_json",
  "equipment_loadout_json",
  "character_stats_json",
  "guild_id",
  "streak_days",
  "last_activity_date",
  "major",
  "academic_area",
  "requested_school_name",
  "requested_school_at",
  "realm_intro_completed_at",
  "class_year",
  "qa_selected_role",
  "campus_email_verified_at",
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

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email ?? null;
  if (isProtectedAccountEmail(email) || isOnboardingQaEmail(email)) {
    throw new ApiError(
      403,
      "This account is protected and cannot have onboarding or profile data reset.",
      "QA_RESET_PROTECTED_ACCOUNT",
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
      user_metadata: { display_name: "CampusQuest QA", is_test_user: true },
    });
    if (createError || !createdUser.user) {
      throw new ApiError(400, createError?.message ?? "Could not create QA auth user.", "QA_ACCOUNT_CREATE_FAILED");
    }
    userId = createdUser.user.id;
    created = true;
  }

  const qaProfile: Record<string, unknown> = {
    id: userId,
    username: "campusquestqa",
    display_name: "CampusQuest QA",
    bio: "",
    ...QA_ACCOUNT_PROFILE_FLAGS,
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
 * Login hook: when a QA test user signs in, wipe onboarding state so the app
 * routes them through the full sign-up / onboarding screens again.
 *
 * Triggers only for:
 * - profiles.is_test_user = true, OR
 * - an exact known QA email (so flags can be applied if signup lagged)
 *
 * Does NOT reset ordinary internal testers (is_internal_tester / beta_internal)
 * — campus bypass for those roles stays separate from onboarding wipe.
 */
export async function resetQaOnboardingOnLoginIfTestUser(profile: {
  id: string;
  is_test_user?: boolean | null;
  role?: string | null;
  is_internal_tester?: boolean | null;
  email?: string | null;
}): Promise<boolean> {
  if (isOnboardingQaEmail(profile.email) || isProtectedAccountEmail(profile.email)) {
    logOnboardingQa("login reset skipped for protected/admin QA account", {
      userId: profile.id,
    });
    return false;
  }
  const isKnownQa = isKnownQaAccountEmail(profile.email);
  if (!isKnownQa && !isTestUserProfile(profile)) {
    return false;
  }
  if (!isTestUserProfile(profile)) {
    // Ensure flags exist before wiping so subsequent surfaces stay excluded.
    const admin = createAdminClient();
    await admin
      .from("profiles")
      .update({ ...QA_ACCOUNT_PROFILE_FLAGS })
      .eq("id", profile.id);
  }
  await resetQaOnboardingState(profile.id);
  return true;
}
