import { ApiError } from "@/lib/server/http";
import { assertModerationSafeText } from "@/lib/server/security";
import { notifyQuadPostCommented } from "@/lib/server/quadPostNotifications";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

type CommentProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_custom_json: string | null;
  avatar_url: string | null;
};

export type QuadPostCommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  parent_comment_id: string | null;
  updated_at: string;
};

export type QuadPostCommentDto = {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  parentCommentId: string | null;
  likeCount: number;
  viewerHasLiked: boolean;
  author: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
  replies: QuadPostCommentDto[];
};

function avatarFromProfile(profile: {
  avatar_custom_json: string | null;
  avatar_url: string | null;
} | undefined): string | null {
  const custom = profile?.avatar_custom_json?.trim();
  if (custom) return custom;
  const url = profile?.avatar_url?.trim();
  if (url) return url;
  return null;
}

export function formatQuadPostComment(
  row: QuadPostCommentRow,
  profile: CommentProfile | undefined,
  likeMeta: { likeCount: number; viewerHasLiked: boolean },
): QuadPostCommentDto {
  return {
    id: row.id,
    postId: row.post_id,
    body: row.body,
    createdAt: row.created_at,
    parentCommentId: row.parent_comment_id,
    likeCount: likeMeta.likeCount,
    viewerHasLiked: likeMeta.viewerHasLiked,
    author: {
      id: row.user_id,
      username: profile?.username ?? null,
      displayName: profile?.display_name ?? null,
      avatarUrl: avatarFromProfile(profile),
    },
    replies: [],
  };
}

