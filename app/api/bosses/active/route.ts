import { fail, ok } from "@/lib/server/http";
import { fetchActiveBosses } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "boss:active", limit: 60, windowMs: 60_000 });
    const bosses = await fetchActiveBosses(auth.userClient, auth.user.id);
    return ok({ bosses });
  } catch (error) {
    return fail(error);
  }
}

