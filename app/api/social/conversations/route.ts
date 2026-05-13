import { fail, ok } from "@/lib/server/http";
import { listConversations } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "social:conversations", limit: 45, windowMs: 60_000 });
    const conversations = await listConversations({
      userClient: auth.userClient,
      userId: auth.user.id,
    });
    return ok({ conversations });
  } catch (error) {
    return fail(error);
  }
}
