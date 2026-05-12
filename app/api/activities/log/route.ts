import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";
import { logActivity } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { logActivitySchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "activity:log", limit: 20, windowMs: 60_000 });
    const input = await readJson(request, logActivitySchema);
    const result = await logActivity({
      userClient: auth.userClient,
      userId: auth.user.id,
      activityId: input.activityId,
      minutes: input.minutes,
    });
    return ok(result, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

