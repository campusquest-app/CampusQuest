import { fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { fetchActiveRealmMoments } from "@/lib/server/realmMoments";
import { isRealmLocationId } from "@/lib/realm/locationGeo";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "realm:moments:get", limit: 120, windowMs: 60_000 });

    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("locationId")?.trim();
    if (locationId && !isRealmLocationId(locationId)) {
      return ok({ moments: [] });
    }

    const moments = await fetchActiveRealmMoments({
      locationId: locationId || undefined,
    });

    return ok({ moments });
  } catch (error) {
    return fail(error);
  }
}
