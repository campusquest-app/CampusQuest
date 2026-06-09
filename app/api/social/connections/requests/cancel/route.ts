import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { cancelConnectionRequest } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { connectionCancelSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "social:connections:cancel",
      limit: 20,
      windowMs: 60_000,
    });
    const input = await readJson(request, connectionCancelSchema);
    const result = await cancelConnectionRequest({
      userClient: auth.userClient,
      userId: auth.user.id,
      requestId: input.requestId,
    });
    return ok({ request: result });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
