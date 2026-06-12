import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { getUserXpMilestoneStatus, processXpMilestoneCrossings } from "@/lib/server/xpMilestones";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson } from "@/lib/server/validation";
import { z } from "zod";

const evaluateSchema = z.object({
  previousTotalXp: z.number().finite().min(0),
  currentTotalXp: z.number().finite().min(0),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:milestones:evaluate", limit: 40, windowMs: 60_000 });
    const input = await readJson(request, evaluateSchema);

    if (input.currentTotalXp < input.previousTotalXp) {
      throw new ApiError(400, "currentTotalXp must be >= previousTotalXp.", "MILESTONE_EVAL_INVALID");
    }

    const { newlyUnlocked } = await processXpMilestoneCrossings({
      userId: auth.user.id,
      previousTotalXp: input.previousTotalXp,
      currentTotalXp: input.currentTotalXp,
    });

    const status = await getUserXpMilestoneStatus(auth.user.id);
    return ok({ newlyUnlocked, ...status });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
