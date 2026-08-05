import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { createAdminClient, requireAuthUser } from "@/lib/server/supabase";
import { uuidSchema } from "@/lib/server/validation";
import { canViewerSeeTaggedPost, isTagEntityType } from "@/lib/postTags";
import { QUAD_POSTS_WITH_PROFILE_SELECT } from "@/lib/server/quadPosts";
import { enrichQuadPostsWithTagsAndMentions } from "@/lib/server/postTagService";
import { getAcceptedFriendUserIds } from "@/lib/server/friendProfileAccess";
import type { QuadPostApiRow } from "@/lib/quadFieldNote";

export async function GET(
  request: Request,
  context: { params: Promise<{ entityType: string; entityId: string }> },
) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quad:tagged:get", limit: 60, windowMs: 60_000 });
    const { entityType, entityId } = await context.params;
    if (!isTagEntityType(entityType)) throw new ApiError(400, "Invalid entity type.", "INVALID_TYPE");
    const idParsed = uuidSchema.safeParse(entityId);
    if (!idParsed.success) throw new ApiError(400, "Invalid entity id.", "INVALID_ID");

    const { searchParams } = new URL(request.url);
    const limit = Math.min(60, Math.max(1, Number(searchParams.get("limit") || "30") || 30));
    const admin = createAdminClient();

    const { data: tags, error: tagErr } = await admin
      .from("post_tags")
      .select("post_id")
      .eq("entity_type", entityType)
      .eq("entity_id", idParsed.data)
      .eq("status", "approved")
      .is("removed_at", null)
      .in("tag_source", ["composer", "photo"])
      .order("created_at", { ascending: false })
      .limit(limit);
    if (tagErr) throw new ApiError(400, tagErr.message, "TAGGED_LIST_FAILED");

    const postIds = Array.from(new Set((tags ?? []).map((t) => t.post_id as string)));
    if (!postIds.length) return ok({ posts: [] });

    // Fetch via admin so we can apply visibility in-app (RLS allows all authed reads).
    const { data: posts, error } = await admin
      .from("quad_posts")
      .select(QUAD_POSTS_WITH_PROFILE_SELECT)
      .in("id", postIds)
      .order("created_at", { ascending: false });
    if (error) throw new ApiError(400, error.message, "TAGGED_POSTS_FAILED");

    const friendIds = await getAcceptedFriendUserIds({
      userClient: auth.userClient,
      userId: auth.user.id,
    });
    const friendSet = new Set(friendIds);

    const visible = ((posts ?? []) as unknown as QuadPostApiRow[]).filter((p) =>
      canViewerSeeTaggedPost({
        viewerId: auth.user.id,
        authorId: p.user_id,
        visibility: p.visibility,
        friendAuthorIds: friendSet,
      }),
    );

    return ok({ posts: await enrichQuadPostsWithTagsAndMentions(visible) });
  } catch (error) {
    return fail(error);
  }
}
