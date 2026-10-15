import { ApiError, fail, ok } from "@/lib/server/http";
import { issueReviewDemoRewardPass, issueStudentRewardPass } from "@/lib/server/partnerRewards";
import { viewerCanSeeReviewDemo } from "@/lib/server/reviewDemo";
import { enforceRateLimit } from "@/lib/server/security";
import { createAdminClient, requireAuthUser } from "@/lib/server/supabase";
import { isReviewDemoPartnerId } from "@/lib/partners/reviewDemoPartner";
import { REWARD_ERROR_CODES, type RewardPassResponse } from "@/lib/partners/rewardAccess";

const PARTNER_ID = /^[a-z0-9-]{1,80}$/;

async function readRefreshFlag(request: Request): Promise<boolean> {
  try {
    const body = (await request.json()) as { refresh?: unknown } | null;
    return body?.refresh === true;
  } catch {
    return false;
  }
}

/**
 * Issues a ~60 second student reward pass. Eligibility is re-derived from the session user on every call;
 * nothing about the student's role or identity is read from the request.
 */
export async function POST(request: Request, context: { params: Promise<{ partnerId: string }> }) {
  try {
    const { user, userClient } = await requireAuthUser(request);
    const { partnerId } = await context.params;
    if (!PARTNER_ID.test(partnerId)) throw new ApiError(400, "Invalid partner.", "INVALID_PARTNER_ID");
    enforceRateLimit({
      userId: user.id,
      routeKey: "partners:reward-pass",
      limit: 30,
      windowMs: 60_000,
      message: "Too many reward requests. Wait a moment and try again.",
    });
    let pass;
    if (isReviewDemoPartnerId(partnerId)) {
      if (!(await viewerCanSeeReviewDemo(userClient))) {
        throw new ApiError(404, "This business isn\u2019t a CampusQuest partner.", REWARD_ERROR_CODES.partnerNotFound);
      }
      pass = issueReviewDemoRewardPass();
    } else {
      const refresh = await readRefreshFlag(request);
      pass = await issueStudentRewardPass({
        admin: createAdminClient(),
        user: { id: user.id, email: user.email ?? null },
        partnerId,
        refresh,
      });
    }
    const response = ok<RewardPassResponse>({ pass });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const response = fail(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
