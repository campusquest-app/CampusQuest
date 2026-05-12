import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { createPost } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { createPostSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "post:create", limit: 15, windowMs: 60_000 });
    const input = await readJson(request, createPostSchema);
    const post = await createPost({
      userClient: auth.userClient,
      userId: auth.user.id,
      body: input.body,
      imageUrl: input.imageUrl,
    });
    return ok(post, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

