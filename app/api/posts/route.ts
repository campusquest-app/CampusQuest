import { ZodError } from "zod";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { ApiError, fail, ok } from "@/lib/server/http";
import { createPost, listFeedPosts } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { createPostSchema, readJson } from "@/lib/server/validation";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parseIntParam(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "post:feed", limit: 120, windowMs: 60_000 });
    const url = new URL(request.url);
    const rawLimit = parseIntParam(url.searchParams.get("limit"), DEFAULT_LIMIT);
    const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
    const offset = parseIntParam(url.searchParams.get("offset"), 0);
    const posts = await listFeedPosts({
      userClient: auth.userClient,
      userId: auth.user.id,
      limit,
      offset,
    });
    return ok({
      posts,
      pagination: {
        limit,
        offset,
        returned: posts.length,
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    await assertAccountCanSocialize(auth.userClient as any, auth.user.id);
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

