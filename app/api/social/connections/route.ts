import { fail, ok } from "@/lib/server/http";
import { listConnections } from "@/lib/server/messaging";
import { getFollowCounts } from "@/lib/server/socialFollows";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "social:connections", limit: 30, windowMs: 60_000 });
    const userId = auth.user.id;
    const [connections, counts] = await Promise.all([
      listConnections({ userClient: auth.userClient, userId }),
      getFollowCounts({ userClient: auth.userClient, userId }),
    ]);
    return ok({
      connections,
      following: connections,
      followersCount: counts.followersCount,
      followingCount: counts.followingCount,
    });
  } catch (error) {
    return fail(error);
  }
}
