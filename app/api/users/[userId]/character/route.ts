import { fail, ok, ApiError } from "@/lib/server/http";
import { getFriendCharacterSnapshot } from "@/lib/server/friendCharacter";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { uuidSchema } from "@/lib/server/validation";

export async function GET(
  request: Request,
  context: { params: { userId: string } },
) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "users:character:get",
      limit: 60,
      windowMs: 60_000,
    });

    const parsed = uuidSchema.safeParse(context.params.userId);
    if (!parsed.success) {
      return fail(new ApiError(400, "Invalid user id.", "VALIDATION_ERROR"));
    }

    const snapshot = await getFriendCharacterSnapshot({
      userClient: auth.userClient,
      viewerId: auth.user.id,
      targetUserId: parsed.data,
    });

    return ok(snapshot);
  } catch (error) {
    return fail(error);
  }
}
