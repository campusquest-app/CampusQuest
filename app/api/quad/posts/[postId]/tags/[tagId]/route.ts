import { ZodError, z } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { createAdminClient, requireAuthUser } from "@/lib/server/supabase";
import { formatZodError } from "@/lib/server/zodErrors";
import { readJson, uuidSchema } from "@/lib/server/validation";

const patchSchema = z
  .object({
    action: z.enum(["approve", "reject", "remove", "reposition"]).optional(),
    positionX: z.number().min(0).max(1).optional(),
    positionY: z.number().min(0).max(1).optional(),
  })
  .refine(
    (v) =>
      v.action === "reposition"
        ? v.positionX != null && v.positionY != null
        : Boolean(v.action),
    { message: "Provide an action, or reposition with positionX/positionY." },
  );

export async function PATCH(
  request: Request,
  context: { params: Promise<{ postId: string; tagId: string }> },
) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quad:tags:patch", limit: 40, windowMs: 60_000 });
    const { postId, tagId } = await context.params;
    const postParsed = uuidSchema.safeParse(postId);
    const tagParsed = uuidSchema.safeParse(tagId);
    if (!postParsed.success || !tagParsed.success) {
      throw new ApiError(400, "Invalid id.", "INVALID_ID");
    }
    const input = await readJson(request, patchSchema);
    const admin = createAdminClient();
    const { data: tag, error } = await admin
      .from("post_tags")
      .select("id, post_id, entity_type, entity_id, status, created_by, tag_source")
      .eq("id", tagParsed.data)
      .eq("post_id", postParsed.data)
      .is("removed_at", null)
      .maybeSingle();
    if (error || !tag) throw new ApiError(404, "Tag not found.", "TAG_NOT_FOUND");

    const { data: post } = await admin.from("quad_posts").select("user_id").eq("id", postParsed.data).maybeSingle();
    const isAuthor = post?.user_id === auth.user.id;
    const isTaggedUser = tag.entity_type === "user" && tag.entity_id === auth.user.id;
    if (!isAuthor && !isTaggedUser) {
      throw new ApiError(403, "You cannot manage this tag.", "TAG_FORBIDDEN");
    }

    if (input.action === "reposition") {
      if (!isAuthor) throw new ApiError(403, "Only the author can move photo tags.", "TAG_FORBIDDEN");
      if (tag.tag_source !== "photo") {
        throw new ApiError(400, "Only photo tags can be repositioned.", "TAG_NOT_PHOTO");
      }
      const { error: upd } = await admin
        .from("post_tags")
        .update({
          position_x: input.positionX,
          position_y: input.positionY,
        })
        .eq("id", tag.id);
      if (upd) throw new ApiError(400, upd.message, "TAG_UPDATE_FAILED");
      return ok({ status: "repositioned", positionX: input.positionX, positionY: input.positionY });
    }

    if (input.action === "approve") {
      if (!isTaggedUser) throw new ApiError(403, "Only the tagged user can approve.", "TAG_FORBIDDEN");
      if (tag.status === "approved") return ok({ status: "approved" });
      const { error: upd } = await admin
        .from("post_tags")
        .update({ status: "approved", decided_at: new Date().toISOString(), decided_by: auth.user.id })
        .eq("id", tag.id);
      if (upd) throw new ApiError(400, upd.message, "TAG_UPDATE_FAILED");

      const { data: authorProfile } = await admin
        .from("profiles")
        .select("username")
        .eq("id", tag.created_by)
        .maybeSingle();
      try {
        const { deliverOnTagApproved } = await import("@/lib/server/postTagService");
        await deliverOnTagApproved({
          tagId: tag.id as string,
          postId: postParsed.data,
          authorId: tag.created_by as string,
          authorUsername: authorProfile?.username?.trim() || "Someone",
          recipientUserId: tag.entity_id as string,
        });
      } catch (deliveryError) {
        console.warn("[cq][tag-delivery] approve delivery failed", {
          tagId: tag.id,
          message: deliveryError instanceof Error ? deliveryError.message : String(deliveryError),
        });
      }
      return ok({ status: "approved" });
    }

    if (input.action === "reject") {
      if (!isTaggedUser) throw new ApiError(403, "Only the tagged user can reject.", "TAG_FORBIDDEN");
      const { error: upd } = await admin
        .from("post_tags")
        .update({
          status: "rejected",
          removed_at: new Date().toISOString(),
          decided_at: new Date().toISOString(),
          decided_by: auth.user.id,
        })
        .eq("id", tag.id);
      if (upd) throw new ApiError(400, upd.message, "TAG_UPDATE_FAILED");
      return ok({ status: "rejected" });
    }

    // remove
    const { error: upd } = await admin
      .from("post_tags")
      .update({
        status: "removed",
        removed_at: new Date().toISOString(),
        decided_at: new Date().toISOString(),
        decided_by: auth.user.id,
      })
      .eq("id", tag.id);
    if (upd) throw new ApiError(400, upd.message, "TAG_UPDATE_FAILED");
    return ok({ status: "removed" });
  } catch (error) {
    if (error instanceof ZodError) return fail(new ApiError(400, formatZodError(error), "VALIDATION_ERROR"));
    return fail(error);
  }
}
