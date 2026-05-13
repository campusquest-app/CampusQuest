import { ZodError } from "zod";
import { userHasModerationAdminAccess } from "@/lib/server/adminAuth";
import { fail, ok, ApiError } from "@/lib/server/http";
import {
  formatNextChangeDateLabel,
  getNextIdentityChangeEligibleAt,
  isProfileIdentityCooldownActive,
  PROFILE_DISPLAY_NAME_COOLDOWN_MS,
  PROFILE_USERNAME_COOLDOWN_MS,
} from "@/lib/profileIdentityCooldown";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { patchMeProfileSchema, readJson } from "@/lib/server/validation";

function normalizeDisplayName(value: string) {
  return value.trim();
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:profile:get", limit: 80, windowMs: 60_000 });
    const { data, error } = await auth.userClient
      .from("profiles")
      .select("*")
      .eq("id", auth.user.id)
      .single();

    if (error || !data) {
      throw new ApiError(404, error?.message ?? "Profile not found.", "PROFILE_NOT_FOUND");
    }

    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:profile:patch", limit: 30, windowMs: 60_000 });
    const input = await readJson(request, patchMeProfileSchema);

    const { data: existing, error: loadError } = await auth.userClient
      .from("profiles")
      .select(
        "id, display_name, username, onboarding_character_completed, display_name_changed_at, username_changed_at",
      )
      .eq("id", auth.user.id)
      .single();

    if (loadError || !existing) {
      throw new ApiError(404, loadError?.message ?? "Profile not found.", "PROFILE_NOT_FOUND");
    }

    const postCharacterOnboarding = Boolean(existing.onboarding_character_completed);
    const preserveIdentityTimestamps =
      input.preserveIdentityCooldownTimestamps === true &&
      userHasModerationAdminAccess({
        email: auth.user.email,
        email_confirmed_at: (auth.user as { email_confirmed_at?: string | null }).email_confirmed_at ?? null,
        confirmed_at: (auth.user as { confirmed_at?: string | null }).confirmed_at ?? null,
      });

    const displayChanging =
      input.displayName !== undefined &&
      normalizeDisplayName(input.displayName) !== normalizeDisplayName(existing.display_name as string);
    const usernameChanging =
      input.username !== undefined &&
      normalizeUsername(input.username) !== normalizeUsername(existing.username as string);

    if (postCharacterOnboarding && !preserveIdentityTimestamps) {
      if (
        displayChanging &&
        isProfileIdentityCooldownActive(
          existing.display_name_changed_at as string | null | undefined,
          PROFILE_DISPLAY_NAME_COOLDOWN_MS,
        )
      ) {
        const next = getNextIdentityChangeEligibleAt(
          existing.display_name_changed_at as string | null | undefined,
          PROFILE_DISPLAY_NAME_COOLDOWN_MS,
        );
        const label = next ? formatNextChangeDateLabel(next) : "later";
        throw new ApiError(
          403,
          `You can change your display name again on ${label}.`,
          "DISPLAY_NAME_COOLDOWN",
        );
      }
      if (
        usernameChanging &&
        isProfileIdentityCooldownActive(
          existing.username_changed_at as string | null | undefined,
          PROFILE_USERNAME_COOLDOWN_MS,
        )
      ) {
        const next = getNextIdentityChangeEligibleAt(
          existing.username_changed_at as string | null | undefined,
          PROFILE_USERNAME_COOLDOWN_MS,
        );
        const label = next ? formatNextChangeDateLabel(next) : "later";
        throw new ApiError(403, `You can change your username again on ${label}.`, "USERNAME_COOLDOWN");
      }
    }

    const nowIso = new Date().toISOString();

    const patch: Record<string, unknown> = {};
    if (input.displayName !== undefined) patch.display_name = normalizeDisplayName(input.displayName);
    if (input.username !== undefined) patch.username = normalizeUsername(input.username);
    if (input.avatarCustomJson !== undefined) patch.avatar_custom_json = input.avatarCustomJson;
    if (input.characterClassId !== undefined) patch.character_class_id = input.characterClassId;
    if (input.starterWeapon !== undefined) patch.starter_weapon = input.starterWeapon;
    if (input.scholarGuildId !== undefined) patch.scholar_guild_id = input.scholarGuildId;
    if (input.bio !== undefined) patch.bio = input.bio;
    if (input.gameStateJson !== undefined) patch.game_state_json = input.gameStateJson;
    if (input.characterOnboardingComplete === true) {
      patch.onboarding_character_completed = true;
    }

    if (!preserveIdentityTimestamps) {
      if (displayChanging) patch.display_name_changed_at = nowIso;
      if (usernameChanging) patch.username_changed_at = nowIso;
    }

    if (input.beginnerChainCelebrationSeenReset === true && process.env.NODE_ENV !== "production") {
      patch.beginner_chain_celebration_seen_at = null;
    } else if (input.beginnerChainCelebrationSeen === true) {
      patch.beginner_chain_celebration_seen_at = nowIso;
    }

    if (input.starterIntroSeenReset === true && process.env.NODE_ENV !== "production") {
      patch.starter_intro_seen_at = null;
    } else if (input.starterIntroSeen === true) {
      patch.starter_intro_seen_at = nowIso;
    }

    if (Object.keys(patch).length === 0) {
      throw new ApiError(400, "No profile fields to update.", "PROFILE_PATCH_EMPTY");
    }

    const { data, error } = await auth.userClient
      .from("profiles")
      .update(patch)
      .eq("id", auth.user.id)
      .select("*")
      .single();

    if (error) {
      const code = error.code ?? "";
      const msg = error.message ?? "Could not update profile.";
      if (code === "23505" || msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
        throw new ApiError(409, "That username is already taken.", "USERNAME_TAKEN");
      }
      throw new ApiError(400, msg, "PROFILE_PATCH_FAILED");
    }
    if (!data) throw new ApiError(404, "Profile not found after update.", "PROFILE_NOT_FOUND");

    let mergedProfile = data;
    if (input.characterOnboardingComplete === true) {
      const { data: existingPrefs } = await auth.userClient
        .from("user_onboarding_preferences")
        .select("user_id")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (existingPrefs) {
        const { data: repaired, error: repairErr } = await auth.userClient
          .from("profiles")
          .update({
            onboarding_completed: true,
            onboarding_completed_at: new Date().toISOString(),
          })
          .eq("id", auth.user.id)
          .select("*")
          .single();
        if (!repairErr && repaired) mergedProfile = repaired;
      }
    }

    return ok(mergedProfile);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
