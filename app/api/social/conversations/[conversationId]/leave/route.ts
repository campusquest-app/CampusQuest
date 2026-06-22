import { fail, ok } from "@/lib/server/http";
import { leaveGroupConversation } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

type RouteContext = { params: { conversationId: string } };

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "social:conversation:leave", limit: 30, windowMs: 60_000 });
    const result = await leaveGroupConversation({
      userClient: auth.userClient,
      userId: auth.user.id,
      conversationId: context.params.conversationId,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
