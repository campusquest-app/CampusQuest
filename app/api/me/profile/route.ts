import { ZodError } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { patchMeProfileSchema, readJson } from "@/lib/server/validation";

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

    const patch: Record<string, unknown> = {};
    if (input.displayName !== undefined) patch.display_name = input.displayName;
    if (input.username !== undefined) patch.username = input.username;
    if (input.avatarCustomJson !== undefined) patch.avatar_custom_json = input.avatarCustomJson;
    if (input.characterClassId !== undefined) patch.character_class_id = input.characterClassId;
    if (input.starterWeapon !== undefined) patch.starter_weapon = input.starterWeapon;
    if (input.scholarGuildId !== undefined) patch.scholar_guild_id = input.scholarGuildId;
    if (input.bio !== undefined) patch.bio = input.bio;
    if (input.gameStateJson !== undefined) patch.game_state_json = input.gameStateJson;
    if (input.characterOnboardingComplete === true) {
      patch.onboarding_character_completed = true;
    }

    if (input.beginnerChainCelebrationSeenReset === true && process.env.NODE_ENV !== "production") {
      patch.beginner_chain_celebration_seen_at = null;
    } else if (input.beginnerChainCelebrationSeen === true) {
      patch.beginner_chain_celebration_seen_at = new Date().toISOString();
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
