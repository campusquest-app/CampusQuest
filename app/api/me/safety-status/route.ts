import { fail, ok } from "@/lib/server/http";
import { getAccountSafetyStatus } from "@/lib/server/accountSafety";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:safety-status", limit: 40, windowMs: 60_000 });
    const safety = await getAccountSafetyStatus(auth.userClient as any, auth.user.id);
    return ok(safety);
  } catch (error) {
    return fail(error);
  }
}
