import { fail, ok } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";
import { PARTNER_DIRECTORY } from "@/lib/partners/partnerDirectory";
import { visiblePartners } from "@/lib/partners/partnerStatus";
import type { PartnersResponse } from "@/lib/partners/types";

export async function GET(request: Request) {
  try {
    await requireAuthUser(request);
    // Partners live in a static directory until a partners table exists. When it does, read active rows
    // via the user-scoped client (RLS: read-only) and map them with `mapPartnerRow`.
    const body: PartnersResponse = { partners: visiblePartners(PARTNER_DIRECTORY) };
    return ok(body);
  } catch (error) {
    return fail(error);
  }
}
