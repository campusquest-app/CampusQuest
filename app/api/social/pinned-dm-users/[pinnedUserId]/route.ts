import { fail, ok } from "@/lib/server/http";
import { unpinDmUser } from "@/lib/server/pinnedDmUsers";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function DELETE(request: Request, context: { params: { pinnedUserId: string } }) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "social:pinned-dm-users:delete",
      limit: 60,
      windowMs: 60_000,
    });
    const result = await unpinDmUser({
      userClient: auth.userClient,
      userId: auth.user.id,
      pinnedUserId: context.params.pinnedUserId,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
