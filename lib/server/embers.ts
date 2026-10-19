import { ApiError } from "@/lib/server/http";
import { listMutualBlockedUserIds } from "@/lib/server/blockedUsers";
import { createAdminClient } from "@/lib/server/supabase";
import {
  notifyQuadPostEmbered,
  removeQuadPostEmberNotification,
} from "@/lib/server/quadPostNotifications";
import {
  DAILY_EMBER_LIMIT,
  EMBER_COPY,
  EMBER_ERROR_CODES,
  EMBER_REACTION_TYPE,
  campusDayWindowForEmbers,
  emberAllowanceFromUsed,
  hasUnlimitedDailyEmbers,
  isEligibleEmberGiver,
  shouldRollbackOverLimitInsert,
  unlimitedEmberAllowance,
  type EmberAllowance,
} from "@/lib/embers";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

export { EMBER_COPY, EMBER_ERROR_CODES, DAILY_EMBER_LIMIT };

export async function countUserEmbersInWindow(args: {
  userClient: SupabaseClientLike;
  userId: string;
  start: Date;
  end: Date;
}): Promise<number> {
  const { count, error } = await args.userClient
    .from("quad_post_reactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.userId)
    .eq("reaction_type", EMBER_REACTION_TYPE)
    .gte("created_at", args.start.toISOString())
    .lt("created_at", args.end.toISOString());

  if (error) {
    throw new ApiError(400, error.message ?? "Could not load Ember allowance.", "EMBER_ALLOWANCE_LOAD_FAILED");
  }
  return count ?? 0;
}

export async function getViewerEmberAllowance(args: {
  userClient: SupabaseClientLike;
  userId: string;
  now?: Date;
}): Promise<EmberAllowance> {
  const now = args.now ?? new Date();
  const unlimited = await viewerHasUnlimitedEmbers(args.userClient, args.userId);
  if (unlimited) return unlimitedEmberAllowance(now);
  const { start, end } = campusDayWindowForEmbers(now);
  const used = await countUserEmbersInWindow({
    userClient: args.userClient,
    userId: args.userId,
    start,
    end,
  });
  return emberAllowanceFromUsed(used, now);
}

/**
 * Eligibility / unlimited checks read profiles via the service role.
 * Authenticated clients cannot SELECT profiles.student_status (column REVOKE
 * in 20261016010000); selecting it through the user session returns
 * "permission denied for table profiles" and aborts the Ember award before insert.
 * Email, username, and client-supplied flags are ignored. Role escalation remains
 * blocked by DB triggers.
 */
async function loadEmberGiverProfile(userId: string): Promise<{
  role: string | null;
  student_status: string | null;
  campus_email_verified_at: string | null;
}> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("role, student_status, campus_email_verified_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new ApiError(400, error.message ?? "Could not load profile.", "EMBER_PROFILE_LOAD_FAILED");
  }

  return {
    role: data?.role ?? null,
    student_status: data?.student_status ?? null,
    campus_email_verified_at: data?.campus_email_verified_at ?? null,
  };
}

export async function viewerHasUnlimitedEmbers(
  _userClient: SupabaseClientLike,
  userId: string,
): Promise<boolean> {
  const profile = await loadEmberGiverProfile(userId);
  return hasUnlimitedDailyEmbers(profile.role);
}

export async function assertEmberGiverEligible(args: {
  userClient: SupabaseClientLike;
  userId: string;
}): Promise<{ unlimited: boolean }> {
  void args.userClient;
  const profile = await loadEmberGiverProfile(args.userId);

  const decision = isEligibleEmberGiver({
    role: profile.role,
    student_status: profile.student_status,
    campus_email_verified_at: profile.campus_email_verified_at,
  });
  if (!decision.ok) {
    throw new ApiError(403, decision.message, decision.code);
  }
  return { unlimited: hasUnlimitedDailyEmbers(profile.role) };
}

export async function assertEmberNotBlocked(args: {
  userClient: SupabaseClientLike;
  viewerId: string;
  authorId: string;
}): Promise<void> {
  if (args.viewerId === args.authorId) return;
  const blocked = await listMutualBlockedUserIds(args.userClient, args.viewerId);
  if (blocked.has(args.authorId)) {
    throw new ApiError(403, EMBER_COPY.blocked, EMBER_ERROR_CODES.blocked);
  }
}

export async function notifyEmberGiven(args: {
  postOwnerUserId: string;
  actorUserId: string;
  postId: string;
}): Promise<void> {
  if (args.postOwnerUserId === args.actorUserId) return;
  await notifyQuadPostEmbered(args);
}

export async function retractEmberNotification(args: {
  postOwnerUserId: string;
  actorUserId: string;
  postId: string;
}): Promise<void> {
  await removeQuadPostEmberNotification(args);
}

export function emberDailyLimitError(): ApiError {
  return new ApiError(409, EMBER_COPY.exhausted, EMBER_ERROR_CODES.dailyLimit);
}

export function emberSelfError(): ApiError {
  return new ApiError(403, EMBER_COPY.ownPost, EMBER_ERROR_CODES.self);
}

export function emberInsertExceededLimit(usedAfterInsert: number, unlimited = false): boolean {
  return shouldRollbackOverLimitInsert(usedAfterInsert, unlimited);
}

type EmberCountPost = { id: string; user_id: string; hype_count?: number | null };

/**
 * Owner totals come from the service role. Every other viewer gets 0.
 * Direct reaction enumeration is closed by the spark SELECT policy.
 */
export async function discloseEmberCounts<T extends EmberCountPost>(posts: T[], viewerId: string): Promise<T[]> {
  const ownIds = posts.filter((post) => post.user_id === viewerId).map((post) => post.id);
  const counts = new Map<string, number>();
  if (ownIds.length > 0) {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.from("quad_posts").select("id, hype_count").in("id", ownIds);
      if (!error) {
        for (const row of data ?? []) {
          const id = String((row as { id?: string }).id ?? "");
          const count = Number((row as { hype_count?: number | null }).hype_count ?? 0);
          if (id) counts.set(id, Math.max(0, Number.isFinite(count) ? count : 0));
        }
      }
    } catch {
      /* Owner fallback below uses the row only for the author. */
    }
  }
  return posts.map((post) => {
    if (post.user_id !== viewerId) return { ...post, hype_count: 0 };
    const fromStore = counts.get(post.id);
    const fallback = Math.max(0, Number(post.hype_count ?? 0) || 0);
    return { ...post, hype_count: fromStore ?? fallback };
  });
}
