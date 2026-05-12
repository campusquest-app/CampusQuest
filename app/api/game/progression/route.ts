import { z } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { calculateLevelProgression } from "@/lib/server/gameplay";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

const progressionSchema = z.object({
  totalXp: z.number().int().min(0),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "game:progression", limit: 60, windowMs: 60_000 });
    const payload = progressionSchema.parse(await request.json());
    const progression = calculateLevelProgression(payload.totalXp);
    return ok(progression);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

