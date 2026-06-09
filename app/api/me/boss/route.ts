import { ZodError } from "zod";
import { z } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { fetchBossDropsForUser, persistBossDrop } from "@/lib/server/bossDrops";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson } from "@/lib/server/validation";

const persistBossDropSchema = z.object({
  bossId: z.string().trim().min(1).max(120),
  bossName: z.string().trim().min(1).max(120),
  cosmeticId: z.string().trim().min(1).max(120),
  itemName: z.string().trim().max(120).optional(),
  rarity: z.string().trim().max(32).optional(),
  isFinalBoss: z.boolean().optional(),
  quantity: z.number().int().min(1).max(10).optional(),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:boss:get", limit: 120, windowMs: 60_000 });
    const { searchParams } = new URL(request.url);
    const limit = Math.min(300, Math.max(1, Math.floor(Number(searchParams.get("limit") || "200"))));
    const drops = await fetchBossDropsForUser(auth.userClient, auth.user.id, limit);
    return ok({ drops });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return fail(error);
    }
    return ok({ drops: [] });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:boss:post", limit: 60, windowMs: 60_000 });
    const input = await readJson(request, persistBossDropSchema);
    const drop = await persistBossDrop({
      userClient: auth.userClient,
      userId: auth.user.id,
      input,
    });
    return ok({ drop }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
