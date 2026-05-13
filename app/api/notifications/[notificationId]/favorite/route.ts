import { ZodError } from "zod";

import { ApiError, fail, ok } from "@/lib/server/http";
import { setNotificationFavorite } from "@/lib/server/notifications";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson, toggleFavoritedSchema } from "@/lib/server/validation";

export async function POST(request: Request, context: { params: { notificationId: string } }) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "notifications:favorite", limit: 120, windowMs: 60_000 });
    const input = await readJson(request, toggleFavoritedSchema);
    const row = await setNotificationFavorite({
      userClient: auth.userClient as any,
      userId: auth.user.id,
      notificationId: context.params.notificationId,
      favorited: input.favorited,
    });
    return ok(row);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
