import { ApiError } from "@/lib/server/http";
import type { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

/**
 * Canonical blocked-user set for discovery surfaces.
 * Includes both directions: users you blocked and users who blocked you.
 */
export async function listMutualBlockedUserIds(
  userClient: SupabaseClientLike,
  userId: string,
): Promise<Set<string>> {
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
