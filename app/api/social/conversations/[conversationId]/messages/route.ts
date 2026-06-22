import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { listConversationMessages, sendConversationMessage } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { touchUserActivityFromAuth } from "@/lib/server/userActivity";
import { readJson, sendDirectMessageSchema } from "@/lib/server/validation";

export async function GET(request: Request, context: { params: { conversationId: string } }) {
  try {
    const auth = await requireAuthUser(request as any);
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit") ?? 50);
    enforceRateLimit({ userId: auth.user.id, routeKey: "social:messages:get", limit: 80, windowMs: 60_000 });
    const messages = await listConversationMessages({
      userClient: auth.userClient,
      userId: auth.user.id,
      conversationId: context.params.conversationId,
      limit: Number.isFinite(limitParam) ? limitParam : 50,
    });
    return ok({ messages });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, context: { params: { conversationId: string } }) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "social:messages:post",
      limit: 30,
      windowMs: 60_000,
      message: "You're doing that too often. Please try again later.",
      code: "ABUSE_RATE_LIMITED",
    });
    const input = await readJson(request, sendDirectMessageSchema);
    touchUserActivityFromAuth(auth);
    const type = input.type ?? "text";
    if (type === "text" && !(input.content?.trim())) {
      return fail(new ApiError(400, "Message content is required.", "VALIDATION_ERROR"));
    }
    const message = await sendConversationMessage({
      userClient: auth.userClient,
      userId: auth.user.id,
      conversationId: context.params.conversationId,
      content: input.content,
      type,
      imageUrl: input.imageUrl,
      sharedPostId: input.sharedPostId,
      sharedPostType: input.sharedPostType,
      metadata: input.metadata,
    });
    return ok({ message }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
