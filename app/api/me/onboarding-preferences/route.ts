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
      .select("school_name, interests, discovery_focus, completed_at")
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
    const { data, error } = await auth.userClient
      .from("user_onboarding_preferences")
      .upsert(
        {
          user_id: auth.user.id,
          school_name: input.schoolName,
          interests: input.interests,
          discovery_focus: input.discoveryFocus,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("school_name, interests, discovery_focus, completed_at")
      .single();
    if (error || !data) {
      throw new ApiError(400, error?.message ?? "Could not save onboarding preferences.", "ONBOARDING_PREFS_SAVE_FAILED");
    }
    return ok({
      preferences: {
        schoolName: data.school_name,
        interests: Array.isArray(data.interests) ? data.interests : [],
        discoveryFocus: Array.isArray(data.discovery_focus) ? data.discovery_focus : [],
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
