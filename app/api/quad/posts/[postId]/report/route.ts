import { ZodError } from "zod";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { ApiError, fail, ok } from "@/lib/server/http";
import { reportQuadPost } from "@/lib/server/quadPostModeration";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson, reportQuadPostSchema, uuidSchema } from "@/lib/server/validation";

async function parsePostId(context: { params: Promise<{ postId: string }> }): Promise<string> {
  const { postId: rawPostId } = await context.params;
  const postIdParsed = uuidSchema.safeParse(rawPostId);
  if (!postIdParsed.success) {
    throw new ApiError(400, "Invalid post id.", "INVALID_POST_ID");
  }
  return postIdParsed.data;
}

export async function POST(request: Request, context: { params: Promise<{ postId: string }> }) {
  try {
    const auth = await requireAuthUser(request);
    await assertAccountCanSocialize(auth.userClient, auth.user.id);
    const postId = await parsePostId(context);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "quad:posts:report",
      limit: 10,
      windowMs: 60_000,
    });
    const input = await readJson(request, reportQuadPostSchema);
    const report = await reportQuadPost({
      userClient: auth.userClient,
      userId: auth.user.id,
      postId,
      reason: input.reason,
      details: input.details,
    });
    return ok({ report }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
