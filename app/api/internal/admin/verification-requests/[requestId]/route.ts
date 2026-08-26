import { uuidSchema } from "@/lib/server/validation";
import { fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { getVerificationRequestAdmin } from "@/lib/server/verificationRequests";
import { enforceRateLimit } from "@/lib/server/security";

export async function GET(request: Request, context: { params: { requestId: string } }) {
  try {
    const requestId = uuidSchema.parse(context.params.requestId);
    const auth = await requireAdminUser(request as never);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "internal:admin:verification-requests:detail",
      limit: 60,
      windowMs: 60_000,
    });
    const detail = await getVerificationRequestAdmin(requestId);
    return ok({ request: detail });
  } catch (error) {
    return fail(error);
  }
}
