import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { listContentReportsForModeration, resolveContentReport } from "@/lib/server/contentReports";
import { enforceRateLimit } from "@/lib/server/security";
import { readJson, resolveContentReportSchema } from "@/lib/server/validation";

/**
 * Admin queue for `content_reports` (reported users, comments, infringement,
 * marketplace listings, student businesses). Message, post, event and
 * organization reports have their own queues.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "internal:moderation:content:reports:get", limit: 30, windowMs: 60_000 });
    const url = new URL(request.url);
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
    const reports = await listContentReportsForModeration(Number.isFinite(limit) ? limit : 100);
    return ok({ reports });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "internal:moderation:content:reports:post", limit: 20, windowMs: 60_000 });
    const input = await readJson(request, resolveContentReportSchema);
    const report = await resolveContentReport({
      reportId: input.reportId,
      status: input.status,
      moderatorNote: input.moderatorNote,
      reviewerUserId: auth.user.id,
      reviewerEmail: auth.normalizedEmail,
    });
    return ok({ report });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
