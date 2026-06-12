import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { getUserProfileForViewer } from "@/lib/server/userProfileView";
import { uuidSchema } from "@/lib/server/validation";

export async function GET(
  request: Request,
  context: { params: { userId: string } },
) {
  try {
    const auth = await requireAuthUser(request as Request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "users:profile:view",
      limit: 60,
      windowMs: 60_000,
    });

    const parsed = uuidSchema.safeParse(context.params.userId);
    if (!parsed.success) {
      return fail(new ApiError(400, "Invalid user id.", "VALIDATION_ERROR"));
    }

    const payload = await getUserProfileForViewer({
      userClient: auth.userClient,
      viewerId: auth.user.id,
      targetUserId: parsed.data,
    });

    return ok(payload);
  } catch (error) {
    return fail(error);
  }
}
