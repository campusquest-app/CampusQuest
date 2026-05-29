import { ZodError } from "zod";
import { requireQrAdminUser } from "@/lib/server/adminAuth";
import { ApiError, fail, ok } from "@/lib/server/http";
import { updateQrCodeAdmin } from "@/lib/server/qrCodeAdmin";
import { enforceRateLimit } from "@/lib/server/security";
import { updateQrCodeSchema, readJson } from "@/lib/server/validation";

type RouteContext = { params: { id: string } };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireQrAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:qr-codes:patch", limit: 40, windowMs: 60_000 });
    const input = await readJson(request, updateQrCodeSchema);
    const updated = await updateQrCodeAdmin(context.params.id, input);
    return ok(updated);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
