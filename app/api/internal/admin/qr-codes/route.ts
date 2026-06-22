import { ZodError } from "zod";
import { requireQrAdminUser } from "@/lib/server/adminAuth";
import { ApiError, ok } from "@/lib/server/http";
import { createQrCodeAdmin, listQrCodesAdmin } from "@/lib/server/qrCodeAdmin";
import { qrCodeApiErrorResponse, qrCodeValidationResponse } from "@/lib/server/qrCodeRouteErrors";
import { enforceRateLimit } from "@/lib/server/security";
import { createQrCodeSchema } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const auth = await requireQrAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:qr-codes:list", limit: 60, windowMs: 60_000 });
    const codes = await listQrCodesAdmin();
    return ok({ codes });
  } catch (error) {
    if (error instanceof ApiError) return qrCodeApiErrorResponse("admin:qr-codes:list", error);
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireQrAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:qr-codes:create", limit: 30, windowMs: 60_000 });

    const json = await request.json().catch(() => null);
    if (!json || typeof json !== "object") {
      return qrCodeValidationResponse(
        "admin:qr-codes:create",
        new ZodError([{ code: "custom", path: [], message: "Request body must be a JSON object." }]),
      );
    }

    const parsed = createQrCodeSchema.safeParse(json);
    if (!parsed.success) {
      return qrCodeValidationResponse("admin:qr-codes:create", parsed.error);
    }

    const created = await createQrCodeAdmin({ input: parsed.data, createdBy: auth.user.id });
    return ok(created, 201);
  } catch (error) {
    if (error instanceof ApiError) return qrCodeApiErrorResponse("admin:qr-codes:create", error);
    throw error;
  }
}
