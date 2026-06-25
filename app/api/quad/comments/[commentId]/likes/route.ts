import { fail, ok, ApiError } from "@/lib/server/http";
import { setQuadCommentLike } from "@/lib/server/quadComments";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { uuidSchema } from "@/lib/server/validation";

async function parseCommentId(context: { params: Promise<{ commentId: string }> }): Promise<string> {
  const { commentId: rawCommentId } = await context.params;
  const parsed = uuidSchema.safeParse(rawCommentId);
  if (!parsed.success) {
    throw new ApiError(400, "Invalid comment id.", "INVALID_COMMENT_ID");
  }
  return parsed.data;
}

/** Like a Quad comment (idempotent). */
export async function POST(
  request: Request,
  context: { params: Promise<{ commentId: string }> },
) {
  try {
    const auth = await requireAuthUser(request);
    const commentId = await parseCommentId(context);

    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "quad:comments:likes:create",
      limit: 120,
      windowMs: 60_000,
    });

    const like = await setQuadCommentLike({
      userClient: auth.userClient,
      userId: auth.user.id,
      commentId,
      liked: true,
    });

    return ok({ like });
  } catch (error) {
    return fail(error);
  }
}

/** Unlike a Quad comment (idempotent). */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ commentId: string }> },
) {
  try {
    const auth = await requireAuthUser(request);
    const commentId = await parseCommentId(context);

    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "quad:comments:likes:delete",
      limit: 120,
      windowMs: 60_000,
    });

    const like = await setQuadCommentLike({
      userClient: auth.userClient,
      userId: auth.user.id,
      commentId,
      liked: false,
    });

    return ok({ like });
  } catch (error) {
    return fail(error);
  }
}
