import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { setDirectMessageFavorite } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson, toggleFavoritedSchema } from "@/lib/server/validation";

export async function POST(request: Request, context: { params: { messageId: string } }) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "social:message:favorite", limit: 120, windowMs: 60_000 });
    const input = await readJson(request, toggleFavoritedSchema);
    const result = await setDirectMessageFavorite({
      userClient: auth.userClient,
      userId: auth.user.id,
      messageId: context.params.messageId,
      favorited: input.favorited,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
