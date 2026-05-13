import { ZodError } from "zod";
import { isAdminEmail } from "@/lib/server/adminAuth";
import { moderateCampusContent } from "@/lib/server/campusModeration";
import { ApiError, fail, ok } from "@/lib/server/http";
import { moderateCampusContentSchema, readJson } from "@/lib/server/validation";

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

export async function POST(request: Request) {
  try {
    assertModerationKey(request);
    const adminEmail = assertModerationAdminEmailHeader(request);
    const input = await readJson(request, moderateCampusContentSchema);
    const content = await moderateCampusContent({
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      moderatorNote: input.moderatorNote,
      reviewerUserId: input.reviewerUserId,
      reviewerEmail: input.reviewerEmail ?? adminEmail,
    });
    return ok({ content });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
