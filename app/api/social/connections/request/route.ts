import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { sendConnectionRequest } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { connectionRequestSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "social:connections:request",
      limit: 8,
      windowMs: 60_000,
      message: "You're doing that too often. Please try again later.",
      code: "ABUSE_RATE_LIMITED",
    });
    const input = await readJson(request, connectionRequestSchema);
    const connection = await sendConnectionRequest({
      userClient: auth.userClient,
      userId: auth.user.id,
      targetUsername: input.username,
    });
    return ok({ connection }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
