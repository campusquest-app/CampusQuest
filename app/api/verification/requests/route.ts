import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";
import { readJson } from "@/lib/server/validation";
import { submitVerificationRequestSchema } from "@/lib/identity/schemas";
import { listMyVerificationRequests, submitVerificationRequest } from "@/lib/server/verificationRequests";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "verification:list", limit: 40, windowMs: 60_000 });
    const requests = await listMyVerificationRequests({
      userClient: auth.userClient,
      userId: auth.user.id,
    });
    return ok({ requests });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "verification:submit", limit: 8, windowMs: 60_000 });
    const input = await readJson(request, submitVerificationRequestSchema);
    const result = await submitVerificationRequest({
      userClient: auth.userClient,
      userId: auth.user.id,
      userEmail: auth.user.email ?? null,
      emailConfirmedAt: auth.user.email_confirmed_at ?? null,
      confirmedAt: (auth.user as { confirmed_at?: string | null }).confirmed_at ?? null,
      displayName:
        typeof auth.user.user_metadata?.display_name === "string" ? auth.user.user_metadata.display_name : null,
      input,
    });
    return ok(result, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid application.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
