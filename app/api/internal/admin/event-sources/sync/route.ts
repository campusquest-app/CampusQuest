import { z } from "zod";
import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { enforceRateLimit } from "@/lib/server/security";
import { getEventSourceAdapter } from "@/lib/server/eventSources/adapters";
import { listEventSourceAdminStatuses } from "@/lib/server/eventSources/sourceStatus";
import { readJson } from "@/lib/server/validation";

const bodySchema = z.object({
  source: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:event-sources-sync", limit: 8, windowMs: 60_000 });
    const input = await readJson(request, bodySchema);
    const adapter = getEventSourceAdapter(input.source);
    if (!adapter) throw new ApiError(400, "Unknown event source.", "UNKNOWN_SOURCE");
    const result = await adapter.sync("manual");
    const sources = await listEventSourceAdminStatuses();
    return ok({ result, sources });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
