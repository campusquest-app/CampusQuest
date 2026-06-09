import { ApiError } from "@/lib/server/http";
import { addXpInternal } from "@/lib/server/services";
import { createAdminClient } from "@/lib/server/supabase";
import type { QuadPostApiRow } from "@/lib/quadFieldNote";

export type QuadReactionType = "like" | "spark";

export type QuadPostLikeResult = {
  postId: string;
  likeCount: number;
  currentUserHasLiked: boolean;
};

export type QuadReactionToggleResult = QuadPostLikeResult & {
  reactionType: QuadReactionType;
  active: boolean;
  sparkCount: number;
  currentUserHasSparked: boolean;
};

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

function isMissingTableError(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || Boolean(error.message?.toLowerCase().includes("does not exist"));
}

export async function fetchViewerReactionsForPosts(
  userClient: SupabaseClientLike,
  viewerId: string,
  postIds: string[],
): Promise<Map<string, Set<QuadReactionType>>> {
  const map = new Map<string, Set<QuadReactionType>>();
  if (postIds.length === 0) return map;

  const [likesResult, sparksResult] = await Promise.all([
    userClient.from("post_likes").select("post_id").eq("user_id", viewerId).in("post_id", postIds),
    userClient
      .from("quad_post_reactions")
      .select("post_id")
      .eq("user_id", viewerId)
      .eq("reaction_type", "spark")
      .in("post_id", postIds),
  ]);

  if (likesResult.error && !isMissingTableError(likesResult.error)) {
    throw new ApiError(400, likesResult.error.message ?? "Could not load likes.", "POST_LIKES_LOAD_FAILED");
  }
  if (sparksResult.error && !isMissingTableError(sparksResult.error)) {
    throw new ApiError(400, sparksResult.error.message ?? "Could not load sparks.", "QUAD_REACTIONS_LOAD_FAILED");
  }

  for (const row of likesResult.data ?? []) {
    const postId = String(row.post_id);
    const set = map.get(postId) ?? new Set<QuadReactionType>();
    set.add("like");
    map.set(postId, set);
  }

  for (const row of sparksResult.data ?? []) {
    const postId = String(row.post_id);
    const set = map.get(postId) ?? new Set<QuadReactionType>();
    set.add("spark");
    map.set(postId, set);
  }

  // Legacy fallback: likes still in quad_post_reactions before migration backfill
  if (likesResult.error && isMissingTableError(likesResult.error)) {
    const { data, error } = await userClient
      .from("quad_post_reactions")
      .select("post_id, reaction_type")
      .eq("user_id", viewerId)
      .in("post_id", postIds);

    if (error && !isMissingTableError(error)) {
      throw new ApiError(400, error.message ?? "Could not load reactions.", "QUAD_REACTIONS_LOAD_FAILED");
    }

    for (const row of data ?? []) {
      const postId = String(row.post_id);
      const type = row.reaction_type as QuadReactionType;
      if (type !== "like" && type !== "spark") continue;
      const set = map.get(postId) ?? new Set<QuadReactionType>();
      set.add(type);
      map.set(postId, set);
    }
  }

  return map;
}

export function enrichQuadPostsWithViewerReactions(
  posts: QuadPostApiRow[],
  viewerReactions: Map<string, Set<QuadReactionType>>,
): QuadPostApiRow[] {
  return posts.map((post) => {
    const reactions = viewerReactions.get(post.id);
    const viewer_reactions: QuadReactionType[] = [];
    const currentUserHasLiked = reactions?.has("like") ?? false;
    if (currentUserHasLiked) viewer_reactions.push("like");
    if (reactions?.has("spark")) viewer_reactions.push("spark");
    return {
      ...post,
      viewer_reactions,
      like_count: Math.max(0, post.nod_count ?? 0),
      current_user_has_liked: currentUserHasLiked,
    };
  });
}

async function loadPostForReaction(
  userClient: SupabaseClientLike,
  postId: string,
): Promise<{ id: string; user_id: string; nod_count: number; hype_count: number }> {
  const { data, error } = await userClient
    .from("quad_posts")
    .select("id, user_id, nod_count, hype_count")
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    throw new ApiError(400, error.message ?? "Could not load post.", "QUAD_POST_LOAD_FAILED");
  }
  if (!data) {
    throw new ApiError(404, "Post not found.", "QUAD_POST_NOT_FOUND");
  }
  return data;
}

