import { markNotificationRead } from "@/lib/server/notifications";
import { fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function POST(request: Request, context: { params: { notificationId: string } }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "notifications:read", limit: 240, windowMs: 60_000 });
    const result = await markNotificationRead({
      userClient: auth.userClient as any,
      userId: auth.user.id,
      notificationId: context.params.notificationId,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
