import { fail, ok } from "@/lib/server/http";
import { fetchUserInventory } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "inventory:list", limit: 120, windowMs: 60_000 });
    const inventory = await fetchUserInventory(auth.userClient, auth.user.id);
    return ok({ inventory });
  } catch (error) {
    return fail(error);
  }
}

