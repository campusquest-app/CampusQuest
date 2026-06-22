import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { getConversationDetails, updateGroupConversation } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson, updateGroupConversationSchema } from "@/lib/server/validation";

type RouteContext = { params: { conversationId: string } };

export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "social:conversation:get", limit: 60, windowMs: 60_000 });
    const conversation = await getConversationDetails({
      userClient: auth.userClient,
      userId: auth.user.id,
      conversationId: context.params.conversationId,
    });
    return ok({ conversation });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "social:conversation:patch", limit: 30, windowMs: 60_000 });
    const input = await readJson(request, updateGroupConversationSchema);
    const conversation = await updateGroupConversation({
      userClient: auth.userClient,
      userId: auth.user.id,
      conversationId: context.params.conversationId,
      title: input.title,
    });
    return ok({ conversation });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
