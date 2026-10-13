import { fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { listPartnerSuggestionsForAdmin } from "@/lib/server/partnerSuggestions";
import { enforceRateLimit } from "@/lib/server/security";
import { createAdminClient } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request as never);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "internal:admin:partner-suggestions:get",
      limit: 40,
      windowMs: 60_000,
    });
    const suggestions = await listPartnerSuggestionsForAdmin(createAdminClient());
    return ok({ suggestions });
  } catch (error) {
    return fail(error);
  }
}
