import { z } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { updateStreak } from "@/lib/server/gameplay";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

const streakSchema = z.object({
  currentStreakDays: z.number().int().min(0),
  lastActivityDate: z.string().date().nullable(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "streak:update", limit: 60, windowMs: 60_000 });
    const payload = streakSchema.parse(await request.json());
    const next = updateStreak(payload.lastActivityDate);
    const nextStreak =
      next.streakDays === "increment"
        ? payload.currentStreakDays + 1
        : typeof next.streakDays === "number"
          ? next.streakDays
          : payload.currentStreakDays;

    return ok({
      streakDays: nextStreak,
      lastActivityDate: next.lastActivityDate,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

