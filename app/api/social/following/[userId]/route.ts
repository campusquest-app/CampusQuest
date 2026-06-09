import { fail, ok } from "@/lib/server/http";
import { assertCanViewFollowLists, listFollowing } from "@/lib/server/socialFollows";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request, context: { params: { userId: string } }) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "social:following", limit: 30, windowMs: 60_000 });
    const targetUserId = context.params.userId;
    await assertCanViewFollowLists({
      userClient: auth.userClient,
      viewerId: auth.user.id,
      targetUserId,
    });
    const following = await listFollowing({ userClient: auth.userClient, userId: targetUserId });
    return ok({ following, followingCount: following.length });
  } catch (error) {
    return fail(error);
  }
}
