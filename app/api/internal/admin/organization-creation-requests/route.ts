import { fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { listOrganizationCreationRequestsAdmin } from "@/lib/server/organizationCreationRequests";
import { enforceRateLimit } from "@/lib/server/security";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request as never);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "internal:admin:organization-creation-requests:get",
      limit: 40,
      windowMs: 60_000,
    });
    const requests = await listOrganizationCreationRequestsAdmin();
    return ok({ requests });
  } catch (error) {
    return fail(error);
  }
}
