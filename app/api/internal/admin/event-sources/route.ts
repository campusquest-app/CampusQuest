import { fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { enforceRateLimit } from "@/lib/server/security";
import { listEventSourceAdminStatuses } from "@/lib/server/eventSources/sourceStatus";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:event-sources", limit: 30, windowMs: 60_000 });
    const sources = await listEventSourceAdminStatuses();
    return ok({ sources });
  } catch (error) {
    return fail(error);
  }
}
