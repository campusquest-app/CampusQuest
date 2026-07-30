import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { createContentReport } from "@/lib/server/contentReports";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson, reportInfringementSchema } from "@/lib/server/validation";

/**
 * POST /api/moderation/infringement
 * Copyright / trademark infringement reports (Samsung UGC requirement).
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "moderation:infringement",
      limit: 5,
      windowMs: 60 * 60_000,
    });
    const input = await readJson(request, reportInfringementSchema);
    const detailsParts = [input.details.trim()];
    if (input.contentUrl) detailsParts.push(`Content URL: ${input.contentUrl}`);
    const report = await createContentReport({
      userClient: auth.userClient,
      reporterId: auth.user.id,
      targetType: "infringement",
      targetId: input.targetId ?? null,
      reason: input.reason,
      details: detailsParts.join("\n\n"),
    });
    return ok({ report }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
