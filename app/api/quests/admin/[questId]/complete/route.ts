import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { completeAdminQuestForUser } from "@/lib/server/adminQuests";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { completeAdminQuestSchema, readJson, uuidSchema } from "@/lib/server/validation";

async function parseQuestId(context: { params: Promise<{ questId: string }> }): Promise<string> {
  const { questId: raw } = await context.params;
  const parsed = uuidSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "Invalid quest id.", "INVALID_QUEST_ID");
  return parsed.data;
}

export async function POST(request: Request, context: { params: Promise<{ questId: string }> }) {
  try {
    const auth = await requireAuthUser(request);
    const questId = await parseQuestId(context);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "quests:admin:complete",
      limit: 20,
      windowMs: 60_000,
    });
    const input = await readJson(request, completeAdminQuestSchema);
    const result = await completeAdminQuestForUser({
      userClient: auth.userClient,
      userId: auth.user.id,
      questId,
      proofUrl: input.proofUrl,
    });
    return ok({
      questId,
      status: result.completion.status,
      xpAwarded: result.completion.xp_awarded,
      leveledUp: Boolean(result.xpResult?.leveledUp),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
