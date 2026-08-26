import { fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { enforceRateLimit } from "@/lib/server/security";
import { isVerificationStatus } from "@/lib/identity/policy";
import {
  countPendingVerificationRequests,
  listVerificationRequestsAdmin,
} from "@/lib/server/verificationRequests";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request as never);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "internal:admin:verification-requests:get",
      limit: 40,
      windowMs: 60_000,
    });
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const status = statusParam && isVerificationStatus(statusParam) ? statusParam : undefined;
    const [requests, pendingCount] = await Promise.all([
      listVerificationRequestsAdmin(status && status !== "draft" ? status : undefined),
      countPendingVerificationRequests(),
    ]);
    return ok({ requests, pendingCount });
  } catch (error) {
    return fail(error);
  }
}
