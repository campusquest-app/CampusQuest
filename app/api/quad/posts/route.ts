import { ZodError } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { touchUserActivityFromAuth } from "@/lib/server/userActivity";
import { postQuadPostSchema, readJson, uuidSchema } from "@/lib/server/validation";
import { formatZodError } from "@/lib/server/zodErrors";
import {
  enrichQuadPostsWithViewerReactions,
  fetchViewerReactionsForPosts,
} from "@/lib/server/quadReactions";
import { isRealmLocationId } from "@/lib/realm/locationGeo";
import { shouldCreateRealmMoment } from "@/lib/realm/realmMomentEligibility";
import {
  logQuadPostError,
  normalizeQuadPostProofUrl,
  QUAD_POSTS_WITH_PROFILE_SELECT,
} from "@/lib/server/quadPosts";
import { createRealmMomentForPost } from "@/lib/server/realmMoments";
import type { QuadPostApiRow } from "@/lib/quadFieldNote";

function normalizeRamMarks(input: { id?: string; tag: string }[] | undefined): { id: string; tag: string }[] {
  if (!input?.length) return [];
  return input
    .map((r, i) => ({
      id: r.id && r.id.length > 0 ? r.id : `rm-${i}-${r.tag}`,
      tag: r.tag.trim().toLowerCase().slice(0, 15),
    }))
    .filter((r) => r.tag.length > 0)
    .slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quad:posts:get", limit: 120, windowMs: 60_000 });
    const { searchParams } = new URL(request.url);
    const limit = Math.min(120, Math.max(1, Math.floor(Number(searchParams.get("limit") || "60"))));
    const authorIdParam = searchParams.get("authorId")?.trim();
    const postIdParam = searchParams.get("postId")?.trim();
    const feedParam = searchParams.get("feed")?.trim().toLowerCase();

    if (postIdParam) {
      const parsed = uuidSchema.safeParse(postIdParam);
      if (!parsed.success) {
        throw new ApiError(400, "Invalid post id.", "INVALID_POST_ID");
      }
      const { data, error } = await auth.userClient
        .from("quad_posts")
        .select(QUAD_POSTS_WITH_PROFILE_SELECT)
        .eq("id", parsed.data)
        .eq("visibility", "public")
        .maybeSingle();
      if (error) {
        logQuadPostError("get", error, { userId: auth.user.id, postId: parsed.data });
        throw new ApiError(400, error.message ?? "Could not load post.", "QUAD_POST_GET_FAILED");
      }
      if (!data) {
        return ok({ posts: [] as QuadPostApiRow[] });
      }
      const post = data as unknown as QuadPostApiRow;
      const viewerReactions = await fetchViewerReactionsForPosts(auth.userClient, auth.user.id, [post.id]);
      const enriched = enrichQuadPostsWithViewerReactions([post], viewerReactions);
      return ok({ posts: enriched });
    }

    if (feedParam === "friends") {
      const { listFriendsQuadPosts } = await import("@/lib/server/quadFriendsFeed");
      const posts = await listFriendsQuadPosts({
        userClient: auth.userClient,
        userId: auth.user.id,
        limit,
      });
      const postIds = posts.map((p) => p.id);
      const viewerReactions = await fetchViewerReactionsForPosts(auth.userClient, auth.user.id, postIds);
      const enriched = enrichQuadPostsWithViewerReactions(posts, viewerReactions);
      return ok({ posts: enriched });
    }

    let query = auth.userClient.from("quad_posts").select(QUAD_POSTS_WITH_PROFILE_SELECT);

    if (authorIdParam) {
      const parsed = uuidSchema.safeParse(authorIdParam);
      if (!parsed.success) {
        throw new ApiError(400, "Invalid author id.", "INVALID_AUTHOR");
      }
      query = query.eq("user_id", authorIdParam);
      if (authorIdParam !== auth.user.id) {
        const { getAcceptedFriendUserIds } = await import("@/lib/server/friendProfileAccess");
        const friendIds = await getAcceptedFriendUserIds({
          userClient: auth.userClient,
          userId: auth.user.id,
        });
        if (friendIds.includes(authorIdParam)) {
          query = query.in("visibility", ["public", "friends"]);
        } else {
          query = query.eq("visibility", "public");
        }
      }
    } else if (feedParam === "public" || !feedParam) {
      query = query.eq("visibility", "public");
    }

    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);

    if (error) {
      logQuadPostError("list", error, { userId: auth.user.id });
      throw new ApiError(400, error.message ?? "Could not load Quad posts.", "QUAD_POSTS_LIST_FAILED");
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

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quad:posts:post", limit: 30, windowMs: 60_000 });
    const input = await readJson(request, postQuadPostSchema);
    touchUserActivityFromAuth(auth);

    const proofUrl = await normalizeQuadPostProofUrl(input.proofUrl, auth.user.id);

    const ramMarks = normalizeRamMarks(input.ramMarks);
    const visibility = input.visibility ?? "public";
    const locationId = input.locationId?.trim();
    const locationName = input.locationName?.trim();
    const hasValidLocation = !!locationId && isRealmLocationId(locationId);

    const insert = {
      user_id: auth.user.id,
      body: input.body.trim().slice(0, 300),
      proof_url: proofUrl,
      visibility,
      ram_marks: ramMarks,
      related_activity_id: input.relatedActivityId ?? null,
      related_quest_slug: input.relatedQuestSlug ?? null,
      author_streak_days: input.authorStreakDays ?? null,
      location_id: hasValidLocation ? locationId : null,
      location_name: hasValidLocation && locationName ? locationName.slice(0, 80) : null,
    };

    const { data: created, error: insErr } = await auth.userClient
      .from("quad_posts")
      .insert(insert)
      .select(QUAD_POSTS_WITH_PROFILE_SELECT)
      .single();

    if (insErr || !created) {
      logQuadPostError("create", insErr ?? new Error("insert returned no row"), {
        userId: auth.user.id,
        code: insErr?.code,
        details: insErr?.details,
        hint: insErr?.hint,
      });
      throw new ApiError(400, insErr?.message ?? "Could not create post.", "QUAD_POST_CREATE_FAILED");
    }

    const post = created as unknown as QuadPostApiRow;
    const enriched = enrichQuadPostsWithViewerReactions([post], new Map());

    let realmMoment: { id: string; locationId: string; locationName: string; expiresAt: string } | null = null;
    if (shouldCreateRealmMoment({ visibility, locationId: hasValidLocation ? locationId : null })) {
      realmMoment = await createRealmMomentForPost({
        userClient: auth.userClient,
        postId: post.id,
        userId: auth.user.id,
        locationId: locationId!,
        locationName,
      });
    }

    return ok({ post: enriched[0] ?? post, realmMoment });
  } catch (error) {
    if (error instanceof ZodError) {
      const message = formatZodError(error);
      logQuadPostError("validate", error, { issues: message });
      return fail(new ApiError(400, message, "VALIDATION_ERROR"));
    }
    if (!(error instanceof ApiError)) {
      logQuadPostError("post_unhandled", error);
    }
    return fail(error);
  }
}
