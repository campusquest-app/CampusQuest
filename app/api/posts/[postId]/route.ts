import { fail, ok } from "@/lib/server/http";
import { deleteOwnPost } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function DELETE(
  request: Request,
  { params }: { params: { postId: string } },
) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "post:delete", limit: 30, windowMs: 60_000 });
    const result = await deleteOwnPost({
      userClient: auth.userClient,
      userId: auth.user.id,
      postId: params.postId,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

