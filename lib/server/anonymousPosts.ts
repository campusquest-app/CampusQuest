import { anonymousNoticeSatisfied, ANONYMOUS_NOTICE_FEATURE_KEY, ANONYMOUS_NOTICE_VERSION } from "@/lib/anonymousPost";
import { ApiError } from "@/lib/server/http";
import { logAdminAuditAction } from "@/lib/server/audit";
import { createAdminClient } from "@/lib/server/supabase";
import type { QuadPostApiRow } from "@/lib/quadFieldNote";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

export async function resolveQuadPostOwnerId(post: {
  id: string;
  user_id?: string | null;
  is_anonymous?: boolean | null;
}): Promise<string | null> {
  if (post.user_id) return post.user_id;
  if (post.is_anonymous === false) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("quad_anonymous_authors")
    .select("user_id")
    .eq("post_id", post.id)
    .maybeSingle();
  if (error || !data?.user_id) return null;
  return String(data.user_id);
}

export async function anonymousPostIdsOwnedBy(viewerId: string, postIds: string[]): Promise<Set<string>> {
  if (!viewerId || postIds.length === 0) return new Set();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("quad_anonymous_authors")
    .select("post_id")
    .eq("user_id", viewerId)
    .in("post_id", postIds);
  if (error || !data) return new Set();
  return new Set(data.map((row) => String(row.post_id)));
}

export async function viewerOwnsAnonymousPost(viewerId: string, postId: string): Promise<boolean> {
  const owned = await anonymousPostIdsOwnedBy(viewerId, [postId]);
  return owned.has(postId);
}

/** Remove author identity from anonymous rows. Ownership is a viewer-only flag. */
export async function presentAnonymousQuadPosts<T extends QuadPostApiRow>(
  posts: T[],
  viewerId: string,
): Promise<T[]> {
  const anonymousIds = posts.filter((post) => post.is_anonymous === true).map((post) => post.id);
  if (anonymousIds.length === 0) return posts;
  const owned = await anonymousPostIdsOwnedBy(viewerId, anonymousIds);
  return posts.map((post) => {
    if (post.is_anonymous !== true) return post;
    const viewerIsAuthor = owned.has(post.id);
    return {
      ...post,
      user_id: "",
      is_anonymous: true,
      viewer_is_author: viewerIsAuthor,
      author_streak_days: null,
      posted_as_display_name: null,
      posted_as_username: null,
      posted_as_avatar_url: null,
      posted_as_verified: false,
      posted_as_type: "personal",
      posted_as_id: null,
      media_storage_path: null,
      profiles: null,
    };
  });
}

export async function assertAnonymousNoticeAccepted(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_feature_acknowledgements")
    .select("version")
    .eq("user_id", userId)
    .eq("feature_key", ANONYMOUS_NOTICE_FEATURE_KEY)
    .maybeSingle();
  if (error) {
    throw new ApiError(400, "Could not confirm the anonymity notice.", "ANONYMOUS_NOTICE_LOOKUP_FAILED");
  }
  if (!anonymousNoticeSatisfied(typeof data?.version === "number" ? data.version : null)) {
    throw new ApiError(
      403,
      "Accept the anonymity notice before posting anonymously.",
      "ANONYMOUS_NOTICE_REQUIRED",
    );
  }
}

export async function readAnonymousNoticeVersion(userId: string): Promise<number | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_feature_acknowledgements")
    .select("version")
    .eq("user_id", userId)
    .eq("feature_key", ANONYMOUS_NOTICE_FEATURE_KEY)
    .maybeSingle();
  if (error || typeof data?.version !== "number") return null;
  return data.version;
}

export async function acceptAnonymousNotice(userId: string): Promise<{ version: number }> {
  const admin = createAdminClient();
  const { error } = await admin.from("user_feature_acknowledgements").upsert(
    {
      user_id: userId,
      feature_key: ANONYMOUS_NOTICE_FEATURE_KEY,
      version: ANONYMOUS_NOTICE_VERSION,
      accepted_at: new Date().toISOString(),
    },
    { onConflict: "user_id,feature_key" },
  );
  if (error) {
    throw new ApiError(400, "Could not save the anonymity notice.", "ANONYMOUS_NOTICE_SAVE_FAILED");
  }
  return { version: ANONYMOUS_NOTICE_VERSION };
}

export async function auditAnonymousAuthorLookup(args: {
  actorId: string | null;
  postId: string;
  actorEmail?: string | null;
}): Promise<string | null> {
  const ownerId = await resolveQuadPostOwnerId({ id: args.postId, user_id: null, is_anonymous: true });
  await logAdminAuditAction({
    actionType: "anonymous_post_author_lookup",
    adminUserId: args.actorId,
    adminEmail: args.actorEmail ?? null,
    targetUserId: ownerId,
    reason: "Authorized moderation lookup",
    metadata: { postId: args.postId, found: Boolean(ownerId) },
  });
  return ownerId;
}

export async function blockAnonymousPostAuthor(args: {
  blockerId: string;
  postId: string;
}): Promise<{ blockId: string }> {
  const ownerId = await resolveQuadPostOwnerId({ id: args.postId, user_id: null, is_anonymous: true });
  if (!ownerId) {
    throw new ApiError(404, "Post not found.", "QUAD_POST_NOT_FOUND");
  }
  if (ownerId === args.blockerId) {
    throw new ApiError(400, "You cannot block yourself.", "VALIDATION_ERROR");
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("anonymous_account_blocks")
    .upsert(
      { blocker_id: args.blockerId, blocked_id: ownerId },
      { onConflict: "blocker_id,blocked_id" },
    )
    .select("id")
    .single();
  if (error || !data?.id) {
    throw new ApiError(400, "Could not block this account.", "BLOCK_FAILED");
  }
  return { blockId: String(data.id) };
}

export function anonymousBlockListItem(row: { id: string; created_at?: string | null }) {
  return {
    blockId: row.id,
    anonymous: true as const,
    displayName: "Anonymous account",
    username: "",
    avatarUrl: null,
    blockedAt: row.created_at ?? null,
  };
}

export async function listAnonymousBlocksForViewer(userClient: SupabaseClientLike) {
  const { data, error } = await userClient.rpc("cq_my_anonymous_blocks");
  if (error) {
    if (/cq_my_anonymous_blocks|schema cache|does not exist/i.test(error.message ?? "")) return [];
    throw new ApiError(400, error.message, "ANONYMOUS_BLOCKS_FAILED");
  }
  return ((data ?? []) as { id: string; created_at?: string | null }[]).map(anonymousBlockListItem);
}
