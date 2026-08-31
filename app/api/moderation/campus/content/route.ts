import { ZodError } from "zod";
import { assertPlatformModerationAdminEmail } from "@/lib/server/moderationAuth";
import { moderateCampusContent } from "@/lib/server/campusModeration";
import { ApiError, fail, ok } from "@/lib/server/http";
import { moderateCampusContentSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const adminEmail = await assertPlatformModerationAdminEmail(request);
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
