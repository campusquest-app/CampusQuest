import { fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { fetchActiveUserQuests } from "@/lib/server/services";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quests:active", limit: 120, windowMs: 60_000 });
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 5);
    const quests = await fetchActiveUserQuests({
      userClient: auth.userClient,
      userId: auth.user.id,
      limit,
    });
    return ok({ quests });
  } catch (error) {
    return fail(error);
  }
}
