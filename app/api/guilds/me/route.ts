import { fail, ok } from "@/lib/server/http";
import { getMyGuild } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "guild:me", limit: 60, windowMs: 60_000 });
    const guild = await getMyGuild(auth.userClient, auth.user.id);
    return ok(guild);
  } catch (error) {
    return fail(error);
  }
}

