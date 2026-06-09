import { fail, ok, ApiError } from "@/lib/server/http";
import { removeConnection } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { uuidSchema } from "@/lib/server/validation";

export async function DELETE(
  request: Request,
  context: { params: { connectionId: string } },
) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "social:connections:remove",
      limit: 30,
      windowMs: 60_000,
    });

    const parsed = uuidSchema.safeParse(context.params.connectionId);
    if (!parsed.success) {
      return fail(new ApiError(400, "Invalid connection id.", "VALIDATION_ERROR"));
    }

    const result = await removeConnection({
      userClient: auth.userClient,
      userId: auth.user.id,
      connectionId: parsed.data,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
