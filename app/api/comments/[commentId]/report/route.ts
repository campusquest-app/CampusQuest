import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { createContentReport } from "@/lib/server/contentReports";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson, reportCommentSchema, uuidSchema } from "@/lib/server/validation";

async function parseCommentId(context: { params: Promise<{ commentId: string }> }): Promise<string> {
  const { commentId: raw } = await context.params;
  const parsed = uuidSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "Invalid comment id.", "INVALID_COMMENT_ID");
  return parsed.data;
}

export async function POST(request: Request, context: { params: Promise<{ commentId: string }> }) {
  try {
    const auth = await requireAuthUser(request);
    const commentId = await parseCommentId(context);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "comments:report",
      limit: 10,
      windowMs: 60_000,
    });
    const input = await readJson(request, reportCommentSchema);
    const report = await createContentReport({
      userClient: auth.userClient,
      reporterId: auth.user.id,
      targetType: "comment",
      targetId: commentId,
      reportedUserId: input.reportedUserId ?? null,
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
