import { ZodError } from "zod";
import { isAdminEmail } from "@/lib/server/adminAuth";
import { ApiError, fail, ok } from "@/lib/server/http";
import { setOrganizationFreeze, transferOrganizationOwnership } from "@/lib/server/organizationManagement";
import { moderateCampusContent } from "@/lib/server/campusModeration";
import { organizationAdminModerationSchema, readJson } from "@/lib/server/validation";

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
    const input = await readJson(request, organizationAdminModerationSchema);
    if (input.action === "freeze" || input.action === "unfreeze") {
      const result = await setOrganizationFreeze({
        organizationId: input.organizationId,
        frozen: input.action === "freeze",
        reason: input.reason,
      });
      return ok({ result });
    }
    if (input.action === "transfer_owner") {
      if (!input.newOwnerUserId) {
        throw new ApiError(400, "newOwnerUserId is required.", "VALIDATION_ERROR");
      }
      const result = await transferOrganizationOwnership({
        organizationId: input.organizationId,
        newOwnerUserId: input.newOwnerUserId,
      });
      return ok({ result });
    }
    const result = await moderateCampusContent({
      entityType: "organization",
      entityId: input.organizationId,
      action: input.action === "remove" ? "remove" : "restore",
      moderatorNote: input.reason,
    });
    return ok({ result });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
