import { fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { fetchFriendsXpLeaderboard } from "@/lib/server/xpLeaderboards";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request as Request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "leaderboard:friends", limit: 60, windowMs: 60_000 });
    const data = await fetchFriendsXpLeaderboard({
      userClient: auth.userClient as any,
      userId: auth.user.id,
      userEmail: auth.user.email ?? null,
      emailConfirmedAt: (auth.user as { email_confirmed_at?: string | null }).email_confirmed_at ?? null,
      confirmedAt: (auth.user as { confirmed_at?: string | null }).confirmed_at ?? null,
    });
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
