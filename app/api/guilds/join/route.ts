import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { joinGuild } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { joinGuildSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "guild:join", limit: 5, windowMs: 60_000 });
    const input = await readJson(request, joinGuildSchema);
    const result = await joinGuild({
      userClient: auth.userClient,
      userId: auth.user.id,
      guildId: input.guildId,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

