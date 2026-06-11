import { fail, ok } from "@/lib/server/http";
import { listActiveExternalEvents } from "@/lib/server/externalContent";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "external:events", limit: 60, windowMs: 60_000 });
    const url = new URL(request.url);
    const timeframeParam = url.searchParams.get("timeframe");
    const events = await listActiveExternalEvents({
      category: url.searchParams.get("category") ?? undefined,
      location: url.searchParams.get("location") ?? undefined,
      timeframe: timeframeParam === "today" || timeframeParam === "this_week" ? timeframeParam : undefined,
    });
    return ok({ events });
  } catch (error) {
    return fail(error);
  }
}