async function loadUserReactionState(
  userClient: SupabaseClientLike,
  postId: string,
  userId: string,
): Promise<{ liked: boolean; sparked: boolean }> {
  const [likeResult, sparkResult] = await Promise.all([
    userClient.from("post_likes").select("id").eq("post_id", postId).eq("user_id", userId).maybeSingle(),
    userClient
      .from("quad_post_reactions")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .eq("reaction_type", "spark")
      .maybeSingle(),
  ]);

  let liked = Boolean(likeResult.data?.id);
  if (likeResult.error && isMissingTableError(likeResult.error)) {
    const legacy = await userClient
      .from("quad_post_reactions")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .eq("reaction_type", "like")
      .maybeSingle();
    liked = Boolean(legacy.data?.id);
  } else if (likeResult.error) {
    throw new ApiError(400, likeResult.error.message ?? "Could not load like state.", "POST_LIKE_STATE_FAILED");
  }

  if (sparkResult.error && !isMissingTableError(sparkResult.error)) {
    throw new ApiError(400, sparkResult.error.message ?? "Could not load spark state.", "QUAD_REACTION_STATE_FAILED");
  }

  return { liked, sparked: Boolean(sparkResult.data?.id) };
}

async function insertPostLike(args: {
  userClient: SupabaseClientLike;
  userId: string;
  postId: string;
}): Promise<void> {
  const { userClient, userId, postId } = args;

  const { error: insertError } = await userClient.from("post_likes").insert({
    post_id: postId,
    user_id: userId,
  });

  if (!insertError) return;

  if (insertError.code === "23505") return;

  if (isMissingTableError(insertError)) {
    await ensureLegacyQuadReaction({ userClient, userId, postId, reactionType: "like" });
    return;
  }

  throw new ApiError(400, insertError.message ?? "Could not add like.", "POST_LIKE_INSERT_FAILED");
}

async function deletePostLike(args: {
  userClient: SupabaseClientLike;
  userId: string;
  postId: string;
}): Promise<void> {
  const { userClient, userId, postId } = args;

  const { error: deleteError } = await userClient
    .from("post_likes")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", userId);

  if (!deleteError) return;

  if (isMissingTableError(deleteError)) {
    await removeLegacyQuadReaction({ userClient, userId, postId, reactionType: "like" });
    return;
  }

  throw new ApiError(400, deleteError.message ?? "Could not remove like.", "POST_LIKE_DELETE_FAILED");
}

export async function setQuadPostLike(args: {
  userClient: SupabaseClientLike;
  userId: string;
  postId: string;
  liked: boolean;
}): Promise<QuadPostLikeResult> {
  const { userClient, userId, postId, liked } = args;

  await loadPostForReaction(userClient, postId);

  if (liked) {
    await insertPostLike({ userClient, userId, postId });
  } else {
    await deletePostLike({ userClient, userId, postId });
  }

  const refreshed = await loadPostForReaction(userClient, postId);
  const state = await loadUserReactionState(userClient, postId, userId);

  return {
    postId,
    likeCount: Math.max(0, refreshed.nod_count ?? 0),
    currentUserHasLiked: state.liked,
  };
}

async function ensureLegacyQuadReaction(args: {
  userClient: SupabaseClientLike;
  userId: string;
  postId: string;
  reactionType: QuadReactionType;
}): Promise<void> {
  const { userClient, userId, postId, reactionType } = args;
  const { error: insertError } = await userClient.from("quad_post_reactions").insert({
    post_id: postId,
    user_id: userId,
    reaction_type: reactionType,
  });

  if (!insertError || insertError.code === "23505") return;
  throw new ApiError(400, insertError.message ?? "Could not add reaction.", "QUAD_REACTION_INSERT_FAILED");
}

async function removeLegacyQuadReaction(args: {
  userClient: SupabaseClientLike;
  userId: string;
  postId: string;
  reactionType: QuadReactionType;
}): Promise<void> {
  const { userClient, userId, postId, reactionType } = args;
  const { error: deleteError } = await userClient
    .from("quad_post_reactions")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", userId)
    .eq("reaction_type", reactionType);

  if (deleteError) {
    throw new ApiError(400, deleteError.message ?? "Could not remove reaction.", "QUAD_REACTION_DELETE_FAILED");
  }
}

