import { ZodError } from "zod";
import { assertPlatformModerationAdminEmail } from "@/lib/server/moderationAuth";
import {
  deleteReportedQuadPost,
  listQuadPostReportsForModeration,
  resolveQuadPostReport,
} from "@/lib/server/quadPostModeration";
import { ApiError, fail, ok } from "@/lib/server/http";
import {
  deleteReportedQuadPostSchema,
  readJson,
  resolveQuadPostReportSchema,
} from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    await assertPlatformModerationAdminEmail(request);
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    const reports = await listQuadPostReportsForModeration(limit);
    return ok({ reports });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const adminEmail = await assertPlatformModerationAdminEmail(request);
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "delete-post") {
      const input = await readJson(request, deleteReportedQuadPostSchema);
      const result = await deleteReportedQuadPost({
        postId: input.postId,
        reviewerUserId: input.reviewerUserId!,
        reviewerEmail: input.reviewerEmail ?? adminEmail,
        moderatorNote: input.moderatorNote,
      });
      return ok(result);
    }

    const input = await readJson(request, resolveQuadPostReportSchema);
    const report = await resolveQuadPostReport({
      reportId: input.reportId,
      status: input.status,
      moderatorNote: input.moderatorNote,
      reviewerUserId: input.reviewerUserId,
      reviewerEmail: input.reviewerEmail ?? adminEmail,
    });
    return ok({ report });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
