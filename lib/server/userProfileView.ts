import { resolveProfileAvatar } from "@/lib/avatarSource";
import { ApiError } from "@/lib/server/http";
import { getClassTitle } from "@/lib/characterClasses";
import type { QuadPostApiRow } from "@/lib/quadFieldNote";
import { getAcceptedFriendUserIds } from "@/lib/server/friendProfileAccess";
import { getRelationshipStatus } from "@/lib/server/messaging";
import {
  enrichQuadPostsWithViewerReactions,
  fetchViewerReactionsForPosts,
} from "@/lib/server/quadReactions";
import { QUAD_POSTS_WITH_PROFILE_SELECT } from "@/lib/server/quadPosts";
import { listHiddenUserIds } from "@/lib/server/qaTestAccount";
import { createAdminClient } from "@/lib/server/supabase";
import { xpToLevel } from "@/lib/level";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

export type ProfileRelationshipStatus =
  | "self"
  | "connected"
  | "pending_outgoing"
  | "pending_incoming"
  | "none"
  | "blocked";

const SCHOLAR_GUILD_LABELS: Record<string, string> = {
  arts_sciences: "Arts & Sciences Guild",
  business: "Business Guild",
  education: "Education Guild",
  engineering: "Engineering Guild",
  health_sciences: "Health Sciences Guild",
  environment_life_sciences: "Environment & Life Guild",
  nursing: "Nursing Guild",
  pharmacy: "Pharmacy Guild",
};

function guildLabelFromProfile(profile: {
  scholar_guild_id: string | null;
  game_state_json: Record<string, unknown> | null;
}): string | null {
  const scholarId = profile.scholar_guild_id;
  if (scholarId && scholarId !== "undecided") {
    return SCHOLAR_GUILD_LABELS[scholarId] ?? "Scholars Guild";
  }
  const gs = profile.game_state_json;
  const guildIds = gs && Array.isArray(gs.guildIds) ? (gs.guildIds as string[]) : [];
  if (guildIds.length > 0) return "Campus Guild";
  return null;
}

function mapRelationshipStatus(args: {
  viewerId: string;
  targetUserId: string;
  relationship: Awaited<ReturnType<typeof getRelationshipStatus>>;
}): ProfileRelationshipStatus {
  const { viewerId, targetUserId, relationship } = args;
  if (viewerId === targetUserId) return "self";
  if (relationship.blockedByMe || relationship.blockedByOther) return "blocked";
  if (relationship.isFollowing || relationship.connectionStatus === "accepted") return "connected";
  if (relationship.outgoingPending) return "pending_outgoing";
  if (relationship.incomingPending) return "pending_incoming";
  return "none";
}

