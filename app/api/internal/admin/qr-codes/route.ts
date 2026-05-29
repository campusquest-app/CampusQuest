import { ZodError } from "zod";
import { requireQrAdminUser } from "@/lib/server/adminAuth";
import { ApiError, fail, ok } from "@/lib/server/http";
import { createQrCodeAdmin, listQrCodesAdmin } from "@/lib/server/qrCodeAdmin";
import { enforceRateLimit } from "@/lib/server/security";
import { createQrCodeSchema, readJson } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const auth = await requireQrAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:qr-codes:list", limit: 60, windowMs: 60_000 });
    const codes = await listQrCodesAdmin();
    return ok({ codes });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireQrAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:qr-codes:create", limit: 30, windowMs: 60_000 });
    const input = await readJson(request, createQrCodeSchema);
    const created = await createQrCodeAdmin({ input, createdBy: auth.user.id });
    return ok(created, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