async function toggleSparkReaction(args: {
  userClient: SupabaseClientLike;
  userId: string;
  postId: string;
  postAuthorId: string;
}): Promise<void> {
  const { userClient, userId, postId, postAuthorId } = args;

  const { data: existing, error: existingError } = await userClient
    .from("quad_post_reactions")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .eq("reaction_type", "spark")
    .maybeSingle();

  if (existingError) {
    throw new ApiError(400, existingError.message ?? "Could not read reaction.", "QUAD_REACTION_READ_FAILED");
  }

  if (existing?.id) {
    const { error: deleteError } = await userClient
      .from("quad_post_reactions")
      .delete()
      .eq("id", existing.id)
      .eq("user_id", userId);
    if (deleteError) {
      throw new ApiError(400, deleteError.message ?? "Could not remove reaction.", "QUAD_REACTION_DELETE_FAILED");
    }
    return;
  }

  const { error: insertError } = await userClient.from("quad_post_reactions").insert({
    post_id: postId,
    user_id: userId,
    reaction_type: "spark",
  });

  if (insertError) {
    if (insertError.code === "23505") {
      throw new ApiError(409, "Reaction already exists.", "QUAD_REACTION_DUPLICATE");
    }
    throw new ApiError(400, insertError.message ?? "Could not add reaction.", "QUAD_REACTION_INSERT_FAILED");
  }

  await maybeAwardSparkXp({ postId, postAuthorId, sparkerUserId: userId });
}

async function maybeAwardSparkXp(args: {
  postId: string;
  postAuthorId: string;
  sparkerUserId: string;
}): Promise<void> {
  const { postId, postAuthorId, sparkerUserId } = args;
  if (postAuthorId === sparkerUserId) return;

  const admin = createAdminClient();

  const { data: existingGrant, error: grantLookupError } = await admin
    .from("quad_spark_xp_grants")
    .select("post_id")
    .eq("post_id", postId)
    .eq("sparker_user_id", sparkerUserId)
    .maybeSingle();

  if (grantLookupError) {
    throw new ApiError(400, grantLookupError.message, "SPARK_XP_LOOKUP_FAILED");
  }
  if (existingGrant) return;

  const { error: grantInsertError } = await admin.from("quad_spark_xp_grants").insert({
    post_id: postId,
    sparker_user_id: sparkerUserId,
  });

  if (grantInsertError) {
    if (grantInsertError.code === "23505") return;
    throw new ApiError(400, grantInsertError.message, "SPARK_XP_GRANT_FAILED");
  }

  await addXpInternal({
    userClient: admin,
    userId: postAuthorId,
    amount: 1,
    sourceType: "quad_spark",
    sourceId: postId,
    note: "Spark on your Quad post",
  });
}

export async function toggleQuadPostReaction(args: {
  userClient: SupabaseClientLike;
  userId: string;
  postId: string;
  reactionType: QuadReactionType;
}): Promise<QuadReactionToggleResult> {
  const { userClient, userId, postId, reactionType } = args;
  const post = await loadPostForReaction(userClient, postId);

  if (reactionType === "like") {
    const before = await loadUserReactionState(userClient, postId, userId);
    const result = await setQuadPostLike({ userClient, userId, postId, liked: !before.liked });
    const state = await loadUserReactionState(userClient, postId, userId);
    return {
      ...result,
      reactionType,
      active: result.currentUserHasLiked,
      sparkCount: Math.max(0, post.hype_count ?? 0),
      currentUserHasSparked: state.sparked,
    };
  } else {
    await toggleSparkReaction({
      userClient,
      userId,
      postId,
      postAuthorId: post.user_id,
    });
  }

  const refreshed = await loadPostForReaction(userClient, postId);
  const state = await loadUserReactionState(userClient, postId, userId);

  return {
    postId,
    reactionType,
    active: state.sparked,
    likeCount: Math.max(0, refreshed.nod_count ?? 0),
    sparkCount: Math.max(0, refreshed.hype_count ?? 0),
    currentUserHasLiked: state.liked,
    currentUserHasSparked: state.sparked,
  };
}
