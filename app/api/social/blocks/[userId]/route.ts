import { fail, ok } from "@/lib/server/http";
import { unblockUser } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function DELETE(request: Request, context: { params: { userId: string } }) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "social:blocks:delete",
      limit: 8,
      windowMs: 60_000,
      message: "You're doing that too often. Please try again later.",
      code: "ABUSE_RATE_LIMITED",
    });
    const result = await unblockUser({
      userClient: auth.userClient,
      userId: auth.user.id,
      blockedUserId: context.params.userId,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
