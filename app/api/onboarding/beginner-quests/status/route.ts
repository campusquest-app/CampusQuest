import { ApiError, fail, ok } from "@/lib/server/http";
import { getBeginnerQuestClaimStatuses } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "onboarding:beginner-status", limit: 30, windowMs: 60_000 });
    const [claims, profileRes] = await Promise.all([
      getBeginnerQuestClaimStatuses({
        userClient: auth.userClient,
        userId: auth.user.id,
      }),
      auth.userClient
        .from("profiles")
        .select("beginner_chain_completed_at, beginner_chain_celebration_seen_at")
        .eq("id", auth.user.id)
        .maybeSingle(),
    ]);

    if (profileRes.error) {
      throw new ApiError(400, profileRes.error.message, "PROFILE_LOOKUP_FAILED");
    }

    const row = profileRes.data as {
      beginner_chain_completed_at?: string | null;
      beginner_chain_celebration_seen_at?: string | null;
    } | null;

    return ok({
      claims,
      beginnerChainCompletedAt: row?.beginner_chain_completed_at ?? null,
      beginnerChainCelebrationSeenAt: row?.beginner_chain_celebration_seen_at ?? null,
    });
  } catch (error) {
    return fail(error);
  }
}

