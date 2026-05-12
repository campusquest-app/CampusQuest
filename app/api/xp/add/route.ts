import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { addXp } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { addXpSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "xp:add", limit: 30, windowMs: 60_000 });
    const input = await readJson(request, addXpSchema);
    const result = await addXp({
      userClient: auth.userClient,
      userId: auth.user.id,
      amount: input.amount,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      activityId: input.activityId,
      note: input.note,
    });
    return ok(result, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

