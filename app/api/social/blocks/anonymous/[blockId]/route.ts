import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { uuidSchema } from "@/lib/server/validation";

export async function DELETE(request: Request, context: { params: Promise<{ blockId: string }> }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "social:blocks:anonymous:delete", limit: 8, windowMs: 60_000 });
    const { blockId } = await context.params;
    const parsed = uuidSchema.safeParse(blockId);
    if (!parsed.success) throw new ApiError(400, "Invalid block.", "VALIDATION_ERROR");
    const { data, error } = await auth.userClient.rpc("cq_remove_my_anonymous_block", { p_block_id: parsed.data });
    if (error) throw new ApiError(400, "Could not unblock this account.", "UNBLOCK_FAILED");
    if (data !== true) throw new ApiError(404, "Block not found.", "BLOCK_NOT_FOUND");
    return ok({ unblocked: true });
  } catch (error) {
    return fail(error);
  }
}
