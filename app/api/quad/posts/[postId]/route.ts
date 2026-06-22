import { ZodError } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import { fetchProfileRole, userHasPlatformAdminAccess } from "@/lib/server/permissions";
import { enforceRateLimit } from "@/lib/server/security";
import { createAdminClient, requireAuthUser } from "@/lib/server/supabase";
import { patchQuadPostSchema, readJson, uuidSchema } from "@/lib/server/validation";
import { formatZodError } from "@/lib/server/zodErrors";
import {
  enrichQuadPostsWithViewerReactions,
  fetchViewerReactionsForPosts,
} from "@/lib/server/quadReactions";
import { logQuadPostError, QUAD_POSTS_WITH_PROFILE_SELECT } from "@/lib/server/quadPosts";
import {
  deleteQuadPost,
  getOwnedQuadPost,
  resolveQuadPostLocationFields,
  syncRealmMomentForPostEdit,
} from "@/lib/server/quadPostMutations";
import type { QuadPostApiRow } from "@/lib/quadFieldNote";

async function parsePostId(context: { params: Promise<{ postId: string }> }): Promise<string> {
  const { postId: rawPostId } = await context.params;
  const postIdParsed = uuidSchema.safeParse(rawPostId);
  if (!postIdParsed.success) {
    throw new ApiError(400, "Invalid post id.", "INVALID_POST_ID");
  }
  return postIdParsed.data;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ postId: string }> },
) {
  try {
    const auth = await requireAuthUser(request);
    const postId = await parsePostId(context);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quad:posts:patch", limit: 60, windowMs: 60_000 });

    const input = await readJson(request, patchQuadPostSchema);
    await getOwnedQuadPost({ userClient: auth.userClient, postId, userId: auth.user.id });

    const patch: Record<string, unknown> = {};
    if (input.body !== undefined) patch.body = input.body.trim().slice(0, 300);
    if (input.visibility !== undefined) patch.visibility = input.visibility;
    if (input.locationId !== undefined || input.locationName !== undefined) {
      const loc = resolveQuadPostLocationFields({
        locationId: input.locationId,
        locationName: input.locationName ?? undefined,
      });
      patch.location_id = loc.location_id;
      patch.location_name = loc.location_name;
    }

    const { data: updated, error: updErr } = await auth.userClient
      .from("quad_posts")
      .update(patch)
      .eq("id", postId)
      .eq("user_id", auth.user.id)
      .select(QUAD_POSTS_WITH_PROFILE_SELECT)
      .single();

    if (updErr || !updated) {
      logQuadPostError("update", updErr ?? new Error("update returned no row"), { postId, userId: auth.user.id });
      throw new ApiError(400, updErr?.message ?? "Could not update post.", "QUAD_POST_UPDATE_FAILED");
    }

    const post = updated as unknown as QuadPostApiRow;
    await syncRealmMomentForPostEdit({
      userClient: auth.userClient,
      postId,
      userId: auth.user.id,
      visibility: post.visibility,
      locationId: post.location_id ?? null,
      locationName: post.location_name ?? null,
    });

    const viewerReactions = await fetchViewerReactionsForPosts(auth.userClient, auth.user.id, [postId]);
    const enriched = enrichQuadPostsWithViewerReactions([post], viewerReactions);

    return ok({ post: enriched[0] ?? post });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, formatZodError(error), "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ postId: string }> },
) {
  try {
    const auth = await requireAuthUser(request);
    const postId = await parsePostId(context);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quad:posts:delete", limit: 60, windowMs: 60_000 });

    const profileRole = await fetchProfileRole(auth.userClient, auth.user.id, {
      email: auth.user.email,
    });
    const isAdmin = userHasPlatformAdminAccess(auth.user, profileRole);

    const result = await deleteQuadPost({
      userClient: auth.userClient,
      adminClient: createAdminClient(),
      postId,
      userId: auth.user.id,
      isAdmin,
    });

    return ok({ deleted: true as const, postId: result.postId });
  } catch (error) {
    return fail(error);
  }
}
