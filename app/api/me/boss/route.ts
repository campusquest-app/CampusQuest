import { fail, ok, ApiError } from "@/lib/server/http";
import { logSecurityEvent } from "@/lib/server/profileSecurity";
import { enforceRateLimit } from "@/lib/server/security";
import { fetchBossDropsForUser } from "@/lib/server/bossDrops";
import { requireAuthUser } from "@/lib/server/supabase";

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

    const rawBody = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    await logSecurityEvent({
      userId: auth.user.id,
      eventType: "blocked_boss_drop_grant",
      blockedFields: Object.keys(rawBody),
      requestPath: "/api/me/boss",
      metadata: { method: "POST" },
    });

    throw new ApiError(
      403,
      "Boss rewards are granted only by the verified server-side combat flow.",
      "BOSS_DROP_SELF_GRANT_FORBIDDEN",
    );
  } catch (error) {
    return fail(error);
  }
}
