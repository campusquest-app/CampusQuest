import { ZodError } from "zod";
import { isAdminEmail } from "@/lib/server/adminAuth";
import { ApiError, fail, ok } from "@/lib/server/http";
import { suspendUserForModeration } from "@/lib/server/messaging";
import { readJson, setUserSafetyStatusSchema } from "@/lib/server/validation";

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

export async function POST(request: Request) {
  try {
    assertModerationKey(request);
    assertModerationAdminEmailHeader(request);
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
