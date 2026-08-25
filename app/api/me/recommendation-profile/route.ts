import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { loadUserRecommendationProfile } from "@/lib/server/recommendationProfile";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "me:recommendation-profile",
      limit: 60,
      windowMs: 60_000,
    });
    const profile = await loadUserRecommendationProfile({
      userClient: auth.userClient as any,
      user: auth.user,
    });
    return ok({ profile });
  } catch (error) {
    if (error instanceof ApiError) return fail(error);
    return fail(error);
  }
}
