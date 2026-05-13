import { fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { listOrganizationEventAttendees } from "@/lib/server/organizationManagement";

export async function GET(request: Request, context: { params: { organizationId: string; eventId: string } }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "organizations:admin:events:attendees:get",
      limit: 80,
      windowMs: 60_000,
    });
    const attendees = await listOrganizationEventAttendees({
      userClient: auth.userClient as any,
      organizationId: context.params.organizationId,
      eventId: context.params.eventId,
      userId: auth.user.id,
    });
    return ok({ attendees });
  } catch (error) {
    return fail(error);
  }
}
