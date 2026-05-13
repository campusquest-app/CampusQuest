import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { createSafetyAppeal, listOwnSafetyAppeals } from "@/lib/server/accountSafety";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson, safetyAppealSchema } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "safety:appeals:get", limit: 20, windowMs: 60_000 });
    const appeals = await listOwnSafetyAppeals({
      userClient: auth.userClient as any,
      userId: auth.user.id,
    });
    return ok({ appeals });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "safety:appeals:post",
      limit: 5,
      windowMs: 60_000,
      message: "You're doing that too often. Please try again later.",
      code: "ABUSE_RATE_LIMITED",
    });
    const input = await readJson(request, safetyAppealSchema);
    const appeal = await createSafetyAppeal({
      userClient: auth.userClient as any,
      userId: auth.user.id,
      message: input.message,
    });
    return ok({ appeal }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
