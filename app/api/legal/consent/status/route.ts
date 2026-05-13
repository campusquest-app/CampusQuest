import { fail, ok } from "@/lib/server/http";
import { getLegalConsentStatus } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "legal:consent-status", limit: 30, windowMs: 60_000 });
    const status = await getLegalConsentStatus({
      userClient: auth.userClient,
      userId: auth.user.id,
    });
    return ok(status);
  } catch (error) {
    return fail(error);
  }
}
