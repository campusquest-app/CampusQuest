import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson, startBossSchema } from "@/lib/server/validation";
import { startBossBattle } from "@/lib/server/services";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "boss:start", limit: 20, windowMs: 60_000 });
    const input = await readJson(request, startBossSchema);
    const result = await startBossBattle({
      userClient: auth.userClient,
      userId: auth.user.id,
      bossId: input.bossId,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

