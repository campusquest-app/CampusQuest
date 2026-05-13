import { fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { enforceRateLimit } from "@/lib/server/security";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "internal:admin:access", limit: 30, windowMs: 60_000 });
    return ok({
      allowed: true,
      email: auth.normalizedEmail,
      userId: auth.user.id,
    });
  } catch (error) {
    return fail(error);
  }
}