async function countQuadPosts(args: {
  userClient: SupabaseClientLike;
  authorId: string;
  includeFriendsOnly: boolean;
}): Promise<number> {
  let query = args.userClient
    .from("quad_posts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.authorId);
  if (!args.includeFriendsOnly) {
    query = query.eq("visibility", "public");
  }
  const { count, error } = await query;
  if (error) throw new ApiError(400, error.message, "PROFILE_POST_COUNT_FAILED");
  return count ?? 0;
}

async function listAuthorQuadPosts(args: {
  userClient: SupabaseClientLike;
  viewerId: string;
  authorId: string;
  limit: number;
}): Promise<QuadPostApiRow[]> {
  let query = args.userClient
    .from("quad_posts")
    .select(QUAD_POSTS_WITH_PROFILE_SELECT)
    .eq("user_id", args.authorId);

  if (args.authorId !== args.viewerId) {
    const friendIds = await getAcceptedFriendUserIds({
      userClient: args.userClient,
      userId: args.viewerId,
    });
    if (friendIds.includes(args.authorId)) {
      query = query.in("visibility", ["public", "friends"]);
    } else {
      query = query.eq("visibility", "public");
    }
  }

  const { data, error } = await query.order("created_at", { ascending: false }).limit(args.limit);
  if (error) throw new ApiError(400, error.message, "PROFILE_POSTS_FETCH_FAILED");
  const posts = (data ?? []) as unknown as QuadPostApiRow[];
  const postIds = posts.map((post) => post.id);
  const viewerReactions = await fetchViewerReactionsForPosts(args.userClient, args.viewerId, postIds);
  return enrichQuadPostsWithViewerReactions(posts, viewerReactions);
}

async function countMutualFriends(args: {
  userClient: SupabaseClientLike;
  viewerId: string;
  targetUserId: string;
}): Promise<number> {
  const [viewerFriends, targetFriends] = await Promise.all([
    getAcceptedFriendUserIds({ userClient: args.userClient, userId: args.viewerId }),
    getAcceptedFriendUserIds({ userClient: args.userClient, userId: args.targetUserId }),
  ]);
  const targetSet = new Set(targetFriends);
  return viewerFriends.filter((id) => id !== args.targetUserId && targetSet.has(id)).length;
}

export async function getUserProfileForViewer(args: {
  userClient: SupabaseClientLike;
  viewerId: string;
  targetUserId: string;
  postsLimit?: number;
}) {
  const { userClient, viewerId, targetUserId } = args;
  const postsLimit = Math.min(60, Math.max(1, args.postsLimit ?? 50));

  const [profileResult, statsResult] = await Promise.all([
    userClient
      .from("profiles")
      .select(
        "id, username, display_name, avatar_url, avatar_custom_json, bio, character_class_id, starter_weapon, scholar_guild_id, streak_days, game_state_json",
      )
      .eq("id", targetUserId)
      .maybeSingle(),
    userClient.from("user_stats").select("level, total_xp").eq("user_id", targetUserId).maybeSingle(),
  ]);

  if (profileResult.error) {
    throw new ApiError(400, profileResult.error.message, "PROFILE_FETCH_FAILED");
  }
  if (!profileResult.data) {
    throw new ApiError(404, "User not found.", "USER_NOT_FOUND");
  }

  // QA/test accounts (is_hidden = true) have no public profile — except to themselves.
  if (viewerId !== targetUserId) {
    const hiddenIds = await listHiddenUserIds(userClient);
    if (hiddenIds.has(targetUserId)) {
      throw new ApiError(404, "User not found.", "USER_NOT_FOUND");
    }
  }
  if (statsResult.error) {
    throw new ApiError(400, statsResult.error.message, "PROFILE_STATS_FETCH_FAILED");
  }

  const profile = profileResult.data;
  const totalXp = Math.max(0, Number(statsResult.data?.total_xp ?? 0));
  const level = Math.max(1, Number(statsResult.data?.level ?? xpToLevel(totalXp)));

  let relationship: Awaited<ReturnType<typeof getRelationshipStatus>> | null = null;
  if (viewerId !== targetUserId) {
    relationship = await getRelationshipStatus({ userClient, userId: viewerId, otherUserId: targetUserId });
  }

  const relationshipStatus = relationship
    ? mapRelationshipStatus({ viewerId, targetUserId, relationship })
    : "self";

  if (relationshipStatus === "blocked") {
    throw new ApiError(403, "You cannot view this profile.", "PROFILE_BLOCKED");
  }

  const canViewPrivateContent = relationshipStatus === "self" || relationshipStatus === "connected";

  const [postCount, friendsCount, mutualFriends] = await Promise.all([
    countQuadPosts({
      userClient,
      authorId: targetUserId,
      includeFriendsOnly: canViewPrivateContent,
    }),
    getAcceptedFriendUserIds({ userClient, userId: targetUserId }).then((rows) => rows.length),
    viewerId === targetUserId
      ? Promise.resolve(0)
      : countMutualFriends({ userClient, viewerId, targetUserId }),
  ]);

  const classTitle = getClassTitle(profile.character_class_id) ?? null;
  const gs = (profile.game_state_json ?? null) as Record<string, unknown> | null;
  const equippedTitleId =
    typeof gs?.equippedTitleId === "string"
      ? gs.equippedTitleId
      : gs?.equippedTitleId === null
        ? null
        : undefined;

  const user = {
    id: profile.id,
    displayName: profile.display_name?.trim() || "Student",
    username: profile.username?.trim().toLowerCase().replace(/\s+/g, "_") || "student",
    avatar: resolveProfileAvatar(profile),
    level,
    title: classTitle,
    guild: guildLabelFromProfile({
      scholar_guild_id: profile.scholar_guild_id,
      game_state_json: gs,
    }),
    bio: canViewPrivateContent ? profile.bio?.trim() || null : null,
    classId: profile.character_class_id ?? null,
    starterWeapon: profile.starter_weapon ?? null,
    streakDays: Math.max(0, Number(profile.streak_days ?? 0)),
    equippedTitleId: canViewPrivateContent ? (equippedTitleId ?? null) : null,
  };

  let posts: QuadPostApiRow[] = [];
  let profileRow: typeof profile | null = null;
  let statsRow: typeof statsResult.data | null = null;

  if (canViewPrivateContent) {
    const [authorPosts, fullProfile, fullStats] = await Promise.all([
      listAuthorQuadPosts({ userClient, viewerId, authorId: targetUserId, limit: postsLimit }),
      userClient
        .from("profiles")
        .select(
          "id, username, display_name, avatar_url, avatar_custom_json, bio, major, class_year, streak_days, last_activity_date, character_class_id, starter_weapon, scholar_guild_id, game_state_json",
        )
        .eq("id", targetUserId)
        .maybeSingle(),
      userClient.from("user_stats").select("*").eq("user_id", targetUserId).maybeSingle(),
    ]);
    posts = authorPosts;
    profileRow = fullProfile.data ?? profile;
    statsRow = fullStats.data ?? statsResult.data;
  }

  return {
    user,
    relationshipStatus,
    canViewPrivateContent,
    requestId: relationship?.requestId ?? null,
    counts: {
      posts: postCount,
      friends: canViewPrivateContent ? friendsCount : null,
      mutualFriends: viewerId === targetUserId ? 0 : mutualFriends,
    },
    posts,
    profile: profileRow,
    stats: statsRow,
  };
}
