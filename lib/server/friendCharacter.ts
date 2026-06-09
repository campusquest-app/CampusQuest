import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import { assertCanViewFriendProfile } from "@/lib/server/friendProfileAccess";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

export async function getFriendCharacterSnapshot(args: {
  userClient: SupabaseClientLike;
  viewerId: string;
  targetUserId: string;
}) {
  const { userClient, viewerId, targetUserId } = args;
  await assertCanViewFriendProfile({ userClient, viewerId, targetUserId });

  const [profileResult, statsResult] = await Promise.all([
    userClient
      .from("profiles")
      .select(
        "id, username, display_name, avatar_url, avatar_custom_json, bio, major, class_year, streak_days, last_activity_date, character_class_id, starter_weapon, scholar_guild_id, game_state_json",
      )
      .eq("id", targetUserId)
      .maybeSingle(),
    userClient.from("user_stats").select("*").eq("user_id", targetUserId).maybeSingle(),
  ]);

  if (profileResult.error) {
    throw new ApiError(400, profileResult.error.message, "FRIEND_PROFILE_FETCH_FAILED");
  }
  if (!profileResult.data) {
    throw new ApiError(404, "User not found.", "USER_NOT_FOUND");
  }
  if (statsResult.error) {
    throw new ApiError(400, statsResult.error.message, "FRIEND_STATS_FETCH_FAILED");
  }
  if (!statsResult.data) {
    throw new ApiError(404, "User stats not found.", "FRIEND_STATS_NOT_FOUND");
  }

  return {
    profile: profileResult.data,
    stats: statsResult.data,
  };
}
