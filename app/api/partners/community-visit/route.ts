import { ApiError, fail, ok } from "@/lib/server/http";
import { PARTNER_DIRECTORY } from "@/lib/partners/partnerDirectory";
import { visiblePartners } from "@/lib/partners/partnerStatus";
import { recordBusinessViews } from "@/lib/server/partnerEngagement";
import { fetchProfileRole } from "@/lib/server/permissions";
import { enforceRateLimit } from "@/lib/server/security";
import { createAdminClient, requireAuthUser } from "@/lib/server/supabase";

const VISIT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Records one Community visit for every business on the student's listing. The client does not choose the businesses. */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "partners:community-visit",
      limit: 30,
      windowMs: 60_000,
    });
    const body = (await request.json().catch(() => null)) as { visitId?: unknown } | null;
    const visitId = typeof body?.visitId === "string" ? body.visitId.trim() : "";
    if (!VISIT_ID.test(visitId)) throw new ApiError(400, "Invalid visit.", "INVALID_COMMUNITY_VISIT");
    const role = await fetchProfileRole(auth.userClient, auth.user.id, { email: auth.user.email });
    if (role === "local_business") return ok({ recorded: false });
    const partnerIds = visiblePartners(PARTNER_DIRECTORY).map((partner) => partner.id);
    const recorded = await recordBusinessViews(createAdminClient(), {
      userId: auth.user.id,
      visitId,
      partnerIds,
    });
    return ok({ recorded });
  } catch (error) {
    return fail(error);
  }
}
