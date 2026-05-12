import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { addComment } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { commentSchema, readJson } from "@/lib/server/validation";

export async function POST(
  request: Request,
  { params }: { params: { postId: string } },
) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "post:comment", limit: 30, windowMs: 60_000 });
    const input = await readJson(request, commentSchema);
    const comment = await addComment({
      userClient: auth.userClient,
      userId: auth.user.id,
      postId: params.postId,
      body: input.body,
    });
    return ok(comment, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

