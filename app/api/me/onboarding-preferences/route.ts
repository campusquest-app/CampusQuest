import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { onboardingPreferencesSchema, readJson } from "@/lib/server/validation";
import {
  INSTITUTIONS,
  MIN_INTERESTS,
  normalizeCommunityIds,
  normalizeInterestIds,
  ONBOARDING_VERSION,
} from "@/lib/onboarding/taxonomy";

function mapPrefsRow(data: Record<string, unknown>) {
  return {
    schoolName: data.school_name as string,
    interests: normalizeInterestIds(Array.isArray(data.interests) ? (data.interests as string[]) : []),
    communities: normalizeCommunityIds(Array.isArray(data.communities) ? (data.communities as string[]) : []),
    discoveryFocus: Array.isArray(data.discovery_focus) ? data.discovery_focus : [],
    major: (data.major as string | null) ?? null,
    institutionId: (data.institution_id as string | null) ?? null,
    completedAt: data.completed_at as string,
  };
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:onboarding:get", limit: 60, windowMs: 60_000 });
    const { data, error } = await auth.userClient
      .from("user_onboarding_preferences")
      .select("school_name, interests, discovery_focus, major, completed_at, communities, institution_id")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) {
      if (/communities|institution_id/i.test(error.message)) {
        throw new ApiError(
          500,
          "Onboarding demographics migration is required. Apply supabase/migrations/20260818220000_onboarding_demographics_v2.sql.",
          "SCHEMA_MIGRATION_REQUIRED",
        );
      }
      throw new ApiError(400, error.message, "ONBOARDING_PREFS_FETCH_FAILED");
    }
    return ok({
      exists: Boolean(data),
      preferences: data ? mapPrefsRow(data as Record<string, unknown>) : null,
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
    const interests = normalizeInterestIds(input.interests);
    if (interests.length < MIN_INTERESTS) {
      throw new ApiError(
        400,
        `Pick at least ${MIN_INTERESTS} interests.`,
        "ONBOARDING_INTERESTS_REQUIRED",
      );
    }
    const communities = normalizeCommunityIds(input.communities ?? []);
    const institutionId =
      input.institutionId && input.institutionId in INSTITUTIONS
        ? input.institutionId
        : input.schoolName.toLowerCase().includes("rhode island")
          ? "uri"
          : null;
    const schoolName =
      institutionId && institutionId in INSTITUTIONS
        ? INSTITUTIONS[institutionId as keyof typeof INSTITUTIONS].schoolName
        : input.schoolName;
    const discoveryFocus =
      input.discoveryFocus && input.discoveryFocus.length > 0
        ? input.discoveryFocus
        : (["events", "organizations", "meet_students"] as const);

    const upsertPayload: Record<string, unknown> = {
      user_id: auth.user.id,
      school_name: schoolName,
      interests,
      discovery_focus: discoveryFocus,
      major: majorTrimmed,
      completed_at: new Date().toISOString(),
      communities,
      institution_id: institutionId,
    };

    const { data, error } = await auth.userClient
      .from("user_onboarding_preferences")
      .upsert(upsertPayload, { onConflict: "user_id" })
      .select("school_name, interests, discovery_focus, major, completed_at, communities, institution_id")
      .single();

    if (error) {
      if (/communities|institution_id/i.test(error.message)) {
        throw new ApiError(
          500,
          "Onboarding demographics migration is required. Apply supabase/migrations/20260818220000_onboarding_demographics_v2.sql.",
          "SCHEMA_MIGRATION_REQUIRED",
        );
      }
      throw new ApiError(400, error.message, "ONBOARDING_PREFS_SAVE_FAILED");
    }
    if (!data) {
      throw new ApiError(400, "Could not save onboarding preferences.", "ONBOARDING_PREFS_SAVE_FAILED");
    }

    const profilePatch: Record<string, unknown> = {};
    if (input.classYear !== undefined) profilePatch.class_year = input.classYear;
    if (input.studentStatus) profilePatch.student_status = input.studentStatus;
    if (institutionId) profilePatch.institution_id = institutionId;
    if (input.onboardingVersion != null) profilePatch.onboarding_version = input.onboardingVersion;

    const { data: profileRow, error: profileErr } = await auth.userClient
      .from("profiles")
      .select("onboarding_character_completed, onboarding_completed")
      .eq("id", auth.user.id)
      .single();
    if (profileErr || !profileRow) {
      throw new ApiError(400, profileErr?.message ?? "Could not verify profile for onboarding.", "PROFILE_FETCH_FAILED");
    }

    const shouldMarkComplete =
      input.markOnboardingComplete === true
        ? true
        : input.markOnboardingComplete === false
          ? false
          : Boolean(profileRow.onboarding_character_completed);

    if (shouldMarkComplete || Object.keys(profilePatch).length > 0) {
      const update: Record<string, unknown> = { ...profilePatch };
      if (shouldMarkComplete) {
        update.onboarding_completed = true;
        update.onboarding_completed_at = new Date().toISOString();
        update.onboarding_version = input.onboardingVersion ?? ONBOARDING_VERSION;
      }
      const { error: doneErr } = await auth.userClient.from("profiles").update(update).eq("id", auth.user.id);
      if (doneErr) {
        if (/student_status|institution_id|onboarding_version/i.test(doneErr.message)) {
          throw new ApiError(
            500,
            "Onboarding demographics migration is required. Apply supabase/migrations/20260818220000_onboarding_demographics_v2.sql.",
            "SCHEMA_MIGRATION_REQUIRED",
          );
        }
        throw new ApiError(400, doneErr.message, "ONBOARDING_COMPLETE_UPDATE_FAILED");
      }
    }

    return ok({
      preferences: mapPrefsRow(data as Record<string, unknown>),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
