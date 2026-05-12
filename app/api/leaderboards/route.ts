import { fail, ok } from "@/lib/server/http";
import { fetchLeaderboards } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "leaderboard:get", limit: 60, windowMs: 60_000 });
    const data = await fetchLeaderboards(auth.userClient);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

