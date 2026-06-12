import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { getUserXpMilestoneStatus, markXpMilestonePopupShown, type XpMilestoneKey } from "@/lib/server/xpMilestones";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson } from "@/lib/server/validation";
import { z } from "zod";

const popupShownSchema = z.object({
  milestoneKey: z.enum(["create_guild_300"]),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:milestones:popup-shown", limit: 20, windowMs: 60_000 });
    const input = await readJson(request, popupShownSchema);
    await markXpMilestonePopupShown(auth.user.id, input.milestoneKey as XpMilestoneKey);
    const status = await getUserXpMilestoneStatus(auth.user.id);
    return ok({ success: true, ...status });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
