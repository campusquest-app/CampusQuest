import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";

/** Fields that must never be accepted on profile / bio update requests. */
export const FORBIDDEN_PROFILE_MUTATION_FIELDS = [
  "xp",
  "totalXp",
  "total_xp",
  "level",
  "currentLevel",
  "current_level",
  "level_title",
  "levelTitle",
  "stats",
  "strength",
  "stamina",
  "knowledge",
  "social",
  "focus",
  "coins",
  "gems",
  "rank",
  "leaderboard_score",
  "leaderboardScore",
  "founder_number",
  "founderNumber",
  "badge_ids",
  "badgeIds",
  "badges",
  "achievements",
  "completed_quests",
  "completedQuests",
  "quest_progress",
  "questProgress",
  "role",
  "is_admin",
  "isAdmin",
  "is_test_user",
  "isTestUser",
  "is_hidden",
  "isHidden",
  "qa_selected_role",
  "qaSelectedRole",
  "campus_email_verified_at",
  "campusEmailVerifiedAt",
  "created_at",
  "createdAt",
  "updated_at",
  "updatedAt",
  "quests_completed",
  "questsCompleted",
  "bosses_defeated",
  "bossesDefeated",
  "final_bosses_defeated",
  "finalBossesDefeated",
] as const;

/** Safe editable identity / presentation fields for profile PATCH. */
export const ALLOWED_PROFILE_IDENTITY_FIELDS = [
  "displayName",
  "display_name",
  "username",
  "bio",
  "avatar_url",
  "banner_url",
  "avatarCustomJson",
  "major",
  "classYear",
  "year",
] as const;

/** Additional profile fields allowed for onboarding / gameplay cosmetic sync (not stats). */
export const ALLOWED_PROFILE_GAMEPLAY_FIELDS = [
  "characterClassId",
  "starterWeapon",
  "scholarGuildId",
  "gameStateJson",
  "characterOnboardingComplete",
  "beginnerChainCelebrationSeen",
  "beginnerChainCelebrationSeenReset",
  "starterIntroSeen",
  "starterIntroSeenReset",
  "realmWelcomeSeen",
  "realmWelcomeSeenReset",
  "navHintsSeen",
  "navHintsSeenReset",
  "preserveIdentityCooldownTimestamps",
] as const;

/** Keys clients may merge into `profiles.game_state_json`. Server-owned keys are preserved. */
export const CLIENT_GAME_STATE_JSON_KEYS = new Set([
  "equippedCosmetics",
  "unlockedCosmetics",
  "guildIds",
  "equippedTitleId",
  "miniGameTraining",
  "statPrestige",
]);

function normalizeBodyKey(key: string): string {
  return key.trim();
}

export function findForbiddenProfileMutationFields(body: Record<string, unknown>): string[] {
  const forbidden = new Set<string>(FORBIDDEN_PROFILE_MUTATION_FIELDS);
  return Object.keys(body)
    .map(normalizeBodyKey)
    .filter((key) => forbidden.has(key));
}

export function sanitizeClientGameStateJson(
  incoming: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (CLIENT_GAME_STATE_JSON_KEYS.has(key)) {
      out[key] = value;
    }
  }
  return out;
}

export function mergeSanitizedGameStateJson(
  existing: Record<string, unknown> | undefined | null,
  incoming: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {};
  const sanitized = sanitizeClientGameStateJson(incoming);
  return { ...base, ...sanitized };
}

export async function logSecurityEvent(args: {
  userId: string;
  eventType: string;
  blockedFields?: string[];
  requestPath?: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("security_events").insert({
    user_id: args.userId,
    event_type: args.eventType,
    blocked_fields: args.blockedFields ?? [],
    request_path: args.requestPath ?? null,
    metadata: args.metadata ?? {},
  });
  if (error) {
    console.warn("[SECURITY] Failed to persist security event", {
      userId: args.userId,
      eventType: args.eventType,
      message: error.message,
    });
  }
}

export async function rejectForbiddenProfileFields(args: {
  body: Record<string, unknown>;
  userId: string;
  requestPath: string;
}) {
  const blockedFields = findForbiddenProfileMutationFields(args.body);
  if (blockedFields.length === 0) return;

  console.warn("[SECURITY] Forbidden profile field attempted", {
    userId: args.userId,
    blockedFields,
    requestPath: args.requestPath,
  });

  await logSecurityEvent({
    userId: args.userId,
    eventType: "blocked_profile_stat_mutation",
    blockedFields,
    requestPath: args.requestPath,
  });

  throw new ApiError(
    400,
    `Forbidden profile fields: ${blockedFields.join(", ")}`,
    "FORBIDDEN_PROFILE_FIELDS",
  );
}