function nestQuadPostComments(flat: QuadPostCommentDto[]): QuadPostCommentDto[] {
  const byId = new Map(flat.map((comment) => [comment.id, { ...comment, replies: [] as QuadPostCommentDto[] }]));
  const roots: QuadPostCommentDto[] = [];

  for (const comment of flat) {
    const node = byId.get(comment.id);
    if (!node) continue;
    if (comment.parentCommentId && byId.has(comment.parentCommentId)) {
      byId.get(comment.parentCommentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

async function assertQuadPostReadable(userClient: SupabaseClientLike, postId: string) {
  const { data, error } = await userClient.from("quad_posts").select("id").eq("id", postId).maybeSingle();
  if (error) throw new ApiError(400, error.message, "QUAD_POST_LOOKUP_FAILED");
  if (!data) throw new ApiError(404, "Post not found.", "QUAD_POST_NOT_FOUND");
}

async function loadCommentProfiles(userClient: SupabaseClientLike, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, CommentProfile>();
  const { data, error } = await userClient
    .from("profiles")
    .select("id, username, display_name, avatar_custom_json, avatar_url")
    .in("id", userIds);
  if (error) throw new ApiError(400, error.message, "QUAD_COMMENT_PROFILES_FAILED");
  return new Map(((data ?? []) as CommentProfile[]).map((profile) => [profile.id, profile]));
}

async function loadCommentLikeMeta(args: {
  userClient: SupabaseClientLike;
  viewerId: string;
  commentIds: string[];
}): Promise<Map<string, { likeCount: number; viewerHasLiked: boolean }>> {
  const { userClient, viewerId, commentIds } = args;
  const meta = new Map<string, { likeCount: number; viewerHasLiked: boolean }>();
  for (const id of commentIds) {
    meta.set(id, { likeCount: 0, viewerHasLiked: false });
  }
  if (commentIds.length === 0) return meta;

  const { data, error } = await userClient
    .from("quad_comment_likes")
    .select("comment_id, user_id")
    .in("comment_id", commentIds);
  if (error) {
    if (error.code === "42P01") return meta;
    throw new ApiError(400, error.message, "QUAD_COMMENT_LIKES_FETCH_FAILED");
  }

  for (const row of data ?? []) {
    const commentId = String(row.comment_id);
    const current = meta.get(commentId) ?? { likeCount: 0, viewerHasLiked: false };
    current.likeCount += 1;
    if (String(row.user_id) === viewerId) current.viewerHasLiked = true;
    meta.set(commentId, current);
  }

  return meta;
}

export async function listQuadPostComments(args: {
  userClient: SupabaseClientLike;
  viewerId: string;
  postId: string;
  limit: number;
  offset: number;
}) {
  const { userClient, viewerId, postId, limit, offset } = args;
  await assertQuadPostReadable(userClient, postId);

  const { data, error } = await userClient
    .from("quad_post_comments")
    .select("id, post_id, user_id, body, created_at, parent_comment_id, updated_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new ApiError(400, error.message, "QUAD_COMMENTS_FETCH_FAILED");

  const rows = (data ?? []) as QuadPostCommentRow[];
  const profileMap = await loadCommentProfiles(userClient, rows.map((row) => row.user_id));
  const likeMeta = await loadCommentLikeMeta({
    userClient,
    viewerId,
    commentIds: rows.map((row) => row.id),
  });

  const flat = rows.map((row) =>
    formatQuadPostComment(row, profileMap.get(row.user_id), likeMeta.get(row.id) ?? { likeCount: 0, viewerHasLiked: false }),
  );

  return nestQuadPostComments(flat);
}

export async function addQuadPostComment(args: {
  userClient: SupabaseClientLike;
  userId: string;
  postId: string;
  body: string;
  parentCommentId?: string | null;
}) {
  const { userClient, userId, postId, body, parentCommentId } = args;
  assertModerationSafeText({ text: body, field: "comment", maxLen: 200 });

  const { data: postRow, error: postError } = await userClient
    .from("quad_posts")
    .select("id, user_id")
    .eq("id", postId)
    .maybeSingle();
  if (postError) throw new ApiError(400, postError.message, "QUAD_POST_LOOKUP_FAILED");
  if (!postRow) throw new ApiError(404, "Post not found.", "QUAD_POST_NOT_FOUND");

  let resolvedParentId: string | null = null;
  if (parentCommentId) {
    const { data: parentRow, error: parentError } = await userClient
      .from("quad_post_comments")
      .select("id, post_id")
      .eq("id", parentCommentId)
      .maybeSingle();
    if (parentError) throw new ApiError(400, parentError.message, "QUAD_COMMENT_PARENT_LOOKUP_FAILED");
    if (!parentRow || parentRow.post_id !== postId) {
      throw new ApiError(404, "Parent comment not found.", "QUAD_COMMENT_PARENT_NOT_FOUND");
    }
    resolvedParentId = parentRow.id;
  }

  const { data, error } = await userClient
    .from("quad_post_comments")
    .insert({
      post_id: postId,
      user_id: userId,
      body: body.trim(),
      parent_comment_id: resolvedParentId,
    })
    .select("id, post_id, user_id, body, created_at, parent_comment_id, updated_at")
    .single();
  if (error) throw new ApiError(400, error.message, "QUAD_COMMENT_CREATE_FAILED");

  const profileMap = await loadCommentProfiles(userClient, [userId]);
  const profile = profileMap.get(userId) as CommentProfile | undefined;
  const comment = formatQuadPostComment(data as QuadPostCommentRow, profile, { likeCount: 0, viewerHasLiked: false });

  if (postRow.user_id !== userId) {
    await notifyQuadPostCommented({
      postOwnerUserId: postRow.user_id,
      actorUserId: userId,
      actorUsername: profile?.username ?? "someone",
      postId,
      commentId: comment.id,
      commentBody: body,
    });
  }

  return comment;
}

export async function setQuadCommentLike(args: {
  userClient: SupabaseClientLike;
  userId: string;
  commentId: string;
  liked: boolean;
}) {
  const { userClient, userId, commentId, liked } = args;

  const { data: commentRow, error: commentError } = await userClient
    .from("quad_post_comments")
    .select("id")
    .eq("id", commentId)
    .maybeSingle();
  if (commentError) throw new ApiError(400, commentError.message, "QUAD_COMMENT_LOOKUP_FAILED");
  if (!commentRow) throw new ApiError(404, "Comment not found.", "QUAD_COMMENT_NOT_FOUND");

  if (liked) {
    const { error } = await userClient
      .from("quad_comment_likes")
      .upsert({ comment_id: commentId, user_id: userId }, { onConflict: "comment_id,user_id", ignoreDuplicates: true });
    if (error) throw new ApiError(400, error.message, "QUAD_COMMENT_LIKE_FAILED");
  } else {
    const { error } = await userClient
      .from("quad_comment_likes")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", userId);
    if (error) throw new ApiError(400, error.message, "QUAD_COMMENT_UNLIKE_FAILED");
  }

  const likeMeta = await loadCommentLikeMeta({
    userClient,
    viewerId: userId,
    commentIds: [commentId],
  });
  const meta = likeMeta.get(commentId) ?? { likeCount: 0, viewerHasLiked: false };

  return {
    commentId,
    likeCount: meta.likeCount,
    viewerHasLiked: meta.viewerHasLiked,
  };
}
