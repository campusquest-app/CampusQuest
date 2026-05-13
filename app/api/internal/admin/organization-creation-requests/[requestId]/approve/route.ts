import { uuidSchema } from "@/lib/server/validation";
import { fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { approveOrganizationCreationRequestAdmin } from "@/lib/server/organizationCreationRequests";
import { enforceRateLimit } from "@/lib/server/security";

export async function POST(request: Request, context: { params: { requestId: string } }) {
  try {
    const requestId = uuidSchema.parse(context.params.requestId);
    const auth = await requireAdminUser(request as never);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "internal:admin:organization-creation-requests:approve",
      limit: 30,
      windowMs: 60_000,
    });
    const result = await approveOrganizationCreationRequestAdmin({
      requestId,
      reviewerUserId: auth.user.id,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
