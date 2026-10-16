import { ApiError } from "@/lib/server/http";
import {
  applyProfilePrivateFields,
  fetchProfilePrivateFields,
  PROFILES_PUBLIC_SELECT,
} from "@/lib/server/profilePrivate";
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

  const [profileResult, statsResult, privateFields] = await Promise.all([
    userClient.from("profiles").select(PROFILES_PUBLIC_SELECT).eq("id", targetUserId).maybeSingle(),
    userClient.from("user_stats").select("*").eq("user_id", targetUserId).maybeSingle(),
    fetchProfilePrivateFields({ userClient, userId: targetUserId }),
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
    profile: applyProfilePrivateFields(profileResult.data as Record<string, unknown>, privateFields),
    stats: statsResult.data,
  };
}
