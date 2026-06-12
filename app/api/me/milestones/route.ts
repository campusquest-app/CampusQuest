import { fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { getUserXpMilestoneStatus } from "@/lib/server/xpMilestones";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:milestones:get", limit: 60, windowMs: 60_000 });
    const status = await getUserXpMilestoneStatus(auth.user.id);
    return ok(status);
  } catch (error) {
    return fail(error);
  }
}
