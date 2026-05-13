import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { onboardingPreferencesSchema, readJson } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:onboarding:get", limit: 60, windowMs: 60_000 });
    const { data, error } = await auth.userClient
      .from("user_onboarding_preferences")
      .select("school_name, interests, discovery_focus, major, completed_at")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) throw new ApiError(400, error.message, "ONBOARDING_PREFS_FETCH_FAILED");
    return ok({
      exists: Boolean(data),
      preferences: data
        ? {
            schoolName: data.school_name,
            interests: Array.isArray(data.interests) ? data.interests : [],
            discoveryFocus: Array.isArray(data.discovery_focus) ? data.discovery_focus : [],
            major: data.major ?? null,
            completedAt: data.completed_at,
          }
        : null,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:onboarding:post", limit: 20, windowMs: 60_000 });
    const input = await readJson(request, onboardingPreferencesSchema);
    const majorTrimmed = typeof input.major === "string" && input.major.trim().length > 0 ? input.major.trim() : null;

    const { data, error } = await auth.userClient
      .from("user_onboarding_preferences")
      .upsert(
        {
          user_id: auth.user.id,
          school_name: input.schoolName,
          interests: input.interests,
          discovery_focus: input.discoveryFocus,
          major: majorTrimmed,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("school_name, interests, discovery_focus, major, completed_at")
      .single();
    if (error || !data) {
      throw new ApiError(400, error?.message ?? "Could not save onboarding preferences.", "ONBOARDING_PREFS_SAVE_FAILED");
    }

    const { data: profileRow, error: profileErr } = await auth.userClient
      .from("profiles")
      .select("onboarding_character_completed")
      .eq("id", auth.user.id)
      .single();
    if (profileErr || !profileRow) {
      throw new ApiError(400, profileErr?.message ?? "Could not verify profile for onboarding.", "PROFILE_FETCH_FAILED");
    }
    if (profileRow.onboarding_character_completed) {
      const { error: doneErr } = await auth.userClient
        .from("profiles")
        .update({
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq("id", auth.user.id);
      if (doneErr) {
        throw new ApiError(400, doneErr.message, "ONBOARDING_COMPLETE_UPDATE_FAILED");
      }
    }

    return ok({
      preferences: {
        schoolName: data.school_name,
        interests: Array.isArray(data.interests) ? data.interests : [],
        discoveryFocus: Array.isArray(data.discovery_focus) ? data.discovery_focus : [],
        major: data.major ?? null,
        completedAt: data.completed_at,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
