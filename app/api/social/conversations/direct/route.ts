import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { getOrCreateDirectConversation } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { directConversationSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "social:conversation:direct", limit: 45, windowMs: 60_000 });
    const input = await readJson(request, directConversationSchema);
    const conversation = await getOrCreateDirectConversation({
      userClient: auth.userClient,
      userId: auth.user.id,
      otherUserId: input.otherUserId,
    });
    return ok({ conversation }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
