import { ZodError } from "zod";
import { requireQrAdminUser } from "@/lib/server/adminAuth";
import { ApiError, ok } from "@/lib/server/http";
import { updateQrCodeAdmin } from "@/lib/server/qrCodeAdmin";
import { qrCodeApiErrorResponse, qrCodeValidationResponse } from "@/lib/server/qrCodeRouteErrors";
import { enforceRateLimit } from "@/lib/server/security";
import { updateQrCodeSchema } from "@/lib/server/validation";

type RouteContext = { params: { id: string } };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireQrAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:qr-codes:patch", limit: 40, windowMs: 60_000 });

    const json = await request.json().catch(() => null);
    if (!json || typeof json !== "object") {
      return qrCodeValidationResponse(
        "admin:qr-codes:patch",
        new ZodError([{ code: "custom", path: [], message: "Request body must be a JSON object." }]),
      );
    }

    const parsed = updateQrCodeSchema.safeParse(json);
    if (!parsed.success) {
      return qrCodeValidationResponse("admin:qr-codes:patch", parsed.error);
    }

    const updated = await updateQrCodeAdmin(context.params.id, parsed.data, {
      origin: new URL(request.url).origin,
    });
    return ok(updated);
  } catch (error) {
    if (error instanceof ApiError) return qrCodeApiErrorResponse("admin:qr-codes:patch", error);
    throw error;
  }
}
