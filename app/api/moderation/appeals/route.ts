import { ZodError } from "zod";
import { isAdminEmail } from "@/lib/server/adminAuth";
import { ApiError, fail, ok } from "@/lib/server/http";
import { listSafetyAppealsForModeration, reviewSafetyAppeal } from "@/lib/server/accountSafety";
import { readJson, reviewSafetyAppealSchema } from "@/lib/server/validation";

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
}

export async function GET(request: Request) {
  try {
    assertModerationKey(request);
    assertModerationAdminEmailHeader(request);
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    const appeals = await listSafetyAppealsForModeration(limit);
    return ok({ appeals });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    assertModerationKey(request);
    assertModerationAdminEmailHeader(request);
    const input = await readJson(request, reviewSafetyAppealSchema);
    const appeal = await reviewSafetyAppeal({
      appealId: input.appealId,
      status: input.status,
      moderatorNote: input.moderatorNote,
      reviewerUserId: input.reviewerUserId,
      reviewerEmail: input.reviewerEmail,
    });
    return ok({ appeal });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
