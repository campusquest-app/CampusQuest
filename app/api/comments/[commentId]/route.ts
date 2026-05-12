import { fail, ok } from "@/lib/server/http";
import { deleteOwnComment } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function DELETE(
  request: Request,
  { params }: { params: { commentId: string } },
) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "comment:delete", limit: 40, windowMs: 60_000 });
    const result = await deleteOwnComment({
      userClient: auth.userClient,
      userId: auth.user.id,
      commentId: params.commentId,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

