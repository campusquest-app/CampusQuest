import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { respondConnectionRequest } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { connectionRespondSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "social:connections:respond", limit: 30, windowMs: 60_000 });
    const input = await readJson(request, connectionRespondSchema);
    const result = await respondConnectionRequest({
      userClient: auth.userClient,
      userId: auth.user.id,
      requestId: input.requestId,
      action: input.action,
    });
    return ok({ request: result });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
