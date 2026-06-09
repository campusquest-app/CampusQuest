import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import { listConnections } from "@/lib/server/messaging";
import { assertCanViewFriendProfile } from "@/lib/server/friendProfileAccess";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

export type FollowUserItem = {
  connectionId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarCustomJson: string | null;
};

/** Accepted mutual connections = users this profile follows. */
export async function listFollowing(args: {
  userClient: SupabaseClientLike;
  userId: string;
}): Promise<FollowUserItem[]> {
  return listConnections(args) as Promise<FollowUserItem[]>;
}

/** For accepted mutual connections, followers are the same set as following. */
export async function listFollowers(args: {
  userClient: SupabaseClientLike;
  userId: string;
}): Promise<FollowUserItem[]> {
  return listConnections(args) as Promise<FollowUserItem[]>;
}

export async function getFollowCounts(args: { userClient: SupabaseClientLike; userId: string }) {
  const following = await listFollowing(args);
  const count = following.length;
  return { followersCount: count, followingCount: count };
}

export async function assertCanViewFollowLists(args: {
  userClient: SupabaseClientLike;
  viewerId: string;
  targetUserId: string;
}) {
  const { viewerId, targetUserId } = args;
  if (viewerId === targetUserId) return;
  try {
    await assertCanViewFriendProfile(args);
  } catch (error) {
    if (error instanceof ApiError && error.code === "PROFILE_FRIENDS_ONLY") {
      throw new ApiError(403, "You can only view follow lists for connected profiles.", "FOLLOW_LIST_FORBIDDEN");
    }
    throw error;
  }
}
