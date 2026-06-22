import { ZodError } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import { sharePostToConversations } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { touchUserActivityFromAuth } from "@/lib/server/userActivity";
import { readJson, sharePostToDmSchema } from "@/lib/server/validation";
import { formatZodError } from "@/lib/server/zodErrors";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "messages:share-post",
      limit: 30,
      windowMs: 60_000,
    });
    const input = await readJson(request, sharePostToDmSchema);
    touchUserActivityFromAuth(auth);
    const messages = await sharePostToConversations({
      userClient: auth.userClient,
      userId: auth.user.id,
      postId: input.postId,
      postType: input.postType,
      conversationIds: input.conversationIds,
      optionalText: input.optionalText,
      locationName: input.locationName,
    });
    return ok({ messages }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, formatZodError(error), "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
