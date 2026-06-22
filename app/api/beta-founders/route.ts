import { fail, ok } from "@/lib/server/http";
import { getBetaFounderForUser, listBetaFounders } from "@/lib/server/betaFounders";
import { fetchProfileRole, userHasPlatformAdminAccess } from "@/lib/server/permissions";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "beta-founders:list", limit: 40, windowMs: 60_000 });

    const role = await fetchProfileRole(auth.userClient as never, auth.user.id, { email: auth.user.email });
    const isAdmin = userHasPlatformAdminAccess(auth.user, role);
    const mine = await getBetaFounderForUser(auth.user.id);

    if (!mine && !isAdmin) {
      return ok({ visible: false as const });
    }

    const roster = await listBetaFounders();
    return ok({
      visible: true as const,
      mine,
      ...roster,
    });
  } catch (error) {
    return fail(error);
  }
}
