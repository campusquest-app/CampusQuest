import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import {
  filterUserQuestBoardItems,
  safeBuildUserQuestBoardAdminItems,
} from "@/lib/server/adminQuests";
import { requireAuthUser } from "@/lib/server/supabase";
import { questBoardQuerySchema } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    const url = new URL(request.url);
    const query = questBoardQuerySchema.parse({
      filter: url.searchParams.get("filter") ?? undefined,
      lat: url.searchParams.get("lat") ?? undefined,
      lng: url.searchParams.get("lng") ?? undefined,
      locationId: url.searchParams.get("locationId") ?? undefined,
    });

    const adminItems = await safeBuildUserQuestBoardAdminItems(auth.user.id);
    const filtered = filterUserQuestBoardItems(adminItems, query.filter ?? "all", {
      userLat: query.lat,
      userLng: query.lng,
      locationId: query.locationId,
    });

    return ok({ quests: filtered, fetchedAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid query.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
