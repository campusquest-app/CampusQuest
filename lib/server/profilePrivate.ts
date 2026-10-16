import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = {
  from: (table: string) => any;
};

export const PROFILE_PRIVATE_COLUMNS =
  "user_id, bio, major, class_year, academic_area, requested_school_name, student_status" as const;

export type ProfilePrivateFields = {
  user_id: string;
  bio: string | null;
  major: string | null;
  class_year: number | null;
  academic_area: string | null;
  requested_school_name: string | null;
  student_status: string | null;
};

export async function fetchProfilePrivateFields(args: {
  userClient: SupabaseClientLike;
  userId: string;
}): Promise<ProfilePrivateFields | null> {
  const { data, error } = await args.userClient
    .from("profile_private")
    .select(PROFILE_PRIVATE_COLUMNS)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (error) {
    if (/profile_private|schema cache|does not exist/i.test(error.message ?? "")) {
      return null;
    }
    throw new ApiError(400, error.message, "PROFILE_PRIVATE_FETCH_FAILED");
  }
  return (data as ProfilePrivateFields | null) ?? null;
}

export const PROFILES_PUBLIC_SELECT =
  "id, username, display_name, avatar_url, avatar_custom_json, character_class_id, starter_weapon, scholar_guild_id, streak_days, last_activity_date, game_state_json";

export function applyProfilePrivateFields<T extends Record<string, unknown>>(
  row: T,
  privateFields: ProfilePrivateFields | null,
): T & Partial<ProfilePrivateFields> {
  if (!privateFields) return row;
  return {
    ...row,
    bio: privateFields.bio,
    major: privateFields.major,
    class_year: privateFields.class_year,
    academic_area: privateFields.academic_area,
    requested_school_name: privateFields.requested_school_name,
    student_status: privateFields.student_status,
  };
}

/** Owner/admin reads of the full profiles row. Uses service role after column REVOKE. */
export async function fetchOwnerProfileRecord(args: {
  userId: string;
}): Promise<Record<string, unknown> | null> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("*")
    .eq("id", args.userId)
    .maybeSingle();
  if (error) {
    throw new ApiError(400, error.message, "PROFILE_FETCH_FAILED");
  }
  return (data as Record<string, unknown> | null) ?? null;
}
