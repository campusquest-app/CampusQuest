import { ApiError } from "@/lib/server/http";
import {
  notifyQuadPostLiked,
  removeQuadPostLikeNotification,
} from "@/lib/server/quadPostNotifications";
import { createAdminClient } from "@/lib/server/supabase";
import type { QuadPostApiRow } from "@/lib/quadFieldNote";
import { DAILY_EMBER_LIMIT, EMBER_REACTION_TYPE, campusDayWindowForEmbers } from "@/lib/embers";
import type { EmberAllowance } from "@/lib/embers";
import {
  assertEmberGiverEligible,
  assertEmberNotBlocked,
  countUserEmbersInWindow,
  discloseEmberCounts,
  emberDailyLimitError,
  emberInsertExceededLimit,
  emberSelfError,
  getViewerEmberAllowance,
  notifyEmberGiven,
  retractEmberNotification,
} from "@/lib/server/embers";

export type QuadReactionType = "like" | "spark";

export type QuadPostLikeResult = {
  postId: string;
  likeCount: number;
  currentUserHasLiked: boolean;
};

export type QuadReactionToggleResult = QuadPostLikeResult & {
  reactionType: QuadReactionType;
  active: boolean;
  /** Null unless the viewer authored the post. */
  sparkCount: number | null;
  currentUserHasSparked: boolean;
  emberAllowance?: EmberAllowance;
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
      .eq("reaction_type", EMBER_REACTION_TYPE)
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

export async function enrichQuadPostsWithViewerReactions(
  posts: QuadPostApiRow[],
  viewerReactions: Map<string, Set<QuadReactionType>>,
  viewerId: string,
): Promise<QuadPostApiRow[]> {
  const disclosed = await discloseEmberCounts(posts, viewerId);
  return disclosed.map((post) => {
    const reactions = viewerReactions.get(post.id);
    const viewer_reactions: QuadReactionType[] = [];
    const currentUserHasLiked = reactions?.has("like") ?? false;
    if (currentUserHasLiked) viewer_reactions.push("like");
    if (reactions?.has("spark")) viewer_reactions.push("spark");
    return {
      ...post,
      hype_count: post.user_id === viewerId ? Math.max(0, post.hype_count ?? 0) : 0,
      viewer_reactions,
      like_count: Math.max(0, post.nod_count ?? 0),
      current_user_has_liked: currentUserHasLiked,
    };
  });
}

async function loadPostForReaction(
  userClient: SupabaseClientLike,
  postId: string,
): Promise<{ id: string; user_id: string; nod_count: number }> {
  const { data, error } = await userClient
    .from("quad_posts")
    .select("id, user_id, nod_count")
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

/** Author-only total. Other viewers receive null so the response cannot be counted. */
async function emberTotalForViewer(viewerId: string, authorId: string, postId: string): Promise<number | null> {
  if (viewerId !== authorId) return null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("quad_posts").select("hype_count").eq("id", postId).maybeSingle();
    if (error || !data) return 0;
    return Math.max(0, Number(data.hype_count ?? 0) || 0);
  } catch {
    return 0;
  }
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
      .eq("reaction_type", EMBER_REACTION_TYPE)
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

async function loadActorUsername(userClient: SupabaseClientLike, userId: string): Promise<string> {
  const { data } = await userClient.from("profiles").select("username").eq("id", userId).maybeSingle();
  return data?.username?.trim() || "someone";
}

export async function setQuadPostLike(args: {
  userClient: SupabaseClientLike;
  userId: string;
  postId: string;
  liked: boolean;
}): Promise<QuadPostLikeResult> {
  const { userClient, userId, postId, liked } = args;

  const post = await loadPostForReaction(userClient, postId);
  const before = await loadUserReactionState(userClient, postId, userId);

  if (liked) {
    await insertPostLike({ userClient, userId, postId });
    if (!before.liked && post.user_id !== userId) {
      const actorUsername = await loadActorUsername(userClient, userId);
      await notifyQuadPostLiked({
        postOwnerUserId: post.user_id,
        actorUserId: userId,
        actorUsername,
        postId,
      });
    }
  } else {
    await deletePostLike({ userClient, userId, postId });
    if (before.liked && post.user_id !== userId) {
      await removeQuadPostLikeNotification({
        postOwnerUserId: post.user_id,
        actorUserId: userId,
        postId,
      });
    }
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

/**
 * Toggle an Ember (stored as reaction_type = spark).
 * Never awards XP — Embers stay independent of paused progression.
 */
async function toggleSparkReaction(args: {
  userClient: SupabaseClientLike;
  userId: string;
  postId: string;
  postAuthorId: string;
  now?: Date;
}): Promise<void> {
  const { userClient, userId, postId, postAuthorId } = args;
  const now = args.now ?? new Date();

  const { data: existing, error: existingError } = await userClient
    .from("quad_post_reactions")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .eq("reaction_type", EMBER_REACTION_TYPE)
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
    await retractEmberNotification({
      postOwnerUserId: postAuthorId,
      actorUserId: userId,
      postId,
    });
    return;
  }

  if (userId === postAuthorId) {
    throw emberSelfError();
  }

  const { unlimited } = await assertEmberGiverEligible({ userClient, userId });
  await assertEmberNotBlocked({ userClient, viewerId: userId, authorId: postAuthorId });

  const { start, end } = campusDayWindowForEmbers(now);
  if (!unlimited) {
    const usedToday = await countUserEmbersInWindow({ userClient, userId, start, end });
    if (usedToday >= DAILY_EMBER_LIMIT) {
      throw emberDailyLimitError();
    }
  }

  const { data: inserted, error: insertError } = await userClient
    .from("quad_post_reactions")
    .insert({
      post_id: postId,
      user_id: userId,
      reaction_type: EMBER_REACTION_TYPE,
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    if (insertError.code === "23505") {
      throw new ApiError(409, "You already gave this post an Ember.", "QUAD_REACTION_DUPLICATE");
    }
    if (insertError.message?.includes("ember_daily_limit")) {
      throw emberDailyLimitError();
    }
    if (insertError.message?.includes("ember_self_not_allowed")) {
      throw emberSelfError();
    }
    throw new ApiError(400, insertError.message ?? "Could not add reaction.", "QUAD_REACTION_INSERT_FAILED");
  }

  if (!unlimited) {
    const usedAfter = await countUserEmbersInWindow({ userClient, userId, start, end });
    if (emberInsertExceededLimit(usedAfter, false) && inserted?.id) {
      await userClient.from("quad_post_reactions").delete().eq("id", inserted.id).eq("user_id", userId);
      throw emberDailyLimitError();
    }
  }

  await notifyEmberGiven({
    postOwnerUserId: postAuthorId,
    actorUserId: userId,
    postId,
  });
}

/**
 * Historical Spark XP path — retained so prior grants stay documented.
 * Embers must never call this, even if progression is later re-enabled.
 */
export async function maybeAwardSparkXp(_args: {
  postId: string;
  postAuthorId: string;
  sparkerUserId: string;
}): Promise<void> {
  return;
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
      sparkCount: await emberTotalForViewer(userId, post.user_id, postId),
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
  const emberAllowance = await getViewerEmberAllowance({ userClient, userId });

  return {
    postId,
    reactionType,
    active: state.sparked,
    likeCount: Math.max(0, refreshed.nod_count ?? 0),
    sparkCount: await emberTotalForViewer(userId, refreshed.user_id, postId),
    currentUserHasLiked: state.liked,
    currentUserHasSparked: state.sparked,
    emberAllowance,
  };
}

export type QuadPostLikerRow = {
  userId: string;
  username: string;
  displayName: string;
  /** Resolved avatar payload for AvatarDisplay. */
  avatar: string;
  isConnection: boolean;
  likedAt: string | null;
};

function mapLikerRow(args: {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatar: string;
  isConnection: boolean;
  likedAt: string | null;
}): QuadPostLikerRow {
  return {
    userId: args.userId,
    username: (args.username ?? "student").trim().toLowerCase() || "student",
    displayName: (args.displayName ?? "Student").trim() || "Student",
    avatar: args.avatar,
    isConnection: args.isConnection,
    likedAt: args.likedAt,
  };
}

/**
 * Batch-load a small "Liked by" preview for feed posts.
 * Connections/friends are prioritized into the top slots.
 */
export async function attachRecentLikersToPosts(args: {
  userClient: SupabaseClientLike;
  viewerId: string;
  posts: QuadPostApiRow[];
  previewLimit?: number;
}): Promise<QuadPostApiRow[]> {
  const { userClient, viewerId, posts } = args;
  const previewLimit = Math.max(1, Math.min(5, args.previewLimit ?? 3));
  if (posts.length === 0) return posts;

  const postIds = posts.map((p) => p.id);
  const { getAcceptedFriendUserIds } = await import("@/lib/server/friendProfileAccess");
  const { resolveProfileAvatar } = await import("@/lib/avatarSource");

  const friendIds = new Set(
    await getAcceptedFriendUserIds({ userClient, userId: viewerId }).catch(() => [] as string[]),
  );

  const { data: likeRows, error } = await userClient
    .from("post_likes")
    .select("post_id, user_id, created_at")
    .in("post_id", postIds)
    .order("created_at", { ascending: false });

  if (error && !isMissingTableError(error)) {
    console.warn("[cq:likes] recent likers load failed", error.message);
    return posts;
  }

  let rows = likeRows ?? [];
  if (error && isMissingTableError(error)) {
    const legacy = await userClient
      .from("quad_post_reactions")
      .select("post_id, user_id, created_at")
      .eq("reaction_type", "like")
      .in("post_id", postIds)
      .order("created_at", { ascending: false });
    rows = legacy.data ?? [];
  }

  const byPost = new Map<string, Array<{ userId: string; likedAt: string | null }>>();
  for (const row of rows) {
    const postId = String(row.post_id);
    const list = byPost.get(postId) ?? [];
    list.push({ userId: String(row.user_id), likedAt: (row.created_at as string | null) ?? null });
    byPost.set(postId, list);
  }

  const neededUserIds = new Set<string>();
  for (const list of Array.from(byPost.values())) {
    const prioritized = [
      ...list.filter((l) => friendIds.has(l.userId)),
      ...list.filter((l) => !friendIds.has(l.userId)),
    ];
    for (const entry of prioritized.slice(0, previewLimit)) {
      neededUserIds.add(entry.userId);
    }
  }

  const profileMap = new Map<
    string,
    { username: string | null; display_name: string | null; avatar_url: string | null; avatar_custom_json: string | null }
  >();
  if (neededUserIds.size > 0) {
    const { data: profiles } = await userClient
      .from("profiles")
      .select("id, username, display_name, avatar_url, avatar_custom_json")
      .in("id", Array.from(neededUserIds));
    for (const p of profiles ?? []) {
      profileMap.set(String(p.id), {
        username: p.username ?? null,
        display_name: p.display_name ?? null,
        avatar_url: p.avatar_url ?? null,
        avatar_custom_json: p.avatar_custom_json ?? null,
      });
    }
  }

  return posts.map((post) => {
    const list = byPost.get(post.id) ?? [];
    const prioritized = [
      ...list.filter((l) => friendIds.has(l.userId)),
      ...list.filter((l) => !friendIds.has(l.userId)),
    ];
    // Dedupe while preserving priority order.
    const seen = new Set<string>();
    const unique = prioritized.filter((l) => {
      if (seen.has(l.userId)) return false;
      seen.add(l.userId);
      return true;
    });
    const recent_likers = unique.slice(0, previewLimit).map((entry) => {
      const profile = profileMap.get(entry.userId);
      return {
        userId: entry.userId,
        username: (profile?.username ?? "student").trim().toLowerCase() || "student",
        displayName: (profile?.display_name ?? "Student").trim() || "Student",
        avatar: resolveProfileAvatar(profile ?? undefined),
        isConnection: friendIds.has(entry.userId),
      };
    });
    return { ...post, recent_likers };
  });
}

/** Full liker list for the "Liked by" sheet. */
export async function listQuadPostLikers(args: {
  userClient: SupabaseClientLike;
  viewerId: string;
  postId: string;
  limit?: number;
}): Promise<{ total: number; likers: QuadPostLikerRow[] }> {
  const { userClient, viewerId, postId } = args;
  const limit = Math.max(1, Math.min(100, args.limit ?? 60));
  const { getAcceptedFriendUserIds } = await import("@/lib/server/friendProfileAccess");
  const { resolveProfileAvatar } = await import("@/lib/avatarSource");
  const friendIds = new Set(
    await getAcceptedFriendUserIds({ userClient, userId: viewerId }).catch(() => [] as string[]),
  );

  let likeRows: Array<{ user_id: string; created_at: string | null }> | null = null;
  const primary = await userClient
    .from("post_likes")
    .select("user_id, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (primary.error && isMissingTableError(primary.error)) {
    const legacy = await userClient
      .from("quad_post_reactions")
      .select("user_id, created_at")
      .eq("post_id", postId)
      .eq("reaction_type", "like")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (legacy.error) {
      throw new ApiError(400, legacy.error.message ?? "Could not load likes.", "POST_LIKERS_LOAD_FAILED");
    }
    likeRows = legacy.data ?? [];
  } else if (primary.error) {
    throw new ApiError(400, primary.error.message ?? "Could not load likes.", "POST_LIKERS_LOAD_FAILED");
  } else {
    likeRows = primary.data ?? [];
  }

  const userIds = Array.from(new Set((likeRows ?? []).map((r) => String(r.user_id))));
  const profileMap = new Map<
    string,
    { username: string | null; display_name: string | null; avatar_url: string | null; avatar_custom_json: string | null }
  >();
  if (userIds.length > 0) {
    const { data: profiles } = await userClient
      .from("profiles")
      .select("id, username, display_name, avatar_url, avatar_custom_json")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      profileMap.set(String(p.id), {
        username: p.username ?? null,
        display_name: p.display_name ?? null,
        avatar_url: p.avatar_url ?? null,
        avatar_custom_json: p.avatar_custom_json ?? null,
      });
    }
  }

  const likers = (likeRows ?? []).map((row) => {
    const userId = String(row.user_id);
    const profile = profileMap.get(userId);
    return mapLikerRow({
      userId,
      username: profile?.username ?? null,
      displayName: profile?.display_name ?? null,
      avatar: resolveProfileAvatar(profile ?? undefined),
      isConnection: friendIds.has(userId),
      likedAt: row.created_at ?? null,
    });
  });

  // Connections first, then original recency order.
  likers.sort((a, b) => Number(b.isConnection) - Number(a.isConnection));

  const { count } = await userClient
    .from("post_likes")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId);

  return { total: Math.max(count ?? likers.length, likers.length), likers };
}
