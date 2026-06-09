import { fail, ok } from "@/lib/server/http";
import { assertCanViewFollowLists, getFollowCounts } from "@/lib/server/socialFollows";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request, context: { params: { userId: string } }) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "profile:social-counts", limit: 45, windowMs: 60_000 });
    const targetUserId = context.params.userId;
    await assertCanViewFollowLists({
      userClient: auth.userClient,
      viewerId: auth.user.id,
      targetUserId,
    });
    const { followersCount, followingCount } = await getFollowCounts({
      userClient: auth.userClient,
      userId: targetUserId,
    });
    return ok({ userId: targetUserId, followersCount, followingCount });
  } catch (error) {
    return fail(error);
  }
}
