import { fail, ok } from "@/lib/server/http";
import { listConnections } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "social:connections", limit: 30, windowMs: 60_000 });
    const connections = await listConnections({
      userClient: auth.userClient,
      userId: auth.user.id,
    });
    return ok({ connections });
  } catch (error) {
    return fail(error);
  }
}
