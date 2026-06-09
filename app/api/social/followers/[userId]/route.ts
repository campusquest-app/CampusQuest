import { fail, ok } from "@/lib/server/http";
import { assertCanViewFollowLists, listFollowers } from "@/lib/server/socialFollows";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request, context: { params: { userId: string } }) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "social:followers", limit: 30, windowMs: 60_000 });
    const targetUserId = context.params.userId;
    await assertCanViewFollowLists({
      userClient: auth.userClient,
      viewerId: auth.user.id,
      targetUserId,
    });
    const followers = await listFollowers({ userClient: auth.userClient, userId: targetUserId });
    return ok({ followers, followersCount: followers.length });
  } catch (error) {
    return fail(error);
  }
}
