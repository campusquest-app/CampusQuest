import { z } from "zod";
import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { enforceRateLimit } from "@/lib/server/security";
import { readJson } from "@/lib/server/validation";
import { inspectEventProviderWatchdog } from "@/lib/server/eventSources/providerWatchdog";
import { runUrinvolvedSync } from "@/lib/server/urinvolved/sync";
import { runAthleticsSync } from "@/lib/server/eventSources/athleticsSync";
import { listEventSourceAdminStatuses } from "@/lib/server/eventSources/sourceStatus";

const resyncSchema = z.object({
  action: z.literal("resync"),
  source: z.enum(["urinvolved", "athletics"]),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:event-health", limit: 30, windowMs: 60_000 });
    const watchdog = await inspectEventProviderWatchdog();
    return ok({ watchdog });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:event-health-resync", limit: 5, windowMs: 60_000 });
    const input = await readJson(request, resyncSchema);
    const result =
      input.source === "athletics" ? await runAthleticsSync("manual") : await runUrinvolvedSync("manual");
    const [watchdog, payload] = await Promise.all([
      inspectEventProviderWatchdog(),
      listEventSourceAdminStatuses(),
    ]);
    return ok({
      result,
      watchdog,
      sources: payload.sources,
      schemaHealth: payload.schemaHealth,
      incidents: payload.incidents,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
