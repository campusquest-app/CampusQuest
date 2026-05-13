import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { acceptLegalConsent } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { legalConsentAcceptSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "legal:consent-accept", limit: 10, windowMs: 60_000 });
    await readJson(request, legalConsentAcceptSchema);
    const consent = await acceptLegalConsent({
      userClient: auth.userClient,
      userId: auth.user.id,
      request,
    });
    return ok(consent, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
