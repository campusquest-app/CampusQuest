import { z } from "zod";
import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAdminOrInternalRepair } from "@/lib/server/internalRepairAuth";
import { readJson } from "@/lib/server/validation";
import { runProviderRecoveryController } from "@/lib/server/eventSources/recoveryController";
import { listEventSourceAdminStatuses } from "@/lib/server/eventSources/sourceStatus";

const bodySchema = z.object({
  source: z.enum(["urinvolved", "athletics"]),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAdminOrInternalRepair(request);
    if (auth.kind === "admin") {
      enforceRateLimit({
        userId: auth.admin.user.id,
        routeKey: "admin:provider-repair",
        limit: 4,
        windowMs: 60_000,
      });
    }
    const input = await readJson(request, bodySchema);
    const recovery = await runProviderRecoveryController({
      source: input.source,
      trigger: auth.kind === "admin" ? "admin" : "health",
    });
    const payload = await listEventSourceAdminStatuses();
    return ok({
      recovery,
      sources: payload.sources,
      schemaHealth: payload.schemaHealth,
      watchdog: payload.watchdog,
      incidents: payload.incidents,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
