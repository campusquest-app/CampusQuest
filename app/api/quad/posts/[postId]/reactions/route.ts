import { ZodError } from "zod";
import { z } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { toggleQuadPostReaction } from "@/lib/server/quadReactions";
import { requireAuthUser } from "@/lib/server/supabase";
import { touchUserActivityFromAuth } from "@/lib/server/userActivity";
import { readJson, uuidSchema } from "@/lib/server/validation";

const toggleReactionSchema = z.object({
  reactionType: z.enum(["like", "spark"]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ postId: string }> },
) {
  try {
    const auth = await requireAuthUser(request);
    const { postId: rawPostId } = await context.params;
    const postIdParsed = uuidSchema.safeParse(rawPostId);
    if (!postIdParsed.success) {
      throw new ApiError(400, "Invalid post id.", "INVALID_POST_ID");
    }

    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "quad:posts:reactions:toggle",
      limit: 120,
      windowMs: 60_000,
    });

    const input = await readJson(request, toggleReactionSchema);
    touchUserActivityFromAuth(auth);
    const result = await toggleQuadPostReaction({
      userClient: auth.userClient,
      userId: auth.user.id,
      postId: postIdParsed.data,
      reactionType: input.reactionType,
    });

    return ok({ reaction: result });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
