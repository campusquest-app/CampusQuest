import { ZodError } from "zod";
import { assertPlatformModerationAdminEmail } from "@/lib/server/moderationAuth";
import { ApiError, fail, ok } from "@/lib/server/http";
import { suspendUserForModeration } from "@/lib/server/messaging";
import { readJson, setUserSafetyStatusSchema } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    await assertPlatformModerationAdminEmail(request);
    const input = await readJson(request, setUserSafetyStatusSchema);
    const userSafety = await suspendUserForModeration({
      userId: input.userId,
      status: input.status,
      reason: input.reason,
      suspendedUntil: input.suspendedUntil,
      updatedBy: input.updatedBy,
      adminEmail: input.adminEmail,
    });
    return ok({ userSafety }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
