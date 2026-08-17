import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import {
  attachRecentLikersToPosts,
  enrichQuadPostsWithViewerReactions,
  fetchViewerReactionsForPosts,
} from "@/lib/server/quadReactions";
import { logQuadPostError, QUAD_POSTS_WITH_PROFILE_SELECT } from "@/lib/server/quadPosts";
import { enrichQuadPostsWithTagsAndMentions } from "@/lib/server/postTagService";
import { enrichPostsWithCarouselMedia } from "@/lib/server/quadPostMedia";
import type { QuadPostApiRow } from "@/lib/quadFieldNote";

/** Current user's Quad posts (newest first) — for profile “Posts to the Quad”. */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:quad:posts:get", limit: 80, windowMs: 60_000 });
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Math.floor(Number(searchParams.get("limit") || "40"))));

    const { data, error } = await auth.userClient
      .from("quad_posts")
      .select(QUAD_POSTS_WITH_PROFILE_SELECT)
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logQuadPostError("my_posts_list", error, { userId: auth.user.id });
      throw new ApiError(400, error.message ?? "Could not load your posts.", "MY_QUAD_POSTS_FAILED");
    }

    const posts = (data ?? []) as unknown as QuadPostApiRow[];
    const postIds = posts.map((p) => p.id);
    const viewerReactions = await fetchViewerReactionsForPosts(auth.userClient, auth.user.id, postIds);
    const enriched = enrichQuadPostsWithViewerReactions(posts, viewerReactions);
    const withTags = await enrichQuadPostsWithTagsAndMentions(enriched);
    const withMedia = (await enrichPostsWithCarouselMedia(withTags)) as QuadPostApiRow[];
    const withLikers = await attachRecentLikersToPosts({
      userClient: auth.userClient,
      viewerId: auth.user.id,
      posts: withMedia,
    });

    return ok({ posts: withLikers });
  } catch (error) {
    return fail(error);
  }
}
