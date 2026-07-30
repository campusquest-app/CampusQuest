import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { createContentReport } from "@/lib/server/contentReports";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson, reportUserSchema, uuidSchema } from "@/lib/server/validation";

async function parseUserId(context: { params: Promise<{ userId: string }> }): Promise<string> {
  const { userId: raw } = await context.params;
  const parsed = uuidSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "Invalid user id.", "INVALID_USER_ID");
  return parsed.data;
}

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireAuthUser(request);
    const reportedUserId = await parseUserId(context);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "users:report",
      limit: 10,
      windowMs: 60_000,
    });
    const input = await readJson(request, reportUserSchema);
    const report = await createContentReport({
      userClient: auth.userClient,
      reporterId: auth.user.id,
      targetType: "user",
      targetId: reportedUserId,
      reportedUserId,
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
