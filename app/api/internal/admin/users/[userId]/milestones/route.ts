import { fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { enforceRateLimit } from "@/lib/server/security";
import { getUserXpMilestoneStatus } from "@/lib/server/xpMilestones";

export async function GET(request: Request, context: { params: { userId: string } }) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:user-milestones", limit: 40, windowMs: 60_000 });
    const status = await getUserXpMilestoneStatus(context.params.userId);
    return ok({ userId: context.params.userId, ...status });
  } catch (error) {
    return fail(error);
  }
}
