import { ZodError } from "zod";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";
import { likeSchema, readJson } from "@/lib/server/validation";
import { setPostLike } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";

export async function POST(
  request: Request,
  { params }: { params: { postId: string } },
) {
  try {
    const auth = await requireAuthUser(request as any);
    await assertAccountCanSocialize(auth.userClient as any, auth.user.id);
    enforceRateLimit({ userId: auth.user.id, routeKey: "post:like", limit: 60, windowMs: 60_000 });
    const input = await readJson(request, likeSchema);
    const result = await setPostLike({
      userClient: auth.userClient,
      userId: auth.user.id,
      postId: params.postId,
      liked: input.liked,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

