import { ZodError } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { xpToLevel } from "@/lib/level";
import { requireAuthUser } from "@/lib/server/supabase";
import { patchMeStatsSchema, readJson } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:stats:get", limit: 80, windowMs: 60_000 });
    const { data, error } = await auth.userClient
      .from("user_stats")
      .select("*")
      .eq("user_id", auth.user.id)
      .single();

    if (error || !data) {
      throw new ApiError(404, error?.message ?? "User stats not found.", "STATS_NOT_FOUND");
    }

    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:stats:patch", limit: 120, windowMs: 60_000 });
    const input = await readJson(request, patchMeStatsSchema);

    const updates: Record<string, unknown> = {};
    if (input.totalXp !== undefined) {
      const txp = Math.max(0, Number(input.totalXp));
      updates.total_xp = txp;
      updates.level = xpToLevel(txp);
    }
    if (input.strength !== undefined) updates.strength = input.strength;
    if (input.stamina !== undefined) updates.stamina = input.stamina;
    if (input.knowledge !== undefined) updates.knowledge = input.knowledge;
    if (input.social !== undefined) updates.social = input.social;
    if (input.focus !== undefined) updates.focus = input.focus;
    if (input.bossesDefeated !== undefined) updates.bosses_defeated = input.bossesDefeated;
    if (input.finalBossesDefeated !== undefined) updates.final_bosses_defeated = input.finalBossesDefeated;

    const { data, error } = await auth.userClient
      .from("user_stats")
      .update(updates)
      .eq("user_id", auth.user.id)
      .select("*")
      .single();

    if (error) {
      throw new ApiError(400, error.message, "STATS_PATCH_FAILED");
    }
    if (!data) throw new ApiError(404, "User stats not found.", "STATS_NOT_FOUND");

    return ok(data);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

