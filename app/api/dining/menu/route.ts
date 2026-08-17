import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import {
  getDiningMenuForRequest,
  NetNutritionError,
} from "@/lib/dining/uriDining";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "dining:menu:get",
      limit: 60,
      windowMs: 60_000,
    });

    const { searchParams } = new URL(request.url);
    const location = searchParams.get("location");
    const date = searchParams.get("date");

    const menu = await getDiningMenuForRequest({
      locationParam: location,
      dateParam: date,
    });

    return ok(menu);
  } catch (error) {
    if (error instanceof NetNutritionError) {
      return fail(
        new ApiError(
          error.status && error.status >= 400 && error.status < 600 ? error.status : 502,
          error.message,
          "DINING_UPSTREAM",
        ),
      );
    }
    return fail(error);
  }
}
