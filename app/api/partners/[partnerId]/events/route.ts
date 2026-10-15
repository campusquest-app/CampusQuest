import { ApiError, fail, ok } from "@/lib/server/http";
import { findPartnerById } from "@/lib/partners/partnerDirectory";
import { isReviewDemoPartnerId } from "@/lib/partners/reviewDemoPartner";
import { isClientReportablePartnerEvent, recordPartnerEngagement } from "@/lib/server/partnerEngagement";
import { viewerCanSeeReviewDemo } from "@/lib/server/reviewDemo";
import { enforceRateLimit } from "@/lib/server/security";
import { createAdminClient, requireAuthUser } from "@/lib/server/supabase";

/** Records a profile or reward view. Pass authorizations are only recorded by the reward-pass route. */
export async function POST(request: Request, context: { params: Promise<{ partnerId: string }> }) {
  try {
    const { user, userClient } = await requireAuthUser(request);
    const { partnerId } = await context.params;
    if (isReviewDemoPartnerId(partnerId) && (await viewerCanSeeReviewDemo(userClient))) {
      return ok({ recorded: false });
    }
    if (!findPartnerById(partnerId)) throw new ApiError(404, "Unknown partner.", "PARTNER_NOT_FOUND");
    enforceRateLimit({ userId: user.id, routeKey: "partners:events", limit: 60, windowMs: 60_000 });
    let type: unknown = null;
    try {
      type = ((await request.json()) as { type?: unknown } | null)?.type ?? null;
    } catch {
      type = null;
    }
    if (!isClientReportablePartnerEvent(type)) throw new ApiError(400, "Invalid event.", "INVALID_PARTNER_EVENT");
    const recorded = await recordPartnerEngagement(createAdminClient(), {
      userId: user.id,
      partnerId,
      eventType: type,
    });
    return ok({ recorded });
  } catch (error) {
    return fail(error);
  }
}
