import { ZodError } from "zod";
import { isAdminEmail } from "@/lib/server/adminAuth";
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

function assertModerationKey(request: Request) {
  const expected = process.env.MESSAGE_MODERATION_API_KEY;
  if (!expected) {
    throw new ApiError(500, "Missing MESSAGE_MODERATION_API_KEY for moderation route.", "MODERATION_KEY_MISSING");
  }
  const provided = request.headers.get("x-message-moderation-key");
  if (!provided || provided !== expected) {
    throw new ApiError(403, "Forbidden.", "FORBIDDEN");
  }
}

function assertModerationAdminEmailHeader(request: Request) {
  const adminEmail = request.headers.get("x-admin-email")?.trim().toLowerCase();
  if (!adminEmail || !isAdminEmail(adminEmail)) {
    throw new ApiError(403, "Forbidden.", "FORBIDDEN");
  }
  return adminEmail;
}

export async function GET(request: Request) {
  try {
    assertModerationKey(request);
    assertModerationAdminEmailHeader(request);
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
    assertModerationKey(request);
    const adminEmail = assertModerationAdminEmailHeader(request);
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
