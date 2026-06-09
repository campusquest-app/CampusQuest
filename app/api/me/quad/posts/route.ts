import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import {
  enrichQuadPostsWithViewerReactions,
  fetchViewerReactionsForPosts,
} from "@/lib/server/quadReactions";
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
      .select(
        `
        *,
        profiles (
          display_name,
          username,
          avatar_custom_json
        )
      `,
      )
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new ApiError(400, error.message ?? "Could not load your posts.", "MY_QUAD_POSTS_FAILED");
    }

    const posts = (data ?? []) as unknown as QuadPostApiRow[];
    const postIds = posts.map((p) => p.id);
    const viewerReactions = await fetchViewerReactionsForPosts(auth.userClient, auth.user.id, postIds);
    const enriched = enrichQuadPostsWithViewerReactions(posts, viewerReactions);

    return ok({ posts: enriched });
  } catch (error) {
    return fail(error);
  }
}
