import { ApiError, fail, ok } from "@/lib/server/http";
import { findPartnerById } from "@/lib/partners/partnerDirectory";
import { isReviewDemoPartnerId } from "@/lib/partners/reviewDemoPartner";
import { isClientReportablePartnerEvent, recordPartnerEngagement, recordWebsiteClick } from "@/lib/server/partnerEngagement";
import { loadMergedPartner } from "@/lib/server/localBusinessAccount";
import { fetchProfileRole } from "@/lib/server/permissions";
import { viewerCanSeeReviewDemo } from "@/lib/server/reviewDemo";
import { enforceRateLimit } from "@/lib/server/security";
import { createAdminClient, requireAuthUser } from "@/lib/server/supabase";

const CLICK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    let body: { type?: unknown; clickId?: unknown } | null = null;
    try {
      body = (await request.json()) as { type?: unknown; clickId?: unknown } | null;
    } catch {
      body = null;
    }
    const type = body?.type ?? null;
    if (type === "website_click") {
      const clickId = typeof body?.clickId === "string" ? body.clickId.trim() : "";
      if (!CLICK_ID.test(clickId)) throw new ApiError(400, "Invalid click.", "INVALID_WEBSITE_CLICK");
      const role = await fetchProfileRole(userClient, user.id, { email: user.email });
      if (role === "local_business") return ok({ recorded: false });
      const merged = await loadMergedPartner(partnerId);
      if (!merged?.partner.websiteUrl?.trim()) return ok({ recorded: false });
      const recorded = await recordWebsiteClick(createAdminClient(), { userId: user.id, partnerId, clickId });
      return ok({ recorded });
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
