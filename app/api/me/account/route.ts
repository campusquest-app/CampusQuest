import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { deleteOwnAccount } from "@/lib/server/selfAccountDeletion";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { deleteOwnAccountSchema, readJson } from "@/lib/server/validation";

/**
 * DELETE /api/me/account
 * Self-serve account deletion (App Store / Play requirement).
 * Body: { "confirmation": "DELETE" }
 */
export async function DELETE(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "me:account:delete",
      limit: 3,
      windowMs: 60 * 60_000,
    });
    await readJson(request, deleteOwnAccountSchema);
    const result = await deleteOwnAccount({
      userId: auth.user.id,
      userEmail: auth.user.email,
    });
    return ok({ deleted: true, userId: result.userId });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(
        new ApiError(
          400,
          'Type DELETE to confirm account deletion.',
          "VALIDATION_ERROR",
        ),
      );
    }
    return fail(error);
  }
}
