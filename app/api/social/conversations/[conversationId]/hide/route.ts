import { fail, ok } from "@/lib/server/http";
import { hideConversation, unhideConversation } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function POST(request: Request, context: { params: { conversationId: string } }) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "social:conversation:hide",
      limit: 20,
      windowMs: 60_000,
      message: "You're doing that too often. Please try again later.",
      code: "ABUSE_RATE_LIMITED",
    });
    const result = await hideConversation({
      userClient: auth.userClient,
      userId: auth.user.id,
      conversationId: context.params.conversationId,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, context: { params: { conversationId: string } }) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "social:conversation:unhide",
      limit: 20,
      windowMs: 60_000,
      message: "You're doing that too often. Please try again later.",
      code: "ABUSE_RATE_LIMITED",
    });
    const result = await unhideConversation({
      userClient: auth.userClient,
      userId: auth.user.id,
      conversationId: context.params.conversationId,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
