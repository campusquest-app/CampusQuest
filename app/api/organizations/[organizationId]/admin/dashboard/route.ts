import { fail, ok } from "@/lib/server/http";
import { listOrganizationAdminDashboard } from "@/lib/server/organizationManagement";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request, context: { params: { organizationId: string } }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "organizations:admin:dashboard:get", limit: 60, windowMs: 60_000 });
    const dashboard = await listOrganizationAdminDashboard({
      userClient: auth.userClient as any,
      organizationId: context.params.organizationId,
      userId: auth.user.id,
    });
    return ok({ dashboard });
  } catch (error) {
    return fail(error);
  }
}
