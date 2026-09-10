import { fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAdminOrInternalRepair } from "@/lib/server/internalRepairAuth";
import { createAdminClient } from "@/lib/server/supabase";
import { listProviderIncidents } from "@/lib/server/eventSources/incidentStore";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminOrInternalRepair(request);
    if (auth.kind === "admin") {
      enforceRateLimit({ userId: auth.admin.user.id, routeKey: "admin:incidents", limit: 30, windowMs: 60_000 });
    }
    const url = new URL(request.url);
    const provider = url.searchParams.get("provider")?.trim() || undefined;
    const incidents = await listProviderIncidents(createAdminClient(), {
      provider,
      limit: 40,
    });
    return ok({ incidents });
  } catch (error) {
    return fail(error);
  }
}
