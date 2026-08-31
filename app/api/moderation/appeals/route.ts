import { ZodError } from "zod";
import { assertPlatformModerationAdminEmail } from "@/lib/server/moderationAuth";
import { ApiError, fail, ok } from "@/lib/server/http";
import { listSafetyAppealsForModeration, reviewSafetyAppeal } from "@/lib/server/accountSafety";
import { readJson, reviewSafetyAppealSchema } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    await assertPlatformModerationAdminEmail(request);
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
    await assertPlatformModerationAdminEmail(request);
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
