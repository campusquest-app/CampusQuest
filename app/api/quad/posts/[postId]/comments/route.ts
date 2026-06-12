import { ZodError } from "zod";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { fail, ok, ApiError } from "@/lib/server/http";
import { addQuadPostComment, listQuadPostComments } from "@/lib/server/quadComments";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { touchUserActivityFromAuth } from "@/lib/server/userActivity";
import { commentSchema, readJson, uuidSchema } from "@/lib/server/validation";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseIntParam(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

async function parsePostId(context: { params: Promise<{ postId: string }> }): Promise<string> {
  const { postId: rawPostId } = await context.params;
  const postIdParsed = uuidSchema.safeParse(rawPostId);
  if (!postIdParsed.success) {
    throw new ApiError(400, "Invalid post id.", "INVALID_POST_ID");
  }
  return postIdParsed.data;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ postId: string }> },
) {
  try {
    const auth = await requireAuthUser(request);
    const postId = await parsePostId(context);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "quad:posts:comments:list",
      limit: 120,
      windowMs: 60_000,
    });
    const url = new URL(request.url);
    const rawLimit = parseIntParam(url.searchParams.get("limit"), DEFAULT_LIMIT);
    const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
    const offset = parseIntParam(url.searchParams.get("offset"), 0);
    const comments = await listQuadPostComments({
      userClient: auth.userClient,
      postId,
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
  context: { params: Promise<{ postId: string }> },
) {
  try {
    const auth = await requireAuthUser(request);
    await assertAccountCanSocialize(auth.userClient as any, auth.user.id);
    const postId = await parsePostId(context);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "quad:posts:comments:create",
      limit: 30,
      windowMs: 60_000,
    });
    const input = await readJson(request, commentSchema);
    touchUserActivityFromAuth(auth);
    const comment = await addQuadPostComment({
      userClient: auth.userClient,
      userId: auth.user.id,
      postId,
      body: input.body,
    });
    return ok({ comment }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
