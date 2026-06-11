import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import { listConnections } from "@/lib/server/messaging";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

async function getBlockedUserIds(userClient: SupabaseClientLike, userId: string): Promise<Set<string>> {
  const { data, error } = await userClient
    .from("blocked_users")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
  if (error) throw new ApiError(400, error.message, "BLOCK_LIST_FAILED");

  const blocked = new Set<string>();
  for (const row of data ?? []) {
    if (row.blocker_id === userId) blocked.add(row.blocked_id);
    if (row.blocked_id === userId) blocked.add(row.blocker_id);
  }
  return blocked;
}

/** Accepted connection user ids excluding blocked accounts. */
export async function getAcceptedFriendUserIds(args: {
  userClient: SupabaseClientLike;
  userId: string;
}): Promise<string[]> {
  const { userClient, userId } = args;
  const blocked = await getBlockedUserIds(userClient, userId);
  const connections = await listConnections({ userClient, userId });
  return connections
    .filter((row): row is NonNullable<typeof row> => row != null)
    .map((row) => row.userId)
    .filter((id) => !blocked.has(id));
}

export async function assertCanViewFriendProfile(args: {
  userClient: SupabaseClientLike;
  viewerId: string;
  targetUserId: string;
}) {
  const { userClient, viewerId, targetUserId } = args;
  if (viewerId === targetUserId) return;

  const blocked = await getBlockedUserIds(userClient, viewerId);
  if (blocked.has(targetUserId)) {
    throw new ApiError(403, "You cannot view this profile.", "PROFILE_BLOCKED");
  }

  const friendIds = await getAcceptedFriendUserIds({ userClient, userId: viewerId });
  if (!friendIds.includes(targetUserId)) {
    throw new ApiError(403, "You can only view profiles of accepted friends.", "PROFILE_FRIENDS_ONLY");
  }
}
