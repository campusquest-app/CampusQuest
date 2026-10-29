import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { createAdminClient, requireAuthUser } from "@/lib/server/supabase";
import {
  attachRecentLikersToPosts,
  enrichQuadPostsWithViewerReactions,
  fetchViewerReactionsForPosts,
} from "@/lib/server/quadReactions";
import { QUAD_POSTS_WITH_PROFILE_SELECT } from "@/lib/server/quadPosts";
import { enrichQuadPostsWithTagsAndMentions } from "@/lib/server/postTagService";
import { enrichPostsWithCarouselMedia } from "@/lib/server/quadPostMedia";
import { presentAnonymousQuadPosts } from "@/lib/server/anonymousPosts";
import type { QuadPostApiRow } from "@/lib/quadFieldNote";

/** Owner-only anonymous posts. The author is taken from the session, never the query string. */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:anonymous-posts", limit: 60, windowMs: 60_000 });
    const { searchParams } = new URL(request.url);
    const limit = Math.min(40, Math.max(1, Math.floor(Number(searchParams.get("limit") || "20"))));
    const before = searchParams.get("before")?.trim() || null;
    const admin = createAdminClient();

    const { data: links, error: linkError } = await admin
      .from("quad_anonymous_authors")
      .select("post_id")
      .eq("user_id", auth.user.id);
    if (linkError) throw new ApiError(400, "Could not load anonymous posts.", "ANONYMOUS_POSTS_FAILED");
    const ids = (links ?? []).map((row) => String(row.post_id)).filter(Boolean);
    if (ids.length === 0) return ok({ posts: [], nextCursor: null });

    let query = admin
      .from("quad_posts")
      .select(QUAD_POSTS_WITH_PROFILE_SELECT)
      .in("id", ids)
      .eq("is_anonymous", true)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (before) query = query.lt("created_at", before);
    const { data, error } = await query;
    if (error) throw new ApiError(400, "Could not load anonymous posts.", "ANONYMOUS_POSTS_FAILED");

    const rows = (data ?? []) as unknown as QuadPostApiRow[];
    const page = rows.slice(0, limit);
    const postIds = page.map((post) => post.id);
    const viewerReactions = await fetchViewerReactionsForPosts(auth.userClient, auth.user.id, postIds);
    const enriched = await enrichQuadPostsWithViewerReactions(page, viewerReactions, auth.user.id);
    const withTags = (await enrichQuadPostsWithTagsAndMentions(enriched)) as QuadPostApiRow[];
    const withMedia = (await enrichPostsWithCarouselMedia(withTags)) as QuadPostApiRow[];
    const withLikers = await attachRecentLikersToPosts({
      userClient: auth.userClient,
      viewerId: auth.user.id,
      posts: withMedia,
    });
    const presented = await presentAnonymousQuadPosts(withLikers, auth.user.id);
    const nextCursor = rows.length > limit ? page[page.length - 1]?.created_at ?? null : null;
    return ok({ posts: presented, nextCursor });
  } catch (error) {
    return fail(error);
  }
}
