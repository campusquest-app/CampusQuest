import { fail, ok } from "@/lib/server/http";
import { removeGroupMember } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

type RouteContext = { params: { conversationId: string; memberId: string } };

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "social:conversation:members:remove",
      limit: 30,
      windowMs: 60_000,
    });
    const conversation = await removeGroupMember({
      userClient: auth.userClient,
      userId: auth.user.id,
      conversationId: context.params.conversationId,
      memberId: context.params.memberId,
    });
    return ok({ conversation });
  } catch (error) {
    return fail(error);
  }
}
