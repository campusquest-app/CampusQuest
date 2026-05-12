import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { scanQrQuest } from "@/lib/server/services";
import { requireAuthUser } from "@/lib/server/supabase";
import { qrScanSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quest:scan-qr", limit: 30, windowMs: 60_000 });
    const input = await readJson(request, qrScanSchema);

    const result = await scanQrQuest({
      userClient: auth.userClient,
      userId: auth.user.id,
      qrCode: input.qrCode,
    });

    return ok(result, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

