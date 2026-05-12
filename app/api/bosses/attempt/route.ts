import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { attemptBossBattle } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { attemptBossSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "boss:attempt", limit: 25, windowMs: 60_000 });
    const input = await readJson(request, attemptBossSchema);
    const result = await attemptBossBattle({
      userClient: auth.userClient,
      userId: auth.user.id,
      bossId: input.bossId,
      activityId: input.activityId,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

