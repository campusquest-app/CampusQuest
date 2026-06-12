import { ApiError } from "@/lib/server/http";
import { assertModerationSafeText } from "@/lib/server/security";
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
  profile?: CommentProfile,
) {
  return {
    id: row.id,
    postId: row.post_id,
    body: row.body,
    createdAt: row.created_at,
    author: {
      id: row.user_id,
      username: profile?.username ?? null,
      displayName: profile?.display_name ?? null,
      avatarUrl: avatarFromProfile(profile),
    },
  };
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

export async function listQuadPostComments(args: {
  userClient: SupabaseClientLike;
  postId: string;
  limit: number;
  offset: number;
}) {
  const { userClient, postId, limit, offset } = args;
  await assertQuadPostReadable(userClient, postId);

  const { data, error } = await userClient
    .from("quad_post_comments")
    .select("id, post_id, user_id, body, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new ApiError(400, error.message, "QUAD_COMMENTS_FETCH_FAILED");

  const rows = (data ?? []) as QuadPostCommentRow[];
  const profileMap = await loadCommentProfiles(userClient, rows.map((row) => row.user_id));
  return rows.map((row) => formatQuadPostComment(row, profileMap.get(row.user_id)));
}

export async function addQuadPostComment(args: {
  userClient: SupabaseClientLike;
  userId: string;
  postId: string;
  body: string;
}) {
  const { userClient, userId, postId, body } = args;
  assertModerationSafeText({ text: body, field: "comment", maxLen: 200 });
  await assertQuadPostReadable(userClient, postId);

  const { data, error } = await userClient
    .from("quad_post_comments")
    .insert({ post_id: postId, user_id: userId, body: body.trim() })
    .select("id, post_id, user_id, body, created_at")
    .single();
  if (error) throw new ApiError(400, error.message, "QUAD_COMMENT_CREATE_FAILED");

  const profileMap = await loadCommentProfiles(userClient, [userId]);
  return formatQuadPostComment(data as QuadPostCommentRow, profileMap.get(userId) as CommentProfile | undefined);
}
