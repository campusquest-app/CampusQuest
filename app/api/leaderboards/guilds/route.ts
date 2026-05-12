import { fail, ok } from "@/lib/server/http";
import { listGuilds } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "leaderboard:guilds", limit: 60, windowMs: 60_000 });
    const guilds = await listGuilds(auth.userClient);
    return ok({ guilds });
  } catch (error) {
    return fail(error);
  }
}

