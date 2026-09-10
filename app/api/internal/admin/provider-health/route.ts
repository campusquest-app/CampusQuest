import { fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAdminOrInternalRepair } from "@/lib/server/internalRepairAuth";
import { inspectCentralProviderHealth } from "@/lib/server/eventSources/providerHealthService";
import { listEventSourceAdminStatuses } from "@/lib/server/eventSources/sourceStatus";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminOrInternalRepair(request);
    if (auth.kind === "admin") {
      enforceRateLimit({ userId: auth.admin.user.id, routeKey: "admin:provider-health", limit: 30, windowMs: 60_000 });
    }
    const [health, payload] = await Promise.all([inspectCentralProviderHealth(), listEventSourceAdminStatuses()]);
    return ok({
      health,
      sources: payload.sources,
      schemaHealth: payload.schemaHealth,
      watchdog: payload.watchdog,
      incidents: payload.incidents,
    });
  } catch (error) {
    return fail(error);
  }
}
