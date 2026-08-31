import { ZodError } from "zod";
import { assertPlatformModerationAdminEmail } from "@/lib/server/moderationAuth";
import { listCampusReportsForModeration, resolveCampusReport } from "@/lib/server/campusModeration";
import { ApiError, fail, ok } from "@/lib/server/http";
import { readJson, resolveCampusContentReportSchema } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    await assertPlatformModerationAdminEmail(request);
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    const reports = await listCampusReportsForModeration(limit);
    return ok(reports);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const adminEmail = await assertPlatformModerationAdminEmail(request);
    const url = new URL(request.url);
    const entityType = url.searchParams.get("entityType") === "organization" ? "organization" : "event";
    const input = await readJson(request, resolveCampusContentReportSchema);
    const report = await resolveCampusReport({
      entityType,
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
