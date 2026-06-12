import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { completeQuest } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { touchUserActivityFromAuth } from "@/lib/server/userActivity";
import { completeQuestSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quest:complete", limit: 15, windowMs: 60_000 });
    const input = await readJson(request, completeQuestSchema);
    touchUserActivityFromAuth(auth);
    const result = await completeQuest({
      userClient: auth.userClient,
      userId: auth.user.id,
      userQuestId: input.userQuestId,
    });
    return ok(result, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

