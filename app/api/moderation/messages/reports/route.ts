import { ZodError } from "zod";
import { assertPlatformModerationAdminEmail } from "@/lib/server/moderationAuth";
import { ApiError, fail, ok } from "@/lib/server/http";
import { listMessageReportsForModeration, resolveMessageReport } from "@/lib/server/messaging";
import { readJson, resolveMessageReportSchema } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    await assertPlatformModerationAdminEmail(request);
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    const reports = await listMessageReportsForModeration(limit);
    return ok({ reports });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertPlatformModerationAdminEmail(request);
    const input = await readJson(request, resolveMessageReportSchema);
    const report = await resolveMessageReport({
      reportId: input.reportId,
      status: input.status,
      moderatorNote: input.moderatorNote,
      reviewerUserId: input.reviewerUserId,
      reviewerEmail: input.reviewerEmail,
    });
    return ok({ report });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
