import { ZodError, z } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { createAdminClient, requireAuthUser } from "@/lib/server/supabase";
import { formatZodError } from "@/lib/server/zodErrors";
import { readJson, uuidSchema } from "@/lib/server/validation";

const patchSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

/** Approve or reject a pending tag on the current user. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ tagId: string }> },
) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:pending-tags:patch", limit: 40, windowMs: 60_000 });
    const { tagId } = await context.params;
    const parsed = uuidSchema.safeParse(tagId);
    if (!parsed.success) throw new ApiError(400, "Invalid tag id.", "INVALID_ID");
    const input = await readJson(request, patchSchema);
    const admin = createAdminClient();

    const { data: tag, error } = await admin
      .from("post_tags")
      .select("id, post_id, entity_type, entity_id, status")
      .eq("id", parsed.data)
      .eq("entity_type", "user")
      .eq("entity_id", auth.user.id)
      .eq("status", "pending")
      .is("removed_at", null)
      .maybeSingle();
    if (error || !tag) throw new ApiError(404, "Pending tag not found.", "TAG_NOT_FOUND");

    if (input.action === "approve") {
      const { error: upd } = await admin
        .from("post_tags")
        .update({
          status: "approved",
          decided_at: new Date().toISOString(),
          decided_by: auth.user.id,
        })
        .eq("id", tag.id);
      if (upd) throw new ApiError(400, upd.message, "TAG_UPDATE_FAILED");
      return ok({ status: "approved", postId: tag.post_id });
    }

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
    return ok({ status: "rejected", postId: tag.post_id });
  } catch (error) {
    if (error instanceof ZodError) return fail(new ApiError(400, formatZodError(error), "VALIDATION_ERROR"));
    return fail(error);
  }
}
