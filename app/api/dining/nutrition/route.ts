import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { getDiningItemNutrition, NetNutritionError } from "@/lib/dining/uriDining";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "dining:nutrition:get",
      limit: 90,
      windowMs: 60_000,
    });

    const detailOid = new URL(request.url).searchParams.get("detailOid")?.trim();
    if (!detailOid || !/^\d+$/.test(detailOid)) {
      throw new ApiError(400, "detailOid is required", "BAD_REQUEST");
    }

    const nutrition = await getDiningItemNutrition({ detailOid });
    return ok({
      detailOid,
      nutrition,
      disclaimer:
        "Nutrition and allergen details are provided by URI Dining / NetNutrition and may change. Verify with dining staff if you have a food allergy.",
    });
  } catch (error) {
    if (error instanceof NetNutritionError) {
      return fail(new ApiError(502, error.message, "DINING_UPSTREAM"));
    }
    return fail(error);
  }
}
