import { listMyNotifications } from "@/lib/server/notifications";
import { fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "notifications:list", limit: 180, windowMs: 60_000 });
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const result = await listMyNotifications({
      userClient: auth.userClient as any,
      userId: auth.user.id,
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
