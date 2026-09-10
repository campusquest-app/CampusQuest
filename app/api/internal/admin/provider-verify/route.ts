import { z } from "zod";
import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAdminOrInternalRepair } from "@/lib/server/internalRepairAuth";
import {
  runProviderVerification,
  runProviderRecoveryController,
} from "@/lib/server/eventSources/recoveryController";
import { listEventSourceAdminStatuses } from "@/lib/server/eventSources/sourceStatus";

const bodySchema = z.object({
  source: z.enum(["urinvolved", "athletics"]).optional(),
  retry: z.boolean().optional(),
});

async function readOptionalJson(request: Request) {
  const text = await request.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as unknown;
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminOrInternalRepair(request);
    if (auth.kind === "admin") {
      enforceRateLimit({
        userId: auth.admin.user.id,
        routeKey: "admin:provider-verify",
        limit: 8,
        windowMs: 60_000,
      });
    }
    const input = bodySchema.parse(await readOptionalJson(request));
    const source = input.source ?? "urinvolved";
    const verification = await runProviderVerification(source);
    const recovery = input.retry
      ? await runProviderRecoveryController({
          source,
          trigger: "post_deploy",
          lastError: verification.lastError,
        })
      : null;
    const payload = await listEventSourceAdminStatuses();
    return ok({
      verification,
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
