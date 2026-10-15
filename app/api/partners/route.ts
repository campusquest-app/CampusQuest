import { fail, ok } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";
import { PARTNER_DIRECTORY } from "@/lib/partners/partnerDirectory";
import { visiblePartners } from "@/lib/partners/partnerStatus";
import { REVIEW_DEMO_PARTNER } from "@/lib/partners/reviewDemoPartner";
import { viewerCanSeeReviewDemo } from "@/lib/server/reviewDemo";
import type { PartnersResponse } from "@/lib/partners/types";

export async function GET(request: Request) {
  try {
    const { userClient } = await requireAuthUser(request);
    // Partners live in a static directory until a partners table exists. When it does, read active rows
    // via the user-scoped client (RLS: read-only) and map them with `mapPartnerRow`.
    const partners = visiblePartners(PARTNER_DIRECTORY);
    if (await viewerCanSeeReviewDemo(userClient)) partners.push(REVIEW_DEMO_PARTNER);
    const body: PartnersResponse = { partners };
    return ok(body);
  } catch (error) {
    return fail(error);
  }
}
