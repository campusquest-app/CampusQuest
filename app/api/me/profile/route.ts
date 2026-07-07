import { ZodError } from "zod";
import { resolveIsPlatformAdmin } from "@/lib/server/campusAccess";
import { fail, ok, ApiError } from "@/lib/server/http";
import {
  formatNextChangeDateLabel,
  getNextIdentityChangeEligibleAt,
  isProfileIdentityCooldownActive,
  PROFILE_DISPLAY_NAME_COOLDOWN_MS,
  PROFILE_USERNAME_COOLDOWN_MS,
} from "@/lib/profileIdentityCooldown";
import {
  appendIdentityWeeklyEvents,
  countWeeklyByKind,
  enrichProfileRowForApiClient,
  hasWeeklyIdentityBudget,
  IDENTITY_WEEKLY_CHANGE_LIMIT,
  IDENTITY_WEEKLY_WINDOW_MS,
  parseIdentityWeeklyEvents,
  type StoredIdentityChangeEvent,
} from "@/lib/identityWeeklyBudget";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { touchUserActivityFromAuth } from "@/lib/server/userActivity";
import { syncEquipmentTableFromGameState } from "@/lib/server/equipmentLoadoutDb";
import { tryAwardTorchBearerBadge } from "@/lib/server/betaFounders";
import {
  mergeSanitizedGameStateJson,
  rejectForbiddenProfileFields,
} from "@/lib/server/profileSecurity";
import { patchMeProfileSchema } from "@/lib/server/validation";

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

    await tryAwardTorchBearerBadge({
      userId: auth.user.id,
      user: auth.user,
      email: auth.user.email,
    });

    const { data, error } = await auth.userClient
      .from("profiles")
      .select("*")
      .eq("id", auth.user.id)
      .single();

    if (error || !data) {
      throw new ApiError(404, error?.message ?? "Profile not found.", "PROFILE_NOT_FOUND");
    }

    return ok(enrichProfileRowForApiClient(data as unknown as Record<string, unknown>, auth.user.email));
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:profile:patch", limit: 30, windowMs: 60_000 });
    touchUserActivityFromAuth(auth);
    const rawBody = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    await rejectForbiddenProfileFields({
      body: rawBody,
      userId: auth.user.id,
      requestPath: "/api/me/profile",
    });
    const input = patchMeProfileSchema.parse(rawBody);
    // Gameplay autosync payloads should not overwrite identity fields.
    const identitySuppressedForSync =
      input.gameStateJson !== undefined &&
      input.characterOnboardingComplete !== true &&
      input.preserveIdentityCooldownTimestamps !== true;
    const displayNameInput = identitySuppressedForSync ? undefined : (input.displayName ?? input.display_name);
    const usernameInput = identitySuppressedForSync ? undefined : input.username;
    const classYearInput = input.classYear ?? input.year;

    const { data: existing, error: loadError } = await auth.userClient
      .from("profiles")
      .select("*")
      .eq("id", auth.user.id)
      .single();

    if (loadError || !existing) {
      throw new ApiError(404, loadError?.message ?? "Profile not found.", "PROFILE_NOT_FOUND");
    }

    const weeklyEventsColumnPresent = Object.prototype.hasOwnProperty.call(
      existing as object,
      "identity_weekly_change_events",
    );

    const postCharacterOnboarding = Boolean(existing.onboarding_character_completed);
    const isPlatformAdminUser = await resolveIsPlatformAdmin(auth.userClient, auth.user);
    const preserveIdentityTimestamps =
      input.preserveIdentityCooldownTimestamps === true && isPlatformAdminUser;

    const currentDisplayName = typeof existing.display_name === "string" ? existing.display_name : "";
    const currentUsername = typeof existing.username === "string" ? existing.username : "";

    const displayChanging =
      displayNameInput !== undefined &&
      normalizeDisplayName(displayNameInput) !== normalizeDisplayName(currentDisplayName);
    const usernameChanging =
      usernameInput !== undefined &&
      normalizeUsername(usernameInput) !== normalizeUsername(currentUsername);

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    let weeklyPrunedForUpdate: StoredIdentityChangeEvent[] | null = null;

    if (postCharacterOnboarding && !preserveIdentityTimestamps) {
      if (hasWeeklyIdentityBudget(auth.user.email) && weeklyEventsColumnPresent) {
        if (displayChanging || usernameChanging) {
          const rawEvents = parseIdentityWeeklyEvents(
            (existing as { identity_weekly_change_events?: unknown }).identity_weekly_change_events,
          );
          const { display_used, username_used, pruned } = countWeeklyByKind(
            rawEvents,
            nowMs,
            IDENTITY_WEEKLY_WINDOW_MS,
          );
          weeklyPrunedForUpdate = pruned;

          if (displayChanging && display_used >= IDENTITY_WEEKLY_CHANGE_LIMIT) {
            throw new ApiError(
              403,
              `You can change your display name at most ${IDENTITY_WEEKLY_CHANGE_LIMIT} times per rolling 7-day period.`,
              "DISPLAY_NAME_WEEKLY_LIMIT",
            );
          }
          if (usernameChanging && username_used >= IDENTITY_WEEKLY_CHANGE_LIMIT) {
            throw new ApiError(
              403,
              `You can change your username at most ${IDENTITY_WEEKLY_CHANGE_LIMIT} times per rolling 7-day period.`,
              "USERNAME_WEEKLY_LIMIT",
            );
          }
        }
      } else {
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
    }

    const patch: Record<string, unknown> = {};
    if (displayNameInput !== undefined) patch.display_name = normalizeDisplayName(displayNameInput);
    if (usernameInput !== undefined) patch.username = normalizeUsername(usernameInput);
    if (input.avatar_url !== undefined) patch.avatar_url = input.avatar_url || null;
    if (input.avatarCustomJson !== undefined) patch.avatar_custom_json = input.avatarCustomJson;
    if (input.major !== undefined) patch.major = input.major || null;
    if (classYearInput !== undefined) patch.class_year = classYearInput;
    if (input.characterClassId !== undefined) patch.character_class_id = input.characterClassId;
    if (input.starterWeapon !== undefined) patch.starter_weapon = input.starterWeapon;
    if (input.scholarGuildId !== undefined) patch.scholar_guild_id = input.scholarGuildId;
    if (input.bio !== undefined) patch.bio = input.bio;
    if (input.gameStateJson !== undefined) {
      const existingGsRaw = (existing as { game_state_json?: unknown }).game_state_json;
      const existingGs =
        existingGsRaw && typeof existingGsRaw === "object" && !Array.isArray(existingGsRaw)
          ? (existingGsRaw as Record<string, unknown>)
          : {};
      patch.game_state_json = mergeSanitizedGameStateJson(existingGs, input.gameStateJson);
    }
    if (input.characterOnboardingComplete === true) {
      patch.onboarding_character_completed = true;
    }

    if (!preserveIdentityTimestamps) {
      if (displayChanging) patch.display_name_changed_at = nowIso;
      if (usernameChanging) patch.username_changed_at = nowIso;
    }

    if (
      weeklyPrunedForUpdate != null &&
      hasWeeklyIdentityBudget(auth.user.email) &&
      weeklyEventsColumnPresent &&
      (displayChanging || usernameChanging)
    ) {
      patch.identity_weekly_change_events = appendIdentityWeeklyEvents(weeklyPrunedForUpdate, {
        display: displayChanging,
        username: usernameChanging,
        nowIso,
      });
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

    let dataOut = data;
    let errorOut = error;

    if (
      errorOut &&
      typeof errorOut.message === "string" &&
      errorOut.message.includes("identity_weekly_change_events") &&
      patch.identity_weekly_change_events !== undefined
    ) {
      const { identity_weekly_change_events: _w, ...patchWithoutWeekly } = patch;
      const second = await auth.userClient
        .from("profiles")
        .update(patchWithoutWeekly)
        .eq("id", auth.user.id)
        .select("*")
        .single();
      dataOut = second.data;
      errorOut = second.error;
    }

    if (errorOut) {
      const code = errorOut.code ?? "";
      const msg = errorOut.message ?? "Could not update profile.";
      if (code === "23505" || msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
        throw new ApiError(409, "That username is already taken.", "USERNAME_TAKEN");
      }
      throw new ApiError(400, msg, "PROFILE_PATCH_FAILED");
    }
    if (!dataOut) throw new ApiError(404, "Profile not found after update.", "PROFILE_NOT_FOUND");

    console.log("[PROFILE] Safe profile update complete", {
      userId: auth.user.id,
      fields: Object.keys(patch),
    });

    if (patch.game_state_json !== undefined) {
      await syncEquipmentTableFromGameState(
        auth.userClient,
        auth.user.id,
        dataOut.game_state_json as Record<string, unknown> | null | undefined,
      );
    }

    let mergedProfile = dataOut;
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

    return ok(
      enrichProfileRowForApiClient(mergedProfile as unknown as Record<string, unknown>, auth.user.email),
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
