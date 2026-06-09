import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import { getAcceptedFriendUserIds } from "@/lib/server/friendProfileAccess";
import { QUAD_POSTS_WITH_PROFILE_SELECT } from "@/lib/server/quadPosts";
import type { QuadPostApiRow } from "@/lib/quadFieldNote";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

/** Recent Quad posts from accepted friends (backend-filtered). */
export async function listFriendsQuadPosts(args: {
  userClient: SupabaseClientLike;
  userId: string;
  limit: number;
}): Promise<QuadPostApiRow[]> {
  const { userClient, userId, limit } = args;
  const friendIds = await getAcceptedFriendUserIds({ userClient, userId });
  if (friendIds.length === 0) return [];

  const { data, error } = await userClient
    .from("quad_posts")
    .select(QUAD_POSTS_WITH_PROFILE_SELECT)
    .in("user_id", friendIds)
    .in("visibility", ["public", "friends"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new ApiError(400, error.message ?? "Could not load friends Quad posts.", "QUAD_FRIENDS_FEED_FAILED");
  }

  return (data ?? []) as unknown as QuadPostApiRow[];
}
