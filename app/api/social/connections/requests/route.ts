import { fail, ok } from "@/lib/server/http";
import { listConnectionRequests } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    const url = new URL(request.url);
    const direction = url.searchParams.get("direction") === "outgoing" ? "outgoing" : "incoming";
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: `social:connections:requests:${direction}`,
      limit: 30,
      windowMs: 60_000,
    });
    const requests = await listConnectionRequests({
      userClient: auth.userClient,
      userId: auth.user.id,
      direction,
    });
    return ok({ requests });
  } catch (error) {
    return fail(error);
  }
}
