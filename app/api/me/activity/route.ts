import { fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { touchUserActivity, USER_ACTIVITY_MIN_INTERVAL_MS } from "@/lib/server/userActivity";
import { requireAuthUser } from "@/lib/server/supabase";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "me:activity",
      limit: 24,
      windowMs: USER_ACTIVITY_MIN_INTERVAL_MS,
    });

    const updated = await touchUserActivity(auth.user.id, auth.userClient as Parameters<typeof touchUserActivity>[1]);

    return ok({ success: true, updated });
  } catch (error) {
    return fail(error);
  }
}
