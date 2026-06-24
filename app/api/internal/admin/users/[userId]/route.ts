import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { deleteAdminTargetUser } from "@/lib/server/adminUserDeletion";
import { enforceRateLimit } from "@/lib/server/security";
import { uuidSchema } from "@/lib/server/validation";

export async function DELETE(request: Request, context: { params: { userId: string } }) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "internal:admin:users:delete",
      limit: 10,
      windowMs: 60_000,
      message: "Too many delete attempts. Please wait and try again.",
      code: "USER_DELETE_RATE_LIMIT",
    });

    const parsed = uuidSchema.safeParse(context.params.userId);
    if (!parsed.success) {
      throw new ApiError(400, "Invalid user id.", "VALIDATION_ERROR");
    }

    const targetUserId = parsed.data;
    const result = await deleteAdminTargetUser({
      targetUserId,
      adminUserId: auth.user.id,
      adminEmail: auth.normalizedEmail,
    });

    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
