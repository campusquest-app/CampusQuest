import { ZodError } from "zod";
import { blockAnonymousPostAuthor } from "@/lib/server/anonymousPosts";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson, uuidSchema } from "@/lib/server/validation";
import { z } from "zod";

const schema = z.object({ postId: uuidSchema });

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    await assertAccountCanSocialize(auth.userClient, auth.user.id);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "social:blocks:anonymous",
      limit: 8,
      windowMs: 60_000,
      message: "You're doing that too often. Please try again later.",
      code: "ABUSE_RATE_LIMITED",
    });
    const input = await readJson(request, schema);
    const block = await blockAnonymousPostAuthor({ blockerId: auth.user.id, postId: input.postId });
    return ok(
      {
        blocked: true,
        blockId: block.blockId,
        message: "You’ll no longer see posts from this account. Their profile is not shown.",
      },
      201,
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, "Invalid post.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
