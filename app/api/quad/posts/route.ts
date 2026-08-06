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
import { listHiddenUserIds } from "@/lib/server/qaTestAccount";
import { createRealmMomentForPost } from "@/lib/server/realmMoments";
import { maybeAwardQuadPostCreationXp } from "@/lib/server/quadPostXp";
import {
  enrichQuadPostsWithTagsAndMentions,
  persistPostTagsAndMentions,
} from "@/lib/server/postTagService";
import {
  attachCarouselMediaToPost,
  attachSingleVideoToPost,
  enrichPostsWithCarouselMedia,
  getReadyQuadMedia,
} from "@/lib/server/quadPostMedia";
import type { QuadPostApiRow } from "@/lib/quadFieldNote";

async function withTagsAndMentions(posts: QuadPostApiRow[]): Promise<QuadPostApiRow[]> {
  return (await enrichQuadPostsWithTagsAndMentions(posts)) as QuadPostApiRow[];
}

async function finalizeFeedPosts(posts: QuadPostApiRow[]): Promise<QuadPostApiRow[]> {
  const tagged = await withTagsAndMentions(posts);
  return (await enrichPostsWithCarouselMedia(tagged)) as QuadPostApiRow[];
}

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
        .maybeSingle();
      if (error) {
        logQuadPostError("get", error, { userId: auth.user.id, postId: parsed.data });
        throw new ApiError(400, error.message ?? "Could not load post.", "QUAD_POST_GET_FAILED");
      }
      if (!data) {
        return ok({ posts: [] as QuadPostApiRow[] });
      }
      const post = data as unknown as QuadPostApiRow;
      // Respect Public/Following (friends) visibility for deep links.
      if (post.user_id !== auth.user.id && post.visibility === "friends") {
        const { getAcceptedFriendUserIds } = await import("@/lib/server/friendProfileAccess");
        const friendIds = await getAcceptedFriendUserIds({
          userClient: auth.userClient,
          userId: auth.user.id,
        });
        if (!friendIds.includes(post.user_id)) {
          return ok({ posts: [] as QuadPostApiRow[] });
        }
      } else if (post.user_id !== auth.user.id && post.visibility !== "public") {
        return ok({ posts: [] as QuadPostApiRow[] });
      }
      const viewerReactions = await fetchViewerReactionsForPosts(auth.userClient, auth.user.id, [post.id]);
      const enriched = enrichQuadPostsWithViewerReactions([post], viewerReactions);
      return ok({ posts: await finalizeFeedPosts(enriched) });
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
      return ok({ posts: await finalizeFeedPosts(enriched) });
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

    const [{ data, error }, hiddenIds] = await Promise.all([
      query.order("created_at", { ascending: false }).limit(limit),
      listHiddenUserIds(auth.userClient),
    ]);

    if (error) {
      logQuadPostError("list", error, { userId: auth.user.id });
      throw new ApiError(400, error.message ?? "Could not load Quad posts.", "QUAD_POSTS_LIST_FAILED");
    }

    // QA/test account posts stay visible to the author, hidden from everyone else.
    const posts = ((data ?? []) as unknown as QuadPostApiRow[]).filter(
      (post) => post.user_id === auth.user.id || !hiddenIds.has(post.user_id),
    );
    const postIds = posts.map((p) => p.id);
    const viewerReactions = await fetchViewerReactionsForPosts(auth.userClient, auth.user.id, postIds);
    const enriched = enrichQuadPostsWithViewerReactions(posts, viewerReactions);

    return ok({ posts: await finalizeFeedPosts(enriched) });
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

    const carouselItems =
      input.mediaItems && input.mediaItems.length > 0
        ? [...input.mediaItems].sort((a, b) => a.sortOrder - b.sortOrder)
        : input.mediaId
          ? [{ mediaId: input.mediaId, sortOrder: 0 }]
          : null;

    let proofUrl: string | null = null;
    let posterUrl: string | null = null;
    let mediaType: "none" | "image" | "video" = input.mediaType ?? (input.proofUrl ? "image" : "none");
    let mediaDurationSeconds: number | null = null;
    let mediaHasAudio = false;
    let mediaWidth: number | null = null;
    let mediaHeight: number | null = null;
    let mediaMimeType: string | null = null;
    let mediaFileSizeBytes: number | null = null;
    let mediaStoragePath: string | null = null;
    let mediaCount = 0;
    let coverMediaId: string | null = null;

    if (carouselItems) {
      const coverId =
        input.coverMediaId && carouselItems.some((i) => i.mediaId === input.coverMediaId)
          ? input.coverMediaId
          : carouselItems[0]!.mediaId;
      const cover = await getReadyQuadMedia({ mediaId: coverId, userId: auth.user.id });
      // Pre-validate every item before insert.
      for (const item of carouselItems) {
        await getReadyQuadMedia({ mediaId: item.mediaId, userId: auth.user.id });
      }
      proofUrl = cover.playbackUrl;
      posterUrl = cover.mediaType === "video" ? cover.posterUrl : null;
      mediaType = cover.mediaType;
      mediaDurationSeconds = cover.mediaType === "video" ? cover.durationSeconds : null;
      mediaHasAudio = cover.mediaType === "video" ? cover.hasAudio : false;
      mediaWidth = cover.width;
      mediaHeight = cover.height;
      mediaMimeType = cover.mimeType;
      mediaFileSizeBytes = cover.fileSizeBytes;
      mediaStoragePath = cover.storagePath;
      mediaCount = carouselItems.length;
      coverMediaId = cover.id;
    } else {
      proofUrl = await normalizeQuadPostProofUrl(input.proofUrl, auth.user.id);
      if (proofUrl) {
        mediaType = "image";
        mediaCount = 1;
      }
    }

    const ramMarks = normalizeRamMarks(input.ramMarks);
    const visibility = input.visibility ?? "public";
    const locationId = input.locationId?.trim();
    const locationName = input.locationName?.trim();
    const hasValidLocation = !!locationId && isRealmLocationId(locationId);

    const insert = {
      user_id: auth.user.id,
      body: input.body.trim().slice(0, 300),
      proof_url: proofUrl,
      media_type: mediaType,
      poster_url: mediaType === "video" ? posterUrl : null,
      media_duration_seconds: mediaType === "video" ? mediaDurationSeconds : null,
      media_has_audio: mediaType === "video" ? mediaHasAudio : false,
      media_width: mediaWidth,
      media_height: mediaHeight,
      media_mime_type: mediaMimeType,
      media_file_size_bytes: mediaFileSizeBytes,
      media_storage_path: mediaStoragePath,
      media_processing_status: "ready" as const,
      media_count: mediaCount,
      cover_media_id: coverMediaId,
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

    if (carouselItems) {
      try {
        if (carouselItems.length === 1 && mediaType === "video" && !input.mediaItems) {
          await attachSingleVideoToPost({
            mediaId: carouselItems[0]!.mediaId,
            postId: post.id,
            userId: auth.user.id,
          });
        } else {
          await attachCarouselMediaToPost({
            postId: post.id,
            userId: auth.user.id,
            items: carouselItems,
            coverMediaId,
          });
        }
      } catch (mediaErr) {
        logQuadPostError("media_attach", mediaErr, { userId: auth.user.id, postId: post.id });
        await auth.userClient.from("quad_posts").delete().eq("id", post.id).eq("user_id", auth.user.id);
        throw mediaErr instanceof ApiError
          ? mediaErr
          : new ApiError(400, "Could not attach media to post.", "MEDIA_ATTACH_FAILED");
      }
    }

    try {
      const authorUsername =
        (post as { profiles?: { username?: string | null } }).profiles?.username?.trim() ||
        "Someone";
      await persistPostTagsAndMentions({
        postId: post.id,
        authorId: auth.user.id,
        authorUsername,
        composerTags: (input.tags ?? []).map((t) => ({
          entityType: t.entityType,
          entityId: t.entityId,
          displayLabel: t.displayLabel ?? t.entityType,
          subtitle: t.subtitle ?? null,
          mentionSlug: t.mentionSlug ?? null,
        })),
        photoTags: (input.photoTags ?? []).map((t) => ({
          entityType: t.entityType,
          entityId: t.entityId,
          mediaKey: t.mediaKey || "primary",
          positionX: t.positionX,
          positionY: t.positionY,
          displayLabel: t.displayLabel ?? t.entityType,
        })),
        mentions: (input.mentions ?? []).map((m) => ({
          entityType: m.entityType,
          entityId: m.entityId,
          displayText: m.displayText,
          startIndex: m.startIndex,
          endIndex: m.endIndex,
        })),
      });
    } catch (tagError) {
      // Post already created — surface tag failure without deleting the post.
      logQuadPostError("tags", tagError, { userId: auth.user.id, postId: post.id });
    }

    const enriched = enrichQuadPostsWithViewerReactions([post], new Map());
    const [finalPost] = await finalizeFeedPosts(enriched);

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

    const xpReward = await maybeAwardQuadPostCreationXp({
      userId: auth.user.id,
      postId: post.id,
    });

    return ok({ post: finalPost ?? post, realmMoment, xpReward });
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
