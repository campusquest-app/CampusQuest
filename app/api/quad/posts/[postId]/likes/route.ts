import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { setQuadPostLike } from "@/lib/server/quadReactions";
import { requireAuthUser } from "@/lib/server/supabase";
import { uuidSchema } from "@/lib/server/validation";

async function parsePostId(context: { params: Promise<{ postId: string }> }): Promise<string> {
  const { postId: rawPostId } = await context.params;
  const postIdParsed = uuidSchema.safeParse(rawPostId);
  if (!postIdParsed.success) {
    throw new ApiError(400, "Invalid post id.", "INVALID_POST_ID");
  }
  return postIdParsed.data;
}

/** Like a Quad post (idempotent — duplicate likes are ignored). */
export async function POST(
  request: Request,
  context: { params: Promise<{ postId: string }> },
) {
  try {
    const auth = await requireAuthUser(request);
    const postId = await parsePostId(context);

    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "quad:posts:likes:create",
      limit: 120,
      windowMs: 60_000,
    });

    const like = await setQuadPostLike({
      userClient: auth.userClient,
      userId: auth.user.id,
      postId,
      liked: true,
    });

    return ok({ like });
  } catch (error) {
    return fail(error);
  }
}

/** Unlike a Quad post (idempotent — missing likes are ignored). */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ postId: string }> },
) {
  try {
    const auth = await requireAuthUser(request);
    const postId = await parsePostId(context);

    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "quad:posts:likes:delete",
      limit: 120,
      windowMs: 60_000,
    });

    const like = await setQuadPostLike({
      userClient: auth.userClient,
      userId: auth.user.id,
      postId,
      liked: false,
    });

    return ok({ like });
  } catch (error) {
    return fail(error);
  }
}
