import { markAllNotificationsRead } from "@/lib/server/notifications";
import { fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "notifications:read-all", limit: 80, windowMs: 60_000 });
    const result = await markAllNotificationsRead({
      userClient: auth.userClient as any,
      userId: auth.user.id,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
