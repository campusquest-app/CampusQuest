import { forYouRecommendationGate } from "@/lib/basic/forYouAccess";
import { loadOwnBasicEntitlement } from "@/lib/server/basicEntitlement";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

/**
 * Gate for personalized For You recommendations.
 * Non-Basic callers receive UPGRADE_REQUIRED and no ranked events.
 * The client may rank the public catalog only after this returns entitled.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "events:for-you",
      limit: 60,
      windowMs: 60_000,
    });
    const entitlement = await loadOwnBasicEntitlement(
      auth.userClient as { from: (table: string) => any },
      auth.user.id,
    );
    const gate = forYouRecommendationGate(entitlement);
    if (gate.status === "unknown") {
      throw new ApiError(503, "Could not check CampusQuest Basic.", "ENTITLEMENT_UNKNOWN");
    }
    if (gate.status === "upgrade_required") {
      throw new ApiError(
        403,
        "CampusQuest Basic is required for For You recommendations.",
        "UPGRADE_REQUIRED",
      );
    }
    return ok({ entitled: true });
  } catch (error) {
    return fail(error);
  }
}
