import { fail, ok } from "@/lib/server/http";
import { getLegalConsentStatus } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireLegalConsentUser } from "@/lib/server/legalConsentAuth";

export async function GET(request: Request) {
  try {
    const auth = await requireLegalConsentUser(request, "/api/legal/consent/status");
    enforceRateLimit({ userId: auth.user.id, routeKey: "legal:consent-status", limit: 30, windowMs: 60_000 });
    const status = await getLegalConsentStatus({
      userClient: auth.userClient,
      userId: auth.user.id,
      path: "/api/legal/consent/status",
    });
    return ok(status);
  } catch (error) {
    return fail(error);
  }
}
