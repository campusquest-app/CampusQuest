import { ZodError } from "zod";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { ApiError, fail, ok } from "@/lib/server/http";
import { addComment, listPostComments } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { commentSchema, readJson } from "@/lib/server/validation";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseIntParam(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export async function GET(
  request: Request,
  { params }: { params: { postId: string } },
) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "post:comments:list", limit: 120, windowMs: 60_000 });
    const url = new URL(request.url);
    const rawLimit = parseIntParam(url.searchParams.get("limit"), DEFAULT_LIMIT);
    const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
    const offset = parseIntParam(url.searchParams.get("offset"), 0);
    const comments = await listPostComments({
      userClient: auth.userClient,
      postId: params.postId,
      limit,
      offset,
    });
    return ok({
      comments,
      pagination: {
        limit,
        offset,
        returned: comments.length,
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: { postId: string } },
) {
  try {
    const auth = await requireAuthUser(request);
    await assertAccountCanSocialize(auth.userClient as any, auth.user.id);
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

