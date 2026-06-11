import { fail, ok } from "@/lib/server/http";
import { listActiveExternalOrganizations } from "@/lib/server/externalContent";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "external:organizations", limit: 60, windowMs: 60_000 });
    const url = new URL(request.url);
    const organizations = await listActiveExternalOrganizations({
      query: url.searchParams.get("query") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
    });
    return ok({ organizations });
  } catch (error) {
    return fail(error);
  }
}
