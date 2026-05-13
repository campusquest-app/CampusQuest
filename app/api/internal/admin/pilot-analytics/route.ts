import { fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { getPilotAnalyticsSnapshot } from "@/lib/server/pilotAnalytics";
import { enforceRateLimit } from "@/lib/server/security";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "internal:pilot-analytics:get", limit: 30, windowMs: 60_000 });
    const analytics = await getPilotAnalyticsSnapshot();
    return ok({ analytics });
  } catch (error) {
    return fail(error);
  }
}
