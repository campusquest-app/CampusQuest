import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

export type PinnedDmUserDto = {
  pinnedUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarCustomJson: string | null;
  pinnedAt: string;
};

type SupabaseErrorLike = { message?: string; code?: string };

export function isPinnedDmUsersSchemaError(error: SupabaseErrorLike | null | undefined): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST205" ||
    (msg.includes("pinned_dm_users") &&
      (msg.includes("schema cache") || msg.includes("could not find") || msg.includes("does not exist")))
  );
}

function pinnedDmSchemaUnavailable(): never {
  throw new ApiError(
    503,
    "Pinned DM users are not available yet. Apply the pinned_dm_users database migration.",
    "PINNED_DM_SCHEMA_MISSING",
  );
}

export async function listPinnedDmUsers(args: {
  userClient: SupabaseClientLike;
  userId: string;
}): Promise<PinnedDmUserDto[]> {
  const { userClient, userId } = args;
  const { data, error } = await userClient
    .from("pinned_dm_users")
    .select("pinned_user_id, created_at")
    .eq("user_id", userId)
    .neq("pinned_user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    if (isPinnedDmUsersSchemaError(error)) return [];
    throw new ApiError(400, error.message, "PINNED_DM_FETCH_FAILED");
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const pinnedUserIds = rows.map((row) => row.pinned_user_id as string);
  const { data: profiles, error: profilesError } = await userClient
    .from("profiles")
    .select("id, username, display_name, avatar_url, avatar_custom_json")
    .in("id", pinnedUserIds);

  if (profilesError) throw new ApiError(400, profilesError.message, "PINNED_DM_PROFILES_FAILED");

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]));
  const pinnedAtMap = new Map(rows.map((row) => [row.pinned_user_id as string, row.created_at as string]));

  return pinnedUserIds
    .map((pinnedUserId) => {
      if (pinnedUserId === userId) return null;
      const profile = profileMap.get(pinnedUserId);
      if (!profile) return null;
      return {
        pinnedUserId: profile.id as string,
        username: profile.username as string,
        displayName: (profile.display_name as string) ?? profile.username,
        avatarUrl: (profile.avatar_url as string | null) ?? null,
        avatarCustomJson: (profile.avatar_custom_json as string | null) ?? null,
        pinnedAt: pinnedAtMap.get(pinnedUserId) ?? new Date().toISOString(),
      };
    })
    .filter((row): row is PinnedDmUserDto => row != null);
}

export async function pinDmUser(args: {
  userClient: SupabaseClientLike;
  userId: string;
  pinnedUserId: string;
}): Promise<{ pinned: true }> {
  const { userClient, userId, pinnedUserId } = args;
  if (pinnedUserId === userId) {
    throw new ApiError(400, "You cannot pin yourself.", "CANNOT_PIN_SELF");
  }

  const { error } = await userClient.from("pinned_dm_users").insert({
    user_id: userId,
    pinned_user_id: pinnedUserId,
  });

  if (error) {
    if (error.code === "23505") return { pinned: true };
    if (isPinnedDmUsersSchemaError(error)) pinnedDmSchemaUnavailable();
    throw new ApiError(400, error.message, "PIN_DM_FAILED");
  }

  return { pinned: true };
}

export async function unpinDmUser(args: {
  userClient: SupabaseClientLike;
  userId: string;
  pinnedUserId: string;
}): Promise<{ unpinned: true }> {
  const { userClient, userId, pinnedUserId } = args;
  const { error } = await userClient
    .from("pinned_dm_users")
    .delete()
    .eq("user_id", userId)
    .eq("pinned_user_id", pinnedUserId);

  if (error) {
    if (isPinnedDmUsersSchemaError(error)) pinnedDmSchemaUnavailable();
    throw new ApiError(400, error.message, "UNPIN_DM_FAILED");
  }
  return { unpinned: true };
}
