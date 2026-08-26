import { fail, ok } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";
import { listCampusIdentities } from "@/lib/server/identities";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "identities:get", limit: 60, windowMs: 60_000 });
    const payload = await listCampusIdentities({
      userClient: auth.userClient,
      userId: auth.user.id,
      email: auth.user.email ?? null,
    });
    return ok(payload);
  } catch (error) {
    return fail(error);
  }
}
