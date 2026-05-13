import { fail, ok } from "@/lib/server/http";
import { getBeginnerQuestClaimStatuses } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "onboarding:beginner-status", limit: 30, windowMs: 60_000 });
    const claims = await getBeginnerQuestClaimStatuses({
      userClient: auth.userClient,
      userId: auth.user.id,
    });
    return ok({ claims });
  } catch (error) {
    return fail(error);
  }
}

